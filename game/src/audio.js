// Tiny WebAudio synth: every sound in Harbor Heat is generated, nothing loads.
// Engine hum and the two-tone siren are loops tied to game state; the rest are
// one-shot blips, thuds and stings.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
    this.engineOsc = null; this.engineGain = null;
  }
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const g = this.ctx.createGain(); g.gain.value = 0.5; g.connect(this.ctx.destination);
        this.master = g;
      } catch { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur, type = 'square', vol = 0.16, slideTo = null, delay = 0) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, vol = 0.2, freq = 1200, delay = 0) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }
  pickup() { this.tone(880, 0.07, 'square', 0.1); this.tone(1320, 0.09, 'square', 0.1, null, 0.06); }
  cash() { [660, 880, 1100, 1470].forEach((f, i) => this.tone(f, 0.09, 'triangle', 0.14, null, i * 0.05)); }
  shot() { this.noise(0.13, 0.3, 2600); this.tone(160, 0.08, 'sawtooth', 0.1, 60); }
  punch() { this.noise(0.07, 0.22, 500); }
  crash(big = false) { this.noise(big ? 0.3 : 0.16, big ? 0.4 : 0.25, 700); this.tone(90, 0.18, 'sine', 0.2, 40); }
  door() { this.tone(220, 0.06, 'square', 0.08, 140); }
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.15, null, i * 0.09)); }
  fail() { this.tone(300, 0.25, 'sawtooth', 0.12, 110); }
  bustedJingle() { [392, 370, 349, 311].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.14, null, i * 0.16)); }
  setSiren(on) {
    if (!this.ensure()) return;
    if (on && !this.sirenOn) {
      this.sirenOn = true;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 700; g.gain.value = 0.035;
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 0.55; lg.gain.value = 180;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenOsc = [o, lfo]; this.sirenGain = g;
    } else if (!on && this.sirenOn) {
      this.sirenOn = false;
      try { this.sirenOsc.forEach((o) => o.stop()); } catch { /* already gone */ }
      this.sirenOsc = null;
    }
  }
  setEngine(on, rpm = 0) {
    if (!this.ensure()) return;
    if (on && !this.engineOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 60; g.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start();
      this.engineOsc = o; this.engineGain = g;
    }
    if (this.engineOsc) {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + rpm * 130, t, 0.06);
      this.engineGain.gain.setTargetAtTime(on ? 0.05 : 0.0, t, 0.09);
      if (!on) { const o = this.engineOsc; setTimeout(() => { try { o.stop(); } catch { /* noop */ } }, 300); this.engineOsc = null; }
    }
  }
}
