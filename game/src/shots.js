// Deterministic staging for the four public screenshots.  A shot is not
// a different game mode: it places the ordinary player, car, police and
// mission state into a composed scene, then the normal loop renders it.
// Daytime scenes sit in the long golden hour so the covers read as
// sunlit Vice-City-style postcards; only the night scene is truly dark.

export function readShotRequest() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  if (!name) return null;
  return {
    name,
    seed: Number(params.get('seed') || 7) || 7,
  };
}

export function applyShotScene(name, api) {
  const L = api.locations;
  if (name === 'city') {
    // 17:15 golden hour on the marina road: palms line the south side
    // and traffic shares the run east through Old Market.
    api.setTime(17 * 60 + 15);
    api.placeCar(api.startCar, -88, 93.1, Math.PI / 2);
    api.enterCar(api.startCar);
    api.setMission(0);
    return true;
  }
  if (name === 'night') {
    // 23:12 stays night, with Neon Row behind the start of the run.
    api.setTime(23 * 60 + 12);
    api.placeCar(api.startCar, -21.9, 28, 0);
    api.enterCar(api.startCar);
    api.setWanted(2);
    api.setMission(1);
    return true;
  }
  if (name === 'chase') {
    // 18:05, still golden: warm sky and facades, and the AIR ONE
    // spotlight cone stays readable against the dusk.
    api.setTime(18 * 60 + 5);
    api.placeCar(api.startCar, -6, 48.1, Math.PI / 2);
    api.startCar.speed = 23;
    api.startCar.travelHeading = Math.PI / 2;
    api.enterCar(api.startCar);
    api.setWanted(4);
    api.spawnPoliceAt(-24, 41.9, Math.PI / 2);
    api.spawnPoliceAt(-29, 54.2, Math.PI / 2);
    api.spawnPoliceAt(-44, 48.1, Math.PI / 2);
    api.setMission(4);
    return true;
  }
  if (name === 'mission') {
    // 17:25 golden hour, driving east on the docks road toward the
    // Warehouse 9 pickup instead of staging inside a city block.
    api.setTime(17 * 60 + 25);
    api.placeCar(api.startCar, 68.1, 48.1, Math.PI / 2);
    api.enterCar(api.startCar);
    api.setMission(1);
    return true;
  }
  return false;
}

export function shotIsReady(frameCount, startedAt) {
  return frameCount > 8 && performance.now() - startedAt > 700;
}
