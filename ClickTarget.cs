using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

// A protocol activation survives the short-lived toast sender. The ticket is
// for this Windows user and this process lifetime, not a command or a tab index.
internal static class ClickTarget {
    const string Scheme = "opencode-notify";
    const string Prefix = Scheme + "://focus/";
    const string Key = @"Software\Classes\" + Scheme;
    static readonly byte[] Purpose = Encoding.ASCII.GetBytes("OpenCode.CLI/focus/1");
    static string HandlerCommand() {
        return "\"" + Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "OpenCodeNotify.Focus.exe") + "\" \"%1\"";
    }
    internal static void Register() {
        using (var key = Registry.CurrentUser.CreateSubKey(Key)) {
            key.SetValue("", "URL:OpenCode notification");
            key.SetValue("URL Protocol", "");
            using (var cmd = key.CreateSubKey(@"shell\open\command")) cmd.SetValue("", HandlerCommand());
        }
    }
    internal static void Unregister() {
        using (var cmd = Registry.CurrentUser.OpenSubKey(Key + @"\shell\open\command")) {
            if (cmd == null || !String.Equals(cmd.GetValue("") as string, HandlerCommand(), StringComparison.OrdinalIgnoreCase)) return;
        }
        Registry.CurrentUser.DeleteSubKeyTree(Key, false);
    }

    [DllImport("kernel32.dll")] static extern uint GetConsoleProcessList([Out] uint[] ids, uint size);
    internal static string Create(DateTimeOffset expires) {
        try {
            int pid;
            string source = Environment.GetEnvironmentVariable("OPENCODE_NOTIFY_SOURCE_PID");
            if (String.IsNullOrEmpty(source)) {
                // Interactive CLI test: pick another live client of this same console.
                uint[] ids = new uint[64];
                uint count = GetConsoleProcessList(ids, (uint)ids.Length);
                if (count > ids.Length) return null;
                int self = Process.GetCurrentProcess().Id;
                pid = 0;
                for (int i = 0; i < count; i++) if (ids[i] != self) { pid = (int)ids[i]; break; }
            } else if (!Int32.TryParse(source, NumberStyles.None, CultureInfo.InvariantCulture, out pid)) return null;
            if (pid <= 0) return null;
            using (var process = Process.GetProcessById(pid))
            using (var stream = new MemoryStream())
            using (var writer = new BinaryWriter(stream)) {
                writer.Write(pid);
                writer.Write(process.StartTime.ToFileTimeUtc());
                writer.Write(expires.UtcDateTime.ToFileTimeUtc());
                byte[] ticket = ProtectedData.Protect(stream.ToArray(), Purpose, DataProtectionScope.CurrentUser);
                return Prefix + Convert.ToBase64String(ticket).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            }
        } catch (Exception) { return null; } // A missing source must not prevent delivery.
    }

    internal static Process Open(string uri) {
        if (uri.Length > 2048 || !uri.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase)) return null;
        string token = uri.Substring(Prefix.Length);
        if (!Regex.IsMatch(token, @"\A[A-Za-z0-9_-]+\z")) return null;
        string b64 = token.Replace('-', '+').Replace('_', '/');
        byte[] ticket = Convert.FromBase64String(b64.PadRight((b64.Length + 3) / 4 * 4, '='));
        byte[] data = ProtectedData.Unprotect(ticket, Purpose, DataProtectionScope.CurrentUser);
        if (data.Length != 20 || DateTime.UtcNow.ToFileTimeUtc() >= BitConverter.ToInt64(data, 12)) return null;
        var process = Process.GetProcessById(BitConverter.ToInt32(data, 0));
        if (!process.HasExited && process.StartTime.ToFileTimeUtc() == BitConverter.ToInt64(data, 4)) return process;
        process.Dispose(); return null;
    }
}
