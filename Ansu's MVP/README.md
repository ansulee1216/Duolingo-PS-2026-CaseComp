# Ansu's MVP: Duolingo Connect

A clickable prototype of **Duolingo Connect**: tap a button to talk with **Lily (AI)**, get matched with a **real learner**, or **join a room** (Super). In real-person calls, your avatar speaks for you, your face is hidden by default, and you choose your **real or synthetic voice** (switchable mid-call).

## Connect Rooms (Super)
A cozy living room you walk around in. Set your language, level and what you can help others with, then:
- **Tap the floor** (or arrow keys/WASD) to walk. Routes go around furniture.
- Get within range of someone and **Say hi**, or **Join in** to an existing group.
- While talking: **Invite** someone nearby, **Merge groups**, or **Leave**. Walking away also leaves.
- Other people join, merge and drift apart on their own; nearby conversations show as faded bubbles.
- ★ marks good matches (native speakers who want to learn a language you can help with).

## Run the demo
Open `demo/duolingo-connect-demo.html` in Chrome. It's a single, offline file.

Presenter shortcuts: `L` call Lily · `P` real-person call setup · `R` join a room · `Space` say hi / join / merge in a room · `U` reset paywall · `G` safety-filter demo · `N` next partner · `Esc` end call · `H` hide presenter panel · `1/2/3` switch language.

## Develop
```bash
npm install
npx vite          # dev server
npx vite build    # rebuilds dist/index.html (single file)
```
Main component: `src/App.jsx` (React + Tailwind + lucide-react).
