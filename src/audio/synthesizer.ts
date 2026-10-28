import type { AcousticEvent } from "../shared/schemas/deltas";

const noiseBufferCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/**
 * Generates a Hann-windowed noise AudioBuffer in memory to prevent boundary clicks/pops.
 * Buffers are cached per AudioContext so combat bursts trigger zero allocations on the main thread.
 */
export function createWindowedNoiseBuffer(
  ctx: AudioContext,
  durationSec: number,
  pinkFilter = false
): AudioBuffer {
  let ctxCache = noiseBufferCache.get(ctx);
  if (!ctxCache) {
    ctxCache = new Map<string, AudioBuffer>();
    noiseBufferCache.set(ctx, ctxCache);
  }

  const cacheKey = `${durationSec.toFixed(3)}:${pinkFilter ? "pink" : "white"}`;
  const cached = ctxCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    const windowHann = Math.sin((Math.PI * i) / length);
    if (pinkFilter) {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.12;
      data[i] = pink * windowHann;
    } else {
      data[i] = white * windowHann;
    }
  }

  ctxCache.set(cacheKey, buffer);
  return buffer;
}

export function synthesizeSoundOnNode(
  ctx: AudioContext,
  destination: AudioNode,
  soundKind: AcousticEvent["soundKind"] | "UI_CLICK",
  detuneCents = 0
): number {
  const now = ctx.currentTime + 0.005;

  if (soundKind === "UI_CLICK") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.045);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.055);
    return 60;
  }

  if (soundKind === "CANNON_FIRE" || soundKind === "EXPLOSION_SMALL" || soundKind === "EXPLOSION_LARGE") {
    const duration = soundKind === "EXPLOSION_LARGE" ? 0.52 : soundKind === "EXPLOSION_SMALL" ? 0.32 : 0.22;
    const noise = ctx.createBufferSource();
    noise.buffer = createWindowedNoiseBuffer(ctx, duration, true);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(soundKind === "EXPLOSION_LARGE" ? 180 : 320, now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(soundKind === "EXPLOSION_LARGE" ? 0.42 : 0.28, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start(now);
    noise.stop(now + duration + 0.01);

    // Sub-bass shockwave (explosions) or breech/muzzle thump (cannon fire)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    const startFreq = soundKind === "EXPLOSION_LARGE" ? 115 : soundKind === "EXPLOSION_SMALL" ? 145 : 180;
    const endFreq = soundKind === "EXPLOSION_LARGE" ? 26 : soundKind === "EXPLOSION_SMALL" ? 36 : 52;
    const impactDuration = soundKind === "EXPLOSION_LARGE" ? 0.48 : soundKind === "EXPLOSION_SMALL" ? 0.28 : 0.12;
    const impactPeakGain = soundKind === "EXPLOSION_LARGE" ? 0.48 : soundKind === "EXPLOSION_SMALL" ? 0.34 : 0.26;

    subOsc.type = soundKind === "CANNON_FIRE" ? "triangle" : "sine";
    subOsc.frequency.setValueAtTime(startFreq, now);
    subOsc.frequency.exponentialRampToValueAtTime(endFreq, now + impactDuration);

    subGain.gain.setValueAtTime(impactPeakGain, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + impactDuration);

    subOsc.connect(subGain);
    subGain.connect(destination);
    subOsc.start(now);
    subOsc.stop(now + impactDuration + 0.01);

    return Math.round(duration * 1000);
  }

  if (soundKind === "LASER_BEAM" || soundKind === "ROCKET_LAUNCH" || soundKind === "RIFLE_BURST") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.detune.setValueAtTime(detuneCents, now);

    if (soundKind === "LASER_BEAM") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.28);
    } else if (soundKind === "ROCKET_LAUNCH") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.24);
    } else {
      osc.type = "square";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.09);
    }

    const dur = soundKind === "RIFLE_BURST" ? 0.095 : 0.28;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
    return Math.round(dur * 1000);
  }

  // EVA / Economy two-tone tactical chime
  const notes =
    soundKind === "EVA_LOW_POWER" || soundKind === "EVA_BASE_UNDER_ATTACK" || soundKind === "EVA_UNIT_LOST"
      ? [520, 390]
      : soundKind === "EVA_VICTORY"
      ? [523.25, 659.25, 783.99]
      : [587.33, 880];

  notes.forEach((freq, idx) => {
    const start = now + idx * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(start + 0.105);
  });

  return notes.length * 120 + 180;
}
