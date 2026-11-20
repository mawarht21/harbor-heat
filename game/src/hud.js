// The HUD is ordinary DOM over the WebGL canvas, except for the circular
// minimap.  Layout follows the leaderboard pattern: job on the left,
// stars and money on the right, SBPD dispatch beneath them, speed low
// right, map and radio low left.

const SONGS = [
  'Coral Static — “Low Tide Engine”',
  'Mara Vale — “Neon in the Rain”',
  'The Breakwaters — “Fifth Gear Heart”',
  'DJ Solana — “Harbor Lights”',
  'Rico & The Sirens — “Do Not Stop”',
];

function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing HUD element #${id}`);
  return found;
}

export class Hud {
  constructor() {
    this.root = element('hud');
    this.missionTitle = element('mission-title');
    this.missionObjective = element('mission-objective');
    this.missionDistance = element('mission-distance');
    this.missionTimer = element('mission-timer');
    this.stars = element('stars');
    this.clock = element('clock');
    this.cash = element('cash');
    this.district = element('district');
    this.dispatchUnits = element('dispatch-units');
    this.dispatchDistance = element('dispatch-distance');
    this.dispatchTactic = element('dispatch-tactic');
    this.dispatchState = element('dispatch-state');
    this.speedPanel = element('speed-panel');
    this.speed = element('speed');
    this.carHealth = element('car-health');
    this.minimap = element('minimap');
    this.minimapContext = this.minimap.getContext('2d');
    this.radio = element('radio');
    this.prompt = element('prompt');
    this.bustWrap = element('bust-wrap');
    this.bustBar = element('bust-bar');
    this.toastBox = element('toast');
    this.dialogBox = element('dialog');
    this.dialogName = element('dialog-name');
    this.dialogText = element('dialog-text');
    this.damage = element('damage');
    this.menu = element('menu');
    this.pause = element('pause');
    this.busted = element('busted');
    this.continueButton = element('continue-game');
    this.weaponBat = element('weapon-bat');
    this.weaponPistol = element('weapon-pistol');
    this.toastUntil = 0;
    this.dialogUntil = 0;
    this.damageUntil = 0;
  }

  showGame() {
    this.root.classList.remove('hidden');
    this.menu.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.busted.classList.add('hidden');
  }

  showMenu(hasSave) {
    this.root.classList.add('hidden');
    this.menu.classList.remove('hidden');
    this.continueButton.disabled = !hasSave;
    this.continueButton.classList.toggle('unavailable', !hasSave);
  }

  showPause(show) {
    this.pause.classList.toggle('hidden', !show);
  }

  showBusted(show) {
    this.busted.classList.toggle('hidden', !show);
  }

  toast(message, seconds = 3.2) {
    this.toastBox.textContent = message;
    this.toastBox.classList.remove('hidden');
    this.toastUntil = performance.now() + seconds * 1000;
  }

  dialog(name, text, seconds = 6) {
    this.dialogName.textContent = name;
    this.dialogText.textContent = text;
    this.dialogBox.classList.remove('hidden');
    this.dialogUntil = performance.now() + seconds * 1000;
  }

  flashDamage() {
    this.damageUntil = performance.now() + 280;
    this.damage.classList.add('active');
  }

  setPrompt(text) {
    if (text) {
      this.prompt.textContent = text;
      this.prompt.classList.remove('hidden');
    } else {
      this.prompt.classList.add('hidden');
    }
  }

  update(state) {
    const now = performance.now();
    if (now > this.toastUntil) this.toastBox.classList.add('hidden');
    if (now > this.dialogUntil) this.dialogBox.classList.add('hidden');
    if (now > this.damageUntil) this.damage.classList.remove('active');

    this.missionTitle.textContent = state.title;
    this.missionObjective.textContent = state.objective;
    if (state.marker) {
      const distance = Math.hypot(state.marker.x - state.playerPos.x, state.marker.z - state.playerPos.z);
      this.missionDistance.textContent = `${Math.round(distance)} m`;
    } else {
      this.missionDistance.textContent = 'FREE ROAM';
    }
    this.missionTimer.textContent = state.timer === null || state.timer === undefined
      ? '' : `${Math.ceil(state.timer)}s`;

    const stars = state.wanted.stars;
    this.stars.textContent = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars);
    this.stars.classList.toggle('hot', stars > 0);
    const hour = Math.floor(state.minutes / 60) % 24;
    const minute = Math.floor(state.minutes % 60);
    this.clock.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    this.cash.textContent = `$${Math.round(state.cash).toLocaleString('en-US')}`;
    this.district.textContent = state.district;

