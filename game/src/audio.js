// Every sound is synthesized with WebAudio: oscillators for engine and
// siren, short envelopes for UI and pickups, filtered noise for crashes.
// There are no audio files and nothing to download.

export class SoundEngine {
  constructor(muted = false) {
    this.muted = muted;
    this.context = null;
    this.master = null;
    this.engineOscillator = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOscillator = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.context.destination);
      this.buildEngine();
      this.buildSiren();
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  buildEngine() {
    const context = this.context;
    this.engineOscillator = context.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    this.engineOscillator.frequency.value = 52;
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engineOscillator.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOscillator.start();
  }

  buildSiren() {
    const context = this.context;
    this.sirenOscillator = context.createOscillator();
    this.sirenOscillator.type = 'triangle';
    this.sirenOscillator.frequency.value = 690;
    this.sirenGain = context.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOscillator.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOscillator.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.03);
    }
  }

  update(dt, speedKmh, wantedStars, driving) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const engineLevel = driving ? 0.028 + Math.min(Math.abs(speedKmh), 130) / 130 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(engineLevel, now, 0.08);
    this.engineOscillator.frequency.setTargetAtTime(48 + Math.abs(speedKmh) * 1.65, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(260 + Math.abs(speedKmh) * 7, now, 0.08);
    if (wantedStars >= 2) {
      this.sirenTimer += dt;
      const high = Math.floor(this.sirenTimer * 1.6) % 2 === 0;
      this.sirenOscillator.frequency.setTargetAtTime(high ? 880 : 660, now, 0.04);
      this.sirenGain.gain.setTargetAtTime(0.018, now, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, now, 0.12);
    }
  }

  tone(frequency, duration, type = 'sine', volume = 0.08, slideTo = null, delay = 0) {
    if (!this.context || this.muted) return;
    const context = this.context;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  click() {
    this.tone(740, 0.06, 'square', 0.035);
  }

  pickup() {
    this.tone(880, 0.09, 'sine', 0.07);
    this.tone(1318, 0.14, 'sine', 0.06, null, 0.07);
  }

  success() {
    this.tone(523, 0.13, 'triangle', 0.08);
    this.tone(659, 0.13, 'triangle', 0.08, null, 0.1);
    this.tone(784, 0.22, 'triangle', 0.09, null, 0.2);
  }

  fail() {
    this.tone(220, 0.25, 'sawtooth', 0.045, 130);
  }

  crash(intensity = 1) {
    if (!this.context || this.muted) return;
    const context = this.context;
    const duration = 0.16 + Math.min(intensity, 20) / 20 * 0.16;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = context.createGain();
    gain.gain.value = Math.min(0.22, 0.07 + intensity * 0.008);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.tone(72, duration, 'sine', 0.11, 38);
  }
}
