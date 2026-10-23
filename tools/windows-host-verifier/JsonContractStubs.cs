// SPDX-License-Identifier: MIT
// Minimal executable test interfaces/DTOs; never substituted for the actual Model build reference.
using System;
using System.IO;
namespace MediaBrowser.Model.Serialization
{
    [AttributeUsage(AttributeTargets.Property)] public class IgnoreDataMemberAttribute : Attribute { }
    public interface IJsonSerializer
    {
        void SerializeToStream(object obj, Stream stream);
        void SerializeToFile(object obj, string file);
        object DeserializeFromFile(Type type, string file);
        T DeserializeFromFile<T>(string file) where T : class;
        T DeserializeFromStream<T>(Stream stream);
        T DeserializeFromString<T>(string text);
        object DeserializeFromStream(Stream stream, Type type);
        object DeserializeFromString(string json, Type type);
        string SerializeToString(object obj);
    }
}
namespace MediaBrowser.Model.IO
{
    public enum FileOpenMode { Create }
    public enum FileAccessMode { Write }
    public enum FileShareMode { Read }
    public interface IFileSystem
    {
        Stream GetFileStream(string path, FileOpenMode mode, FileAccessMode access, FileShareMode share);
    }
}
namespace MediaBrowser.Model.Logging
{
    public interface ILogger { void Debug(string message, params object[] args); }
}
