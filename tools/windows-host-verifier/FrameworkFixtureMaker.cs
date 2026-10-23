// MIT. Work-owned synthetic ZIP fixture generator, no external inputs or runtime payloads.
using System; using System.IO; using System.IO.Compression; using System.Linq; using System.Text; using System.Collections.Generic;
static class FrameworkFixtureMaker {
 class Entry { public string Name; public byte[] Data=Encoding.UTF8.GetBytes("payload"), Extra=new byte[0], CentralExtra=new byte[0]; public ushort Flags, Method; public bool Descriptor; }
 static string root;
 static byte[] Bytes(Action<BinaryWriter> f){using(var m=new MemoryStream()){using(var w=new BinaryWriter(m,Encoding.UTF8,true))f(w);return m.ToArray();}}
 static uint CRC(byte[] b){uint c=0xffffffff;foreach(byte x in b){c^=x;for(int j=0;j<8;j++)c=(c&1)!=0?(c>>1)^0xedb88320:c>>1;}return ~c;}
 static byte[] Deflate(byte[] b){using(var m=new MemoryStream()){using(var d=new DeflateStream(m,CompressionMode.Compress,true))d.Write(b,0,b.Length);return m.ToArray();}}
 static byte[] Extra(string s,byte version=1,uint crc=0){var b=Encoding.UTF8.GetBytes(s);return Bytes(w=>{w.Write((ushort)0x7075);w.Write((ushort)(5+b.Length));w.Write(version);w.Write(crc);w.Write(b);});}
 static Entry E(string name,string data="payload"){return new Entry{Name=name,Data=Encoding.UTF8.GetBytes(data)};}
 static void Make(string name,Entry[] entries,bool reverse=false){
  var locals=new List<byte[]>();var central=new List<byte[]>();uint offset=0;
  foreach(var e in entries){byte[] n=Encoding.UTF8.GetBytes(e.Name),packed=e.Method==8?Deflate(e.Data):e.Data;uint crc=CRC(e.Data);ushort flags=(ushort)(e.Flags|(e.Descriptor?8:0));
   byte[] local=Bytes(w=>{w.Write(0x04034b50u);w.Write((ushort)20);w.Write(flags);w.Write(e.Method);w.Write((ushort)0);w.Write((ushort)0);w.Write(e.Descriptor?0u:crc);w.Write(e.Descriptor?0u:(uint)packed.Length);w.Write(e.Descriptor?0u:(uint)e.Data.Length);w.Write((ushort)n.Length);w.Write((ushort)e.Extra.Length);w.Write(n);w.Write(e.Extra);w.Write(packed);if(e.Descriptor){w.Write(0x08074b50u);w.Write(crc);w.Write((uint)packed.Length);w.Write((uint)e.Data.Length);}});
   central.Add(Bytes(w=>{w.Write(0x02014b50u);w.Write((ushort)20);w.Write((ushort)20);w.Write(flags);w.Write(e.Method);w.Write((ushort)0);w.Write((ushort)0);w.Write(crc);w.Write((uint)packed.Length);w.Write((uint)e.Data.Length);w.Write((ushort)n.Length);w.Write((ushort)e.CentralExtra.Length);w.Write((ushort)0);w.Write((ushort)0);w.Write((ushort)0);w.Write(0u);w.Write(offset);w.Write(n);w.Write(e.CentralExtra);}));locals.Add(local);offset+=(uint)local.Length;
  }
  if(reverse)central.Reverse();uint size=(uint)central.Sum(b=>b.Length);File.WriteAllBytes(Path.Combine(root,name),Bytes(w=>{foreach(var b in locals)w.Write(b);foreach(var b in central)w.Write(b);w.Write(0x06054b50u);w.Write((ushort)0);w.Write((ushort)0);w.Write((ushort)entries.Length);w.Write((ushort)entries.Length);w.Write(size);w.Write(offset);w.Write((ushort)0);}));
 }
 static void Main(string[] args){root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
  Make("stored.zip",new[]{E("emptydir/",""),E("dir/",""),E("dir/a.txt","stored"),E("empty","")});
  var def=E("dir/a.txt",String.Concat(Enumerable.Repeat("deflated",1000)));def.Method=8;Make("deflate.zip",new[]{def});
  var utf=E("目录/视频.txt","中文");utf.Flags=0x800;Make("utf8.zip",new[]{utf});
  var un=E("fallback.txt","local-wins");un.Extra=Extra("目录/真实.txt");un.CentralExtra=Extra("central-wrong.txt");Make("unicode-local.zip",new[]{un});
  var crc=E("old.txt","legacy-unchecked");crc.Extra=Extra("unicode.txt",9,0x12345678);Make("unicode-unchecked-crc.zip",new[]{crc});
  var first=E("old.txt","first");first.Extra=Extra("first.txt").Concat(Extra("second.txt")).ToArray();Make("unicode-first.zip",new[]{first});
  Make("central-order.zip",new[]{E("same.txt","first"),E("same.txt","last")},true);
  var dd=E("a.txt",String.Concat(Enumerable.Repeat("descriptor",100)));dd.Method=8;dd.Descriptor=true;Make("descriptor.zip",new[]{dd});
  var bad=E("a.txt");bad.Method=12;Make("bad-method.zip",new[]{bad});var enc=E("a.txt");enc.Flags=1;Make("encrypted.zip",new[]{enc});
  var trunc=E("a.txt");trunc.Extra=new byte[]{0x75,0x70,2,0,120,120};Make("unicode-truncated.zip",new[]{trunc});
  string[] labels={"parent","absolute","drive","backslash","ads"},paths={"../outside","/outside","C:/outside","..\\outside","a.txt:stream"};for(int i=0;i<labels.Length;i++)Make("path-"+labels[i]+".zip",new[]{E(paths[i])});
  Make("preflight-path.zip",new[]{E("first.txt"),E("../outside")});Make("empty.zip",new Entry[0]);
  using(var m=new MemoryStream()){using(var g=new GZipStream(m,CompressionMode.Compress,true))g.WriteByte(120);File.WriteAllBytes(Path.Combine(root,"gzip.bin"),m.ToArray());}
  var d=File.ReadAllBytes(Path.Combine(root,"deflate.zip"));File.WriteAllBytes(Path.Combine(root,"truncated.zip"),d.Take(d.Length-10).ToArray());
  var marker=File.ReadAllBytes(Path.Combine(root,"stored.zip"));marker[marker.Length-12]=255;marker[marker.Length-11]=255;File.WriteAllBytes(Path.Combine(root,"zip64-marker.zip"),marker);
  var altered=File.ReadAllBytes(Path.Combine(root,"stored.zip"));int count=0;for(int i=0;i<altered.Length-4;i++)if(BitConverter.ToUInt32(altered,i)==0x02014b50u&&++count==3){for(int j=0;j<4;j++)altered[i+16+j]=0;break;}File.WriteAllBytes(Path.Combine(root,"bad-crc.zip"),altered);
  Console.WriteLine("Synthetic fixture files="+Directory.GetFiles(root).Length);
 }
}
