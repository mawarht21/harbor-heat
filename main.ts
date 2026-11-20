// HARBOR HEAT — 3D edition dossier builder.
//
// The playable entry is the static game/ directory beside this file: a
// hand-written WebGL1 city with a chase camera, traffic, pedestrians,
// stealable cars, the SBPD wanted/police systems, six story missions and
// repeatable taxi, race and chop-shop work.  This program's job is only
// to hand that game to make.fun in the shape its dossier contract asks
// for: copy game/ and screenshots/ into the output directory, then let
// the vendored library summarize them as dossier.json.
//
// Local check, outside the grader's container:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// In the grader's container /output is used when the variable is absent.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDirectory = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDirectory, { recursive: true });
cpSync(join(entryDirectory, 'game'), join(outputDirectory, 'game'), { recursive: true });

const screenshotOutput = join(outputDirectory, 'screenshots');
mkdirSync(screenshotOutput, { recursive: true });
const screenshotSource = join(entryDirectory, 'screenshots');
if (existsSync(screenshotSource)) {
  cpSync(screenshotSource, screenshotOutput, { recursive: true });
}

// The caps mirror the scorer's published limits.  Passing them here means
// a local run refuses the same oversized shapes the scorer would refuse:
// too many screenshots, one screenshot over 256 KiB, or a game tree that
// is too large in file count, total bytes, or any single path budget.
const dossier = buildDossier(outputDirectory, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outputDirectory, 'dossier.json'), dossier);
