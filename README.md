# OpenCode Windows Notify

Native Windows notifications for the OpenCode CLI. A finished turn previews the final reply, a question shows what is being asked, and an approval shows the requested operation. Click the banner or its entry in Notification Center to return to the originating CMD window or Windows Terminal tab. No npm dependencies, additional model calls, or remote notification service.

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

Previews are local excerpts of up to 120 characters and may be visible on the lock screen and in notification history. To use fixed messages instead, set `$env:OPENCODE_NOTIFY_PREVIEW = '0'` before starting OpenCode. `$env:OPENCODE_NOTIFY_QUIET = '1'` sends notifications to history without a banner.

**Click targeting:** use a local OpenCode CLI in classic CMD or Windows Terminal, with the latter allowing applications to set the tab title. On click, the helper briefly marks the source console's title, selects that exact tab and restores the title. Identical titles and tab reordering are fine. A closed source, a manually locked tab title or a background split pane whose title is not displayed cannot be targeted; the helper does not guess another tab. A standalone server has no client terminal to focus. If you move the installation, run `build.ps1` again to register its new click handler location.

## 中文说明

在 Windows PowerShell 中运行上面的安装命令，把输出的 URI 加到 OpenCode 全局配置的 `plugin` 数组，退出并重启 OpenCode。完成通知摘录本轮回复；提问和审批通知显示要回答的问题或需要批准的操作。点通知横幅或通知中心（`Win + N`）里的提醒，就会选回发出通知的 CMD 标签页，窗口最小化时也会还原。

Windows Terminal 需允许应用设置标签标题。标签同名或换序不影响定位；若手动锁定标题或关闭了来源终端，点击不会误切到其他页。若不想让正文出现在通知中，启动 OpenCode 前设置 `$env:OPENCODE_NOTIFY_PREVIEW = '0'`。

## Development and removal

Run `node --test test/events.test.mjs` (Node 20+). `.\build.ps1 -NoRegister` builds both helpers without registering the per-user sender and activation protocol. On an interactive Windows Terminal desktop, `.\test\windows-click.ps1` checks a real toast and two identically named CMD tabs. Add `-ViaProtocol` to test Windows' registered `opencode-notify:` handler for the installed build.

To uninstall, run `.\OpenCodeNotify.exe unregister` from the installation, remove the plugin URI, restart OpenCode, and delete the checkout. License: [MIT](LICENSE).
