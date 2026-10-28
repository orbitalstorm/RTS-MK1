import type { AcousticEvent } from "../shared/schemas/deltas";
import { computeCameraSpatialParams } from "./spatial";
import { synthesizeSoundOnNode } from "./synthesizer";

export const MAX_POLYPHONY_PER_WINDOW = 4;
export const POLYPHONY_WINDOW_MS = 80;

/**
 * Pure polyphony gate testable in isolation and used by the WebAudio Mixer.
 * Enforces max 4 instances of the same sound within an 80 ms rolling window.
 */
export class PolyphonyLimiter {
  private readonly timestampsBySound: Map<string, number[]> = new Map();

  public tryAcquire(soundKey: string, nowMs: number): boolean {
    const list = this.timestampsBySound.get(soundKey) ?? [];
    const cutoff = nowMs - POLYPHONY_WINDOW_MS;
    const active = list.filter((t) => t >= cutoff);
    if (active.length >= MAX_POLYPHONY_PER_WINDOW) {
      this.timestampsBySound.set(soundKey, active);
      return false;
    }
    active.push(nowMs);
    this.timestampsBySound.set(soundKey, active);
    return true;
  }
}

export class RtsAudioMixer {
  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private evaBus: GainNode | null = null;
  private combatBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private readonly polyphony = new PolyphonyLimiter();
  private muted = false;

  private ensureContext(): boolean {
    if (this.muted || typeof window === "undefined") return false;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterBus = this.ctx.createGain();
      this.evaBus = this.ctx.createGain();
      this.combatBus = this.ctx.createGain();
      this.uiBus = this.ctx.createGain();

      this.masterBus.gain.value = 0.8;
      this.evaBus.gain.value = 0.9;
      this.combatBus.gain.value = 0.75;
      this.uiBus.gain.value = 0.7;

      this.evaBus.connect(this.masterBus);
      this.combatBus.connect(this.masterBus);
      this.uiBus.connect(this.masterBus);
      this.masterBus.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterBus && this.ctx) {
      this.masterBus.gain.setValueAtTime(muted ? 0 : 0.8, this.ctx.currentTime);
    }
  }

  public playUiClick(): void {
    if (!this.ensureContext() || !this.ctx || !this.uiBus) return;
    if (!this.polyphony.tryAcquire("UI_CLICK", performance.now())) return;
    synthesizeSoundOnNode(this.ctx, this.uiBus, "UI_CLICK", 0);
  }

  public playAcousticEvent(
    event: AcousticEvent,
    cameraCenterTileX: number,
    cameraCenterTileY: number
  ): void {
    if (!this.ensureContext() || !this.ctx || !this.combatBus || !this.evaBus) return;
    const nowMs = performance.now();
    if (!this.polyphony.tryAcquire(event.soundKind, nowMs)) return;

    const isEva = event.soundKind.startsWith("EVA_");
    if (isEva) {
      // Automatic ducking of the Combat bus during an EVA alert
      const now = this.ctx.currentTime;
      this.combatBus.gain.cancelScheduledValues(now);
      this.combatBus.gain.setValueAtTime(this.combatBus.gain.value, now);
      this.combatBus.gain.linearRampToValueAtTime(0.22, now + 0.03);
      const durationMs = synthesizeSoundOnNode(this.ctx, this.evaBus, event.soundKind, 0);
      this.combatBus.gain.linearRampToValueAtTime(0.75, now + durationMs / 1000 + 0.25);
      return;
    }

    const spatial = computeCameraSpatialParams(
      event.worldX,
      event.worldY,
      cameraCenterTileX,
      cameraCenterTileY
    );
    if (spatial.gainMultiplier <= 0.01) return;

    const panner = this.ctx.createStereoPanner();
    const spatialGain = this.ctx.createGain();
    panner.pan.setValueAtTime(spatial.pan, this.ctx.currentTime);
    spatialGain.gain.setValueAtTime(spatial.gainMultiplier, this.ctx.currentTime);

    spatialGain.connect(panner);
    panner.connect(this.combatBus);

    const detune = Math.round((Math.random() * 2 - 1) * 45);
    const durationMs = synthesizeSoundOnNode(this.ctx, spatialGain, event.soundKind, detune);
    setTimeout(() => {
      try {
        spatialGain.disconnect();
        panner.disconnect();
      } catch {
        // Ignore if already disconnected
      }
    }, durationMs + 80);
  }
}

export const globalAudioMixer = new RtsAudioMixer();
