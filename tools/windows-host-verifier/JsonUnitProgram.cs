// SPDX-License-Identifier: MIT
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Logging;
using Serializer = Emby.Theater.Serialization.JsonSerializer;

public enum Completion { Completed, Failed, Cancelled, Aborted }
[Flags] public enum Bits { None = 0, A = 1, B = 2 }
public class TaskResult
{
    public DateTime StartTimeUtc { get; set; }
    public DateTime EndTimeUtc { get; set; }
    public Completion Status { get; set; }
    public string Name { get; set; }
    public string Key { get; set; }
    public string Id { get; set; }
    public string ErrorMessage { get; set; }
    public string LongErrorMessage { get; set; }
}
public class Trigger
{
    public string Type { get; set; }
    public long? TimeOfDayTicks { get; set; }
    public long? IntervalTicks { get; set; }
    public Completion? SystemEvent { get; set; }
    public DayOfWeek? DayOfWeek { get; set; }
    public int? MaxRuntimeMs { get; set; }
}
public class VersionInfo
{
    public string versionStr { get; set; }
    [IgnoreDataMember] public Version version { get { return new Version(versionStr); } }
    public Completion classification { get; set; }
    public string sourceUrl { get; set; }
    public string checksum { get; set; }
    public string targetFilename { get; set; }
    public string runtimes { get; set; }
}
public class PackageInfo
{
    public string name { get; set; }
    public float price { get; set; }
    public bool isPremium { get; set; }
    public int? totalRatings { get; set; }
    public DateTime expDate { get; set; }
    public Completion targetSystem { get; set; }
    public VersionInfo[] versions { get; set; }
}
public class Config
{
    public bool EnableAutoUpdate { get; set; }
    public int LogFileRetentionDays { get; set; }
    public string CachePath { get; set; }
    public string IgnoredField = "do not emit";
}
public class Defaults
{
    public string Name { get; set; } = "seed";
    public Completion Status { get; set; } = Completion.Failed;
    public int Count { get; set; } = 7;
    public int[] Values { get; set; } = new[] { 9 };
    public DateTime? Time { get; set; }
    public Bits Flags { get; set; }
}
public class RecursivePoco
{
    public RecursivePoco[] Children { get; set; }
}
public class BrokenWriter
{
    public string Good { get { return "ok"; } }
    public string Broken { get { throw new InvalidOperationException("fixture getter failure"); } }
}
public class PlainFileSystem : IFileSystem
{
    public Stream GetFileStream(string path, FileOpenMode mode, FileAccessMode access, FileShareMode share)
    { return new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read); }
}
public class QuietLogger : ILogger { public void Debug(string message, params object[] args) { } }
public class NonSeekReadStream : Stream
{
    readonly MemoryStream inner;
    public bool Closed;
    public NonSeekReadStream(byte[] bytes) { inner = new MemoryStream(bytes); }
    public override bool CanRead { get { return !Closed; } }
    public override bool CanSeek { get { return false; } }
    public override bool CanWrite { get { return false; } }
    public override long Length { get { throw new NotSupportedException(); } }
    public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
    public override void Flush() { }
    public override int Read(byte[] b, int o, int c) { return inner.Read(b, o, c); }
    public override long Seek(long x, SeekOrigin y) { throw new NotSupportedException(); }
    public override void SetLength(long x) { throw new NotSupportedException(); }
    public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
    protected override void Dispose(bool disposing) { Closed = true; if (disposing) inner.Dispose(); base.Dispose(disposing); }
}
public static class Program
{
    static readonly Serializer Codec = new Serializer(new PlainFileSystem(), new QuietLogger());
    static readonly List<object> Results = new List<object>();
    static int failures;
    static void Assert(bool ok, string reason) { if (!ok) throw new Exception(reason); }
    static void Test(string name, Action test)
    {
        try { test(); Results.Add(new { name, status = "pass" }); }
        catch (Exception ex) { failures++; Results.Add(new { name, status = "fail", error = ex.GetType().Name + ": " + ex.Message }); }
    }
    static void Throws<T>(Action test) where T : Exception
    {
        try { test(); } catch (T) { return; }
        throw new Exception("Expected " + typeof(T).Name);
    }
    public static int Main()
    {
        Test("task-write-default-enum-and-null-omission", () => {
            var text = Codec.SerializeToString(new TaskResult { Name = "电影-é", StartTimeUtc = new DateTime(2026,10,23,1,2,3,DateTimeKind.Utc).AddTicks(1234567) });
            var t = JObject.Parse(text);
            Assert((string)t["Status"] == "Completed", "default enum string");
            Assert(t["ErrorMessage"] == null && t["Name"].ToString() == "电影-é", "null/UTF8");
            Assert(text.Contains("\"StartTimeUtc\":\"2026-10-23T01:02:03.1234567Z\""), "seven digits UTC");
        });
        Test("all-task-status-and-undefined-enum-roundtrip", () => {
            foreach (var status in new[] { Completion.Completed,Completion.Failed,Completion.Cancelled,Completion.Aborted,(Completion)99 }) {
                var text = Codec.SerializeToString(new TaskResult { Status = status });
                Assert(JObject.Parse(text)["Status"].Type == JTokenType.String, "ordinary enum must be string including undefined");
                Assert(Codec.DeserializeFromString<TaskResult>(text).Status == status, "enum roundtrip");
            }
        });
        Test("date-read-offset-z-and-no-zone", () => {
            foreach (var value in new[] { "2026-10-23T03:02:03.1234567+02:00", "2026-10-23T01:02:03.1234567Z", "2026-10-23T01:02:03.1234567" }) {
                var r = Codec.DeserializeFromString<TaskResult>("{\"StartTimeUtc\":\"" + value + "\"}");
                Assert(r.StartTimeUtc == new DateTime(2026,10,23,1,2,3,DateTimeKind.Utc).AddTicks(1234567) && r.StartTimeUtc.Kind == DateTimeKind.Utc, "normalize input");
            }
        });
        Test("date-write-unspecified-and-local", () => {
            var d = new DateTime(2026,1,2,3,4,5,DateTimeKind.Unspecified);
            Assert(Codec.SerializeToString(d) == "\"2026-01-02T03:04:05.0000000Z\"", "unspecified assumed UTC");
            d = DateTime.SpecifyKind(d,DateTimeKind.Local);
            Assert(Codec.SerializeToString(d) == "\""+d.ToString("o",CultureInfo.InvariantCulture)+"\"", "local offset preserved");
        });
        Test("legacy-date-microsoft-and-condensed", () => {
            Assert(Codec.DeserializeFromString<DateTime>("\"\\/Date(0)\\/\"") == new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc), "Microsoft date");
            var shifted = Codec.DeserializeFromString<DateTime>("\"/Date(0+0200)/\"");
            var expected = new DateTime(1970,1,1,2,0,0,DateTimeKind.Local).ToUniversalTime();
            Assert(shifted == expected && shifted.Kind == DateTimeKind.Utc, "legacy offset semantics");
            var condensed = Codec.DeserializeFromString<DateTime>("\"20261023\"");
            Assert(condensed.Kind == DateTimeKind.Unspecified && condensed.Day == 23, "legacy condensed kind");
        });
        Test("trigger-long-ticks-null-and-enums", () => {
            const long ticks = 9007199254740993L;
            var arr = new[] { new Trigger { Type="IntervalTrigger", IntervalTicks=ticks, DayOfWeek=DayOfWeek.Sunday, MaxRuntimeMs=0 }, null };
            var text = Codec.SerializeToString(arr);
            Assert(text.Contains("9007199254740993") && !text.Contains("TimeOfDayTicks") && text.Contains("\"Sunday\""), "stored trigger shape");
            var read = Codec.DeserializeFromString<IEnumerable<Trigger>>(text).ToArray();
            Assert(read[0].IntervalTicks == ticks && read[0].MaxRuntimeMs == 0 && read[1] != null && read[1].Type == null, "typed null writes empty object; ticks preserved");
        });
        Test("typed-poco-null-write-not-read", () => {
            Assert(Codec.SerializeToString(new Trigger[] { null }) == "[{}]", "Windows null-array write baseline");
            Assert(Codec.DeserializeFromString<Trigger[]>("[null]")[0] == null, "explicit null read remains null");
            Assert(Codec.DeserializeFromString<Trigger[]>("[{}]")[0] != null, "empty object read remains object");
            Assert(Codec.SerializeToString(new List<Trigger> { null }) == "[{}]", "typed List");
            Assert(Codec.SerializeToString(new Trigger[] { null }.Select(x => x)) == "[{}]", "typed enumerable");
            Assert(Codec.SerializeToString(new[] { new Trigger { Type="DailyTrigger" }, null }) == "[{\"Type\":\"DailyTrigger\"},{}]", "nonnull item unchanged");
        });
        Test("null-slot-rule-does-not-spread", () => {
            Assert(Codec.SerializeToString(new object[] { null }) == "[null]", "object slot");
            Assert(Codec.SerializeToString(new object[] { new Trigger(), null }) == "[{},null]", "late-bound object slot after POCO");
            Assert(Codec.SerializeToString(new string[] { null }) == "[null]", "string slot");
            Assert(Codec.SerializeToString(new int?[] { null }) == "[null]", "nullable scalar slot");
            Assert(Codec.SerializeToString(new Dictionary<string, Trigger>[] { null }) == "[null]", "dictionary slot");
            Assert(Codec.SerializeToString(new Trigger[][] { null }) == "[null]", "nested collection remains outside fix");
            Assert(Codec.SerializeToString(new Config()) == "{\"EnableAutoUpdate\":false,\"LogFileRetentionDays\":0}", "null property omission unchanged");
        });
        Test("poco-collection-recursive-contract-and-loop-check", () => {
            Assert(Codec.SerializeToString(new[] { new RecursivePoco { Children=new RecursivePoco[] { null } } }) == "[{\"Children\":[{}]}]", "nested typed contract");
            var node=new RecursivePoco(); node.Children=new[] { node };
            Throws<Newtonsoft.Json.JsonSerializationException>(() => Codec.SerializeToString(new[] { node }));
        });
        Test("typed-poco-null-stream-and-file", () => {
            var stream = new MemoryStream(); Codec.SerializeToStream(new Trigger[] { null }, stream);
            Assert(stream.CanWrite && Encoding.UTF8.GetString(stream.ToArray()) == "[{}]", "write stream open/exact bytes");
            var root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "json-null-" + Guid.NewGuid()); Directory.CreateDirectory(root);
            try {
                var file = Path.Combine(root, "triggers.js"); Codec.SerializeToFile(new Trigger[] { null }, file);
                Assert(File.ReadAllText(file) == "[{}]", "file write");
            } finally { Directory.Delete(root,true); }
        });
        Test("all-trigger-shapes", () => {
            foreach(var type in new[] { "DailyTrigger","WeeklyTrigger","IntervalTrigger","StartupTrigger","SystemEventTrigger" }) {
                var t = new Trigger { Type=type,TimeOfDayTicks=864000000000L,SystemEvent=Completion.Completed };
                Assert(Codec.DeserializeFromString<Trigger>(Codec.SerializeToString(t)).Type == type,"trigger type");
            }
        });
        Test("package-remote-fixture-and-custom-ignore", () => {
            var r = Codec.DeserializeFromString<PackageInfo[]>("[{\"name\":\"测试\",\"price\":1.25,\"isPremium\":true,\"totalRatings\":null,\"expDate\":\"2026-10-23T00:00:00Z\",\"targetSystem\":1,\"unknown\":{},\"versions\":[{\"versionStr\":\"1.2.3\",\"classification\":\"completed\",\"sourceUrl\":\"https://invalid.example/no-request.zip\",\"checksum\":\"abc\",\"runtimes\":\"netframework\",\"version\":{\"Major\":99}}]}]");
            Assert(r[0].price == 1.25F && r[0].versions[0].version.ToString() == "1.2.3" && r[0].versions[0].classification == Completion.Completed,"package read");
            var text = Codec.SerializeToString(r);
            Assert(!text.Contains("\"version\":") && text.Contains("\"versionStr\":"), "custom IgnoreDataMember honored");
        });
        Test("config-defaults-and-property-only", () => {
            var t = JObject.Parse(Codec.SerializeToString(new Config()));
            Assert((bool)t["EnableAutoUpdate"] == false && (int)t["LogFileRetentionDays"] == 0,"false/0 kept");
            Assert(t["CachePath"] == null && t["IgnoredField"] == null && t["$type"] == null && t["__type"] == null,"field/null/type excluded");
        });
        Test("unknown-case-member-and-no-type-activation", () => {
            var d = Codec.DeserializeFromString<Defaults>("{\"$type\":\"NoSuch.Type, NoSuch\",\"__type\":\"NoSuch.Type\",\"nAmE\":\"safe\",\"added\":42}");
            Assert(d.GetType() == typeof(Defaults) && d.Name == "safe", "known typed DTO/unknown ignored");
        });
        Test("null-assignment-missing-default-and-collection-replace", () => {
            var d = Codec.DeserializeFromString<Defaults>("{\"Name\":null,\"Values\":[1,2],\"Time\":null,\"Status\":null}");
            Assert(d.Name == null && d.Count == 7 && d.Status == Completion.Failed && d.Values.SequenceEqual(new[]{1,2}) && d.Time == null,"null/missing/replaced collection");
        });
        Test("bad-member-conversion-skipped-with-valid-members", () => {
            var d = Codec.DeserializeFromString<Defaults>("{\"Status\":\"not-a-status\",\"Count\":\"bad-int\",\"Name\":\"still-read\"}");
            Assert(d.Status == Completion.Failed && d.Count == 7 && d.Name == "still-read", "legacy tolerant member conversion");
        });
        Test("flags-numeric", () => {
            Assert((int)JObject.Parse(Codec.SerializeToString(new Defaults { Flags=Bits.A|Bits.B }))["Flags"] == 3,"flags numeric output");
            Assert(Codec.DeserializeFromString<Defaults>("{\"Flags\":\"A, B\"}").Flags == (Bits.A|Bits.B),"flags names input");
        });
        Test("stream-write-open-and-bom-free", () => {
            var s = new MemoryStream();Codec.SerializeToStream(new Config(),s);
            Assert(s.CanWrite && s.ToArray()[0] == (byte)'{', "writer leaves stream open, no BOM");s.Dispose();
        });
        Test("failed-write-does-not-flush-or-autocomplete-small-partial-document", () => {
            var s = new MemoryStream();
            Throws<Newtonsoft.Json.JsonSerializationException>(() => Codec.SerializeToStream(new BrokenWriter(), s));
            Assert(s.CanWrite && s.Length == 0, "failed object must not become flushed valid partial JSON");s.Dispose();
        });
        Test("stream-read-generic-closes-nonseek-utf8-bom", () => {
            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes("{\"Name\":\"电影\"}")).ToArray();
            var s=new NonSeekReadStream(bytes);var d=Codec.DeserializeFromStream<Defaults>(s);
            Assert(d.Name == "电影" && s.Closed,"reader consumes BOM/nonseek and closes input");
        });
        Test("stream-read-runtime-type-closes-on-success-and-error", () => {
            var s=new NonSeekReadStream(Encoding.UTF8.GetBytes("{\"Name\":\"x\"}"));
            Assert(((Defaults)Codec.DeserializeFromStream(s,typeof(Defaults))).Name == "x" && s.Closed,"type overload");
            s=new NonSeekReadStream(Encoding.UTF8.GetBytes("{\"Name\":"));
            Throws<Newtonsoft.Json.JsonReaderException>(()=>Codec.DeserializeFromStream(s,typeof(Defaults)));Assert(s.Closed,"error closes");
        });
        Test("empty-stream-default-and-null-string", () => {
            var s=new MemoryStream();Assert(Codec.DeserializeFromStream<TaskResult>(s)==null && !s.CanRead,"empty stream");
            Assert(Codec.DeserializeFromString<TaskResult>("null")==null,"null root");
        });
        Test("file-overloads-close-own-streams-and-retain-name", () => {
            var root=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ete-json-contract-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
            try { var path=Path.Combine(root,"history.js");Codec.SerializeToFile(new TaskResult { Name="stored",Status=Completion.Aborted },path);
                Assert(Codec.DeserializeFromFile<TaskResult>(path).Status == Completion.Aborted,"generic file");
                Assert(((TaskResult)Codec.DeserializeFromFile(typeof(TaskResult),path)).Name=="stored","runtime-type file");
                using(var exclusive=new FileStream(path,FileMode.Open,FileAccess.ReadWrite,FileShare.None)) Assert(exclusive.Length>0,"file released");
            } finally { Directory.Delete(root,true); }
        });
        Test("all-wrapper-null-empty-guards", () => {
            Throws<ArgumentNullException>(()=>Codec.SerializeToString(null));
            Throws<ArgumentNullException>(()=>Codec.SerializeToStream(null,new MemoryStream()));
            Throws<ArgumentNullException>(()=>Codec.SerializeToStream(new object(),null));
            Throws<ArgumentNullException>(()=>Codec.SerializeToFile(new object(),""));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromFile(typeof(object),""));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromFile(null,"x"));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromFile<TaskResult>(""));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromStream<TaskResult>(null));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromStream(null,typeof(object)));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromStream(new MemoryStream(),null));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromString<TaskResult>(""));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromString("",typeof(object)));
            Throws<ArgumentNullException>(()=>Codec.DeserializeFromString("{}",null));
        });
        Test("approved-incomplete-or-appended-TaskResult-errors", () => {
            // Approved abnormal-input change; valid DTO contracts remain separately tested.
            foreach (var input in new[] { "{\"Name\":", "{}{}" }) {
                Throws<Newtonsoft.Json.JsonReaderException>(() => Codec.DeserializeFromString<TaskResult>(input));
                Throws<Newtonsoft.Json.JsonReaderException>(() => Codec.DeserializeFromString(input,typeof(TaskResult)));
                var stream = new MemoryStream(Encoding.UTF8.GetBytes(input));
                Throws<Newtonsoft.Json.JsonReaderException>(() => Codec.DeserializeFromStream<TaskResult>(stream));
                Assert(!stream.CanRead,"generic damaged read closes stream");
                stream = new MemoryStream(Encoding.UTF8.GetBytes(input));
                Throws<Newtonsoft.Json.JsonReaderException>(() => Codec.DeserializeFromStream(stream,typeof(TaskResult)));
                Assert(!stream.CanRead,"runtime-type damaged read closes stream");
            }
        });
        Test("approved-parser-errors-preserve-file-bytes", () => {
            var root=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"json-strict-"+Guid.NewGuid());Directory.CreateDirectory(root);
            try { foreach(var input in new[] { "{\"Name\":", "{}{}" }) {
                var file=Path.Combine(root,"history.js");var bytes=Encoding.UTF8.GetBytes(input);File.WriteAllBytes(file,bytes);
                Throws<Newtonsoft.Json.JsonReaderException>(()=>Codec.DeserializeFromFile<TaskResult>(file));
                Assert(File.ReadAllBytes(file).SequenceEqual(bytes),"generic read does not replace damaged history");
                Throws<Newtonsoft.Json.JsonReaderException>(()=>Codec.DeserializeFromFile(typeof(TaskResult),file));
                Assert(File.ReadAllBytes(file).SequenceEqual(bytes),"Type read does not replace damaged history");
                using(var check=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.None))Assert(check.Length==bytes.Length,"file handle released");
            }} finally { Directory.Delete(root,true); } // Only this test's synthetic directory.
        });
        Test("complete-documents-still-materialize", () => {
            var empty=Codec.DeserializeFromString<TaskResult>("{}");
            Assert(empty!=null && empty.Status==Completion.Completed,"complete empty object remains valid");
            var named=Codec.DeserializeFromString<TaskResult>(" \r\n{\"Name\":\"kept\"}\t ");
            Assert(named.Name=="kept","surrounding whitespace accepted");
            Assert(!Codec.SerializeToString(named).Contains("Error"),"no injected failure fields");
            Assert(Codec.DeserializeFromString<Trigger[]>("[]").Length==0,"valid empty trigger array");
            Assert(Codec.DeserializeFromString<PackageInfo[]>("[]").Length==0,"valid empty package array");
        });
        Test("malformed-json-not-partial-object", () => {
            Throws<Newtonsoft.Json.JsonReaderException>(()=>Codec.DeserializeFromString<Defaults>("{\"Name\":\"x\""));
            Throws<Newtonsoft.Json.JsonException>(()=>Codec.DeserializeFromString<Defaults>("{}{}"));
        });
        Console.WriteLine(Newtonsoft.Json.JsonConvert.SerializeObject(new { total=Results.Count, failures, fixture="Windows net462/x86 stubs; actual Model DTOs tested separately; strict document errors are approved",clr=Environment.Version.ToString(),is64=Environment.Is64BitProcess, results=Results },Newtonsoft.Json.Formatting.Indented));
        return failures == 0 ? 0 : 1;
    }
}
