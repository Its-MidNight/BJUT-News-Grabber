' Hidden launcher for the local server (campus-notice).
' If an instance is already running it just opens the UI, so double-clicking twice
' never starts a second server.
' Stop it later with stop.cmd (or: node ctl.mjs stop).
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
code = shell.Run("cmd /c node ctl.mjs check", 0, True)
If code = 0 Then
  shell.Run "cmd /c node ctl.mjs open", 0, False
Else
  shell.Run "node server.mjs", 0, False
End If
