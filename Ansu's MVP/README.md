# Ansu's MVP: Duolingo Connect

A clickable prototype of **Duolingo Connect**: tap a button to talk with **Lily (AI)** or get matched with a **real learner**. In real-person calls, your avatar speaks for you, your face is hidden by default, and you choose your **real or synthetic voice** (switchable mid-call).

## Run the demo
Open `demo/duolingo-connect-demo.html` in Chrome. It's a single, offline file.

Presenter shortcuts: `L` call Lily · `P` real-person call setup · `G` safety-filter demo · `N` next partner · `Esc` end call · `H` hide presenter panel · `1/2/3` switch language.

## Develop
```bash
npm install
npx vite          # dev server
npx vite build    # rebuilds dist/index.html (single file)
```
Main component: `src/App.jsx` (React + Tailwind + lucide-react).
