# harbor-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/mawarht21/harbor-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/mawarht21/harbor-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**HARBOR HEAT** — an original open-world crime game set in the sun-soaked coastal city of Solana Bay, built from scratch as plain static files (HTML + ES modules, no build step, no network). Explore the city on foot and by car: steal cars, cruise with live traffic and pedestrians, outrun the SBPD through a five-star wanted system, fight with fists and a pistol, and work a six-mission story for fixer Mara Voss — from your first stolen coupe to the harbor heist finale — plus taxi fares and the Harbor Run street race on the side. Full HUD with a live minimap, a day–night cycle from golden hour to neon night, WebAudio sound, pause, and localStorage saves with Continue.

Controls: WASD / arrows move & drive · E enter / steal car · F or click punch / shoot · Shift sprint · P pause.

![HARBOR HEAT — Solana Bay at golden hour, first story mission on the HUD](screenshots/1-city.jpg)

## What's in the game

- **A living city** — Solana Bay, 3600×2600 world px: six districts (Palm Heights, Old Market, Neon Row, Harbor Garage, The Docks, Marina Pier), named rooftops, beach and marina, palms, crosswalks, and street lamps that glow after dark.
- **Traffic & pedestrians** — 26 NPC cars cruising the grid (they brake, queue and turn at intersections), 30 parked cars to steal, and 44 citizens who stroll the sidewalks and flee from danger.
- **Wanted system** — crimes witnessed add heat; 1–5 stars bring SBPD interceptors that predict your line, ram and box you in, plus foot cops at 3+ stars and a bust meter when you are cornered. Break line of sight and the heat cools.
- **A six-mission story** — fixer Mara Voss and Rico Ferran pull you from a first stolen coupe through a package run, a market debt call against Vasco's enforcers, a timed night-courier run and a vault job, to a 60-second citywide manhunt finale. Side jobs: taxi fares and the Harbor Run street race.
- **Combat & consequences** — fists, a pistol from mission 2, tracers, particles, health for you and your car, WASTED / BUSTED / HARBOR LEGEND end screens.
- **Full HUD** — live minimap (police blips, objective beacon, player arrow), wanted stars, money, respect, clock, health and vehicle bars, mission objective with distance and timer, and story dialog.
- **Day–night cycle & sound** — golden hour slides into neon night over a 7-minute day; every sound is synthesized live with WebAudio (shots, crashes, sirens, cash), so the game is fully offline.
- **Saves** — progress, money, weapon and position persist in localStorage; Continue from the title screen.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=hcqmckce&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
