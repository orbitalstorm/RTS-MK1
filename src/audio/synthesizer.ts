import type { AcousticEvent } from "../shared/schemas/deltas";

/**
 * Generates a Hann-windowed noise AudioBuffer in memory to prevent boundary clicks/pops.
 */
export function createWindowedNoiseBuffer(
  ctx: AudioContext,
  durationSec: number,
  pinkFilter = false
): AudioBuffer {
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
