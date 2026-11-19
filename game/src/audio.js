// Tiny WebAudio sound kit: every effect is an oscillator blip or a noise burst
// made on the spot, so the game needs no audio files and stays fully offline.

export function createAudio() {
  let ctx = null;
  let sirenOsc = null;
  let sirenGain = null;

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function blip(freqA, freqB, seconds, type, volume) {
    const ac = ensure(); if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freqA, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), ac.currentTime + seconds);
    gain.gain.setValueAtTime(volume || 0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + seconds);
    osc.connect(gain).connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + seconds);
  }

  function noise(seconds, volume) {
    const ac = ensure(); if (!ac) return;
    const size = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, size, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ac.createBufferSource(); src.buffer = buffer;
    const gain = ac.createGain(); gain.gain.value = volume || 0.12;
    src.connect(gain).connect(ac.destination); src.start();
  }

  return {
    unlock() { ensure(); },
    pickup() { blip(880, 1320, 0.12, 'sine', 0.10); },
    cash() { blip(660, 990, 0.10, 'triangle', 0.10); setTimeout(() => blip(990, 1480, 0.12, 'triangle', 0.08), 60); },
    punch() { noise(0.08, 0.14); blip(160, 60, 0.08, 'square', 0.06); },
    shot() { noise(0.14, 0.20); blip(320, 50, 0.12, 'sawtooth', 0.10); },
    hit() { blip(220, 90, 0.10, 'square', 0.08); },
    crash() { noise(0.28, 0.22); blip(120, 40, 0.25, 'sawtooth', 0.10); },
    door() { blip(300, 180, 0.09, 'square', 0.07); },
    missionDone() { blip(523, 523, 0.10, 'triangle', 0.10); setTimeout(() => blip(659, 659, 0.10, 'triangle', 0.10), 110); setTimeout(() => blip(784, 1046, 0.18, 'triangle', 0.10), 220); },
    busted() { blip(440, 110, 0.6, 'sawtooth', 0.10); },
    setSiren(on) {
      const ac = ensure(); if (!ac) return;
      if (on && !sirenOsc) {
        sirenOsc = ac.createOscillator(); sirenGain = ac.createGain();
        sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 720;
        sirenGain.gain.value = 0.018;
        const lfo = ac.createOscillator(); const lfoGain = ac.createGain();
        lfo.frequency.value = 0.7; lfoGain.gain.value = 180;
        lfo.connect(lfoGain).connect(sirenOsc.frequency);
        sirenOsc.connect(sirenGain).connect(ac.destination);
        sirenOsc.start(); lfo.start(); sirenOsc._lfo = lfo;
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenOsc._lfo.stop(); } catch { /* already stopped */ }
        sirenOsc = null; sirenGain = null;
      }
    },
  };
}
