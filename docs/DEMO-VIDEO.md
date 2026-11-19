# Demo video outline

Target length: 3 to 4 minutes. Record the game in the browser at
http://localhost:8080 (run `npm run web` first). Capture the screen and
narrate over it. Keep the narration short and plain.

## 0:00 - 0:25 Opening

Show the menu screen. Say what the game is in one sentence: you are the
avalanche, built for CLAY Hackathon III on Sui. Mention the twist: size
is speed and health at once.

## 0:25 - 2:00 Gameplay

Start a run. Steer with the arrow keys. Swallow a snow patch and a pine,
and point out the size bar growing and the combo counter climbing. Let
the ball grow big and show how steering gets heavier. Take a hit on a
boulder on purpose to show the shrink and the shield blink, then keep
rolling until the run ends. Show the game over screen with the score,
distance and swallowed count.

## 2:00 - 2:50 How it works

Show the code briefly: `src/game.js` holds the rules, `web/app.js`
renders the canvas. Mention the tests (`npm test`, 34 tests) and the
terminal demo (`npm run demo`). If time allows, show the tuning: mass
sets speed and steering, and mass melts away so the player has to keep
eating.

## 2:50 - 3:30 On-chain leaderboard

Show `sui-move/sources/leaderboard.move`. Explain in one sentence: a
shared object keeps the ten best runs, one entry per player. If the
package is published, show the package ID and a testnet explorer link.

## 3:30 - 3:45 Close

One line: the game is free to play, the repo is public, and the
leaderboard lives on Sui testnet.

## Recording notes

- Record at 1080p if possible, game area only.
- The `?autoplay` address runs the game by itself, which helps when
  recording hands-free gameplay.
- Keep background music off or very low so the narration stays clear.
- Upload to YouTube as unlisted or public and paste the link in the
  submission form.
