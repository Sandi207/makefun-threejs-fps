# SIEGE LINE — Meridian Yards

A round-based tactical FPS in three.js for the make.fun threejs-fps-02 bounty:
Counter-Strike-style play with an original map, art, sounds and names. Single-player
against bots, from static files — no build step, no network requests.

## The game

Meridian Yards is an industrial container yard at dusk. Two bomb sites — **A: the
warehouse** on the west, **B: the rail dock** on the east — joined by a mid lane and
two side lanes, with containers, crates and lane walls for cover.

- **5v5, first to 5 rounds.** You play for **Vanguard** (attackers) with four bot
  teammates against five **Jackal** bots. A round is won by eliminating the other
  team, or by the bomb: the carrier plants the device at A or B by holding **E**
  inside the site ring (3 s); it detonates after 35 s unless a Jackal defuses it
  by holding **E** near it (5 s). Round timer 100 s; time expiring hands the round
  to the defenders.
- **Economy and buy menu.** Start at $800; +$300 per elimination, +$3250 for a round
  win, +$1900 for a loss (+$500 per consecutive loss). Press **B** during the buy
  phase to buy: P9 Sidearm, FANG-9 SMG, LONGBOW Rifle, JACKHAMMER Shotgun, NEEDLE
  Sniper, Kevlar Vest, Flashbang and Smoke Canister. Bots buy too, per round.
- **Gunplay.** Hitscan raycasts with headshots (~4x), torso (1x) and legs (0.75x);
  recoil and spread bloom that punish firing on the move; aim down sights with
  right mouse (tighter spread, slower move); crouching steadies your aim, jumping
  ruins it. Reload with **R**, switch weapons with **1**/**2**, throw a flashbang
  with **G** and smoke with **H**.
- **Bots.** Nine named bots navigate a waypoint graph over the yard: they rush
  sites, hold angles, rotate on intel, plant and defuse, and fall back when
  outnumbered. They aim with reaction time and error, hear gunshots, and are
  blinded by flashbangs and blocked by smoke.
- **HUD.** Dynamic crosshair, hitmarker, health/armour, ammo, money, round score
  and timer, alive counts, kill feed, damage-direction indicator, a 2D minimap
  (teammates always, enemies when spotted), buy menu, round banners and a
  scoreboard on **Tab**. If you go down, you spectate a teammate.
- **Sound.** Everything is synthesized with WebAudio: gunshots, hit ticks, reload
  clicks, footsteps, plant beeps, the bomb timer and round stings. No audio files.
- **Deterministic captures.** `?shot=start&seed=1` shows the title over a
  cinematic map view, `?shot=play&seed=1` drops you mid-round with bots visible,
  `?shot=end&seed=1` shows the match-end banner and scoreboard. Each renders
  without any user input and sets `window.__shotReady`.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to lock the pointer) |
| Click | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1 / 2 | Primary / sidearm |
| B | Buy menu (buy phase only) |
| E (hold) | Plant the device inside a site ring |
| G / H | Throw flashbang / smoke |
| Shift | Walk (quiet, steady) |
| Space | Jump |
| Ctrl | Crouch |
| Tab (hold) | Scoreboard |

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Requires Node.js 22 or later and a desktop browser with WebGL 2. The game is
plain static files under `game/`; `serve.ts` is a tiny static server for local
play only.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`out/dossier.json` with the vendored make.fun library. The game makes zero
network requests: three.js 0.187.0 is vendored under `game/vendor/three/`, all
textures are drawn on canvas in code, and all sounds are synthesized.

## Layout

- `main.ts` — the entry program (copies the game, writes the dossier)
- `serve.ts` — local static server
- `game/index.html` — page and HUD markup
- `game/src/main.js` — boot, fixed-step loop, shooting, grenades, shot modes
- `game/src/world.js` — the Meridian Yards map, colliders, sites, waypoints
- `game/src/bots.js` — bot agents and their waypoint brain
- `game/src/game.js` — rounds, economy, the bomb, the scoreboard
- `game/src/weapons.js` — the arsenal and the view model
- `game/src/player.js` — movement, collision, crouch and jump
- `game/src/hud.js` — the DOM HUD and the 2D minimap
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/src/audio.js` — WebAudio sound synthesis
- `game/src/textures.js` — procedural canvas textures
- `game/src/palette.js` — the one look plan, shared by scene and HUD
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
- `screenshots/` — three captures of the game (starter placeholders until the
  final renders are taken)
