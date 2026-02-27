#Requires AutoHotkey v2.0

; Orbit Radial Launcher Trigger
; Middle Mouse Button (MButton)

MButton:: {
    if WinExist("ahk_exe orbit.exe") or WinExist("Orbit") {
        if WinActive("ahk_exe orbit.exe") or WinActive("Orbit") {
            WinHide()
        } else {
            WinShow()
            WinActivate()
        }
    } else {
        ; Start the app if not running
        ; Assumes the app is in the same directory or built dist folder
        if FileExist("orbit.exe") {
            Run("orbit.exe")
        } else if FileExist("dist\win-unpacked\orbit.exe") {
            Run("dist\win-unpacked\orbit.exe")
        } else {
            ; Development mode: run via npm
            Run("cmd /c npm start", , "Hide")
        }
    }
}
