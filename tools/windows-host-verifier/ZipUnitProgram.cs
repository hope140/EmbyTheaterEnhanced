// SPDX-License-Identifier: MIT
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using Emby.Theater.Archiving;
using MediaBrowser.Model.IO;
class Program
{
    static string root,fixtures; static int passes;
    static readonly List<object> results = new List<object>();
    static void Main(string[] args)
    {
        // Framework supplies the selected Windows OEM encoding; no provider registration.
        root=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"host-zip-tests-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);fixtures=Path.GetFullPath(args[0]);
        try
        {
            Run("Stored/directories/empty-file",()=>{var d=Extract("stored.zip");Equal("stored",File.ReadAllText(Path.Combine(d,"dir/a.txt")));Equal(0L,new FileInfo(Path.Combine(d,"empty")).Length);True(Directory.Exists(Path.Combine(d,"emptydir")));Equal(0,Directory.GetFileSystemEntries(Path.Combine(d,"emptydir")).Length);});
            Run("DEFLATE",()=>{var d=Extract("deflate.zip");Equal(8000,File.ReadAllBytes(Path.Combine(d,"dir/a.txt")).Length);});
            Run("UTF8",()=>{var d=Extract("utf8.zip");Equal("中文",File.ReadAllText(Path.Combine(d,"目录/视频.txt")));});
            Run("0x7075-local-overrides-central",()=>{var d=Extract("unicode-local.zip");Equal("local-wins",File.ReadAllText(Path.Combine(d,"目录/真实.txt")));});
            Run("0x7075-legacy-no-version-or-crc-validation",()=>{var d=Extract("unicode-unchecked-crc.zip");Equal("legacy-unchecked",File.ReadAllText(Path.Combine(d,"unicode.txt")));});
            Run("0x7075-first-field-wins",()=>{var d=Extract("unicode-first.zip");Equal("first",File.ReadAllText(Path.Combine(d,"first.txt")));});
            Run("local-header-order-preserved",()=>{var d=Extract("central-order.zip");Equal("last",File.ReadAllText(Path.Combine(d,"same.txt")));});
            Run("data-descriptor",()=>{var d=Extract("descriptor.zip");Equal(1000,File.ReadAllBytes(Path.Combine(d,"a.txt")).Length);});
            Run("overwrite-true",()=>{var d=Extract("stored.zip");File.WriteAllText(Path.Combine(d,"dir/a.txt"),"old");WithSource("stored.zip",s=>Client().ExtractAll(s,d,true));Equal("stored",File.ReadAllText(Path.Combine(d,"dir/a.txt")));});
            Run("overwrite-false",()=>{var d=Extract("stored.zip");Throws<IOException>(()=>WithSource("stored.zip",s=>Client().ExtractAll(s,d,false)));Equal("stored",File.ReadAllText(Path.Combine(d,"dir/a.txt")));});
            Run("caller-stream-retained-success",()=>{using(var s=File.OpenRead(F("stored.zip"))){Client().ExtractAll(s,Out(),true);True(s.CanRead);}});
            Run("caller-stream-retained-failure",()=>{using(var s=File.OpenRead(F("bad-method.zip"))){Throws<NotSupportedException>(()=>Client().ExtractAll(s,Out(),true));True(s.CanRead);}});
            Run("non-seekable-stream",()=>{using(var s=new NonSeek(File.ReadAllBytes(F("stored.zip")))){var d=Out();Client().ExtractAll(s,d,true);True(!s.Closed);Equal("stored",File.ReadAllText(Path.Combine(d,"dir/a.txt")));}});
            Run("current-stream-position",()=>{byte[] zip=File.ReadAllBytes(F("stored.zip"));using(var s=new MemoryStream(new byte[7].Concat(zip).ToArray())){s.Position=7;var d=Out();Client().ExtractAll(s,d,true);Equal("stored",File.ReadAllText(Path.Combine(d,"dir/a.txt")));}});
            Run("file-overload-owns-stream",()=>{var fs=new Fs();new ZipClient(fs).ExtractAll(F("stored.zip"),Out(),true);True(!fs.Last.CanRead);});
            Run("four-stream-stubs-retained",()=>{var c=Client();c.ExtractAllFromZip(null,null,false);c.ExtractAllFrom7z((Stream)null,null,false);c.ExtractAllFromTar((Stream)null,null,false);c.ExtractAllFromRar((Stream)null,null,false);});
            Run("three-file-stubs-open-and-dispose",()=>{var fs=new Fs();var c=new ZipClient(fs);c.ExtractAllFrom7z(F("stored.zip"),null,false);True(!fs.Last.CanRead);c.ExtractAllFromTar(F("stored.zip"),null,false);True(!fs.Last.CanRead);c.ExtractAllFromRar(F("stored.zip"),null,false);True(!fs.Last.CanRead);Equal(3,fs.Opens);});
            foreach(string n in new[]{"parent","absolute","drive","backslash","ads"}){var q=n;Run("path-boundary-"+q,()=>Throws<InvalidDataException>(()=>Extract("path-"+q+".zip")));}
            Run("all-paths-preflight-before-output",()=>{var d=Out();Throws<InvalidDataException>(()=>WithSource("preflight-path.zip",s=>Client().ExtractAll(s,d,true)));True(!Directory.Exists(d));});
            Run("unsupported-ZIP-method12-explicit",()=>Throws<NotSupportedException>(()=>Extract("bad-method.zip")));
            Run("encrypted-ZIP-explicit",()=>Throws<NotSupportedException>(()=>Extract("encrypted.zip")));
            Run("ZIP64-explicit",()=>Throws<NotSupportedException>(()=>Extract("zip64-marker.zip")));
            Run("nonZIP-GZip-explicit-failure",()=>Throws<InvalidDataException>(()=>Extract("gzip.bin")));
            Run("truncated-end-record",()=>Throws<InvalidDataException>(()=>Extract("truncated.zip")));
            Run("truncated-Unicode-extra",()=>Throws<InvalidDataException>(()=>Extract("unicode-truncated.zip")));
            Run("empty-archive-no-output",()=>{var d=Out();WithSource("empty.zip",s=>Client().ExtractAll(s,d,true));True(!Directory.Exists(d));});
            // A measured limit, deliberately not a claim of old Sharp parity.
            Run("CRC-limit-measured",()=>{var d=Extract("bad-crc.zip");Equal("stored",File.ReadAllText(Path.Combine(d,"dir/a.txt")));});
            if(args.Length>1)Run("official-3.0.20-x64-199-files-hash-match",()=>Official(args[1],args[2]));
            Console.WriteLine(new JavaScriptSerializer().Serialize(new{status="PASS",framework=Environment.Version.ToString(),tests=passes,results,scope="Windows Framework x86/net462 fixture with test interface stubs; not actual intended Model or complete Host evidence."}));
        }
        finally {Console.Error.WriteLine("OwnedTestRoot="+root);}
    }
    static void Official(string archive,string expected)
    {
        var d=Out();using(var s=File.OpenRead(archive))Client().ExtractAll(s,d,true);
        var entries=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(expected));Equal(199,entries.Count);
        Equal(199,Directory.GetFiles(d,"*",SearchOption.AllDirectories).Length);
        foreach(var x in entries)using(var stream=File.OpenRead(Path.Combine(d,x.Key)))using(var sha=SHA256.Create())Equal(x.Value,BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant());
    }
    static void Run(string name,Action action){try{action();passes++;Console.Error.WriteLine("PASS="+name);results.Add(new{name,status="PASS"});}catch(Exception e){Console.Error.WriteLine(name+" FAILED "+e);throw;}}
    static void Equal<T>(T expected,T actual){if(!object.Equals(expected,actual))throw new Exception("Expected "+expected+" got "+actual);}
    static void True(bool value){if(!value)throw new Exception("Assertion failed");}
    static void Throws<T>(Action f) where T:Exception {try{f();}catch(T){return;}throw new Exception("Expected "+typeof(T).Name);}
    static string F(string n){return Path.Combine(fixtures,n);}static string Out(){return Path.Combine(root,Guid.NewGuid().ToString("N"));}
    static ZipClient Client(){return new ZipClient(new Fs());}
    static void WithSource(string name,Action<Stream> a){using(var s=File.OpenRead(F(name)))a(s);}
    static string Extract(string name){string d=Out();WithSource(name,s=>Client().ExtractAll(s,d,true));return d;}
    sealed class Fs:IFileSystem {internal Stream Last;internal int Opens;public Stream OpenRead(string p){Opens++;return Last=File.OpenRead(p);}}
    sealed class NonSeek:Stream
    {
        readonly MemoryStream inner;internal bool Closed;internal NonSeek(byte[] b){inner=new MemoryStream(b);}
        public override bool CanRead{get{return !Closed;}}public override bool CanSeek{get{return false;}}public override bool CanWrite{get{return false;}}
        public override long Length{get{throw new NotSupportedException();}}public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}}
        public override int Read(byte[] b,int o,int c){return inner.Read(b,o,c);}public override void Flush(){throw new NotSupportedException();}public override long Seek(long o,SeekOrigin x){throw new NotSupportedException();}public override void SetLength(long v){throw new NotSupportedException();}public override void Write(byte[] b,int o,int c){throw new NotSupportedException();}
        protected override void Dispose(bool d){Closed=true;if(d)inner.Dispose();base.Dispose(d);}
    }
}
