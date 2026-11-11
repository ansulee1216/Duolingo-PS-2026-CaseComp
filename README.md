# Character Chat

A mobile-first Duolingo case competition prototype for two people practicing conversational Mandarin. Choose Lily or Zari, find a partner, and make weekend plans in a three-minute voice call.

## Start on your computer

Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/). Open PowerShell and paste these commands.

```powershell
Set-Location 'C:\Users\eargu\Documents\ChatGPT\Duolingo Case Comp (PS'
npm.cmd start
```

The app has zero runtime packages. Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge. Keep the PowerShell window open.

To stop, press Ctrl+C in that window. To restart, run the same two commands again. Restarting clears all waiting players and active sessions. Everyone should reload and find a partner again.

For automatic restarts while editing, use the following command.

```powershell
npm.cmd run dev
```

## Open the same URL on two devices

Use an HTTPS tunnel for a practical rehearsal. Install Cloudflare's tunnel program in another PowerShell window.

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Close and reopen that window after installation. Keep the app running in the first window. In the second window, run the following command.

```powershell
cloudflared tunnel --url http://127.0.0.1:3000
```

Copy the HTTPS address ending in `trycloudflare.com` from the output. Both people open that exact address in their device's browser. The same address always opens the app's lobby. Choose a character, tap Find a partner, and allow microphone access. The first person waits until the other joins.

Keep both terminal windows open and the laptop awake. The tunnel address changes when you restart the tunnel. Restarting just the app lets you continue using the same tunnel address. A Cloudflare configuration file at `%USERPROFILE%\.cloudflared\config.yaml` can interfere with quick tunnels. Follow Cloudflare's setup guidance if the command reports that issue.

