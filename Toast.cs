using System;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

internal static class OpenCodeNotify {
    const string Id = "OpenCode.CLI";
    const string Group = "opencode";
    static int Main(string[] args) {
        string stage = "initialize";
        try {
            Console.OutputEncoding = new UTF8Encoding(false);
            string mode = args.Length == 0 ? "status" : args[0];
            if (mode == "register") {
                using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\AppUserModelId\" + Id)) {
                    key.SetValue("DisplayName", "OpenCode", RegistryValueKind.String);
                    key.SetValue("ShowInSettings", 1, RegistryValueKind.DWord);
                }
                ClickTarget.Register();
                Console.WriteLine("Registered OpenCode.CLI and notification clicks"); return 0;
            }
            if (mode == "unregister") { ClickTarget.Unregister(); return 0; }
            if (mode == "history") {
                foreach (var toast in ToastNotificationManager.History.GetHistory(Id))
                    if (toast.Group == Group) Console.WriteLine(toast.Tag);
                return 0;
            }
            if (mode == "remove" && args.Length == 2 && Regex.IsMatch(args[1], @"^[A-Za-z0-9_-]{1,16}$")) {
                ToastNotificationManager.History.Remove(args[1], Group, Id); return 0;
            }
            stage = "CreateToastNotifier";
            var notifier = ToastNotificationManager.CreateToastNotifier(Id);
            stage = "GetSetting";
            if (mode == "status") {
                try { Console.WriteLine("OpenCode.CLI: " + notifier.Setting); }
                catch (Exception e) { if ((uint)e.HResult != 0x80070490u) throw; Console.WriteLine("OpenCode.CLI: send a first test notification to initialize Windows history."); }
                return 0;
            }
            if (args.Length < 2 || !Regex.IsMatch(args[1], @"^[A-Za-z0-9_-]{1,16}$")) return 2;
            string title, text;
            bool zh = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh";
            switch (mode) {
                case "done": title = zh ? "本轮任务已完成" : "Task finished"; text = zh ? "打开 OpenCode 终端查看结果。" : "Return to OpenCode to see the result."; break;
                case "permission": title = zh ? "等待权限审批" : "Approval needed"; text = zh ? "请回到 OpenCode 终端，允许或拒绝这次操作。" : "Allow or deny the operation in OpenCode."; break;
                case "question": title = zh ? "有问题等你回答" : "Question for you"; text = zh ? "请回到 OpenCode 终端选择或输入答案。" : "Return to OpenCode to answer."; break;
                case "test": title = zh ? "OpenCode 通知测试" : "OpenCode notification test"; text = zh ? "这是一条 Windows 桌面通知。" : "Windows received this test notification."; break;
                default: return 2;
            }
            stage = "CreateToast";
            var xml = new XmlDocument();
            xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text/><text/></binding></visual></toast>");
            string preview = Environment.GetEnvironmentVariable("OPENCODE_NOTIFY_TEXT");
            var lines = xml.GetElementsByTagName("text");
            lines[0].InnerText = title;
            lines[1].InnerText = String.IsNullOrWhiteSpace(preview) ? text : preview;
            var expires = DateTimeOffset.Now.AddHours(8);
            string target = ClickTarget.Create(expires);
            if (target != null) {
                xml.DocumentElement.SetAttribute("activationType", "protocol");
                xml.DocumentElement.SetAttribute("launch", target);
            }
            var message = new ToastNotification(xml);
            message.Tag = args[1]; message.Group = Group;
            message.ExpirationTime = expires;
            if (args.Length == 3 && args[2] == "quiet") message.SuppressPopup = true;
            stage = "Show";
            notifier.Show(message);
            return 0;
        } catch (Exception e) { Console.Error.WriteLine(stage + ": " + e.Message); return 1; }
    }
}
