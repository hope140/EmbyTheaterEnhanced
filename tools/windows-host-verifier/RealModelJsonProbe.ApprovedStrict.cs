// MIT. Actual approved Model DTO/interface tests, all paths under owned test directory.
using System; using System.IO; using System.Text; using System.Linq; using System.Reflection; using System.Collections.Generic;
using System.Runtime.Remoting.Proxies; using System.Runtime.Remoting.Messaging; using System.Security.Cryptography;
using Newtonsoft.Json; using Newtonsoft.Json.Linq; using MediaBrowser.Model.IO; using MediaBrowser.Model.Logging; using MediaBrowser.Model.Serialization;
using Codec=Emby.Theater.Serialization.JsonSerializer;
class RealModelJsonProbe {
 static readonly List<object> results=new List<object>(); static Codec codec; static string root; static Assembly model; static int failures;
 static void Check(bool value,string text){if(!value)throw new Exception(text);}
 static void Test(string name,Action f){try{f();results.Add(new{name,status="pass"});}catch(Exception e){failures++;results.Add(new{name,status="fail",error=e.ToString()});}}
 static Type T(string name){return model.GetType("MediaBrowser.Model."+name,true);}
 static object New(string name){return Activator.CreateInstance(T(name));}
 static void Set(object obj,string key,object value){obj.GetType().GetProperty(key).SetValue(obj,value,null);}
 static object Get(object obj,string key){return obj.GetType().GetProperty(key).GetValue(obj,null);}
 static string Hash(string path){using(var h=SHA256.Create())using(var s=File.OpenRead(path))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 sealed class Proxy:RealProxy {
  readonly bool files; public Proxy(Type type,bool files):base(type){this.files=files;}
  public override IMessage Invoke(IMessage message){var call=(IMethodCallMessage)message;try{
   if(files && call.MethodName=="GetFileStream"){
    string p=Path.GetFullPath((string)call.Args[0]);if(!p.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("File boundary");
    Stream stream=new FileStream(p,FileMode.Create,FileAccess.Write,FileShare.Read);return new ReturnMessage(stream,null,0,call.LogicalCallContext,call);
   }
   if(!files&&call.MethodName=="Debug")return new ReturnMessage(null,null,0,call.LogicalCallContext,call);
   throw new NotSupportedException("Unexpected probe interface call: "+call.MethodName);
  }catch(Exception e){return new ReturnMessage(e,call);}}
 }
 sealed class Input:MemoryStream { public bool Closed; public Input(byte[] bytes):base(bytes){} protected override void Dispose(bool disposing){Closed=true;base.Dispose(disposing);} }
 public static int Main(){
  Console.OutputEncoding=new UTF8Encoding(false);model=typeof(IJsonSerializer).Assembly;root=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"real-model-owned-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  codec=new Codec((IFileSystem)new Proxy(typeof(IFileSystem),true).GetTransparentProxy(),(ILogger)new Proxy(typeof(ILogger),false).GetTransparentProxy());
  string modelHash=Hash(model.Location);Check(modelHash=="db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153","Official Model only");
  var metadata=new List<object>();foreach(string name in new[]{"Tasks.TaskResult","Tasks.TaskTriggerInfo","Updates.PackageInfo","Updates.PackageVersionInfo","Configuration.BaseApplicationConfiguration"}){
   Type type=model.GetType("MediaBrowser.Model."+name,false);if(type!=null)metadata.Add(new{name,properties=type.GetProperties().Select(p=>new{name=p.Name,type=p.PropertyType.FullName,attributes=CustomAttributeData.GetCustomAttributes(p).Select(a=>a.AttributeType.FullName).ToArray()}).ToArray()});
  }
  File.WriteAllText(Path.Combine(root,"actual-dto-shapes.json"),JsonConvert.SerializeObject(metadata,Formatting.Indented),new UTF8Encoding(false));
  Test("actual-nine-method-interface",()=>Check(typeof(Codec).GetInterfaceMap(typeof(IJsonSerializer)).InterfaceMethods.Length==9,"Nine methods"));
  Test("actual-task-UTC-date-enum-null-int64",()=>{
   object task=New("Tasks.TaskResult");var date=new DateTime(2026,10,23,1,2,3,DateTimeKind.Utc).AddTicks(1234567);Set(task,"StartTimeUtc",date);Set(task,"Name","电影-é");Set(task,"ErrorMessage",null);
   var token=JObject.Parse(codec.SerializeToString(task));Check(token["ErrorMessage"]==null&&token["Name"].ToString()=="电影-é","UTF8/null");Check(token["StartTimeUtc"].ToString().Length>0,"Date emitted");
   string text=codec.SerializeToString(task);Check(text.Contains("2026-10-23T01:02:03.1234567Z"),"Seven digits UTC");var back=codec.DeserializeFromString(text,task.GetType());Check((DateTime)Get(back,"StartTimeUtc")==date,"Real task date roundtrip");
  });
  Test("actual-task-all-statuses-and-undefined-enum",()=>{
   object task=New("Tasks.TaskResult");Type status=task.GetType().GetProperty("Status").PropertyType;foreach(var value in Enum.GetValues(status).Cast<object>().Concat(new[]{Enum.ToObject(status,99)})){Set(task,"Status",value);string text=codec.SerializeToString(task);Check(JObject.Parse(text)["Status"].Type==JTokenType.String,"Enum string");Check(Get(codec.DeserializeFromString(text,task.GetType()),"Status").Equals(value),"Actual enum roundtrip");}
  });
  Test("actual-trigger-null-int64-enum-array",()=>{
   object trigger=New("Tasks.TaskTriggerInfo");Set(trigger,"Type","WeeklyTrigger");Set(trigger,"IntervalTicks",9007199254740993L);Set(trigger,"DayOfWeek",DayOfWeek.Sunday);Set(trigger,"TimeOfDayTicks",null);
   var array=Array.CreateInstance(trigger.GetType(),2);array.SetValue(trigger,0);string text=codec.SerializeToString(array);Check(text.Contains("9007199254740993")&&text.Contains("\"Sunday\"")&&!text.Contains("TimeOfDayTicks"),"Actual trigger shape");
   var back=(Array)codec.DeserializeFromString(text,array.GetType());Check((long)Get(back.GetValue(0),"IntervalTicks")==9007199254740993L&&back.GetValue(1)!=null&&(string)Get(back.GetValue(1),"Type")==null,"Actual trigger long/typed-null-write-empty-object array");
  });
  Test("actual-task-date-offset-and-legacy-WCF",()=>{
   foreach(string value in new[]{"2026-10-23T03:02:03.1234567+02:00","2026-10-23T01:02:03.1234567Z","2026-10-23T01:02:03.1234567"}){object task=codec.DeserializeFromString("{\"StartTimeUtc\":\""+value+"\"}",T("Tasks.TaskResult"));var d=(DateTime)Get(task,"StartTimeUtc");Check(d.Kind==DateTimeKind.Utc&&d==new DateTime(2026,10,23,1,2,3,DateTimeKind.Utc).AddTicks(1234567),"Offset normalized");}
   object old=codec.DeserializeFromString("{\"StartTimeUtc\":\"/Date(0+0200)/\"}",T("Tasks.TaskResult"));Check((DateTime)Get(old,"StartTimeUtc")==new DateTime(1970,1,1,2,0,0,DateTimeKind.Local).ToUniversalTime(),"WCF semantics");
  });
  Test("actual-config-false-zero-null",()=>{
   object config=New("Configuration.BaseApplicationConfiguration");Set(config,"EnableAutoUpdate",false);Set(config,"LogFileRetentionDays",0);Set(config,"CachePath",null);var token=JObject.Parse(codec.SerializeToString(config));Check((bool)token["EnableAutoUpdate"]==false&&(int)token["LogFileRetentionDays"]==0&&token["CachePath"]==null,"Actual config defaults preserved");
  });
  Test("actual-package-version-custom-ignore",()=>{
   Type versionType=model.GetType("MediaBrowser.Model.Updates.PackageVersionInfo",false)??model.GetType("MediaBrowser.Model.Updates.VersionInfo",true);object version=Activator.CreateInstance(versionType);Set(version,"versionStr","1.2.3");string text=codec.SerializeToString(version);Check(text.Contains("\"versionStr\"")&&!text.Contains("\"version\":"),"Actual custom IgnoreDataMember");
  });
  Test("actual-DTO-stream-write-retained-read-closed",()=>{
   object task=New("Tasks.TaskResult");Set(task,"Name","stream-电影");var output=new MemoryStream();codec.SerializeToStream(task,output);Check(output.CanWrite&&output.ToArray()[0]==123,"Output retained/BOM free");var input=new Input(output.ToArray());var back=codec.DeserializeFromStream(input,task.GetType());Check(input.Closed&&(string)Get(back,"Name")=="stream-电影","Input closes");output.Dispose();
   var bad=new Input(Encoding.UTF8.GetBytes("{\"Name\":"));bool failed=false;try{codec.DeserializeFromStream(bad,task.GetType());}catch(JsonReaderException){failed=true;}Check(failed&&bad.Closed,"Bad input closes");
  });
  Test("actual-DTO-file-history-and-trigger-cache",()=>{
   object task=New("Tasks.TaskResult");Set(task,"Name","owned-history");string path=Path.Combine(root,"history.js");codec.SerializeToFile(task,path);Check((string)Get(codec.DeserializeFromFile(task.GetType(),path),"Name")=="owned-history","Actual history read");using(var exclusive=new FileStream(path,FileMode.Open,FileAccess.ReadWrite,FileShare.None))Check(exclusive.Length>0,"Own file released");
   object trigger=New("Tasks.TaskTriggerInfo");Set(trigger,"Type","IntervalTrigger");Set(trigger,"IntervalTicks",9007199254740993L);string cached=codec.SerializeToString(trigger);for(int i=0;i<100;i++){var read=codec.DeserializeFromString(cached,trigger.GetType());Check((long)Get(read,"IntervalTicks")==9007199254740993L,"Repeated DTO contract cache");}
  });
  Test("actual-DTO-invalid-member-and-unknown-type-suppression",()=>{
   object value=codec.DeserializeFromString("{\"$type\":\"NotReal.Type\",\"__type\":\"NotReal.Type\",\"Status\":\"bad-status\",\"Name\":\"still-read\",\"unknown\":{}}",T("Tasks.TaskResult"));Check(value.GetType()==T("Tasks.TaskResult")&&(string)Get(value,"Name")=="still-read","Typed materialization/no activation");
  });
  var report=new{total=results.Count,failures,modelIdentity=model.FullName,modelSHA256=modelHash,modelLocation=model.Location,newtonsoftSHA256=Hash(typeof(JsonConvert).Assembly.Location),clr=Environment.Version.ToString(),is64=Environment.Is64BitProcess,zone=TimeZoneInfo.Local.Id,ownedRoot=root,results};
  string json=JsonConvert.SerializeObject(report,Formatting.Indented);File.WriteAllText(Path.Combine(root,"result.json"),json,new UTF8Encoding(false));Console.WriteLine(json);return failures==0?0:1;
 }
}
