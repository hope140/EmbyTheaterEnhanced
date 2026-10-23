using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;

namespace EteTest
{
    // Used only by the copied Host's private configuration. This never forwards
    // non-loopback HTTP requests and makes no machine-wide proxy changes.
    public sealed class GuardProxy : IWebProxy
    {
        public ICredentials Credentials { get; set; }
        static void Check(Uri destination)
        {
            if (destination.IsLoopback) return;
            File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,
                "external-blocked-hosts.txt"), destination.Host + Environment.NewLine);
            throw new InvalidOperationException("ETE test blocks non-loopback HTTP.");
        }
        public bool IsBypassed(Uri destination) { Check(destination); return true; }
        public Uri GetProxy(Uri destination) { Check(destination); return destination; }

        [DllImport("iphlpapi.dll", SetLastError = true)]
        static extern uint GetExtendedTcpTable(IntPtr table, ref int bytes, bool order,
            int family, int tableClass, uint reserved);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool IsWow64Process(IntPtr process, out bool wow64);

        public static bool ProcessIs64Bit(Process process)
        {
            if (!Environment.Is64BitOperatingSystem) return false;
            bool wow64;
            if (!IsWow64Process(process.Handle, out wow64)) throw new Win32Exception();
            return !wow64;
        }

        // Read-only listener ownership, used to avoid sending synthetic requests
        // to any process other than the just-started test Host.
        public static int[] ListenerOwners(int port)
        {
            var owners = new List<int>();
            foreach (int family in new int[] { 2, 23 })
            {
                int size = 0;
                uint error = GetExtendedTcpTable(IntPtr.Zero, ref size, false, family, 3, 0);
                if (error != 122 && error != 0) throw new Win32Exception((int)error);
                IntPtr buffer = Marshal.AllocHGlobal(Math.Max(size, 4));
                try
                {
                    error = GetExtendedTcpTable(buffer, ref size, false, family, 3, 0);
                    if (error != 0) throw new Win32Exception((int)error);
                    int count = Marshal.ReadInt32(buffer);
                    int rowSize = family == 2 ? 24 : 56;
                    int portOffset = family == 2 ? 8 : 20;
                    int pidOffset = family == 2 ? 20 : 52;
                    for (int i = 0; i < count; i++)
                    {
                        int rowOffset = 4 + i * rowSize;
                        int raw = Marshal.ReadInt32(buffer, rowOffset + portOffset);
                        int actual = unchecked((ushort)IPAddress.NetworkToHostOrder((short)raw));
                        if (actual == port)
                        {
                            int pid = Marshal.ReadInt32(buffer, rowOffset + pidOffset);
                            if (!owners.Contains(pid)) owners.Add(pid);
                        }
                    }
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            return owners.ToArray();
        }
    }

    // A lifecycle fixture, not Electron. It does not execute argv payloads,
    // perform network I/O, read real profiles, or invoke media/driver software.
    public static class ControlledChild
    {
        [STAThread]
        public static int Main(string[] args)
        {
            string root = Environment.GetEnvironmentVariable("ETE_TEST_VARIANT_ROOT");
            if (String.IsNullOrEmpty(root) || !Directory.Exists(root)) return 15;
            File.WriteAllText(Path.Combine(root, "controlled-child-start.txt"),
                "PID=" + Process.GetCurrentProcess().Id + Environment.NewLine +
                "ArgumentCount=" + args.Length + Environment.NewLine);
            for (int index=0; index<args.Length; index++) File.AppendAllText(Path.Combine(root,"controlled-child-start.txt"),"Argument"+index+"="+args[index]+Environment.NewLine);
            Stopwatch timeout = Stopwatch.StartNew();
            while (timeout.ElapsedMilliseconds < 40000)
            {
                if (File.Exists(Path.Combine(root, "controlled-child-stop")))
                {
                    File.WriteAllText(Path.Combine(root, "controlled-child-exit.txt"), "Exit=0");
                    return 0;
                }
                Thread.Sleep(25);
            }
            File.WriteAllText(Path.Combine(root, "controlled-child-exit.txt"), "Exit=16");
            return 16;
        }
    }
}
