[CmdletBinding()]
param([switch]$NoRegister)
$ErrorActionPreference = 'Stop'
$framework = if ([Environment]::Is64BitOperatingSystem) { 'Framework64' } else { 'Framework' }
$compiler = Join-Path $env:WINDIR "Microsoft.NET\$framework\v4.0.30319\csc.exe"
$metadata = Join-Path $env:WINDIR 'System32\WinMetadata'
$common = @('/nologo', '/optimize+', '/codepage:65001', '/r:System.Security.dll')
$wpf = Join-Path (Split-Path -Parent $compiler) 'WPF'
$refs = @('UIAutomationClient', 'UIAutomationTypes', 'WindowsBase') | ForEach-Object { "/r:$wpf\$_.dll" }
& $compiler @common @refs /target:winexe "/out:$PSScriptRoot\OpenCodeNotify.Focus.exe" "$PSScriptRoot\Focus.cs" "$PSScriptRoot\ClickTarget.cs"
if ($LASTEXITCODE -ne 0) { throw 'Could not build the notification click handler.' }
$options = $common + @('/target:exe', "/out:$PSScriptRoot\OpenCodeNotify.exe")
foreach ($name in 'Windows.Foundation', 'Windows.Data', 'Windows.UI') {
    $path = Join-Path $metadata "$name.winmd"
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing Windows metadata: $path. Run Windows PowerShell in native bitness." }
    $options += "/r:$path"
}
foreach ($name in 'System.Runtime', 'System.Runtime.InteropServices.WindowsRuntime') {
    $options += '/r:' + [Reflection.Assembly]::Load("$name, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a").Location
}
& $compiler @options "$PSScriptRoot\Toast.cs" "$PSScriptRoot\ClickTarget.cs"
if ($LASTEXITCODE -ne 0) { throw 'Could not build the notification helper.' }
if (-not $NoRegister) {
    & "$PSScriptRoot\OpenCodeNotify.exe" register
    if ($LASTEXITCODE -ne 0) { throw 'Could not register the per-user notification identity.' }
}
$plugin = [Uri]::new((Resolve-Path -LiteralPath "$PSScriptRoot\plugin.mjs").Path)
"OpenCode plugin URI: $($plugin.AbsoluteUri)"
