/**
 * Orbit Plugin: Window Snapper
 * Snaps the currently focused window to 9 screen positions using Win32 API via PowerShell.
 * No external tools required.
 */

const name = 'Window Snapper';
const description = 'Snap any window to Left, Right, Top, Bottom, corners, or fullscreen';
const version = '1.0.0';

// PowerShell Win32 type definition (compiled once, cached by PS runtime)
const WIN32_TYPE = `Add-Type -ErrorAction SilentlyContinue -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class SnapWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd,int x,int y,int w,int h,bool r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd,int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd,out RECT r);
}
[StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
'@`;

// Get primary screen working area (excludes taskbar)
const GET_SCREEN = `$screen=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea`;

function snapCmd(x, y, w, h) {
    // x/y/w/h are expressions like '$screen.Width/2'
    return `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Add-Type -Assembly System.Windows.Forms; ${WIN32_TYPE}; ${GET_SCREEN}; $hw=[SnapWin]::GetForegroundWindow(); [SnapWin]::ShowWindow($hw,1); [SnapWin]::MoveWindow($hw,${x},${y},${w},${h},$true)"`;
}

const SNAPS = [
    { label: 'Left Half',      icon: 'label.svg', x: '0',                         y: '0',                          w: '$screen.Width/2',   h: '$screen.Height'   },
    { label: 'Right Half',     icon: 'label.svg', x: '$screen.Width/2',            y: '0',                          w: '$screen.Width/2',   h: '$screen.Height'   },
    { label: 'Top Half',       icon: 'label.svg', x: '0',                         y: '0',                          w: '$screen.Width',     h: '$screen.Height/2' },
    { label: 'Bottom Half',    icon: 'label.svg', x: '0',                         y: '$screen.Height/2',           w: '$screen.Width',     h: '$screen.Height/2' },
    { label: 'Top-Left',       icon: 'label.svg', x: '0',                         y: '0',                          w: '$screen.Width/2',   h: '$screen.Height/2' },
    { label: 'Top-Right',      icon: 'label.svg', x: '$screen.Width/2',            y: '0',                          w: '$screen.Width/2',   h: '$screen.Height/2' },
    { label: 'Bottom-Left',    icon: 'label.svg', x: '0',                         y: '$screen.Height/2',           w: '$screen.Width/2',   h: '$screen.Height/2' },
    { label: 'Bottom-Right',   icon: 'label.svg', x: '$screen.Width/2',            y: '$screen.Height/2',           w: '$screen.Width/2',   h: '$screen.Height/2' },
    { label: 'Fullscreen',     icon: 'label.svg', x: '0',                         y: '0',                          w: '$screen.Width',     h: '$screen.Height'   },
    { label: 'Center (80%)',   icon: 'label.svg', x: '$screen.Width*0.1',          y: '$screen.Height*0.1',         w: '$screen.Width*0.8', h: '$screen.Height*0.8'}
];

function init(api) {
    api.registerAction({
        type: 'group',
        label: 'Snap Window',
        icon: 'settings.svg',
        children: SNAPS.map(s => ({
            type: 'cmd',
            label: s.label,
            icon: s.icon,
            cmd: snapCmd(s.x, s.y, s.w, s.h)
        }))
    });

    api.logger.info('started');
}

module.exports = { name, description, version, init };