Microphones require HTTPS on phones. The browser also allows localhost on the host computer. A plain HTTP Wi-Fi IP address will fail the microphone check. The tunnel gives both devices a shared HTTPS address. [Microphone access requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [Cloudflare quick tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Use headphones, keep the browser in the foreground, and leave the screen unlocked during the call. Start with both devices on the same home Wi-Fi. Current Chrome/Edge desktop and Chrome Android are the primary rehearsal targets. Safari/iPhone needs physical-device verification.

## Networks and TURN

The HTTPS tunnel carries the app and matchmaking messages. WebRTC establishes its own encrypted audio path between devices. A public Google STUN server helps discover a route. Some mobile, school, company, and hotel networks require a TURN relay. [WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity)

If both people match but the call times out, configure a TURN service such as a hosted TURN provider or a coturn server with a public IP. Obtain its URLs, username, and credential. Stop the app and set these values in the same PowerShell window before starting again.

```powershell
$env:TURN_URL='turn:YOUR_TURN_HOST:3478?transport=udp,turns:YOUR_TURN_HOST:5349?transport=tcp'
$env:TURN_USERNAME='YOUR_TURN_USERNAME'
$env:TURN_CREDENTIAL='YOUR_TURN_PASSWORD'
npm.cmd start
```

Replace all placeholders with your provider's exact values. The TURN service needs its configured listener and relay ports reachable from the internet. TURN credentials are sent to paired browsers for WebRTC use. Use demo-scoped, time-limited credentials and rotate them after sharing the demo. This app reads environment variables directly. It does not load a .env file.

Public hosting is also possible with one persistent Node web-service instance. On Render, connect the repository, use `npm install` as the build command, `npm start` as the start command, and set `HOST=0.0.0.0`. Render supplies PORT and an HTTPS URL. Add TURN environment variables there as needed. Keep the instance awake for your demo. Pairing state lives in that single server's memory, so use one instance. [Render web-service setup](https://render.com/docs/web-services)

Hosting and TURN accounts have to be supplied separately. This project includes no deployed public URL or TURN credentials.

## What is implemented

- One shared lobby with Lily/Zari selection, microphone permission handling, waiting and cancellation.
- Server-assigned random partner selection from waiting players and opaque private session tokens. With two people, they match automatically.
- WebRTC two-way audio with animated local and remote speaking indicators.
- A custom AudioWorklet pitch shifter runs before audio is attached to WebRTC. Lily uses a 0.82 pitch ratio and Zari uses 1.22, with a high-pass filter and compressor. Both players can choose the same character.
- Only processed audio is sent. Worklet startup is checked before queuing. Processor errors, missing heartbeats, suspended audio, and ended microphone tracks close the call and release the microphone.
- Mute/unmute, leave, connection timeout, dropped-connection messages, and microphone release on cancellation, navigation, leaving, or ending.
- Complementary private roles, shared server-timed countdown, optional Chinese/pinyin/English hints, and partner repeat requests.
- XP recap and a casual phrase saved in local browser storage, with rematching.

The pitch effect changes a speaker's voice and preserves the direction of pitch contours mathematically. Recognizability and Mandarin intelligibility need human evaluation. These are stylized character voices. They have no speech synthesis or voice cloning. XP is a local demo reward. Phrase saving persists on the same browser.

The server stores session state and signaling in memory and expires abandoned clients after 10 seconds. It records no audio. A reload ends the participant's session. The app uses short HTTP polling for signaling so the backend stays dependency-free. No account or room code is needed.

## Two-device rehearsal

1. Open the same HTTPS address on two devices. Wear headphones and turn media volume up.
2. Select Lily on one and Zari on the other. Let the first person wait, cancel once, then search again. Let the second join.
3. Confirm each person sees a different private role and the countdown starts together after both audio connections are ready. If the browser shows Hear your partner, tap it to enable playback.
4. Speak in both directions. Check that each voice sounds noticeably changed and the correct speaking indicator moves.
5. Your fluent Mandarin teammate should listen for all four tones and the neutral tone. Try 妈、麻、马、骂, then 七点半可以吗？ and 我八点以前得回家. Repeat at natural conversational speed. Ask the listener to repeat what they heard without looking at the hint.
6. Discuss the actual scenario, including a nearby meeting place and travel time before 8 p.m. Listen for clipped consonants, metallic doubling, missing syllables, delay, and difficulty distinguishing rising and dipping tones. Swap characters and repeat.
7. Toggle mute and confirm the partner hears silence. Unmute and speak again. Open Help me say it and confirm it only opens locally. Send Say it again and check the other screen.
8. Let the full three minutes finish. Confirm both screens show a recap, microphones turn off, and the phrase saves after a reload.
9. Find another partner. Leave on one device and confirm the other gets an ended-call screen. Try closing a tab and briefly disabling Wi-Fi. Confirm the other device eventually ends and releases its microphone.
10. Repeat with the networks and phones you will use during the presentation. Configure TURN if the call cannot establish across those networks.

If the effect obscures tones, lower the shift strength in `public/app.js` by moving the two ratios closer to 1 and rehearse again. Every changed setting requires a new intelligibility check. The privacy effect is a creative disguise and should also be checked by listening.

## Automated verification

See [verification results](verification/RESULTS.md) for the observed checks and remaining physical-device checks.

The browser check uses simulated microphones in two independent Chrome browser contexts, plus a temporary server on port 3001 with a 12-second test round. Your normal app remains three minutes. For a repeatable run, install the test-only package and use the following commands.

```powershell
npm.cmd install --no-save playwright
node verification/browser-check.mjs
```

Chrome must be installed. The check saves mobile screenshots under `verification/`. It starts and stops its own test server. No test package is needed to start the actual app.

## Artwork

The built-in image generation tool produced the portraits saved in `public/lily.png` and `public/zari.png`, with transparent backgrounds, for this case competition prototype.

The Lily prompt was “A single expressive head-and-shoulders portrait of Duolingo character Lily, pale skin, deep purple straight bob swept over one eye, purple hoodie, deadpan half-lidded expression. Flat 2D vector-like illustration, bold rounded geometric shapes, clean solid color fills, recognizable Duolingo character design, no text or extra objects. Centered square app asset, minimal margin, transparent background.”

The Zari prompt was “A single expressive head-and-shoulders portrait of Duolingo character Zari, warm medium-brown skin, bright pink hijab, cobalt blue top, wide joyful smile. Flat 2D vector-like illustration, bold rounded geometric shapes, clean solid color fills, recognizable Duolingo character design, no text or extra objects. Centered square app asset, minimal margin, transparent background.”
