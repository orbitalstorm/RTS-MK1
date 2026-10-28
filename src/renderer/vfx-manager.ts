import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE_PIXEL_SIZE,
  type FactionId,
} from "../shared/constants";
import type {
  ProjectileVisual,
  VisualEffectEvent,
  VisualEffectKind,
} from "../shared/schemas/deltas";
import type { TacticalCamera } from "./camera";
import type { ProceduralSpriteAtlas } from "./generator/atlas-generator";

export interface ScorchCrater {
  worldPxX: number;
  worldPxY: number;
  tileIdx: number;
  radiusPx: number;
  createdAtMs: number;
  seed: number;
}

export interface ActiveExplosion {
  worldPxX: number;
  worldPxY: number;
  tileIdx: number;
  effectKind: VisualEffectKind;
  radiusPx: number;
  startMs: number;
  durationMs: number;
}

export type VfxParticleKind = "SPARK" | "DEBRIS" | "SMOKE" | "CRYSTAL";

export interface VfxParticle {
  kind: VfxParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ageMs: number;
  maxAgeMs: number;
  tileIdx: number;
}

export interface ActiveProjectile {
  id: string;
  fromPxX: number;
  fromPxY: number;
  toPxX: number;
  toPxY: number;
  weaponStyle: ProjectileVisual["weaponStyle"];
  faction?: FactionId;
  startMs: number;
  durationMs: number;
  lastSmokeMs: number;
}

const MAX_CRATERS = 48;
const MAX_EXPLOSIONS = 64;
const MAX_PARTICLES = 320;
const MAX_PROJECTILES = 96;
const CRATER_LIFETIME_MS = 18_000;
const MAX_SEEN_IDS = 256;

function worldTileToIndex(tileX: number, tileY: number): number {
  const cx = Math.max(0, Math.min(MAP_WIDTH_TILES - 1, Math.round(tileX)));
  const cy = Math.max(0, Math.min(MAP_HEIGHT_TILES - 1, Math.round(tileY)));
  return cy * MAP_WIDTH_TILES + cx;
}

function worldPxToTileIndex(pxX: number, pxY: number): number {
  return worldTileToIndex(pxX / TILE_PIXEL_SIZE, pxY / TILE_PIXEL_SIZE);
}

/**
 * High-performance 2D Canvas Battlefield VFX Manager (Explosions, Shockwaves,
 * Persistent Scorch Craters, Particles, Damage Smoke, and 60 FPS Animated Projectiles).
 * Strictly zero DOM allocations and bounded memory pools to prevent GC spikes.
 */
export class BattlefieldVfxManager {
  private readonly craters: ScorchCrater[] = [];
  private readonly explosions: ActiveExplosion[] = [];
  private readonly particles: VfxParticle[] = [];
  private readonly projectiles: ActiveProjectile[] = [];
  private readonly seenIds = new Set<string>();
  private readonly seenIdOrder: string[] = [];
  private prngState = 0x5f3759df;

  private nextRandom(): number {
    // Deterministic fast xorshift32 for particle variation without GC
    let x = this.prngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.prngState = x;
    return (x >>> 0) / 0xffffffff;
  }

  private markIdSeen(id: string): boolean {
    if (this.seenIds.has(id)) {
      return false;
    }
    this.seenIds.add(id);
    this.seenIdOrder.push(id);
    if (this.seenIdOrder.length > MAX_SEEN_IDS) {
      const oldest = this.seenIdOrder.shift();
      if (oldest !== undefined) {
        this.seenIds.delete(oldest);
      }
    }
    return true;
  }

  public getActiveCounts(): {
    craters: number;
    explosions: number;
    particles: number;
    projectiles: number;
  } {
    return {
      craters: this.craters.length,
      explosions: this.explosions.length,
      particles: this.particles.length,
      projectiles: this.projectiles.length,
    };
  }

