using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

// A fixed, same-directory commit. No copy, overwrite, deletion, network or shell
// command is accepted. Handles pin the actual source and its directory ancestry.
public static class EteMediaPublish {
    [StructLayout(LayoutKind.Sequential)] struct Info {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint sharing, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file, out Info info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle file, int kind, IntPtr value, uint size);
    static void Require(bool value) {if (!value) throw new IOException("unsafe-media-publication");}
    static Info Information(SafeFileHandle file) {
        Info value = new Info(); Require(!file.IsInvalid && GetFileInformationByHandle(file, out value));
        Require((value.Attributes & 0x400) == 0); return value;
    }
    static bool Matches(Info value, string dev, string ino) {
        return value.Volume.ToString() == dev && (((ulong)value.IndexHigh << 32) | value.IndexLow).ToString() == ino;
    }
    static string Extended(string value) {return value.StartsWith(@"\\") ? @"\\?\UNC\" + value.Substring(2) : @"\\?\" + value;}
    static void Name(string value) {
        Require(!String.IsNullOrEmpty(value) && Path.GetFileName(value) == value && value != "." && value != ".." &&
            value.IndexOfAny(Path.GetInvalidFileNameChars()) < 0 && !value.EndsWith(".") && !value.EndsWith(" "));
    }
    public static int Move(string directory, string from, string to, string rootDev, string rootIno, string fileDev, string fileIno, long size, string mtimeNs) {
        Require(Path.IsPathRooted(directory) && !directory.StartsWith(@"\\?\") && !directory.StartsWith(@"\\.\") &&
            String.Equals(Path.GetFullPath(directory), directory, StringComparison.OrdinalIgnoreCase));
        Name(from); Name(to); Require(from.StartsWith(".ete-media-") && from.EndsWith(".part") && !String.Equals(from, to, StringComparison.OrdinalIgnoreCase));
        var held = new List<SafeFileHandle>();
        SafeFileHandle file = null; IntPtr buffer = IntPtr.Zero;
        try {
            string current = Path.GetPathRoot(directory);
            var paths = new List<string>(); paths.Add(current);
            foreach (string component in directory.Substring(current.Length).Split(new char[]{'\\'}, StringSplitOptions.RemoveEmptyEntries)) {
                current = Path.Combine(current, component); paths.Add(current);
            }
            foreach (string path in paths) {
                // Share read/write, deny rename/deletion; OPEN_REPARSE_POINT
                // ensures a junction is inspected rather than traversed.
                var handle = CreateFileW(Extended(path), 0, 3, IntPtr.Zero, 3, 0x2200000, IntPtr.Zero); held.Add(handle);
                var info = Information(handle); Require((info.Attributes & 0x10) != 0);
            }
            var root = held[held.Count - 1]; Require(Matches(Information(root), rootDev, rootIno));
            file = CreateFileW(Extended(Path.Combine(directory, from)), 0x80010000, 1, IntPtr.Zero, 3, 0x200000, IntPtr.Zero);
            var before = Information(file);
            Require((before.Attributes & 0x10) == 0 && before.Links == 1 && Matches(before, fileDev, fileIno) && rootDev == fileDev &&
                (((ulong)before.SizeHigh << 32) | before.SizeLow) == (ulong)size && size > 0);
            ulong write = ((ulong)before.WriteHigh << 32) | before.WriteLow;
            Require(write >= 116444736000000000UL && ((write - 116444736000000000UL) * 100).ToString() == mtimeNs);
            byte[] name = Encoding.Unicode.GetBytes(to);
            int rootOffset = IntPtr.Size == 8 ? 8 : 4, lengthOffset = rootOffset + IntPtr.Size, nameOffset = lengthOffset + 4;
            int length = nameOffset + name.Length + 2;
            buffer = Marshal.AllocHGlobal(length);
            Marshal.Copy(new byte[length], 0, buffer, length);
            // ReplaceIfExists/Flags remains zero. An existing file or directory
            // wins atomically, including a name created after the caller's check.
            Marshal.WriteIntPtr(buffer, rootOffset, root.DangerousGetHandle());
            Marshal.WriteInt32(buffer, lengthOffset, name.Length);
            Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length);
            if (!SetFileInformationByHandle(file, 3, buffer, (uint)length)) {
                int error = Marshal.GetLastWin32Error();
                if (error == 5 && (File.Exists(Path.Combine(directory, to)) || Directory.Exists(Path.Combine(directory, to)))) return 183;
                return error;
            }
            return 0;
        } finally {
            if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
            if (file != null) file.Dispose();
            for (int i = held.Count - 1; i >= 0; i--) held[i].Dispose();
        }
    }
}
