using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

internal static class Focus {
    [DllImport("kernel32.dll")] static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetConsoleTitle(StringBuilder title, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool SetConsoleTitle(string title);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int size);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();

    static string ConsoleTitle() {
        var title = new StringBuilder(32768);
        GetConsoleTitle(title, (uint)title.Capacity);
        return title.ToString();
    }
    static bool SelectTab(IntPtr window) {
        var root = AutomationElement.FromHandle(window);
        var tabs = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem);
        string original = ConsoleTitle(), marker = "OpenCode-" + Guid.NewGuid().ToString("N");
        if (!SetConsoleTitle(marker)) return false;
        try {
            var timer = Stopwatch.StartNew();
            do {
                // Match a fresh marker, never an old title, ordinal or foreground tab.
                foreach (AutomationElement tab in root.FindAll(TreeScope.Descendants, tabs)) {
                    if (tab.Current.Name.IndexOf(marker, StringComparison.Ordinal) < 0) continue;
                    object pattern;
                    if (!tab.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) return false;
                    var item = (SelectionItemPattern)pattern;
                    item.Select();
                    return item.Current.IsSelected;
                }
                Thread.Sleep(40);
            } while (timer.ElapsedMilliseconds < 1600);
            return false;
        } finally {
            // Do not overwrite a newer title the application set during the click.
            if (ConsoleTitle() == marker) SetConsoleTitle(original);
        }
    }
    static bool Activate(Process source) {
        FreeConsole(); // If launched from a shell, do not operate on the handler's own console.
        if (!AttachConsole((uint)source.Id)) return false;
        try {
            IntPtr console = GetConsoleWindow();
            IntPtr window = GetAncestor(console, 3); // GA_ROOTOWNER resolves a ConPTY window to its Terminal host.
            if (source.HasExited || window == IntPtr.Zero || !IsWindowVisible(window)) return false;
            var cls = new StringBuilder(128);
            GetClassName(window, cls, cls.Capacity);
            if (cls.ToString() == "CASCADIA_HOSTING_WINDOW_CLASS") {
                using (var mutex = new Mutex(false, @"Local\OpenCodeNotify-" + console.ToInt64())) {
                    try { if (!mutex.WaitOne(2500)) return false; } catch (AbandonedMutexException) { }
                    try { if (!SelectTab(window)) return false; } finally { mutex.ReleaseMutex(); }
                }
            } else if (window != console || cls.ToString() != "ConsoleWindowClass") return false;
            if (IsIconic(window)) ShowWindow(window, 9); // SW_RESTORE; keep maximized windows maximized.
            return SetForegroundWindow(window) || GetForegroundWindow() == window;
        } finally { FreeConsole(); }
    }
    [MTAThread]
    static int Main(string[] args) {
        if (args.Length != 1) return 2;
        try {
            using (var source = ClickTarget.Open(args[0])) return source != null && Activate(source) ? 0 : 1;
        } catch (Exception) { return 1; } // Closed tabs, inaccessible windows and invalid tickets are no-ops.
    }
}
