# Interactive Windows Terminal smoke test. Creates two temporary CMD tabs with
# identical titles. Both exit on the cleanup event, even if an assertion fails.
param([string]$HelperDirectory = (Split-Path -Parent $PSScriptRoot), [switch]$ViaProtocol, [string]$Hold)
$ErrorActionPreference = 'Stop'
if ($Hold) {
    $event = [Threading.EventWaitHandle]::OpenExisting($Hold)
    try { [void]$event.WaitOne(90000) } finally { $event.Dispose() }
    exit 0
}
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
function Wait-For([string]$What, [scriptblock]$Check) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    do {
        $result = & $Check
        if ($result) { return $result }
        Start-Sleep -Milliseconds 100
    } while ($clock.Elapsed.TotalSeconds -lt 8)
    throw "Timed out: $What"
}
function Is-Selected($Tab) {
    $Tab.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected
}
$id = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$title = "OC-test-$id"
$stopA = [Threading.EventWaitHandle]::new($false, 'ManualReset', "${title}A")
$stopB = [Threading.EventWaitHandle]::new($false, 'ManualReset', "${title}B")
$sender = Join-Path $HelperDirectory 'OpenCodeNotify.exe'
$focus = Join-Path $HelperDirectory 'OpenCodeNotify.Focus.exe'
$savedPid = $env:OPENCODE_NOTIFY_SOURCE_PID
$savedText = $env:OPENCODE_NOTIFY_TEXT
try {
    $holdCmd = "title $title& powershell.exe -NoProfile -NonInteractive -File `"$PSCommandPath`" -Hold $title"
    & wt.exe -w $title new-tab --useApplicationTitle cmd.exe /d /c "${holdCmd}A" ';' new-tab --useApplicationTitle cmd.exe /d /c "${holdCmd}B"
    $source = Wait-For 'CMD A' { Get-CimInstance Win32_Process -Filter "Name='cmd.exe' AND CommandLine LIKE '%-Hold ${title}A%'" }
    $scope = [Windows.Automation.TreeScope]
    $ae = [Windows.Automation.AutomationElement]
    $windows = [Windows.Automation.PropertyCondition]::new($ae::ClassNameProperty, 'CASCADIA_HOSTING_WINDOW_CLASS')
    $items = [Windows.Automation.PropertyCondition]::new($ae::ControlTypeProperty, [Windows.Automation.ControlType]::TabItem)
    $window = Wait-For 'new Terminal window' {
        $ae::RootElement.FindAll($scope::Children, $windows) | Where-Object { $_.Current.Name -like "*$title*" }
    }
    [void](Wait-For 'two same-named CMD tabs, B selected' {
        $tabs = $window.FindAll($scope::Descendants, $items)
        $tabs.Count -eq 2 -and $tabs[0].Current.Name -like "*$title*" -and $tabs[0].Current.Name -eq $tabs[1].Current.Name -and (Is-Selected $tabs[1])
    })
    $tabs = $window.FindAll($scope::Descendants, $items)
    $windowPattern = $window.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern)
    if ($ViaProtocol) {
        if (!('NotifySmoke.Foreground' -as [type])) {
            Add-Type -Name Foreground -Namespace NotifySmoke -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'
        }
        $windowPattern.SetWindowVisualState([Windows.Automation.WindowVisualState]::Minimized)
        [void](Wait-For 'test window minimized' { $windowPattern.Current.WindowVisualState -eq 'Minimized' })
    }
    $env:OPENCODE_NOTIFY_SOURCE_PID = [string]$source.ProcessId
    $env:OPENCODE_NOTIFY_TEXT = ([string][char]0x5B8C) + [char]0x6210 + " <A> & B $id"
    & $sender done $id quiet
    if ($LASTEXITCODE -ne 0) { throw 'Sending test toast failed.' }
    $history = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]::History
    $toast = Wait-For 'quiet test toast in history' { $history.GetHistory('OpenCode.CLI') | Where-Object Tag -eq $id }
    [xml]$xml = $toast.Content.GetXml()
    if ($xml.toast.visual.binding.text[1] -cne $env:OPENCODE_NOTIFY_TEXT -or $xml.toast.activationType -ne 'protocol') { throw 'Incorrect toast body or action.' }
    $uri = [string]$xml.toast.launch
    if ($ViaProtocol) { Start-Process -FilePath $uri }
    else {
        $child = Start-Process -FilePath $focus -ArgumentList $uri -Wait -PassThru
        if ($child.ExitCode -ne 0) { throw "Click handler returned $($child.ExitCode)" }
    }
    [void](Wait-For 'source tab A selected and original title restored' {
        (Is-Selected $tabs[0]) -and !(Is-Selected $tabs[1]) -and $tabs[0].Current.Name -eq $tabs[1].Current.Name -and $windowPattern.Current.WindowVisualState -ne 'Minimized'
    })
    if ($ViaProtocol) {
        [void](Wait-For 'source window in foreground' { [NotifySmoke.Foreground]::GetForegroundWindow().ToInt64() -eq $window.Current.NativeWindowHandle })
    }
    'PASS: real notification history preserved the preview; activation selected CMD A from two identically named tabs.'
    [void]$stopA.Set()
    [void](Wait-For 'source CMD A exited' { -not (Get-Process -Id $source.ProcessId -ErrorAction SilentlyContinue) })
    $stale = Start-Process -FilePath $focus -ArgumentList $uri -Wait -PassThru
    if ($stale.ExitCode -eq 0) { throw 'A stale click activated another terminal.' }
    'PASS: a notification from an exited CMD was rejected.'
} finally {
    [void]$stopA.Set(); [void]$stopB.Set(); $stopA.Dispose(); $stopB.Dispose()
    $env:OPENCODE_NOTIFY_SOURCE_PID = $savedPid; $env:OPENCODE_NOTIFY_TEXT = $savedText
    & $sender remove $id
}
