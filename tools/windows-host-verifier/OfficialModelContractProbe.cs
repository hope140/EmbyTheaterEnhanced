using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Serialization;
using System.Threading;
using Emby.Theater.App;
using MediaBrowser.Common;

class SynchronousUnsupportedProbe
{
    const string Expected = "Legacy Host self-update is disabled in ETE.";
    static string Hash(string path) { using (var h=System.Security.Cryptography.SHA256.Create()) using(var f=File.OpenRead(path)) return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant(); }
    static void Dump(string role, Assembly a, string expected) {
        string hash=Hash(a.Location);
        Console.WriteLine(role+"Identity="+a.FullName); Console.WriteLine(role+"Location="+a.Location);
        Console.WriteLine(role+"SHA256="+hash); Console.WriteLine(role+"GAC="+a.GlobalAssemblyCache);
        if(expected!=null && hash!=expected) throw new Exception("Unexpected actual "+role+" hash");
    }
    static ApplicationHost Host() { return (ApplicationHost)FormatterServices.GetUninitializedObject(typeof(ApplicationHost)); }
    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Direct() { if(Host().CheckForApplicationUpdate(CancellationToken.None, null).GetAwaiter().GetResult().IsUpdateAvailable) throw new Exception("Expected no update"); }
    [MethodImpl(MethodImplOptions.NoInlining)]
    static void ViaInterface() { IApplicationHost host = Host(); if(host.CheckForApplicationUpdate(CancellationToken.None, null).GetAwaiter().GetResult().IsUpdateAvailable) throw new Exception("Expected no update"); }
    [MethodImpl(MethodImplOptions.NoInlining)]
    static void ViaReflection()
    {
        var task=(System.Threading.Tasks.Task<MediaBrowser.Model.Updates.CheckForUpdateResult>)typeof(ApplicationHost).GetMethod("CheckForApplicationUpdate").Invoke(Host(), new object[]{CancellationToken.None,null});
        if(task.GetAwaiter().GetResult().IsUpdateAvailable) throw new Exception("Expected no update");
    }
    static bool Test(string label,Action action,bool reflection)
    {
        try { action(); Console.WriteLine(label+"Passed=True"); Console.WriteLine(label+"Result=IsUpdateAvailable=False"); return true; }
        catch(Exception error) {Console.WriteLine(label+"Passed=False");Console.WriteLine(label+"Error="+error);return false;}
    }
    static bool Discovery()
    {
        Assembly hostAssembly = typeof(ApplicationHost).Assembly;
        Assembly model = Assembly.LoadFrom(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "MediaBrowser.Model.dll"));
        Assembly common = typeof(IApplicationHost).Assembly;
        Type hostType = typeof(ApplicationHost);
        object instance = Host();
        string logs = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "owned-loader-diagnostics");
        Directory.CreateDirectory(logs);
        Type managerType = hostAssembly.GetType("Emby.Theater.Logging.SimpleLogManager", true);
        object manager = Activator.CreateInstance(managerType, new object[] { logs, "contract" });
        try
        {
            Type severity = model.GetType("MediaBrowser.Model.Logging.LogSeverity", true);
            managerType.GetMethod("ReloadLogger").Invoke(manager, new object[] { Enum.Parse(severity, "Debug") });
            object logger = managerType.GetMethod("GetLogger", new Type[] { typeof(string) }).Invoke(manager, new object[] { "Contract" });
            hostType.GetProperty("Logger", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
                .GetSetMethod(true).Invoke(instance, new object[] { logger });
            MethodInfo loader = hostType.GetMethod("GetTypes", BindingFlags.Instance | BindingFlags.NonPublic);
            Type[] concrete = new Assembly[] { hostAssembly, model, common }
                .SelectMany(a => (IEnumerable<Type>)loader.Invoke(instance, new object[] { a }))
                .Where(t => t.IsClass && !t.IsAbstract && !t.IsInterface && !t.IsGenericType).ToArray();
            hostType.GetProperty("AllConcreteTypes").GetSetMethod(true).Invoke(instance, new object[] { concrete });
            Type taskType = model.GetType("MediaBrowser.Model.Tasks.IScheduledTask", true);
            var names = new List<string>();
            foreach (Type type in (IEnumerable)hostType.GetMethod("GetExportTypes").MakeGenericMethod(taskType).Invoke(instance, null)) names.Add(type.FullName);
            Console.WriteLine("DiscoveredScheduledTasks=" + String.Join(";", names));
            bool passed = !names.Contains("Emby.Theater.App.SystemUpdateTask");
            Console.WriteLine("OldTaskAbsent=" + passed);
            return passed;
        }
        finally { ((IDisposable)manager).Dispose(); }
    }
    static int Main()
    {
        Console.OutputEncoding=new System.Text.UTF8Encoding(false);
        Console.WriteLine("CLR="+Environment.Version);
        Console.WriteLine("RuntimeDirectory="+System.Runtime.InteropServices.RuntimeEnvironment.GetRuntimeDirectory());
        Dump("Host",typeof(ApplicationHost).Assembly,null);
        Dump("Model",typeof(MediaBrowser.Model.Updates.CheckForUpdateResult).Assembly,"db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153");
        Dump("Common",typeof(IApplicationHost).Assembly,"8fc955a5215e862f5bde882cedbe2be52e6a242d89d03406844993595d72657f");
        bool passed = true;
        Console.WriteLine("Is64BitProcess=" + Environment.Is64BitProcess);
        bool canSelfUpdate = Host().CanSelfUpdate;
        Console.WriteLine("CanSelfUpdate=" + canSelfUpdate); passed &= !canSelfUpdate;
        passed &= Test("Direct", Direct, false);
        passed &= Test("Interface", ViaInterface, false);
        passed &= Test("Reflection", ViaReflection, true);
        try
        {
            var installation = Host().UpdateApplication(null, CancellationToken.None, null);
            bool rejected = false;
            try { installation.GetAwaiter().GetResult(); }
            catch (NotSupportedException error) { rejected = installation.IsFaulted && error.Message == Expected; }
            Console.WriteLine("InstallFaultedTaskContractPassed=" + rejected); passed &= rejected;
        }
        catch (Exception error) { Console.WriteLine("InstallError=" + error); passed = false; }
        try { passed &= Discovery(); }
        catch (Exception error) { Console.WriteLine("DiscoveryError=" + error); passed = false; }
        Console.WriteLine("Scope=Isolated method/discovery objects, not live server instance; no Model rewrite or framework workaround.");
        Console.WriteLine("Passed=" + passed);
        return passed ? 0 : 1;
    }
}