  public ingestProjectiles(
    projectiles: readonly ProjectileVisual[],
    nowMs: number
  ): void {
    for (const proj of projectiles) {
      if (!this.markIdSeen(`proj:${proj.id}`)) {
        continue;
      }
      if (this.projectiles.length >= MAX_PROJECTILES) {
        this.projectiles.shift();
      }
      const durationMs =
        proj.weaponStyle === "ROCKET"
          ? 240
          : proj.weaponStyle === "SHELL"
            ? 200
            : proj.weaponStyle === "LASER"
              ? 180
              : 160;

      this.projectiles.push({
        id: proj.id,
        fromPxX: (proj.fromX + 0.5) * TILE_PIXEL_SIZE,
        fromPxY: (proj.fromY + 0.5) * TILE_PIXEL_SIZE,
        toPxX: (proj.toX + 0.5) * TILE_PIXEL_SIZE,
        toPxY: (proj.toY + 0.5) * TILE_PIXEL_SIZE,
        weaponStyle: proj.weaponStyle,
        faction: proj.faction,
        startMs: nowMs,
        durationMs,
        lastSmokeMs: nowMs,
      });
    }
  }

  public ingestTickEvents(
    events: readonly VisualEffectEvent[],
    projectiles: readonly ProjectileVisual[],
    camera: TacticalCamera,
    nowMs: number
  ): void {
    this.ingestProjectiles(projectiles, nowMs);

    for (const ev of events) {
      if (!this.markIdSeen(`ev:${ev.id}`)) {
        continue;
      }

      if (ev.shakeIntensity > 0) {
        camera.addExplosionShake(ev.shakeIntensity, ev.worldX, ev.worldY);
      }

      const worldPxX = (ev.worldX + 0.5) * TILE_PIXEL_SIZE;
      const worldPxY = (ev.worldY + 0.5) * TILE_PIXEL_SIZE;
      const tileIdx = worldTileToIndex(ev.worldX, ev.worldY);
      const radiusPx = Math.max(10, ev.radiusTiles * TILE_PIXEL_SIZE);

      this.spawnVisualEffect(ev.effectKind, worldPxX, worldPxY, tileIdx, radiusPx, nowMs);
    }

    // Fallback slight shake if heavy projectiles fired without explicit visualEvents
    if (events.length === 0 && projectiles.length > 0) {
      for (const proj of projectiles) {
        if (proj.weaponStyle === "SHELL" || proj.weaponStyle === "ROCKET" || proj.weaponStyle === "LASER") {
          camera.addExplosionShake(0.15, proj.toX, proj.toY);
        }
      }
    }
  }

