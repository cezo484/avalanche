# Avalanche

You are the avalanche. Built for CLAY Hackathon III on Sui Network. Roll
down the mountain, swallow snow, pines and rocks to grow, and dodge the
boulders and ice walls that shrink you back down.

## How to play

Steer the snowball left and right down the slope. Snow patches, pine
trees and small rocks add mass and points. Grabbing things quickly builds
a combo up to x5. Size is speed and health at once: a bigger mass rolls
faster but steers worse, and mass melts away slowly, so you have to keep
eating. Boulders and ice walls shrink you. Shrink to minimum size and the
run ends.

Controls:

- Arrow keys or A and D to steer
- Drag with mouse or finger to steer
- P to pause, Space or Enter to start

## Run it

Node 18 or newer, no packages to install.

```
npm test        # game logic tests
npm run demo    # scripted run in the terminal
npm run web     # serve the game at http://localhost:8080
```

Open `http://localhost:8080/?autoplay` for a self-playing run. It is
handy for screenshots and recordings.

## How it is built

The game rules live in `src/game.js` with no DOM access, so the same code
runs in the browser and in the tests. `web/app.js` renders the game on a
canvas and reads keyboard and pointer input. The best score is stored in
localStorage.

Layout:

- `src/game.js`: game state, movement, spawning, collisions, scoring
- `src/demo.js`: scripted terminal run
- `web/`: canvas game, page, styles
- `test/`: game logic tests (node:test)
- `sui-move/`: on-chain leaderboard module (Move)
- `scripts/build-standalone.js`: builds the single-file version
- `assets/logo.png`: project logo, 1:1

## On-chain leaderboard

`sui-move/` holds a Move module with a shared leaderboard object. It keeps
the ten best runs, one entry per player, and emits an event for each new
score. Build and test it with the Sui CLI:

```
cd sui-move
sui move build
sui move test
```

Publish to testnet with `sui client publish`. The package ID goes in the
hackathon submission form.

The module was verified with Sui CLI 1.84.1: it builds clean and all four
Move tests pass. Publishing was not done from this machine because the Sui
CLI cannot reach testnet endpoints from here; publish from any machine with
normal testnet access.

## License

MIT. See LICENSE.
