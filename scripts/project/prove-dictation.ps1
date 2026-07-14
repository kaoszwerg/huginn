# The whole product, proven end to end (ADR-PROJ-005): speech in, text in the other window.
#
#   1. open a target window and put the caret in it,
#   2. hold push-to-talk,
#   3. SPEAK a known German sentence through the speakers -- the microphone hears the room,
#   4. release,
#   5. read back what the target's text box actually contains, and score it against what was said.
#
# Step 5 is the one that cannot be faked. It is not "the log says it transcribed something": it is the
# sentence, in the document, where the user would have dictated it.
#
# This is the machine talking to itself: the synthesiser speaks, the microphone listens. It is not a
# substitute for the maintainer's own voice on the maintainer's own microphone -- that test is theirs
# to run -- but it exercises every link in the chain with real acoustics: a speaker, a room, and a
# microphone that hears both.
#
#   powershell -File scripts/project/prove-dictation.ps1

param(
    [switch]$NoCtrl,
    [switch]$Alt,
    [switch]$Shift,
    [int]$VirtualKey = 0x20,          # 0x20 = Space
    [int]$Volume = 70,
    [string]$Sentence = "Bitte notiere den Termin am Montag um neun Uhr im Konferenzraum."
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
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    public const byte VK_CONTROL = 0x11;
    public const byte VK_MENU    = 0x12;
    public const byte VK_SHIFT   = 0x10;
    public const uint KEYUP      = 0x0002;
}
"@

function Down([int]$Key) {
    if ($useCtrl) { [Win32]::keybd_event([Win32]::VK_CONTROL, 0, 0, [UIntPtr]::Zero) }
    if ($Alt)     { [Win32]::keybd_event([Win32]::VK_MENU, 0, 0, [UIntPtr]::Zero) }
    if ($Shift)   { [Win32]::keybd_event([Win32]::VK_SHIFT, 0, 0, [UIntPtr]::Zero) }
    [Win32]::keybd_event([byte]$Key, 0, 0, [UIntPtr]::Zero)
}
function Up([int]$Key) {
    [Win32]::keybd_event([byte]$Key, 0, [Win32]::KEYUP, [UIntPtr]::Zero)
    if ($Shift)   { [Win32]::keybd_event([Win32]::VK_SHIFT, 0, [Win32]::KEYUP, [UIntPtr]::Zero) }
    if ($Alt)     { [Win32]::keybd_event([Win32]::VK_MENU, 0, [Win32]::KEYUP, [UIntPtr]::Zero) }
    if ($useCtrl) { [Win32]::keybd_event([Win32]::VK_CONTROL, 0, [Win32]::KEYUP, [UIntPtr]::Zero) }
}

# Word error rate: the same measure the engine was chosen on (ADR-PROJ-005).
function Get-WordErrorRate([string]$Reference, [string]$Hypothesis) {
    $norm = {
        param($s)
        ($s.ToLower() -replace '[^\p{L}\p{Nd}\s]', '') -split '\s+' | Where-Object { $_ }
    }
    $r = & $norm $Reference
    $h = & $norm $Hypothesis
    if ($r.Count -eq 0) { return 0.0 }

    $prev = 0..$h.Count
    for ($i = 0; $i -lt $r.Count; $i++) {
        $cur = @($i + 1)
        for ($j = 0; $j -lt $h.Count; $j++) {
            $cost = if ($r[$i] -eq $h[$j]) { 0 } else { 1 }
            $cur += [Math]::Min([Math]::Min($prev[$j] + $cost, $prev[$j + 1] + 1), $cur[$j] + 1)
        }
        $prev = $cur
    }
    return $prev[$h.Count] / $r.Count
}

$outFile = Join-Path $env:TEMP "huginn-target.txt"
Remove-Item $outFile -ErrorAction SilentlyContinue

Write-Host "opening the dictation target..."
$targetScript = Join-Path $PSScriptRoot "dictation-target.ps1"
$target = Start-Process powershell -PassThru -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $targetScript, "-OutFile", $outFile, "-LifetimeMs", "30000"
)

$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 250
    $target.Refresh()
    $hwnd = $target.MainWindowHandle
}
if ($hwnd -eq [IntPtr]::Zero) { throw "the target window never appeared" }
[void][Win32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 800

# The synthesiser, ready to speak into the room.
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$german = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "de*" } | Select-Object -First 1
if (-not $german) { throw "no German voice is installed -- this test needs one" }
$speaker.SelectVoice($german.VoiceInfo.Name)
$speaker.Volume = $Volume
$speaker.Rate = -1
$speaker.SetOutputToDefaultAudioDevice()

Write-Host "holding push-to-talk and speaking..."
Down $VirtualKey
Start-Sleep -Milliseconds 400        # let the microphone settle before the first word
$speaker.Speak($Sentence)
Start-Sleep -Milliseconds 400        # and let the last word finish before the key comes up
Up $VirtualKey
$speaker.Dispose()

Write-Host "released -- recognising..."
$target.WaitForExit(40000) | Out-Null
$text = if (Test-Path $outFile) { (Get-Content $outFile -Raw).Trim() } else { "" }

$wer = Get-WordErrorRate $Sentence $text

Write-Host ""
Write-Host "=== VERDICT ==="
Write-Host ("spoken     : {0}" -f $Sentence)
Write-Host ("dictated   : {0}" -f $text)
Write-Host ("word error : {0:P1}" -f $wer)

if (-not $target.HasExited) { Stop-Process -Id $target.Id -Force }

if ($text -and $wer -lt 0.34) {
    Write-Host "DICTATION WORKS" -ForegroundColor Green
    exit 0
}
Write-Host "DICTATION FAILED" -ForegroundColor Red
exit 1
