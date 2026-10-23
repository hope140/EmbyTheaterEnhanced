// SPDX-License-Identifier: MIT
// Isolated Windows Framework probe. No application startup, timers or real HTTP client.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Remoting.Messaging;
using System.Runtime.Remoting.Proxies;
using System.Runtime.Serialization;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class ConsumerBoundaryProbe
{
    sealed class Proxy : RealProxy
    {
        readonly Func<IMethodCallMessage, object> handler;
        internal Proxy(Type type, Func<IMethodCallMessage, object> handler) : base(type) { this.handler=handler; }
        public override IMessage Invoke(IMessage message)
        {
            var call=(IMethodCallMessage)message;
            try { if(call.MethodName=="GetType" && call.ArgCount==0) return new ReturnMessage(GetProxiedType(),null,0,call.LogicalCallContext,call); return new ReturnMessage(handler(call),null,0,call.LogicalCallContext,call); }
            catch(Exception ex) { return new ReturnMessage(ex,call); }
        }
    }
    sealed class TrackedStream : MemoryStream
    {
        internal bool Closed;
        internal TrackedStream(byte[] data) : base(data) { }
        protected override void Dispose(bool disposing) { Closed=true; base.Dispose(disposing); }
    }
    static Assembly host,common,model;
    static string root;
    static int failures,cases;
    static readonly string[] Bad={"{\"Name\":","{}{}"};
    static string Hash(string path) { using(var s=SHA256.Create()) return BitConverter.ToString(s.ComputeHash(File.ReadAllBytes(path))).Replace("-","").ToLowerInvariant(); }
    static void Assert(bool condition,string message) { if(!condition) throw new Exception(message); }
    static Type Find(string name) { return host.GetType(name)??common.GetType(name)??model.GetType(name)??throw new Exception("Missing type: "+name); }
    static object MakeProxy(string name,Func<IMethodCallMessage,object> handler) { return new Proxy(Find(name),handler).GetTransparentProxy(); }
    static Exception Unwrap(Exception ex) { while(ex is TargetInvocationException || ex is AggregateException) ex=ex.InnerException; return ex; }
    static object Await(object value)
    {
        var task=(Task)value;task.GetAwaiter().GetResult();
        var result=task.GetType().GetProperty("Result");return result==null?null:result.GetValue(task,null);
    }
    static object Call(object obj,string name,params object[] args)
    {
        var methods=obj.GetType().GetMethods(BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic)
            .Where(m=>m.Name==name&&!m.IsGenericMethodDefinition&&m.GetParameters().Length==args.Length).ToArray();
        Assert(methods.Length==1,"Ambiguous probe call: "+name);return methods[0].Invoke(obj,args);
    }
    static void Field(object obj,string name,object value) { obj.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).SetValue(obj,value); }
    static void Auto(object obj,string name,object value) { Field(obj,"<"+name+">k__BackingField",value); }
    static object TaskValue(IMethodCallMessage call,object value)
    {
        var returnType=((MethodInfo)call.MethodBase).ReturnType;
        return typeof(Task).GetMethod("FromResult").MakeGenericMethod(returnType.GetGenericArguments()[0]).Invoke(null,new[]{value});
    }
    static void JsonError(Action action)
    {
        try { action(); } catch(Exception ex) {
            ex=Unwrap(ex); Assert(ex.GetType().FullName=="Newtonsoft.Json.JsonReaderException","Wrong error: "+ex);return;
        }
        throw new Exception("Expected JsonReaderException; default-object success is forbidden");
    }
    static void TransportError(object value) {
        var task=(Task)value;
        try { Await(task); } catch(Exception error) {
            error=Unwrap(error);Assert(error is IOException&&error.Message=="synthetic-transport-failure","Wrong transport exception: "+error);
            Assert(task.IsFaulted,"Consumer must return faulted Task");return;
        }
        throw new Exception("Transport failure incorrectly became successful result");
    }
    static string Escape(string s) { return s.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n").Replace("\t","\\t"); }
    static void Test(string name,Action action)
    {
        cases++;
        try { action();Console.WriteLine("{\"case\":\""+Escape(name)+"\",\"status\":\"pass\"}"); }
        catch(Exception ex) { failures++;Console.WriteLine("{\"case\":\""+Escape(name)+"\",\"status\":\"fail\",\"error\":\""+Escape(Unwrap(ex).ToString())+"\"}"); }
    }
    sealed class Fixture
    {
        internal readonly string Root,Cache,Data,Config,Download;
        internal readonly object Logger,Paths,Fs,Http,Codec;
        internal readonly List<TrackedStream> Streams=new List<TrackedStream>();
        internal readonly List<string> Logs=new List<string>();
        internal string Response; internal bool FailHttp;
        internal int Downloads,Requests,Copies;
        internal Fixture(string name,string response)
        {
            Root=Path.Combine(root,name);Cache=Path.Combine(Root,"cache");Data=Path.Combine(Root,"data");Config=Path.Combine(Root,"config");Download=Path.Combine(Root,"download.json");
            foreach(var d in new[]{Root,Cache,Data,Config}) Directory.CreateDirectory(d);
            Response=response;
            Logger=MakeProxy("MediaBrowser.Model.Logging.ILogger",call=>{
                Logs.Add(call.MethodName+":"+string.Join("|",call.Args.Select(a=>a==null?"null":a.ToString())));
                var t=((MethodInfo)call.MethodBase).ReturnType;return t!=typeof(void)&&t.IsValueType?Activator.CreateInstance(t):null;
            });
            Paths=MakeProxy("MediaBrowser.Common.Configuration.IApplicationPaths",call=>{
                if(call.MethodName=="get_CachePath") return Cache;
                if(call.MethodName=="get_DataPath") return Data;
                if(call.MethodName=="get_ConfigurationDirectoryPath") return Config;
                throw new NotSupportedException("Unexpected application path: "+call.MethodName);
            });
            Fs=MakeProxy("MediaBrowser.Model.IO.IFileSystem",call=>{
                if(call.MethodName=="GetDirectoryName") return Path.GetDirectoryName(Safe((string)call.Args[0]));
                if(call.MethodName=="CreateDirectory") { Directory.CreateDirectory(Safe((string)call.Args[0]));return null; }
                if(call.MethodName=="CopyFile") { Copies++;File.Copy(Safe((string)call.Args[0]),Safe((string)call.Args[1]),(bool)call.Args[2]);return null; }
                if(call.MethodName=="OpenRead"||call.MethodName=="GetFileStream") {
                    if(call.MethodName=="GetFileStream") Assert(call.Args[1].ToString()=="Open"&&call.Args[2].ToString()=="Read","Probe forbids file writes");
                    var stream=new TrackedStream(File.ReadAllBytes(Safe((string)call.Args[0])));Streams.Add(stream);return stream;
                }
                throw new NotSupportedException("Unexpected file operation: "+call.MethodName);
            });
            Http=MakeProxy("MediaBrowser.Common.Net.IHttpClient",call=>{
                if(FailHttp) {
                    if(call.MethodName=="GetTempFile") Downloads++;
                    else if(call.MethodName=="Get"||call.MethodName=="Post") Requests++;
                    else throw new NotSupportedException("Unexpected mocked transport operation: "+call.MethodName);
                    var returnType=((MethodInfo)call.MethodBase).ReturnType;
                    return typeof(Task).GetMethods(BindingFlags.Static|BindingFlags.Public).Single(m=>m.Name=="FromException"&&m.IsGenericMethodDefinition)
                        .MakeGenericMethod(returnType.GetGenericArguments()[0]).Invoke(null,new object[]{new IOException("synthetic-transport-failure")});
                }
                if(call.MethodName=="GetTempFile") { Downloads++;File.WriteAllText(Download,Response,new UTF8Encoding(false));return TaskValue(call,Download); }
                if(call.MethodName=="Get"||call.MethodName=="Post") { Requests++;var stream=new TrackedStream(Encoding.UTF8.GetBytes(Response));Streams.Add(stream);return TaskValue(call,stream); }
                throw new NotSupportedException("Unexpected mocked HTTP operation: "+call.MethodName);
            });
            Codec=Find("Emby.Theater.Serialization.JsonSerializer").GetConstructor(new[]{Find("MediaBrowser.Model.IO.IFileSystem"),Find("MediaBrowser.Model.Logging.ILogger")}).Invoke(new[]{Fs,Logger});
        }
        string Safe(string path) { path=Path.GetFullPath(path);Assert(path.StartsWith(Root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||path==Root,"Path escapes synthetic fixture");return path; }
        internal object Worker()
        {
            var w=FormatterServices.GetUninitializedObject(Find("Emby.Theater.ScheduledTasks.ScheduledTaskWorker"));
            Auto(w,"JsonSerializer",Codec);Auto(w,"ApplicationPaths",Paths);Auto(w,"Logger",Logger);
            Field(w,"_id","11111111-1111-1111-1111-111111111111");Field(w,"_lastExecutionResultSyncLock",new object());return w;
        }
        internal object Installer()
        {
            var app=MakeProxy("MediaBrowser.Common.IApplicationHost",call=>{
                if(call.MethodName=="get_SystemId") return "isolated-fixture";
                throw new NotSupportedException("Unexpected application host call: "+call.MethodName);
            });
            return Find("Emby.Theater.Updates.InstallationManager").GetConstructors().Single(c=>c.GetParameters().Length==9).Invoke(new[]{Logger,app,Paths,Http,Codec,null,Fs,null,"netframework"});
        }
        internal string CacheFile { get { return Path.Combine(Cache,"serverpackages.json"); } }
        internal void Closed() { Assert(Streams.Count>0&&Streams.All(s=>s.Closed),"Every input stream must close"); }
    }
    public static int Main(string[] args)
    {
        Assert(Environment.OSVersion.Platform==PlatformID.Win32NT&&Environment.Version.Major==4,"Run only on Windows .NET Framework");
        Assert(args.Length==2,"Arguments: candidate-bundle-directory expected-host-SHA256");
        var bundle=Path.GetFullPath(args[0]);var file=Path.Combine(bundle,"Emby.Theater.exe");
        Assert(Hash(file)==args[1].ToLowerInvariant(),"Wrong candidate Host");
        Assert(Hash(Path.Combine(bundle,"MediaBrowser.Model.dll"))=="db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153","Wrong official Model");
        Assert(Hash(Path.Combine(bundle,"Newtonsoft.Json.dll"))=="f0c07af0e84d4dd4da4bd7823ba4535bc0481b3bf623ed40b659b68147a6bb75","Wrong pinned Newtonsoft net45 asset");
        AppDomain.CurrentDomain.AssemblyResolve+=(s,e)=>{ var path=Path.Combine(bundle,new AssemblyName(e.Name).Name+".dll");return File.Exists(path)?Assembly.LoadFrom(path):null; };
        model=Assembly.LoadFrom(Path.Combine(bundle,"MediaBrowser.Model.dll"));common=Assembly.LoadFrom(Path.Combine(bundle,"MediaBrowser.Common.dll"));host=Assembly.LoadFrom(file);
        var refs=host.GetReferencedAssemblies().Select(a=>a.Name).ToArray();
        Assert(refs.Contains("Newtonsoft.Json")&&!refs.Contains("ServiceStack.Text"),"Use integrated replacement candidate, not legacy Host");
        root=Path.Combine(Path.GetTempPath(),"ete-json-boundaries-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        Console.WriteLine("{\"fixtureRoot\":\""+Escape(root)+"\",\"hostSHA256\":\""+Hash(file)+"\",\"network\":\"mocked only\"}");
        Test("package-post-transport-fault",()=>{
            var f=new Fixture("post-transport","[]");f.FailHttp=true;
            TransportError(Call(f.Installer(),"GetAvailablePackages",CancellationToken.None,true,null,null));
            Assert(f.Requests==1&&f.Downloads==0,"No alternate cache request on POST transport failure");
        });
        Test("cache-refresh-transport-fault-retains-old-file",()=>{
            var f=new Fixture("cache-transport","[]");File.WriteAllText(f.CacheFile,"{\"Name\":",new UTF8Encoding(false));var before=Hash(f.CacheFile);f.FailHttp=true;
            TransportError(Call(f.Installer(),"GetAvailablePackagesWithoutRegistrationInfo",CancellationToken.None));
            Assert(f.Downloads==1&&f.Copies==0&&Hash(f.CacheFile)==before,"One failed refresh, no replacement");f.Closed();
        });
        Test("github-check-transport-fault",()=>{
            var f=new Fixture("github-check-transport","[]");f.FailHttp=true;
            var updater=Find("MediaBrowser.Common.Updates.GithubUpdater").GetConstructors().Single(c=>c.GetParameters().Length==2).Invoke(new[]{f.Http,f.Codec});
            TransportError(Call(updater,"CheckForUpdateResult","fixture","fixture",new Version(0,0),Enum.Parse(Find("MediaBrowser.Model.Updates.PackageVersionClass"),"Release"),"fixture.zip","fixture","fixture.zip",TimeSpan.Zero,CancellationToken.None));
            Assert(f.Requests==1,"One mocked GitHub request");
        });
        Test("github-releases-transport-fault",()=>{
            var f=new Fixture("github-list-transport","[]");f.FailHttp=true;
            var updater=Find("MediaBrowser.Common.Updates.GithubUpdater").GetConstructors().Single(c=>c.GetParameters().Length==2).Invoke(new[]{f.Http,f.Codec});
            TransportError(Call(updater,"GetLatestReleases","fixture","fixture","fixture.zip",CancellationToken.None));
            Assert(f.Requests==1,"One mocked GitHub request");
        });
        Console.WriteLine("{\"total\":"+cases+",\"failures\":"+failures+",\"fixtureFilesRetained\":true}");
        return failures==0?0:1;
    }
}
