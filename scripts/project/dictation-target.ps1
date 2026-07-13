# The dictation target for the phase-1a proof: a plain Win32 window with a text box, standing in for
# "whatever application the user was working in".
#
# It exists because the obvious target does not work: Windows 11 ships Notepad as a Store app, which
# Start-Process cannot hand back as a process, and its window is not reliably addressable. A target we
# own is also a better witness -- the injected text is read straight out of the text box, not through
# the clipboard, so nothing between Huginn and the document can flatter the result.
#
# It writes whatever ended up in the box to -OutFile and exits. Started by prove-focus-neutrality.ps1.

param(
    [string]$OutFile = "$env:TEMP\huginn-target.txt",
    [int]$LifetimeMs = 12000
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Huginn Spike Target"
$form.Width = 640
$form.Height = 220
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.Dock = "Fill"
$box.Font = New-Object System.Drawing.Font("Consolas", 11)
$form.Controls.Add($box)

# The caret must be in the text box the moment the window is up -- that caret is the thing the overlay
# must not take away.
$form.Add_Shown({
        $form.Activate()
        $box.Focus() | Out-Null
    })

# Close ourselves after the proof has had its time, and record what the box actually contains.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $LifetimeMs
$timer.Add_Tick({
        Set-Content -Path $OutFile -Value $box.Text -Encoding UTF8
        $timer.Stop()
        $form.Close()
    })
$timer.Start()

[void]$form.ShowDialog()
