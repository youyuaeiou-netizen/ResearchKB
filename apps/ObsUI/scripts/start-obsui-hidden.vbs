Option Explicit

Function QuoteArgument(value)
  QuoteArgument = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

Function IsWindowsAppsPowerShellAlias(value)
  Dim normalized
  normalized = LCase(Replace(CStr(value), "/", "\"))
  IsWindowsAppsPowerShellAlias = (Right(normalized, Len("\appdata\local\microsoft\windowsapps\pwsh.exe")) = "\appdata\local\microsoft\windowsapps\pwsh.exe") _
    Or (InStr(normalized, "\windowsapps\microsoft.powershell_") > 0 And Right(normalized, Len("\pwsh.exe")) = "\pwsh.exe")
End Function

Function ResolvePortablePowerShell(fileSystem, shell)
  Dim userProfile, cacheRoot, rootFolder, runtimeFolder, candidate, latestCandidate, latestDate, candidateDate
  userProfile = shell.ExpandEnvironmentStrings("%USERPROFILE%")
  cacheRoot = fileSystem.BuildPath(userProfile, ".cache\codex-runtimes")
  latestCandidate = ""
  latestDate = #1/1/1900#

  ' Codex bundles a real PowerShell 7 host for local tasks. Prefer it over
  ' Windows PowerShell when the latter is Restricted on this machine; this is
  ' a path lookup only and does not change any execution-policy setting.
  On Error Resume Next
  Set rootFolder = fileSystem.GetFolder(cacheRoot)
  If Err.Number = 0 Then
    For Each runtimeFolder In rootFolder.SubFolders
      candidate = fileSystem.BuildPath(runtimeFolder.Path, "dependencies\native\powershell\pwsh.exe")
      If fileSystem.FileExists(candidate) Then
        candidateDate = fileSystem.GetFile(candidate).DateLastModified
        If latestCandidate = "" Or candidateDate > latestDate Then
          latestCandidate = candidate
          latestDate = candidateDate
        End If
      End If
    Next
  End If
  Err.Clear
  On Error GoTo 0
  ResolvePortablePowerShell = latestCandidate
End Function

Function ResolvePowerShellPath(value, fileSystem, shell)
  Dim systemPowerShell, portablePowerShell, programFiles, windowsApps, folder, subFolder, candidate, latestCandidate, latestDate, candidateDate
  systemPowerShell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

  If LCase(fileSystem.GetFileName(CStr(value))) = "powershell.exe" Or LCase(fileSystem.GetFileName(CStr(value))) = "pwsh.exe" Or IsWindowsAppsPowerShellAlias(value) Then
    portablePowerShell = ResolvePortablePowerShell(fileSystem, shell)
    If portablePowerShell <> "" Then
      ResolvePowerShellPath = portablePowerShell
      Exit Function
    End If
  End If

  ' Never execute a WindowsApps PowerShell alias or packaged host. They can
  ' flash a console even when the caller requests a hidden window; Windows
  ' PowerShell can run the startup script while it resolves a real host itself.
  If IsWindowsAppsPowerShellAlias(value) Then
    If fileSystem.FileExists(systemPowerShell) Then
      ResolvePowerShellPath = systemPowerShell
    Else
      ResolvePowerShellPath = value
    End If
    Exit Function
  End If
  If fileSystem.FileExists(value) Then
    ResolvePowerShellPath = value
    Exit Function
  End If

  ' PowerShell packaged by Microsoft Store can update its versioned folder.
  ' Resolve the current real executable so the shortcut never falls back to
  ' the WindowsApps execution alias.
  latestCandidate = ""
  latestDate = #1/1/1900#
  On Error Resume Next
  programFiles = shell.ExpandEnvironmentStrings("%ProgramFiles%")
  windowsApps = fileSystem.BuildPath(programFiles, "WindowsApps")
  Set folder = fileSystem.GetFolder(windowsApps)
  If Err.Number = 0 Then
    For Each subFolder In folder.SubFolders
      If LCase(Left(subFolder.Name, Len("Microsoft.PowerShell_"))) = LCase("Microsoft.PowerShell_") And InStr(LCase(subFolder.Name), "__8wekyb3d8bbwe") > 0 Then
        candidate = fileSystem.BuildPath(subFolder.Path, "pwsh.exe")
        If fileSystem.FileExists(candidate) Then
          candidateDate = fileSystem.GetFile(candidate).DateLastModified
          If latestCandidate = "" Or candidateDate > latestDate Then
            latestCandidate = candidate
            latestDate = candidateDate
          End If
        End If
      End If
    Next
  End If
  Err.Clear
  On Error GoTo 0
  If latestCandidate <> "" Then
    ResolvePowerShellPath = latestCandidate
    Exit Function
  End If

  If fileSystem.FileExists(systemPowerShell) Then
    ResolvePowerShellPath = systemPowerShell
  Else
    ResolvePowerShellPath = value
  End If
End Function

If WScript.Arguments.Count < 1 Then WScript.Quit 2

Dim shell, fileSystem, powerShellPath, startScript, command, index
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

powerShellPath = ResolvePowerShellPath(WScript.Arguments(0), fileSystem, shell)
startScript = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "start-obsui.ps1")
command = QuoteArgument(powerShellPath) & " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File " & QuoteArgument(startScript)

For index = 1 To WScript.Arguments.Count - 1
  command = command & " " & QuoteArgument(WScript.Arguments(index))
Next

' Window style 0 prevents the PowerShell host from flashing while ObsUI starts.
shell.Run command, 0, False
