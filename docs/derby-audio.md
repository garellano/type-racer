# Office Derby sound

Office Derby adds short office-style applause and cheering during the automatic race, then an original brass-style fanfare and an ovation when the selected racer reaches the finish. Sound is optional and separate from reduced motion. The samples and fanfare do not influence the draw, movement plan, or result.

## Verification

The audio lifecycle suite covers 22 cases. Browser rendering through a real `OfflineAudioContext` produced nonzero race and finish audio, peaks below 0.32, and a silent final half-second after the finite effects ended. Muted, restored-result, and hidden-finish-return renders were entirely silent. See the [measured output](evidence/derby-audio/validation.json). In-game checks also verified gesture activation, synchronized sound controls, a complete round, and default-off sound after refreshing the saved result.

## Source and license

The two crowd effects were downloaded on **November 2, 2026** from SFXMint's public sound library:

- [Small Group Crowd Applause 59](https://sfxmint.com/sounds/crowd-applause-59), from [the original MP3](https://sfxmint.com/dl/crowd-applause-59.mp3), is stored as `public/assets/derby/audio/office-applause-v1.mp3`.
- [Excited Burst Crowd Cheering 47](https://sfxmint.com/sounds/crowd-cheer-47), from [the original MP3](https://sfxmint.com/dl/crowd-cheer-47.mp3), is stored as `public/assets/derby/audio/office-cheer-v1.mp3`.

Both source pages identify the effects as **AI-generated sounds dedicated under CC0 1.0**. These are synthetic crowd effects, not recordings of the team's voices. SFXMint's [license page](https://sfxmint.com/license) permits use, modification, and redistribution in games and applications without attribution or a license fee. The library files were copied unchanged; the application serves its own committed copies and does not hotlink to SFXMint during play.

The finish fanfare is an original short composition synthesized by the Web Audio implementation in `src/derby-audio.ts`. It does not use a third-party musical recording or a familiar copyrighted victory theme.

## File verification

Both files are MP3 audio with ID3 2.4 metadata, **44,100 Hz stereo**, and 128 kbps audio streams. File sizes include metadata. The combined download size is **178,136 bytes**. FFprobe identified the streams, and FFmpeg measured their decoded levels:

| Runtime file             | File duration | Bytes   | RMS level   | Peak level |
| ------------------------ | ------------- | ------- | ----------- | ---------- |
| `office-applause-v1.mp3` | 7.000 s       | 112,892 | −28.63 dBFS | −2.44 dBFS |
| `office-cheer-v1.mp3`    | 4.000 s       | 65,244  | −19.36 dBFS | −2.58 dBFS |

The source pages describe about 6.7 and 3.1 seconds of audible content respectively; the files include some leading or trailing padding. Runtime gains keep the cheering lower than the applause to account for its higher average level.

SHA-256 checksums of the unchanged committed files:

- `office-applause-v1.mp3`: `2e84887e389d33cc9eb50c692ef86d0054ce541a03965522795ee0473ec84606`
- `office-cheer-v1.mp3`: `0e262462180f3265958a6cb639efbdbceb9316478aacc1c594ab852ee1197d78`

## Playback and lifecycle

Sound starts off on each page load. The host's sound-button gesture unlocks the browser's audio context and loads the two local samples once. A brief confirmation makes successful activation audible. If the browser cannot enable sound or load the effects, the control remains off and the game provides feedback; the race can continue.

Applause and cheering are short, intermittent bursts during the race, rather than an uninterrupted loop. Scheduled crowd playback is bounded by the race's saved finish time. The fanfare and final ovation are finite and stop themselves after the final result, even though the race's animation loop has ended.

Muting, hiding the page, starting another round, or leaving the game immediately cancels active and scheduled sounds. Pending activation cannot turn sound back on after a later mute or exit. Enabling sound does not replay earlier cheers. The finish cue is armed only by an audible, visible racing update: restoring a completed result or returning after a hidden finish does not play a late fanfare.

Audio verification belongs to the release checks and includes actual browser activation, mute, race cues, finish timing, restored results, and cleanup. This provenance document does not itself assert that the sound release has been deployed.