    this.dispatchUnits.textContent = String(state.police.unitCount);
    this.dispatchDistance.textContent = Number.isFinite(state.police.nearestDistance)
      ? `${Math.round(state.police.nearestDistance)} m` : '—';
    this.dispatchTactic.textContent = state.wanted.stars === 0 ? 'PATROL' : state.police.tacticLabel;
    this.dispatchState.textContent = state.wanted.statusLabel;

    this.speedPanel.classList.toggle('hidden', !state.inCar);
    if (state.inCar) {
      this.speed.textContent = String(Math.round(state.speedKmh));
      this.carHealth.style.width = `${Math.max(0, state.car ? state.car.health : 0)}%`;
    }
    this.weaponBat.classList.toggle('locked', state.storyIndex < 2);
    this.weaponPistol.classList.toggle('locked', state.storyIndex < 4);

    const bust = state.police.bust || 0;
    this.bustWrap.classList.toggle('hidden', bust <= 0.02);
    this.bustBar.style.width = `${bust * 100}%`;

    const song = SONGS[Math.floor(state.elapsed / 11) % SONGS.length];
    this.radio.textContent = `SOLANA FM 98.6 · ${song}`;
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const context = this.minimapContext;
    const size = this.minimap.width;
    const scale = size / 340;
    const toX = (x) => (x + 170) * scale;
    const toY = (z) => (z + 122) * scale;
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#17352f';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#12667e';
    context.fillRect(0, toY(132), size, size - toY(132));
    context.fillStyle = '#c9ad72';
    context.fillRect(0, toY(104), size, toY(132) - toY(104));
    context.strokeStyle = 'rgba(230,235,230,0.52)';
    context.lineWidth = 3;
    for (const x of state.city.verticalRoads) {
      context.beginPath(); context.moveTo(toX(x), 0); context.lineTo(toX(x), size); context.stroke();
    }
    for (const z of state.city.horizontalRoads) {
      context.beginPath(); context.moveTo(0, toY(z)); context.lineTo(size, toY(z)); context.stroke();
    }
    context.fillStyle = 'rgba(10, 18, 20, 0.55)';
    for (const collider of state.city.colliders) {
      if (collider.height < 5) continue;
      const width = Math.max(2, (collider.maxX - collider.minX) * scale);
      const height = Math.max(2, (collider.maxZ - collider.minZ) * scale);
      context.fillRect(toX(collider.minX), toY(collider.minZ), width, height);
    }
    context.fillStyle = '#43ffd0';
    for (const spot of state.city.hidingSpots) {
      context.fillRect(toX(spot.x) - 2, toY(spot.z) - 2, 4, 4);
    }
    if (state.marker) {
      context.fillStyle = '#ffd23e';
      context.beginPath();
      context.arc(toX(state.marker.x), toY(state.marker.z), 5 + Math.sin(state.elapsed * 4) * 1.2, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#ff3b30';
    for (const car of state.police.cruisers) {
      context.beginPath();
      context.arc(toX(car.pos.x), toY(car.pos.z), 3, 0, Math.PI * 2);
      context.fill();
    }
    const px = toX(state.playerPos.x);
    const py = toY(state.playerPos.z);
    context.translate(px, py);
    // Canvas y grows southward (matching world +z), so the heading angle
    // can be used directly: 0 points the arrow north, PI/2 east.
    context.rotate(state.playerHeading);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(4.5, 5);
    context.lineTo(0, 2.5);
    context.lineTo(-4.5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,0.65)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    context.stroke();
  }
}
