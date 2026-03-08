/**
 * Orbit Plugin: Media Controller
 * Adds a Media group to the radial menu for controlling system media playback.
 * Uses PowerShell + WScript.Shell to simulate Windows media keys — no external tools needed.
 */

const { exec } = require('child_process');

const name = 'Media Controller';
const description = 'Play, pause, skip tracks and adjust volume from the radial menu';
const version = '1.0.0';

// Virtual-key codes for Windows media keys
const VK = {
    PLAY_PAUSE: 179,
    NEXT:       176,
    PREV:       177,
    STOP:       178,
    VOL_UP:     175,
    VOL_DOWN:   174,
    MUTE:       173
};

function mediaKeyCmd(vk) {
    return `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "$s=New-Object -COM WScript.Shell; $s.SendKeys([char](${vk}))"`;
}

function init(api) {
    api.registerAction({
        type: 'group',
        label: 'Media',
        icon: 'media.svg',
        children: [
            { type: 'cmd', label: 'Play / Pause', icon: 'play.svg',    cmd: mediaKeyCmd(VK.PLAY_PAUSE) },
            { type: 'cmd', label: 'Next Track',   icon: 'next.svg',    cmd: mediaKeyCmd(VK.NEXT) },
            { type: 'cmd', label: 'Prev Track',   icon: 'prev.svg',    cmd: mediaKeyCmd(VK.PREV) },
            { type: 'cmd', label: 'Stop',         icon: 'shutdown.svg', cmd: mediaKeyCmd(VK.STOP) },
            { type: 'cmd', label: 'Volume Up',    icon: 'sound.svg',   cmd: mediaKeyCmd(VK.VOL_UP) },
            { type: 'cmd', label: 'Volume Down',  icon: 'mute.svg',    cmd: mediaKeyCmd(VK.VOL_DOWN) },
            { type: 'cmd', label: 'Mute Toggle',  icon: 'mute.svg',    cmd: mediaKeyCmd(VK.MUTE) }
        ]
    });

    // Poll for currently playing media title via PowerShell (Windows 10/11 media session)
    api.schedule(() => {
        const ps = `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "
            try {
                Add-Type -AssemblyName System.Runtime.WindowsRuntime
                $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime]
                $mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
                $session = $mgr.GetCurrentSession()
                if ($session) {
                    $info = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
                    Write-Output (\\"$($info.Title)|||$($info.Artist)\\")
                } else { Write-Output 'none' }
            } catch { Write-Output 'unavailable' }
        "`;

        exec(ps, { timeout: 4000 }, (err, stdout) => {
            if (err || !stdout) return;
            const raw = stdout.trim();
            if (raw === 'none' || raw === 'unavailable') {
                api.broadcast('media-update', { title: null, artist: null });
                return;
            }
            const [title, artist] = raw.split('|||');
            api.broadcast('media-update', { title: title || '', artist: artist || '' });
        });
    }, 5000);

    api.logger.info('started');
}

module.exports = { name, description, version, init };
