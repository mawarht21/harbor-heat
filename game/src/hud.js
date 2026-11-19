// The HUD: mission panel, wanted block, the SBPD dispatch panel, weapon slots,
// radio line, circular minimap, dialogs and toasts — DOM/CSS over the WebGL
// canvas, in the layout language of a modern open-world crime game.

import { clamp, dist2d } from './engine.js';
import { AVENUES_X, STREETS_Z, COAST_Z, BEACH_Z, HIDING_SPOTS, LOCATIONS, districtAt } from './city.js';
import { currentObjective, missionPanel, chopValue } from './missions.js';
import { dispatchRows } from './police.js';
import { respectRank } from './save.js';

const RADIO_TRACKS = [
  'Coral Static — "Palm Static"', 'Vela Roja — "Malecón Mirage"', 'The Tidewater Boys — "Sunset Run"',
  'Kip Sorrente — "Arepa Lights"', 'VHS Riviera — "Low Sun, High Rollers"', 'Los Delfines — "Sal y Sol"',
];
const TACTIC_COLORS = { PURSUIT: '#f4a261', RAMMING: '#ef476f', ROADBLOCK: '#c77dff', SPOTLIGHT: '#4cc9f0', RESPONDING: '#9aa5ad', SEARCHING: '#9aa5ad' };

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.els = {
      mission: $('missionPanel'), mpTitle: $('mpTitle'), mpObj: $('mpObj'), mpBar: $('mpBarFill'),
      mpNext: $('mpNext'), mpTimer: $('mpTimer'),
      stars: $('stars'), clock: $('clock'), money: $('money'), respect: $('respectLine'),
      dispatch: $('dispatch'), dispatchRows: $('dispatchRows'), dispatchState: $('dispatchState'),
      w1: $('w1'), w2: $('w2'), w2ammo: $('w2ammo'),
      vehicle: $('vehicleBox'), vehName: $('vehName'), vehSpeed: $('vehSpeed'), vehCond: $('vehCondFill'),
      radio: $('radio'), minimap: $('minimap'), health: $('healthFill'), armour: $('armourFill'),
      district: $('district'), dialog: $('dialog'), dlgWho: $('dlgWho'), dlgText: $('dlgText'), dlgFace: $('dlgFace'),
      toasts: $('toasts'), bust: $('bustWrap'), bustFill: $('bustFill'), hiding: $('hidingLabel'),
      hint: $('hint'), vignette: $('damageVignette'), garage: $('garageHint'),
      title: $('titleScreen'), continueHint: $('continueHint'),
      pause: $('pauseScreen'), pauseStats: $('pauseStats'),
      end: $('endScreen'), endTitle: $('endTitle'), endText: $('endText'),
    };
    this.mm = this.els.minimap.getContext('2d');
    this.toastList = [];
    this._cache = {};
  }
  set(el, key, value) {
    if (this._cache[key] !== value) { this._cache[key] = value; el.textContent = value; }
  }
  toast(text, color = '#ffffff') {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    div.style.color = color;
    this.els.toasts.appendChild(div);
    this.toastList.push({ div, t: 2.6 });
    while (this.toastList.length > 5) { const old = this.toastList.shift(); old.div.remove(); }
  }
  updateToasts(dt) {
    for (const t of this.toastList) { t.t -= dt; t.div.style.opacity = String(clamp(t.t, 0, 1)); }
    this.toastList = this.toastList.filter((t) => { if (t.t <= 0) { t.div.remove(); return false; } return true; });
  }

  update(state, dt) {
    const P = state.player, w = state.wanted;
    this.updateToasts(dt);
    // ---- mission panel
    const panel = missionPanel(state);
    const obj = currentObjective(state);
    this.set(this.els.mpTitle, 'mpt', panel.title);
    if (obj) {
      const d = Math.round(dist2d(P.x, P.z, obj.x, obj.z));
      this.set(this.els.mpObj, 'mpo', obj.label);
      this.els.mpObj.style.display = '';
      var objDist = d;
    } else {
      this.els.mpObj.style.display = 'none';
      var objDist = 0;
    }
    this.els.mpBar.style.width = `${Math.round(clamp(panel.frac, 0, 1) * 100)}%`;
    this.set(this.els.mpNext, 'mpn', panel.next || '');
    if (state.mission.timer > 0 && state.mission.active) {
      this.els.mpTimer.style.display = '';
      const t = Math.ceil(state.mission.timer);
      this.set(this.els.mpTimer, 'mptim', `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      this.els.mpTimer.style.color = t < 15 ? '#ff6b6b' : '#ffe27a';
    } else if (state.side.taxi && state.side.taxi.phase === 'deliver') {
      this.els.mpTimer.style.display = '';
      const t = Math.max(0, Math.ceil(state.side.taxi.timer));
      this.set(this.els.mpTimer, 'mptim', `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    } else this.els.mpTimer.style.display = 'none';
    // objective distance chip rides under the mission panel
    this.els.mpNext.textContent = (panel.next || '') + (obj && objDist > 0 ? '' : '');
    // ---- wanted / money / clock
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += i < w.stars ? '★' : '☆';
    this.set(this.els.stars, 'stars', starStr);
    this.els.stars.style.color = w.seen ? '#ffd23f' : '#cfd4d8';
    this.els.stars.style.animation = w.seen && w.stars >= 4 ? 'starPulse 0.7s infinite alternate' : 'none';
    const hh = Math.floor(state.timeHours), mm = Math.floor((state.timeHours - hh) * 60);
    this.set(this.els.clock, 'clock', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    this.set(this.els.money, 'money', `$${state.money.toLocaleString('en-US')}`);
    this.set(this.els.respect, 'resp', `RESPECT · ${respectRank(state.respect)}`);
    // ---- dispatch panel
    if (w.stars > 0 && state.police.length) {
      this.els.dispatch.style.display = '';
      const rows = dispatchRows(state);
      this.set(this.els.dispatchState, 'dstate', w.seen ? 'IN SIGHT' : 'SEARCHING');
      this.els.dispatchState.style.color = w.seen ? '#ff6b6b' : '#f4a261';
      const html = rows.map((r) =>
        `<div class="drow"><span class="dname">${r.heli ? '▲' : '◆'} ${r.name}</span><span class="ddist">${r.dist} m</span><span class="dchip" style="background:${TACTIC_COLORS[r.tactic] || '#9aa5ad'}">${r.tactic}</span></div>`).join('');
      if (this._cache.drows !== html) { this._cache.drows = html; this.els.dispatchRows.innerHTML = html; }
    } else this.els.dispatch.style.display = 'none';
    // ---- weapons
    this.els.w1.className = 'wslot' + (state.weapon === 1 ? ' active' : '');
    this.els.w2.className = 'wslot' + (!state.hasPistol ? ' locked' : state.weapon === 2 ? ' active' : '');
    this.set(this.els.w2ammo, 'ammo', state.hasPistol ? String(state.ammo) : 'LOCKED');
    // ---- vehicle box
    if (P.inCar && state.playerCar) {
      this.els.vehicle.style.display = '';
      this.set(this.els.vehName, 'vname', state.playerCar.name.toUpperCase());
      this.set(this.els.vehSpeed, 'vspeed', String(Math.round(Math.abs(state.playerCar.speed) * 3.6)));
      this.els.vehCond.style.width = `${Math.round(state.playerCar.health)}%`;
      this.els.vehCond.style.background = state.playerCar.health < 30 ? '#ef476f' : '#06d6a0';
    } else this.els.vehicle.style.display = 'none';
    // ---- radio
    const track = RADIO_TRACKS[Math.floor(state.radioT / 26) % RADIO_TRACKS.length];
    this.set(this.els.radio, 'radio', `♪ SOLANA FM 98.6 — ${track}`);
    // ---- bars + district
    this.els.health.style.width = `${Math.round(P.health)}%`;
    this.els.armour.style.width = `${Math.round(P.armour)}%`;
    this.set(this.els.district, 'dist', districtAt(P.x, P.z).toUpperCase());
    // ---- dialog
    const dlg = state.mission.dialog;
    if (dlg) {
      this.els.dialog.style.display = '';
      this.set(this.els.dlgWho, 'dwho', dlg.who.toUpperCase());
      this.set(this.els.dlgText, 'dtxt', dlg.text);
      this.els.dlgFace.style.background = dlg.who.includes('Rico') ? '#457b9d' : '#c33c54';
      this.set(this.els.dlgFace, 'dface', dlg.who.split(' ').map((s) => s[0]).join(''));
    } else this.els.dialog.style.display = 'none';
    // ---- bust + hiding + garage hint + context hint
    if (w.bust > 0.02) {
      this.els.bust.style.display = '';
      this.els.bustFill.style.width = `${Math.round(w.bust * 100)}%`;
    } else this.els.bust.style.display = 'none';
    if (w.inHidingSpot && w.stars > 0) {
      this.els.hiding.style.display = '';
      this.set(this.els.hiding, 'hid', w.seen ? `HIDING SPOT · ${w.hidingName}` : '◉ HIDDEN — heat draining fast');
    } else this.els.hiding.style.display = 'none';
    this.updateGarageHint(state);
    this.updateContextHint(state);
    this.els.vignette.style.opacity = String(clamp(state.damageFlash, 0, 0.85));
    this.drawMinimap(state, obj);
  }

  updateGarageHint(state) {
    const P = state.player;
    const g = LOCATIONS.garage;
    const near = P.inCar && dist2d(P.x, P.z, g.x, g.z + 6) < 13;
    if (near && state.playerCar) {
      this.els.garage.style.display = '';
      const val = chopValue(state.playerCar);
      const cd = state.side.chopCooldown > 0 ? ` · chop shop cooling down ${Math.ceil(state.side.chopCooldown)}s` : '';
      this.set(this.els.garage, 'gh', state.side.chopCooldown > 0
        ? `HARBOR GARAGE · R — repair $50${cd}`
        : `HARBOR GARAGE · ENTER — chop this car for $${val} · R — repair $50`);
    } else this.els.garage.style.display = 'none';
  }

  updateContextHint(state) {
    const P = state.player;
    let hint = '';
    if (state.mode === 'title') hint = '';
    else if (!P.inCar) {
      let nearCar = null, nd = 4.2;
      for (const car of state.cars) {
        const d = dist2d(P.x, P.z, car.x, car.z);
        if (d < nd) { nd = d; nearCar = car; }
      }
      if (nearCar) hint = `E — ${nearCar.kind === 'parked' ? 'steal' : 'enter'} the ${nearCar.name}`;
      else if (!state.mission.active && !state.storyDone) hint = 'ENTER — start the next job';
      else if (state.nearTaxiStart) hint = 'T — call a taxi fare';
      else if (state.nearRaceStart) hint = 'T — Harbor Run street race';
    }
    this.set(this.els.hint, 'hint', hint);
    this.els.hint.style.display = hint ? '' : 'none';
  }

  drawMinimap(state, obj) {
    const g = this.mm, S = 190, cx = S / 2, cy = S / 2;
    const scale = S / 800;
    const px = (x) => cx + (x - 275) * scale;
    const pz = (z) => cy + (z - 325) * scale;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(cx, cy, S / 2 - 1, 0, 6.29); g.clip();
    g.fillStyle = '#274b63'; g.fillRect(0, 0, S, S);           // water
    g.fillStyle = '#5d7052'; g.fillRect(px(-70), pz(-70), 690 * scale, (BEACH_Z + 70) * scale); // land
    g.fillStyle = '#e8d193'; g.fillRect(px(-70), pz(BEACH_Z), 690 * scale, (720 - BEACH_Z) * scale); // sand
    g.strokeStyle = '#3c4048'; g.lineWidth = 3.4;
    for (const ax of AVENUES_X) { g.beginPath(); g.moveTo(px(ax), pz(-46)); g.lineTo(px(ax), pz(486)); g.stroke(); }
    for (const sz of [...STREETS_Z, COAST_Z]) { g.beginPath(); g.moveTo(px(-46), pz(sz)); g.lineTo(px(596), pz(sz)); g.stroke(); }
    // hiding spots
    g.fillStyle = 'rgba(120,255,170,0.75)';
    g.font = 'bold 8px Arial'; g.textAlign = 'center';
    for (const h of HIDING_SPOTS) g.fillText('H', px(h.x), pz(h.z) + 3);
    // garage + pier marks
    g.fillStyle = '#ffb703'; g.fillRect(px(LOCATIONS.garage.x) - 2.5, pz(LOCATIONS.garage.z) - 2.5, 5, 5);
    const blip = (x, z, col, r = 3) => { g.fillStyle = col; g.beginPath(); g.arc(px(x), pz(z), r, 0, 6.29); g.fill(); };
    for (const car of state.police) if (car.kind !== 'heli') blip(car.x, car.z, Math.floor(performance.now() / 400) % 2 ? '#4cc9f0' : '#ef476f', 2.6);
    if (state.heli) blip(state.heli.x, state.heli.z, '#4cc9f0', 2.6);
    if (state.side.taxi) { const o = state.side.taxi.objective; blip(o.x, o.z, '#ffd23f', 3.4); }
    if (state.side.race) { const o = state.side.race.objective; blip(o.x, o.z, '#06d6a0', 3.4); }
    if (obj) {
      const pulse = 3.4 + Math.sin(performance.now() / 240) * 1.1;
      blip(obj.x, obj.z, '#ffe27a', pulse);
      g.strokeStyle = 'rgba(255,226,122,0.6)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(px(obj.x), pz(obj.z), pulse + 3.4, 0, 6.29); g.stroke();
    }
    // player arrow
    const P = state.player;
    g.translate(px(P.x), pz(P.z));
    g.rotate(Math.PI - P.heading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -5.4); g.lineTo(3.6, 4.2); g.lineTo(0, 2.2); g.lineTo(-3.6, 4.2); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(10,12,18,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, S / 2 - 1.5, 0, 6.29); g.stroke();
  }
}
