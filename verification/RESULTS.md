# Verification results

Verified on November 10, 2026 with installed desktop Chrome, two isolated browser contexts, and simulated microphone audio. A looping 440 Hz WAV supplied a consistent test signal. The test server used a 12-second round for repeatable expiry checks. The normal application defaults to 180 seconds.

The package-registry download failed in this environment. Verification used the bundled Playwright installation through the PLAYWRIGHT_PATH environment variable. The app itself requires no downloaded packages.

## Passed

- Microphone permission denied, microphone missing, and microphone busy messages, using injected browser errors.
- First player waits, cancellation works, and the captured microphone track ends.
- Two players match automatically with complementary private role cards.
- Both peers receive WebRTC audio with positive inbound audio energy. Each outgoing track is a different track from the raw captured microphone.
- The actual AudioWorklet shifts a synthetic 440 Hz input near the expected Lily and Zari frequencies, within a 25 Hz tolerance.
- Remote audio playback produces a working speaking indicator. Both animated indicators are visible in the mobile call screenshot.
- Shared countdown, optional private hints, repeat request delivery, and mute/unmute outgoing track state.
- Timer expiry leads to XP recap on both screens and stops microphone tracks.
- Saved phrase persists in browser local storage after reload.
- Rematching from recap, early leave, and partner ended-call notification.
- Voice processor error handling closes the call and stops the microphone. The test directly invoked the installed processor-error handler.
- Missing processor heartbeats trigger the watchdog and release the microphone.
- Taking one browser offline ends its call and releases its microphone. The partner also reaches an ended-call screen.
- JavaScript syntax checks and Git whitespace checks.
- Visual inspection at 390 × 844 mobile viewport, including character selection, live call, hints, speaking indicators, and large call controls.

The speaking-indicator test caught a remote playback problem in the initial implementation. Playback now uses an audio element, with an extra user-tap control available for browser autoplay restrictions. The corrected flow passed.

## Still needs physical-device verification

- Two human microphones and actual audible playback in both directions.
- Mandarin word intelligibility, all four tones, neutral tones, tone sandhi, and natural conversational pace after filtering.
- Whether each voice is sufficiently disguised to support your demo.
- The full three-minute rehearsal on the phones and networks used for the presentation.
- Safari/iPhone behavior, headphone routing, Bluetooth latency, browser permission prompts, and the Hear your partner autoplay fallback.
- A real HTTPS tunnel or hosted deployment.
- Cross-network calls and TURN relay connectivity with real credentials.
- Network switching, screen locking, and cellular interruptions on physical devices.

The automated checks establish media transport, audio processing, and UI behavior with generated signals. Use the README rehearsal checklist for listening evaluation and final presentation setup.
