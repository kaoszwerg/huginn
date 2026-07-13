# Proof for PLAN.md phase 1a.1: the overlay must not steal the focus, and the dictated text must land
# in the *other* application.
#
# This is deliberately not a claim in a document. It drives the real app:
#
#   1. open a target window with a text box, and put the caret in it,
#   2. record which window owns the foreground,
#   3. hold the push-to-talk hotkey -- Huginn creates the overlay while it is held,
#   4. sample the foreground window again while the overlay is on screen: it must be unchanged,
#   5. release, and let Huginn inject its probe text,
#   6. read back what the target's text box actually contains.
#
# Step 6 is the one that cannot be faked: either the text is in the box, or the spike failed.
#
# Run it with the app already running (`npm run app:dev`):
#   powershell -File scripts/project/prove-focus-neutrality.ps1
#
# The key parameters must match the hotkey the app actually registered -- look for the "push-to-talk
# armed" line in its log. They default to Huginn's own default, Ctrl+Space.

param(
    [switch]$NoCtrl,
    [switch]$Alt,
    [switch]$Shift,
    [int]$VirtualKey = 0x20, # 0x20 = Space
    [int]$HoldMs = 1500
)

$ErrorActionPreference = "Stop"
$useCtrl = -not $NoCtrl

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    public const byte VK_CONTROL = 0x11;
    public const byte VK_MENU    = 0x12;  // Alt
    public const byte VK_SHIFT   = 0x10;
    public const uint KEYUP      = 0x0002;

    public static string TitleOf(IntPtr h) {
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }
}
"@

function Hold-PushToTalk([int]$Key, [int]$Ms) {
    if ($useCtrl) { [Win32]::keybd_event([Win32]::VK_CONTROL, 0, 0, [UIntPtr]::Zero) }
    if ($Alt)     { [Win32]::keybd_event([Win32]::VK_MENU, 0, 0, [UIntPtr]::Zero) }
    if ($Shift)   { [Win32]::keybd_event([Win32]::VK_SHIFT, 0, 0, [UIntPtr]::Zero) }
    [Win32]::keybd_event([byte]$Key, 0, 0, [UIntPtr]::Zero)

    Start-Sleep -Milliseconds $Ms   # the overlay is on screen for exactly this long

    [Win32]::keybd_event([byte]$Key, 0, [Win32]::KEYUP, [UIntPtr]::Zero)
    if ($Shift)   { [Win32]::keybd_event([Win32]::VK_SHIFT, 0, [Win32]::KEYUP, [UIntPtr]::Zero) }
    if ($Alt)     { [Win32]::keybd_event([Win32]::VK_MENU, 0, [Win32]::KEYUP, [UIntPtr]::Zero) }
    if ($useCtrl) { [Win32]::keybd_event([Win32]::VK_CONTROL, 0, [Win32]::KEYUP, [UIntPtr]::Zero) }
}

$outFile = Join-Path $env:TEMP "huginn-target.txt"
Remove-Item $outFile -ErrorAction SilentlyContinue

$targetScript = Join-Path $PSScriptRoot "dictation-target.ps1"
Write-Host "opening the dictation target..."
$target = Start-Process powershell -PassThru -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $targetScript, "-OutFile", $outFile
)

# Wait for its window, then make sure the caret really is in it.
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 250
    $target.Refresh()
    $hwnd = $target.MainWindowHandle
}
if ($hwnd -eq [IntPtr]::Zero) { throw "the target window never appeared" }

[void][Win32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 800

$before = [Win32]::GetForegroundWindow()
Write-Host ("focus BEFORE : {0:X} ({1})" -f [int64]$before, [Win32]::TitleOf($before))
if ($before -ne $hwnd) { throw "could not put the caret in the target window" }

Write-Host ("holding the hotkey for {0}ms -- the overlay appears now..." -f $HoldMs)
Hold-PushToTalk -Key $VirtualKey -Ms $HoldMs

# Sampled the instant the key came up: the overlay is still on screen (Huginn tears it down only
# after it has injected), so this reads the focus *while the overlay exists*.
$during = [Win32]::GetForegroundWindow()

Start-Sleep -Milliseconds 2000   # key-up is polled every 50 ms, then Huginn injects and closes

$after = [Win32]::GetForegroundWindow()
Write-Host ("focus DURING : {0:X} ({1})" -f [int64]$during, [Win32]::TitleOf($during))
Write-Host ("focus AFTER  : {0:X} ({1})" -f [int64]$after, [Win32]::TitleOf($after))

# Let the target close itself and write down what its text box ended up holding.
Write-Host "waiting for the target to record what it received..."
$target.WaitForExit(20000) | Out-Null
$content = if (Test-Path $outFile) { (Get-Content $outFile -Raw).Trim() } else { "" }

Write-Host ""
Write-Host "=== VERDICT ==="
$focusKept = ($during -eq $before) -and ($after -eq $before)
$textLanded = $content -and $content.Contains("Huginn")

Write-Host ("focus kept in the target  : {0}" -f $focusKept)
Write-Host ("text landed in the target : {0}" -f $textLanded)
Write-Host ("the target now contains   : '{0}'" -f $content)

if (-not $target.HasExited) { Stop-Process -Id $target.Id -Force }

if ($focusKept -and $textLanded) {
    Write-Host "SPIKE 1a.1 PASSED" -ForegroundColor Green
    exit 0
}
Write-Host "SPIKE 1a.1 FAILED" -ForegroundColor Red
exit 1
