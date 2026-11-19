# OpenCode Windows Notify

Native Windows notifications for the OpenCode CLI: a main-session turn finished, an operation needs approval, or a question is waiting for an answer. Notifications display short fixed messages, not your prompts, commands, paths, or answers. No npm dependencies or remote notification service.

## Install

Use **Windows PowerShell 5.1** on a Windows desktop. Tested with OpenCode CLI 1.19.6 on Windows 11. The helper builds locally with the Windows .NET Framework compiler and Windows Runtime metadata; no separate Windows SDK or administrator access is needed on the tested system.

```powershell
git clone https://github.com/zihayi/opencode-windows-notify.git
cd opencode-windows-notify
.\build.ps1
```

Keep the checkout in place. Copy the **plugin URI printed by the build** into the `plugin` array of your global `~/.config/opencode/opencode.json` or `.jsonc`. Preserve any existing entries:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///C:/example/opencode-windows-notify/plugin.mjs"]
}
```

Quit and restart OpenCode. To test Windows delivery independently:

```powershell
.\OpenCodeNotify.exe test setup
.\OpenCodeNotify.exe history
```

`setup` in the history means Windows received the test. If a banner is hidden, check **Settings → System → Notifications → OpenCode** and Do not disturb. Answer or approve in the terminal. Subagent completions are silent, but their requests for input still notify.

## 中文说明

在 Windows PowerShell 中运行上面的安装命令，把输出的 URI 加到 OpenCode 全局配置的 `plugin` 数组，退出并重启 OpenCode。插件在一轮主会话完成、等待权限审批、等待回答问题时发送系统通知。重复的事件只提醒一次；系统勿扰模式可能只把提醒放进通知中心（`Win + N`）。

## Development and removal

Run `node --test test/events.test.mjs` (Node 20+). Use `.\build.ps1 -NoRegister` to build without registering the per-user `OpenCode.CLI` notification sender. To uninstall, remove the plugin URI, restart OpenCode, and delete the checkout. License: [MIT](LICENSE).
