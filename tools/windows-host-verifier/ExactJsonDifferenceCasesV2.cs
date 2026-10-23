// MIT. Fixed synthetic bytes, real official DTOs, no file/config/network access.
using System; using System.IO; using System.Text; using System.Reflection; using System.Security.Cryptography; using System.Collections.Generic;
using Newtonsoft.Json; using Codec=Emby.Theater.Serialization.JsonSerializer;
class ExactJsonDifferenceCases {
 static readonly UTF8Encoding Utf8=new UTF8Encoding(false);static Codec codec;static Assembly model;
 sealed class Input:MemoryStream {internal bool Closed;internal Input(byte[] data):base(data){}protected override void Dispose(bool d){Closed=true;base.Dispose(d);}}
 static string Hash(byte[] data){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(data)).Replace("-","").ToLowerInvariant();}
 static string FileHash(string p){return Hash(File.ReadAllBytes(p));}
 static object Bytes(string value){byte[] data=Utf8.GetBytes(value);return new{text=value,encoding="UTF-8; no BOM; no newline",length=data.Length,hex=BitConverter.ToString(data).Replace("-",""),base64=Convert.ToBase64String(data),sha256=Hash(data)};}
 static object ReadCase(string label,string text,Type type,bool stream){
  var input=stream?new Input(Utf8.GetBytes(text)):null;object result=null;Exception error=null;
  try{result=stream?codec.DeserializeFromStream(input,type):codec.DeserializeFromString(text,type);}catch(Exception e){error=e;}
  string output=null;if(result!=null)output=codec.SerializeToString(result);
  return new{label,dtoType=type.FullName,method=stream?"DeserializeFromStream(Stream,Type)":"DeserializeFromString(string,Type)",input=Bytes(text),returnedType=result==null?null:result.GetType().FullName,returnedArrayLength=result is Array?(int?)((Array)result).Length:null,returnedArrayFirstElementNull=result is Array&&((Array)result).Length>0?(bool?)(((Array)result).GetValue(0)==null):null,returnedArrayFirstElementType=result is Array&&((Array)result).Length>0&&((Array)result).GetValue(0)!=null?((Array)result).GetValue(0).GetType().FullName:null,returnedJson=output,exceptionType=error==null?null:error.GetType().FullName,exceptionMessage=error==null?null:error.Message,readStreamClosed=stream?(bool?)input.Closed:null,readStreamCanReadAfter=stream?(bool?)input.CanRead:null};
 }
 static void Main(){Console.OutputEncoding=Utf8;codec=new Codec(null,null);model=typeof(MediaBrowser.Model.Serialization.IJsonSerializer).Assembly;
  if(FileHash(model.Location)!="db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153")throw new Exception("Unexpected Model");
  Type trigger=model.GetType("MediaBrowser.Model.Tasks.TaskTriggerInfo",true);Type task=model.GetType("MediaBrowser.Model.Tasks.TaskResult",true);var array=Array.CreateInstance(trigger,1);
  string written=codec.SerializeToString(array);var rows=new List<object>();
  rows.Add(new{label="write-null-trigger-array",dtoType=array.GetType().FullName,method="SerializeToString(object)",inputObject="TaskTriggerInfo[1] whose only element is null; no JSON input bytes",output=Bytes(written),exceptionType=(string)null,readStreamClosed=(bool?)null});
  rows.Add(ReadCase("same-input-null-array","[null]",array.GetType(),true));
  rows.Add(ReadCase("same-input-empty-object-array","[{}]",array.GetType(),true));
  foreach(bool stream in new[]{false,true}){
   rows.Add(ReadCase("truncated-after-Name-colon","{\"Name\":",task,stream));
   rows.Add(ReadCase("two-adjacent-empty-objects","{}{}",task,stream));
  }
  Console.WriteLine(JsonConvert.SerializeObject(new{clr=Environment.Version.ToString(),is64=Environment.Is64BitProcess,modelSHA256=FileHash(model.Location),modelPath=model.Location,codecSHA256=FileHash(typeof(Codec).Assembly.Location),codecPath=typeof(Codec).Assembly.Location,cases=rows,scope="Only these exact synthetic inputs; no general claim about other malformed JSON"},Formatting.Indented));
 }
}
