// Deterministic staging for the four public screenshots.  A shot is not
// a different game mode: it places the ordinary player, car, police and
// mission state into a composed scene, then the normal loop renders it.

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
    api.setTime(18 * 60 + 40);
    api.placeCar(api.startCar, -88, 93.1, Math.PI / 2);
    api.enterCar(api.startCar);
    api.setMission(0);
    return true;
  }
  if (name === 'night') {
    api.setTime(23 * 60 + 10);
    api.placeCar(api.startCar, -21.9, 28, 0);
    api.enterCar(api.startCar);
    api.setWanted(2);
    api.setMission(1);
    return true;
  }
  if (name === 'chase') {
    api.setTime(18 * 60 + 55);
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
    api.setTime(18 * 60 + 40);
    api.placeCar(api.startCar, 91, 68, Math.PI / 2);
    api.enterCar(api.startCar);
    api.setMission(1);
    return true;
  }
  return false;
}

export function shotIsReady(frameCount, startedAt) {
  return frameCount > 8 && performance.now() - startedAt > 700;
}
