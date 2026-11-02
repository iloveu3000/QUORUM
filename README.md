# QUORUM

QUORUM is a standalone collective-intelligence demonstration. Simulated chat messages from distinct simulated viewers accumulate into topic clusters. When a cluster reaches quorum, it appears in the discovery feed and OBS overlay. All generated messages and viewer names are demo data; the application has no Twitch or other live chat integration.

## Run locally

1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Run `npm run dev` and open the Vite URL printed in the terminal (normally `http://localhost:5173`).
4. Select **Start** in the DEMO SIGNAL SOURCE panel. Messages are marked **DEMO DATA** and **SIMULATED VIEWER**.

Run `npm test` for regression tests and `npm run build` for the production build. `npm start` runs the API server; configure a static host or reverse proxy to serve the generated `dist` frontend in production.

## Demo controls

- **Start** begins the message sequence and resets its position after a stopped simulation.
- **Pause** freezes the sequence and preserves current messages.
- **Resume** continues a paused sequence.
- **Stop** halts message generation and keeps evidence visible.
- **Reset demo** stops the simulation, clears messages, clusters and cooldown history, and returns to the initial sequence position.

Demo messages enter the same signal engine as the rest of the application. Viewer names are normalized case-insensitively and count once per cluster during the rolling 30-second evidence window.

## Signal engine

- The quorum threshold defaults to 5 and can be changed in the dashboard.
- Score is `min(100, round(unique simulated viewers / threshold × 100))`.
- Text matching lowercases text, removes punctuation and common stop words, applies small suffix rules for common inflections, then compares normalized token sets using Jaccard similarity. A match needs a score of at least 28% and either two shared terms or identical non-empty term sets. The interface shows shared terms and the match score. This is explainable lexical matching, not semantic AI.
- A topic that triggered a discovery is suppressed for the configurable cooldown, default 60 seconds. Set `QUORUM_DISCOVERY_COOLDOWN_MS` to change it. The cooldown survives cluster expiration; **Reset demo** clears it.
- The dashboard exposes supporting messages, contributors, source labels and match evidence. Streamer actions approve or dismiss discoveries; QUORUM does not ban or time out anyone.

## OBS overlay

Add `http://localhost:5173/overlay` as an OBS browser source. The overlay background stays transparent and discoveries update over Socket.IO in real time. Overlay discoveries are labelled **DEMO DATA**.

## Configuration

`.env.example` contains only the API port, default threshold and discovery cooldown. There are no Twitch credentials, OAuth settings or external chat services.
