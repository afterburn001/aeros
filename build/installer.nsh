; Added to the Aeros uninstaller by electron-builder.
; The app registers itself to start with Windows, so a real uninstall must remove that entry too,
; or Windows keeps a dead startup item. Upgrades keep it, along with any choice made in Task Manager.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Aeros"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Aeros"
  ${endIf}
!macroend
