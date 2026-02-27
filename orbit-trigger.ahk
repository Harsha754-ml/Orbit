#Requires AutoHotkey v2.0
#SingleInstance Force

; Orbit Premium Trigger
; Dynamically reads hotkey from config.json

CONFIG_PATH := "config.json"

if !FileExist(CONFIG_PATH) {
    MsgBox("config.json not found! Please run the app once to generate it.")
    ExitApp()
}

; Simple JSON parser for hotkey
ConfigData := FileRead(CONFIG_PATH)
RegExMatch(ConfigData, "`"hotkey`":\s*`"([^`"]+)`"", &Match)
HotkeyStr := Match ? Match[1] : "MButton"

Hotkey(HotkeyStr, ToggleOrbit)

ToggleOrbit(ThisHotkey) {
    if WinExist("ahk_exe orbit.exe") or WinExist("Orbit Premium") {
        if WinActive("ahk_exe orbit.exe") or WinActive("Orbit Premium") {
            WinHide()
        } else {
            WinShow()
            WinActivate()
        }
    } else {
        if FileExist("orbit.exe") {
            Run("orbit.exe")
        } else if FileExist("dist\win-unpacked\orbit.exe") {
            Run("dist\win-unpacked\orbit.exe")
        } else {
            Run("cmd /c npm start", , "Hide")
        }
    }
}
