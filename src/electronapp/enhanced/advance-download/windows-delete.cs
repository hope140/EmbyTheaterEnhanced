using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

// Explicit user-confirmed deletion of one indexed file. Pin its ancestors and
// exact handle; verify receipt identity, time, size and full SHA before marking
// that handle for deletion. No directory, wildcard, shell or recursive operation.
public static class EteMediaDelete {
    public static string Stage = "input";
    [StructLayout(LayoutKind.Sequential)] struct Info {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint sharing, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file, out Info info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle file, int kind, IntPtr value, uint size);
    static void Require(bool value) {if (!value) throw new IOException("unsafe-media-deletion");}
    static Info Information(SafeFileHandle file) {
        Info value = new Info(); Require(!file.IsInvalid && GetFileInformationByHandle(file, out value));
        Require((value.Attributes & 0x400) == 0); return value;
    }
    static bool Matches(Info value, string dev, string ino) {
        return value.Volume.ToString() == dev && (((ulong)value.IndexHigh << 32) | value.IndexLow).ToString() == ino;
    }
    static string Extended(string value) {return value.StartsWith(@"\\") ? @"\\?\UNC\" + value.Substring(2) : @"\\?\" + value;}
    public static string Delete(string directory, string name, string rootDev, string rootIno, string fileDev, string fileIno, long size, string mtimeNs, string sha256) {
        Require(Path.IsPathRooted(directory) && !directory.StartsWith(@"\\?\") && !directory.StartsWith(@"\\.\") &&
            String.Equals(Path.GetFullPath(directory), directory, StringComparison.OrdinalIgnoreCase));
        Require(!String.IsNullOrEmpty(name) && Path.GetFileName(name) == name && name != "." && name != ".." &&
            name.IndexOfAny(Path.GetInvalidFileNameChars()) < 0 && !name.EndsWith(".") && !name.EndsWith(" ") && size >= 0);
        var held = new List<SafeFileHandle>(); SafeFileHandle file = null; IntPtr buffer = IntPtr.Zero;
        try {
            string current = Path.GetPathRoot(directory); var paths = new List<string>(); paths.Add(current);
            foreach (string component in directory.Substring(current.Length).Split(new char[]{'\\'}, StringSplitOptions.RemoveEmptyEntries)) {
                current = Path.Combine(current, component); paths.Add(current);
            }
            foreach (string path in paths) {
                Stage = "ancestor";
                var handle = CreateFileW(Extended(path), 0, 3, IntPtr.Zero, 3, 0x2200000, IntPtr.Zero); held.Add(handle);
                Require((Information(handle).Attributes & 0x10) != 0);
            }
            Stage = "directory-identity";
            Require(Matches(Information(held[held.Count-1]), rootDev, rootIno));
            Stage = "source-open";
            file = CreateFileW(Extended(Path.Combine(directory, name)), 0x80010000, 1, IntPtr.Zero, 3, 0x200000, IntPtr.Zero);
            var before = Information(file);
            Stage = "source-identity";
            Require((before.Attributes & 0x10) == 0 && before.Links == 1 && fileIno != "0" && rootDev == fileDev &&
                Matches(before, fileDev, fileIno) && (((ulong)before.SizeHigh << 32) | before.SizeLow) == (ulong)size);
            ulong write = ((ulong)before.WriteHigh << 32) | before.WriteLow;
            Stage = "source-time";
            Require(write >= 116444736000000000UL && ((write - 116444736000000000UL) * 100).ToString() == mtimeNs);
            using (var stream = new FileStream(file, FileAccess.Read, 1048576, false)) {
                Stage = "source-hash";
                using (var hash = SHA256.Create()) {
                    string actual = BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                    Require(actual == sha256);
                }
                // FILE_DISPOSITION_INFO contains one native BOOLEAN byte.
                buffer = Marshal.AllocHGlobal(1); Marshal.WriteByte(buffer, 1);
                Stage = "delete";
                Require(SetFileInformationByHandle(file, 4, buffer, 1));
            }
            return "0";
        } finally {
            if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
            if (file != null) file.Dispose();
            for (int i=held.Count-1; i>=0; i--) held[i].Dispose();
        }
    }
}