  private spawnVisualEffect(
    kind: VisualEffectKind,
    worldPxX: number,
    worldPxY: number,
    tileIdx: number,
    radiusPx: number,
    nowMs: number
  ): void {
    // 1. Persistent Scorch Crater on ground-scorching explosions
    if (
      kind === "BUILDING_DEMOLITION" ||
      kind === "UNIT_EXPLOSION" ||
      kind === "ROCKET_EXPLOSION"
    ) {
      const craterRadius =
        kind === "BUILDING_DEMOLITION"
          ? Math.max(22, radiusPx * 0.65)
          : kind === "UNIT_EXPLOSION"
            ? Math.max(14, radiusPx * 0.55)
            : Math.max(10, radiusPx * 0.45);
      this.addCrater(worldPxX, worldPxY, tileIdx, craterRadius, nowMs);
    }

    // 2. Animated Multi-Phase Explosion
    if (kind !== "HARVEST_SPARKS") {
      const durationMs =
        kind === "BUILDING_DEMOLITION"
          ? 680
          : kind === "UNIT_EXPLOSION"
            ? 460
            : kind === "ROCKET_EXPLOSION" || kind === "SHELL_IMPACT"
              ? 320
              : kind === "LASER_BURN"
                ? 260
                : 140; // MUZZLE_FLASH

      this.pushExplosion({
        worldPxX,
        worldPxY,
        tileIdx,
        effectKind: kind,
        radiusPx,
        startMs: nowMs,
        durationMs,
      });

      // Staggered secondary sub-explosions for BUILDING_DEMOLITION
      if (kind === "BUILDING_DEMOLITION") {
        const subOffsets: Array<{ dx: number; dy: number; delay: number; scale: number }> = [
          { dx: -radiusPx * 0.35, dy: -radiusPx * 0.25, delay: 95, scale: 0.62 },
          { dx: radiusPx * 0.38, dy: radiusPx * 0.22, delay: 195, scale: 0.68 },
          { dx: -radiusPx * 0.18, dy: radiusPx * 0.36, delay: 310, scale: 0.58 },
        ];
        for (const sub of subOffsets) {
          this.pushExplosion({
            worldPxX: worldPxX + sub.dx,
            worldPxY: worldPxY + sub.dy,
            tileIdx,
            effectKind: "UNIT_EXPLOSION",
            radiusPx: radiusPx * sub.scale,
            startMs: nowMs + sub.delay,
            durationMs: 420,
          });
        }
      }
    }

    // 3. Dynamic Particles (Sparks, Debris, Smoke, or Crystalline Tiberium Sparks)
    if (kind === "HARVEST_SPARKS") {
      for (let i = 0; i < 8; i++) {
        const angle = this.nextRandom() * Math.PI * 2;
        const speed = 18 + this.nextRandom() * 34;
        this.pushParticle({
          kind: "CRYSTAL",
          x: worldPxX + (this.nextRandom() - 0.5) * 10,
          y: worldPxY + (this.nextRandom() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 8,
          size: 2.2 + this.nextRandom() * 2.0,
          color: i % 2 === 0 ? "#22c55e" : "#86efac",
          ageMs: 0,
          maxAgeMs: 260 + this.nextRandom() * 180,
          tileIdx,
        });
      }
      return;
    }

    const sparkCount =
      kind === "BUILDING_DEMOLITION"
        ? 14
        : kind === "UNIT_EXPLOSION"
          ? 10
          : kind === "ROCKET_EXPLOSION" || kind === "SHELL_IMPACT"
            ? 6
            : kind === "LASER_BURN"
              ? 7
              : 4;

    for (let i = 0; i < sparkCount; i++) {
      const angle = this.nextRandom() * Math.PI * 2;
      const speed = 35 + this.nextRandom() * 85;
      this.pushParticle({
        kind: "SPARK",
        x: worldPxX,
        y: worldPxY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.6 + this.nextRandom() * 1.8,
        color:
          kind === "LASER_BURN"
            ? i % 2 === 0
              ? "#fca5a5"
              : "#ef4444"
            : i % 2 === 0
              ? "#fef08a"
              : "#f97316",
        ageMs: 0,
        maxAgeMs: 180 + this.nextRandom() * 240,
        tileIdx,
      });
    }

    if (kind === "BUILDING_DEMOLITION" || kind === "UNIT_EXPLOSION") {
      const debrisCount = kind === "BUILDING_DEMOLITION" ? 8 : 5;
      for (let i = 0; i < debrisCount; i++) {
        const angle = this.nextRandom() * Math.PI * 2;
        const speed = 24 + this.nextRandom() * 60;
        this.pushParticle({
          kind: "DEBRIS",
          x: worldPxX + (this.nextRandom() - 0.5) * 8,
          y: worldPxY + (this.nextRandom() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2.5 + this.nextRandom() * 2.5,
          color: i % 2 === 0 ? "#475569" : "#94a3b8",
          ageMs: 0,
          maxAgeMs: 320 + this.nextRandom() * 260,
          tileIdx,
        });
      }

      const smokeCount = kind === "BUILDING_DEMOLITION" ? 7 : 4;
      for (let i = 0; i < smokeCount; i++) {
        const angle = this.nextRandom() * Math.PI * 2;
        const speed = 8 + this.nextRandom() * 22;
        this.pushParticle({
          kind: "SMOKE",
          x: worldPxX + (this.nextRandom() - 0.5) * 12,
          y: worldPxY + (this.nextRandom() - 0.5) * 12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 12,
          size: 5 + this.nextRandom() * 5,
          color: "#1e293b",
          ageMs: 0,
          maxAgeMs: 480 + this.nextRandom() * 380,
          tileIdx,
        });
      }
    }
  }

  private addCrater(
    worldPxX: number,
    worldPxY: number,
    tileIdx: number,
    radiusPx: number,
    nowMs: number
  ): void {
    if (this.craters.length >= MAX_CRATERS) {
      this.craters.shift();
    }
    this.craters.push({
      worldPxX,
      worldPxY,
      tileIdx,
      radiusPx,
      createdAtMs: nowMs,
      seed: this.nextRandom(),
    });
  }

  private pushExplosion(explosion: ActiveExplosion): void {
    if (this.explosions.length >= MAX_EXPLOSIONS) {
      this.explosions.shift();
    }
    this.explosions.push(explosion);
  }

  private pushParticle(particle: VfxParticle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(particle);
  }

  /**
   * Renders persistent scorch craters on the terrain layer (beneath buildings & units).
   */
  public renderCraters(
    ctx: CanvasRenderingContext2D,
    nowMs: number,
    visibleCells: ReadonlySet<number>,
    exploredCells: ReadonlySet<number>
  ): void {
    for (let i = this.craters.length - 1; i >= 0; i--) {
      const crater = this.craters[i]!;
      const elapsed = nowMs - crater.createdAtMs;
      if (elapsed >= CRATER_LIFETIME_MS) {
        this.craters.splice(i, 1);
        continue;
      }
      if (exploredCells.size > 0 && !exploredCells.has(crater.tileIdx)) {
        continue;
      }

      const lifeRatio = Math.max(0, Math.min(1, elapsed / CRATER_LIFETIME_MS));
      const visibilityFactor =
        exploredCells.size === 0 || visibleCells.has(crater.tileIdx) ? 1.0 : 0.45;
      const alpha = (1 - lifeRatio * 0.85) * 0.68 * visibilityFactor;
      if (alpha <= 0.02) continue;

      ctx.save();
      ctx.globalAlpha = alpha;

      const grad = ctx.createRadialGradient(
        crater.worldPxX,
        crater.worldPxY,
        crater.radiusPx * 0.1,
        crater.worldPxX,
        crater.worldPxY,
        crater.radiusPx
      );
      grad.addColorStop(0, "rgba(8, 10, 14, 0.92)");
      grad.addColorStop(0.55, "rgba(24, 24, 27, 0.65)");
      grad.addColorStop(1, "rgba(24, 24, 27, 0)");

      ctx.beginPath();
      ctx.arc(crater.worldPxX, crater.worldPxY, crater.radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Cracked rim highlight
      ctx.beginPath();
      ctx.arc(
        crater.worldPxX,
        crater.worldPxY,
        crater.radiusPx * 0.58,
        crater.seed * Math.PI,
        crater.seed * Math.PI + Math.PI * 1.35
      );
      ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Renders rising black smoke billows and flickering embers on structures and vehicles below 55% HP.
   */
  public renderDamageSmoke(
    ctx: CanvasRenderingContext2D,
    worldPxX: number,
    worldPxY: number,
    widthPx: number,
    heightPx: number,
    hp: number,
    maxHp: number,
    nowMs: number
  ): void {
    if (maxHp <= 0 || hp <= 0) return;
    const ratio = hp / maxHp;
    if (ratio >= 0.55) return;

    const severity = Math.min(1, (0.55 - ratio) / 0.55);
    const plumeCount = widthPx > TILE_PIXEL_SIZE ? 3 : 2;
    const baseSec = nowMs * 0.001;

    ctx.save();
    for (let i = 0; i < plumeCount; i++) {
      const phase = (baseSec * (0.9 + i * 0.25) + i * 0.37) % 1;
      const anchorX = worldPxX + widthPx * (0.3 + i * (0.4 / Math.max(1, plumeCount - 1)));
      const anchorY = worldPxY + heightPx * 0.42;

      const driftX = Math.sin(baseSec * 2.4 + i * 1.7) * 5 * phase;
      const riseY = -phase * (14 + severity * 12);
      const radius = (3.2 + severity * 3.5) * (0.55 + phase * 0.85);
      const alpha = (1 - phase) * (0.35 + severity * 0.42);

      ctx.beginPath();
      ctx.arc(anchorX + driftX, anchorY + riseY, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha.toFixed(3)})`;
      ctx.fill();

      // Critical damage (< 30% HP): flickering flame core at the base of the smoke plume
      if (ratio < 0.3 && phase < 0.45) {
        const flameR = Math.max(1.5, (2.2 + severity * 2.2) * (1 - phase));
        ctx.beginPath();
        ctx.arc(anchorX + driftX * 0.3, anchorY - 2, flameR, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? "#f97316" : "#ef4444";
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Advances and renders all active 60 FPS projectiles, multi-phase explosions, shockwaves, and particles.
   */
  public stepAndRenderEffects(
    ctx: CanvasRenderingContext2D,
    atlas: ProceduralSpriteAtlas,
    nowMs: number,
    dtSec: number,
    visibleCells: ReadonlySet<number>,
    exploredCells: ReadonlySet<number>
  ): void {
    const safeDt = Number.isFinite(dtSec) ? Math.max(0, Math.min(0.1, dtSec)) : 0.016;

    // 1. Step & Render Animated Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i]!;
      const elapsed = nowMs - proj.startMs;
      if (elapsed >= proj.durationMs) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const t = Math.max(0, Math.min(1, elapsed / proj.durationMs));
      const curX = proj.fromPxX + (proj.toPxX - proj.fromPxX) * t;
      const curY = proj.fromPxY + (proj.toPxY - proj.fromPxY) * t;
      const tileIdx = worldPxToTileIndex(curX, curY);

      if (exploredCells.size > 0 && !visibleCells.has(tileIdx)) {
        continue;
      }

      if (proj.weaponStyle === "LASER") {
        const fade = 1 - t * 0.75;
        const pulse = Math.sin(nowMs * 0.06) * 0.8;

        ctx.save();
        // Outer thermal crimson halo
        ctx.beginPath();
        ctx.moveTo(proj.fromPxX, proj.fromPxY);
        ctx.lineTo(proj.toPxX, proj.toPxY);
        ctx.strokeStyle = `rgba(220, 38, 38, ${(0.45 * fade).toFixed(3)})`;
        ctx.lineWidth = 6.5 + pulse;
        ctx.stroke();

        // Mid ruby laser beam
        ctx.beginPath();
        ctx.moveTo(proj.fromPxX, proj.fromPxY);
        ctx.lineTo(proj.toPxX, proj.toPxY);
        ctx.strokeStyle = `rgba(239, 68, 68, ${(0.88 * fade).toFixed(3)})`;
        ctx.lineWidth = 3.2;
        ctx.stroke();

        // Inner incandescent white-pink plasma core
        ctx.beginPath();
        ctx.moveTo(proj.fromPxX, proj.fromPxY);
        ctx.lineTo(proj.toPxX, proj.toPxY);
        ctx.strokeStyle = `rgba(255, 241, 242, ${(0.95 * fade).toFixed(3)})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();

        // Target thermal lens flare
        ctx.beginPath();
        ctx.arc(proj.toPxX, proj.toPxY, 5.5 * fade, 0, Math.PI * 2);
        ctx.fillStyle = "#fecaca";
        ctx.fill();
        ctx.restore();
      } else if (proj.weaponStyle === "ROCKET") {
        const tailT = Math.max(0, t - 0.32);
        const tailX = proj.fromPxX + (proj.toPxX - proj.fromPxX) * tailT;
        const tailY = proj.fromPxY + (proj.toPxY - proj.fromPxY) * tailT;

        // Spawn periodic rocket exhaust smoke puff
        if (nowMs - proj.lastSmokeMs >= 32) {
          proj.lastSmokeMs = nowMs;
          this.pushParticle({
            kind: "SMOKE",
            x: curX,
            y: curY,
            vx: (this.nextRandom() - 0.5) * 8,
            vy: (this.nextRandom() - 0.5) * 8 - 6,
            size: 2.8,
            color: "#64748b",
            ageMs: 0,
            maxAgeMs: 240,
            tileIdx,
          });
        }

        ctx.save();
        // Exhaust smoke ribbon
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(curX, curY);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.52)";
        ctx.lineWidth = 2.6;
        ctx.stroke();

        // Warhead & thruster flame
        const ang = Math.atan2(proj.toPxY - proj.fromPxY, proj.toPxX - proj.fromPxX);
        ctx.translate(curX, curY);
        ctx.rotate(ang);

        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(-4, 0, 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-3, -1.6, 6.5, 3.2);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(2, -1.6, 2.2, 3.2);
        ctx.restore();
      } else if (proj.weaponStyle === "SHELL") {
        const tailT = Math.max(0, t - 0.25);
        const tailX = proj.fromPxX + (proj.toPxX - proj.fromPxX) * tailT;
        const tailY = proj.fromPxY + (proj.toPxY - proj.fromPxY) * tailT;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(curX, curY);
        ctx.strokeStyle = "rgba(253, 224, 71, 0.72)";
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(curX, curY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "#fef08a";
        ctx.fill();
        ctx.restore();
      } else {
        // BULLET tracer
        const tailT = Math.max(0, t - 0.2);
        const tailX = proj.fromPxX + (proj.toPxX - proj.fromPxX) * tailT;
        const tailY = proj.fromPxY + (proj.toPxY - proj.fromPxY) * tailT;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(curX, curY);
        ctx.strokeStyle = "#fef08a";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Step & Render Multi-Phase Explosions + Shockwave Rings
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i]!;
      if (nowMs < exp.startMs) {
        continue; // Staggered secondary sub-explosion waiting to detonate
      }
      const elapsed = nowMs - exp.startMs;
      if (elapsed >= exp.durationMs) {
        this.explosions.splice(i, 1);
        continue;
      }

      if (exploredCells.size > 0 && !visibleCells.has(exp.tileIdx)) {
        continue;
      }

      const progress = Math.max(0, Math.min(1, elapsed / exp.durationMs));

      ctx.save();
      if (exp.effectKind === "MUZZLE_FLASH") {
        const flashR = exp.radiusPx * (1 - progress * 0.5);
        const alpha = 1 - progress;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(exp.worldPxX, exp.worldPxY, flashR, 0, Math.PI * 2);
        ctx.fillStyle = "#fef08a";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(exp.worldPxX, exp.worldPxY, flashR * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.restore();
        continue;
      }

      // Initial high-energy thermal flash
      if (progress < 0.25) {
        const flashAlpha = (1 - progress / 0.25) * 0.65;
        ctx.beginPath();
        ctx.arc(exp.worldPxX, exp.worldPxY, exp.radiusPx * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(254, 249, 195, ${flashAlpha.toFixed(3)})`;
        ctx.fill();
      }

      // Expanding annular shockwave ring
      const shockR = exp.radiusPx * (0.3 + progress * 0.95);
      const shockAlpha = (1 - progress) * 0.78;
      ctx.beginPath();
      ctx.arc(exp.worldPxX, exp.worldPxY, shockR, 0, Math.PI * 2);
      ctx.strokeStyle =
        exp.effectKind === "LASER_BURN"
          ? `rgba(252, 165, 165, ${shockAlpha.toFixed(3)})`
          : `rgba(254, 240, 138, ${shockAlpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(1, (1 - progress) * 3.5);
      ctx.stroke();

      // Pre-rasterized 12-frame Leonardo Vector Explosion Sprite
      const totalFrames = atlas.explosionFrames.length;
      if (totalFrames > 0) {
        const frameIdx = Math.min(totalFrames - 1, Math.floor(progress * totalFrames));
        const frameBmp = atlas.explosionFrames[frameIdx];
        if (frameBmp) {
          const drawSize = exp.radiusPx * 2.1;
          ctx.drawImage(
            frameBmp,
            exp.worldPxX - drawSize * 0.5,
            exp.worldPxY - drawSize * 0.5,
            drawSize,
            drawSize
          );
        }
      }
      ctx.restore();
    }

    // 3. Step & Render Dynamic Particles (Sparks, Debris, Smoke, Crystals)
    const dtMs = safeDt * 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.ageMs += dtMs;
      if (p.ageMs >= p.maxAgeMs) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.vx *= 0.95;
      p.vy *= 0.95;

      if (p.kind === "SMOKE") {
        p.vy -= 14 * safeDt;
        p.size += 7 * safeDt;
      }

      if (exploredCells.size > 0 && !visibleCells.has(p.tileIdx)) {
        continue;
      }

      const lifeRatio = Math.max(0, Math.min(1, p.ageMs / p.maxAgeMs));
      const alpha = 1 - lifeRatio;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.kind === "SPARK") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.85;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === "CRYSTAL") {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.size);
        ctx.lineTo(p.x + p.size * 0.75, p.y);
        ctx.lineTo(p.x, p.y + p.size);
        ctx.lineTo(p.x - p.size * 0.75, p.y);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === "DEBRIS") {
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size * 0.75);
      } else {
        // SMOKE
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
