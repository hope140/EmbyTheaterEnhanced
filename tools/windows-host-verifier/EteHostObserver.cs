using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;

namespace EteHostObserver
{
    // Documented .NET Framework AppDomainManager test instrumentation, configured
    // only in the copied Host's app.config. It records assemblies without
    // replacing resolution policy, adding trust, or reading application settings.
    public sealed class LifecycleManager : AppDomainManager
    {
        static readonly object Gate = new object();
        static readonly HashSet<string> Seen = new HashSet<string>();
        [ThreadStatic] static bool recording;

        static string Root { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        static void Record(Assembly assembly)
        {
            if (recording) return;
            string name = assembly.GetName().Name;
            if (name != "System.Configuration" && name != "MediaBrowser.Model" &&
                name != "MediaBrowser.Common" && name != "ServiceStack.Text" && name != "Newtonsoft.Json" && name != "SharpCompress" && name != "Emby.Theater") return;
            recording = true;
            try
            {
                lock (Gate)
                {
                    if (!Seen.Add(assembly.FullName + "|" + assembly.Location)) return;
                    string hash;
                    using (var digest = SHA256.Create())
                    using (var file = File.OpenRead(assembly.Location))
                        hash = BitConverter.ToString(digest.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
                    bool reference = false;
                    foreach (var attribute in CustomAttributeData.GetCustomAttributes(assembly))
                        if (attribute.Constructor.DeclaringType.FullName == "System.Runtime.CompilerServices.ReferenceAssemblyAttribute") reference = true;
                    File.AppendAllText(Path.Combine(Root, "host-assembly-observer.txt"),
                        "BeginAssembly=" + name + Environment.NewLine +
                        "Identity=" + assembly.FullName + Environment.NewLine +
                        "Location=" + assembly.Location + Environment.NewLine +
                        "SHA256=" + hash + Environment.NewLine +
                        "GAC=" + assembly.GlobalAssemblyCache + Environment.NewLine +
                        "ReferenceAssembly=" + reference + Environment.NewLine +
                        "EndAssembly=" + name + Environment.NewLine);
                }
            }
            catch (Exception error)
            {
                File.AppendAllText(Path.Combine(Root, "host-observer-error.txt"), error.ToString());
            }
            finally { recording = false; }
        }

        public override void InitializeNewDomain(AppDomainSetup appDomainInfo)
        {
            AppDomain.CurrentDomain.AssemblyLoad += delegate(object sender, AssemblyLoadEventArgs e) { Record(e.LoadedAssembly); };
            AppDomain.CurrentDomain.ProcessExit += delegate {
                File.WriteAllText(Path.Combine(Root, "host-managed-exit.txt"),
                    "PID=" + Process.GetCurrentProcess().Id + Environment.NewLine + "ManagedProcessExit=True");
            };
            File.WriteAllText(Path.Combine(Root, "host-observer-ready.txt"),
                "PID=" + Process.GetCurrentProcess().Id + Environment.NewLine +
                "Is64BitProcess=" + Environment.Is64BitProcess);
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies()) Record(assembly);
            base.InitializeNewDomain(appDomainInfo);
        }
    }
}
