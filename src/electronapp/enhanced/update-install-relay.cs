using System;
using System.Diagnostics;
using System.Threading.Tasks;

// Ordinary hidden startup works on Windows PowerShell. A .NET child does not
// receive libuv's explicit kill-on-Node-exit assignment. No job limit, breakaway
// flag, privilege or execution policy is changed. External job limits apply.
// Keep the real owned guard handle until explicit detach OR confirmed exit.
public static class EteUpdateRelay {
    public static int Run() {
        Process child = null; bool detached = false;
        try {
            Console.Error.WriteLine("ETE_RELAY_STAGE read-bootstrap");
            string bootstrap = Console.In.ReadLine();
            Console.Error.WriteLine("ETE_RELAY_STAGE bootstrap-read");
            if (String.IsNullOrEmpty(bootstrap) || bootstrap.Length > 8192) return 1;
            Convert.FromBase64String(bootstrap);
            string executable;
            using (var self = Process.GetCurrentProcess()) executable = self.MainModule.FileName;
            var start = new ProcessStartInfo(executable, "-NoLogo -NoProfile -NonInteractive -EncodedCommand " + bootstrap) {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
            };
            child = Process.Start(start);
            Console.Error.WriteLine("ETE_RELAY_STAGE child-started");
            if (child == null) return 1;
            child.StandardInput.Close();
            var output = child.StandardOutput.ReadToEndAsync();
            var errors = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
            var instruction = Task.Run(() => Console.In.ReadLine());
            var exit = Task.Run(() => { child.WaitForExit(); return child.ExitCode; });
            int winner = Task.WaitAny(instruction, exit);
            Console.Error.WriteLine("ETE_RELAY_STAGE outcome-" + winner);
            if (winner == 1) return exit.Result;
            if (instruction.Result == "detach") { detached = true; return 0; }
            return 1;
        } catch { return 1; }
        finally {
            if (child != null) {
                if (!detached) { try { if (!child.HasExited) child.Kill(); } catch {} try { child.WaitForExit(); } catch {} }
                child.Dispose();
            }
        }
    }
}
