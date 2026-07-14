# Make the German speech fixture the worker's pipeline test runs against.
#
# The Windows speech synthesiser, written straight to 16 kHz mono -- exactly what whisper wants, so
# nothing is resampled and no aliasing can creep in. It is a synthetic voice, and it is not a
# substitute for a real one on a real microphone; what it IS good for is proving that the path from
# audio bytes to recognised words works, in a test that fails for reasons inside this repository
# rather than because a speaker was too quiet.
#
#   powershell -File scripts/project/make-speech-fixture.ps1

param(
    [string]$OutFile = "$env:TEMP\huginn-fixture-de.wav",
    [string]$Sentence = "Bitte notiere den Termin am Montag um neun Uhr im Konferenzraum."
)

Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$german = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "de*" } | Select-Object -First 1
if (-not $german) { throw "no German voice is installed" }
$s.SelectVoice($german.VoiceInfo.Name)
$s.Rate = -1

$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($OutFile, $fmt)
$s.Speak($Sentence)
$s.Dispose()

Write-Host "written: $OutFile"
Write-Host "spoken : $Sentence"
