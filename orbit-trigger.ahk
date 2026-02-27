#Requires AutoHotkey v2.0
#SingleInstance Force

; Orbit Premium Context-Aware Trigger
; Dynamically reads config.json for rules and hotkey

CONFIG_PATH := "config.json"

if !FileExist(CONFIG_PATH) {
    MsgBox("config.json not found!")
    ExitApp()
}

; Simple JSON parser for config
ConfigData := FileRead(CONFIG_PATH)
RegExMatch(ConfigData, "`"hotkey`":\s*`"([^`"]+)`"", &Match)
HotkeyStr := Match ? Match[1] : "MButton"

RegExMatch(ConfigData, "`"requireCtrlInBrowsers`":\s*(true|false)", &CtrlMatch)
RequireCtrl := CtrlMatch ? (CtrlMatch[1] = "true") : true

RegExMatch(ConfigData, "`"restrictToDesktop`":\s*(true|false)", &DesktopMatch)
RestrictDesktop := DesktopMatch ? (DesktopMatch[1] = "true") : true

; Extract browser list
Browsers := []
Pos := RegExMatch(ConfigData, "s)`"browserList`":\s*\[(.*?)]", &BrowserListMatch)
if Pos {
    InnerList := BrowserListMatch[1]
    Start := 1
    while RegExMatch(InnerList, "`"([^`"]+)`"", &M, Start) {
        Browsers.Push(M[1])
        Start := M.Pos + M.Len
    }
}

Hotkey("~" HotkeyStr, CheckTrigger) ; ~ ensures original key isn't blocked

CheckTrigger(ThisHotkey) {
    if !WinActive("A") ; Safety check: if no window is active, bail out early
        return

    ActiveProcess := WinGetProcessName("A")
    ActiveClass := WinGetClass("A")
    
    ; 1. Check Desktop Restriction
    if (RestrictDesktop) {
        IsDesktop := (ActiveClass = "Progman" or ActiveClass = "WorkerW")
        if (!IsDesktop) {
            ; Not on desktop, but check if it's a browser and we have Ctrl
            IsBrowser := false
            for b in Browsers {
                if (ActiveProcess = b) {
                    IsBrowser := true
                    break
                }
            }
            
            if (IsBrowser and RequireCtrl) {
                if !GetKeyState("Ctrl", "P")
                    return ; Browser without Ctrl -> Do nothing
            } else {
                return ; Not desktop and not a configured browser exception -> Do nothing
            }
        }
    }
    
    ToggleOrbit()
}

ToggleOrbit() {
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
