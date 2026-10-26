using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

// Windows handles make the final hash-to-ShellExecute interval indivisible with
// respect to path rename/reparse/write replacement. No URL, network or installer
// command-line options are accepted here. The trusted main process supplies the
// freshly revalidated official digest through the private stdin pipe.
public sealed class EteUpdateGuard : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Info {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint sharing, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file, out Info info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle file, int kind, ref byte value, uint size);
    readonly List<SafeFileHandle> directories = new List<SafeFileHandle>();
    readonly string directory;
    readonly bool cleanup;
    readonly string volume;
    SafeFileHandle attempt;
    FileStream installer, zoneStream;
    string installerPath;
    const uint Read = 0x80000000, Delete = 0x10000, Reparse = 0x200000, Backup = 0x2000000;
    static void Require(bool condition) { if (!condition) throw new IOException("unsafe-update-file"); }
    static Info Information(SafeFileHandle handle) {
        Info value = new Info(); Require(!handle.IsInvalid && GetFileInformationByHandle(handle, out value));
        Require((value.Attributes & 0x400) == 0); return value;
    }
    static bool FileId(Info value, string ino) { return (((ulong)value.IndexHigh << 32) | value.IndexLow).ToString() == ino; }
    public EteUpdateGuard(string root, string rootIno, string rootDev, string target, string targetIno, bool forCleanup) {
        cleanup = forCleanup;
        volume = rootDev;
        Require(Regex.IsMatch(root ?? "", @"^[A-Za-z]:\\") && Path.GetFullPath(root) == root);
        Require(Path.GetFullPath(target) == target && Path.GetDirectoryName(target) == root &&
            Regex.IsMatch(Path.GetFileName(target), @"^update-[0-9a-f]{32}$"));
        directory = target;
        try {
            string current = Path.GetPathRoot(target);
            foreach (string component in target.Substring(current.Length).Split('\\')) {
                current = Path.Combine(current, component);
                // Directory handles deny deletion/rename of every ancestor;
                // OPEN_REPARSE_POINT then attribute inspection rejects junctions.
                var handle = CreateFileW(current, current == target && cleanup ? Delete : 0, 1, IntPtr.Zero, 3, Reparse | Backup, IntPtr.Zero);
                directories.Add(handle);
                Info info = Information(handle); Require((info.Attributes & 0x10) != 0);
                if (current == root) Require(FileId(info, rootIno) && info.Volume.ToString() == volume);
                if (current == target) { Require(FileId(info, targetIno) && info.Volume.ToString() == volume); attempt = handle; }
            }
        } catch { Dispose(); throw; }
    }
    string Child(string name) {
        Require(!String.IsNullOrEmpty(name) && Path.GetFileName(name) == name && name.IndexOf(':') < 0 && name != "." && name != "..");
        return Path.Combine(directory, name);
    }
    FileStream Locked(string name, string ino, long size, string hash, bool deleting) {
        var handle = CreateFileW(Child(name), Read | (deleting ? Delete : 0), 1, IntPtr.Zero, 3, Reparse, IntPtr.Zero);
        try {
            Info info = Information(handle);
            Require((info.Attributes & 0x10) == 0 && info.Links == 1 && FileId(info, ino) && info.Volume.ToString() == volume);
            var stream = new FileStream(handle, FileAccess.Read);
            try {
                if (!String.IsNullOrEmpty(hash)) {
                    Require(Regex.IsMatch(hash, "^[0-9a-f]{64}$") && stream.Length == size);
                    using (var sha = SHA256.Create()) Require(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant() == hash);
                    stream.Position = 0;
                }
                return stream;
            } catch { stream.Dispose(); throw; }
        } catch { handle.Dispose(); throw; }
    }
    public void Prepare(string name, string ino, long size, string hash, string zone) {
        Require(!cleanup && Regex.IsMatch(name ?? "", @"^EmbyTheaterEnhanced-[0-9A-Za-z.+-]+-win-x64-setup\.exe$") && size > 0 && size <= 536870912);
        installer = Locked(name, ino, size, hash, false); installerPath = Child(name);
        var handle = CreateFileW(installerPath + ":Zone.Identifier", Read, 1, IntPtr.Zero, 3, Reparse, IntPtr.Zero);
        Require(!handle.IsInvalid);
        zoneStream = new FileStream(handle, FileAccess.Read);
        using (var reader = new StreamReader(zoneStream, System.Text.Encoding.UTF8, true, 1024, true)) {
            Require(zone != null && zone.Contains("\r\nZoneId=3\r\n") && zoneStream.Length < 4096 && reader.ReadToEnd() == zone);
        }
    }
    public void OpenWizard() {
        Require(installer != null && zoneStream != null);
        // Keep locks through ShellExecute and wizard lifetime; no /SILENT,
        // elevation bypass, security-warning suppression, or forced client kill.
        var start = new ProcessStartInfo(installerPath) { UseShellExecute = true, WorkingDirectory = directory };
        using (var process = Process.Start(start)) { Require(process != null); process.WaitForExit(); }
    }
    public void DeleteOwned(string name, string ino, long size, string hash) {
        Require(cleanup && (name == "receipt.json" || Regex.IsMatch(name ?? "", @"^\.ete-download-[0-9a-f]{32}\.part$") ||
            Regex.IsMatch(name ?? "", @"^EmbyTheaterEnhanced-[0-9A-Za-z.+-]+-win-x64-setup\.exe$")));
        // Missing files are already clean. Existing unverified names fail closed.
        if (!File.Exists(Child(name)) && !Directory.Exists(Child(name))) return;
        using (var stream = Locked(name, ino, size, hash, true)) {
            byte value = 1; Require(SetFileInformationByHandle(stream.SafeFileHandle, 4, ref value, 1));
        }
    }
    public void ValidateCleanup(string[] names) {
        Require(cleanup);
        var allowed = new HashSet<string>(names, StringComparer.Ordinal);
        foreach (string item in Directory.GetFileSystemEntries(directory)) Require(allowed.Contains(Path.GetFileName(item)));
    }
    public void RemoveEmptyDirectory() {
        Require(cleanup); byte value = 1;
        Require(SetFileInformationByHandle(attempt, 4, ref value, 1));
    }
    public void Dispose() {
        if (zoneStream != null) zoneStream.Dispose(); if (installer != null) installer.Dispose();
        for (int index = directories.Count - 1; index >= 0; index--) directories[index].Dispose();
    }
}
