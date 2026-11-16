// Sound, synthesized with WebAudio only: no audio files, no network. A shared noise
// buffer feeds the gunshots and the footsteps; oscillators make the beeps, ticks and
// stings. The context starts on the first user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let noiseBuffer = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.3);
    source.stop(t + duration);
  }

  function tone(freq, duration, type, gainValue, slideTo = null, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      if (kind === 'needle') {
        noise(0.28, 900, 0.9);
        tone(160, 0.18, 'sawtooth', 0.25, 50);
      } else if (kind === 'jackhammer') {
        noise(0.22, 1400, 0.95);
        tone(120, 0.12, 'square', 0.2, 60);
      } else if (kind === 'p9') {
        noise(0.12, 2200, 0.7);
      } else {
        noise(0.14, 1800, 0.85);
        tone(220, 0.06, 'square', 0.12, 90);
      }
    },
    distantShot() {
      noise(0.18, 700, 0.22);
    },
    hit() {
      tone(1800, 0.05, 'sine', 0.25);
    },
    kill() {
      tone(1800, 0.05, 'sine', 0.3);
      tone(2400, 0.09, 'sine', 0.3, null, 0.06);
    },
    hurt() {
      tone(140, 0.18, 'sawtooth', 0.3, 70);
    },
    reload() {
      tone(900, 0.03, 'square', 0.15);
      tone(600, 0.03, 'square', 0.15, null, 0.25);
      tone(1100, 0.04, 'square', 0.18, null, 0.5);
    },
    dryFire() {
      tone(1200, 0.03, 'square', 0.12);
    },
    step(run) {
      noise(0.06, 500, run ? 0.14 : 0.08);
    },
    plantBeep() {
      tone(1200, 0.09, 'sine', 0.3);
    },
    defuseBeep() {
      tone(900, 0.09, 'sine', 0.25);
    },
    bombTick() {
      tone(1500, 0.05, 'square', 0.2);
    },
    roundStart() {
      tone(440, 0.12, 'triangle', 0.3);
      tone(660, 0.2, 'triangle', 0.3, null, 0.12);
    },
    roundWin() {
      tone(523, 0.14, 'triangle', 0.3);
      tone(659, 0.14, 'triangle', 0.3, null, 0.14);
      tone(784, 0.3, 'triangle', 0.32, null, 0.28);
    },
    roundLose() {
      tone(392, 0.16, 'triangle', 0.3);
      tone(330, 0.16, 'triangle', 0.3, null, 0.16);
      tone(262, 0.34, 'triangle', 0.3, null, 0.32);
    },
    explosion() {
      noise(1.4, 300, 1.0);
      tone(60, 1.0, 'sine', 0.6, 30);
    },
    buy() {
      tone(880, 0.06, 'sine', 0.25);
      tone(1320, 0.1, 'sine', 0.25, null, 0.06);
    },
    denied() {
      tone(220, 0.12, 'square', 0.2);
    },
  };
}
