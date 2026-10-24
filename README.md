# הרודף · HARODEF

An online voice trivia game for Chrome, in the spirit of "The Chase". It's built for a 16:9 screen, needs at least 8 players, and sends everyone's voice live.

## How to play
1. One player opens a lobby and gets a 4-letter code (or an invite link).
2. Everyone joins with the code. Microphone access is required (headphones recommended).
3. When there are 8 or more players, the host starts. One player is randomly drawn as **the chaser**, and the rest are put in a random order.
4. **Qualifying round:** each contestant gets 90 seconds. Every correct answer is worth 5 points, and you need **40** to go on. You can answer out loud or by typing. A wrong answer or "skip" moves on to the next question.
5. **Square choice:** the chaser stands on square 1 and the contestant on square 4. The contestant picks square 3 (+10 points, closer to the chaser) or square 5 (−10 points, farther away).
6. **The chase:** a multiple-choice question with 30 seconds on the clock. A correct answer moves you forward one square; a wrong one leaves you in place. While the question is open, **the chaser and the contestant can't hear each other**, but everyone else hears both of them.
7. Reach square 8 and you've escaped. If the chaser lands on your square, you're caught.
8. The winner is the player who escaped with the most points. If nobody escaped, **the chaser wins**.

## Running locally
```bash
npm install
npm test
npm start      # http://localhost:5173
```
For testing alone: `http://localhost:5173/?dev` lowers the minimum to 2 and adds a "add bot" button to the lobby.

## Hosting on GitHub Pages
The repo includes `.github/workflows/pages.yml`, which runs the tests and deploys on every push to `main`.
In the repo settings: **Settings → Pages → Source: GitHub Actions**.

## 3D studio
The game runs inside a 3D studio in the style of the Israeli show "המרדף" (three.js, `js/studio3d.js`):
- A vertical 8-step board tower in the middle of the studio. The chaser lights it red from the top, the contestant is lit blue with their points, and "home" is gold.
- A raised podium for the chaser and a podium for the contestant, with a screen showing the name and points.
- Every player is a colored 3D piece: lined up in front of the board in the lobby, then on the team bench. A piece glows when its player talks.
- A camera that moves between shots: a wide studio shot, a close-up on the contestant, the board in the chase, and the winner at the end.
- An LED wall, light beams and effects: a red flash and shake when the contestant is caught, gold confetti on an escape.
If the computer doesn't support WebGL, the game automatically falls back to a flat look with a 2D board.

## Architecture
- **No server:** whoever opens the lobby is the "server" (host-authoritative). The connection uses PeerJS (WebRTC, with the free public signaling server and the TURN that comes with PeerJS).
- `js/game.js` holds all the rules as a pure state machine, with tests in `tests/`. Correct answers stay with the host until the reveal.
- `js/net.js` handles the connection, heartbeat and timeouts. `js/voice.js` runs voice between all players and cuts audio between the chaser and the contestant during a question (on both the sending and the receiving side).
- `js/speech.js` does Hebrew speech recognition (Web Speech API in Chrome). `js/match.js` checks answers forgivingly (niqqud, ה prefix, numbers in words, small typos).
- `js/ui.js` holds the screens and `js/main.js` connects everything together. Animations use anime.js, sounds are synthesized with WebAudio, and there are no media files.

## Known limitations
- If the host closes the page, the game ends.
- Voice runs as a full mesh, so up to 16 players are supported.
- On very strict networks (some corporate or university networks) the WebRTC connection may fail.
- Speech recognition in Chrome goes through Google's servers and needs an internet connection.
