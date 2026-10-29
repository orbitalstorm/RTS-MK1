import {
  FACTIONS,
  TERRAIN_KIND,
  type BuildingKind,
  type FactionId,
  type TreeKind,
  type UnitKind,
} from "../../shared/constants";
import {
  resolveVariantMorphology,
  type EnergyCoreHue,
  type StructuralMorphology,
  type VectorAnimationMode,
  type VectorVariantProposal,
} from "../../shared/schemas/vector-variants";

export type VectorDrawingContext =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

export interface VectorAnimationParams {
  mode: VectorAnimationMode;
  phase: number; // 0..1 normalized cycle
  timeMs?: number;
}

export function resolveEnergyPalette(
  hue: EnergyCoreHue,
  factionPrimary: string,
  factionSecondary: string
): { core: string; glow: string; rim: string } {
  if (hue === "CYAN_PLASMA") {
    return { core: "#38bdf8", glow: "rgba(56, 189, 248, 0.45)", rim: "#e0f2fe" };
  }
  if (hue === "AMBER_THERMAL") {
    return { core: "#f59e0b", glow: "rgba(245, 158, 11, 0.45)", rim: "#fef08a" };
  }
  if (hue === "EMERALD_TIBERIUM") {
    return { core: "#10b981", glow: "rgba(16, 185, 129, 0.45)", rim: "#a7f3d0" };
  }
  if (hue === "CRIMSON_LASER") {
    return { core: "#ef4444", glow: "rgba(239, 68, 68, 0.45)", rim: "#fecaca" };
  }
  if (hue === "VIOLET_QUANTUM") {
    return { core: "#a855f7", glow: "rgba(168, 85, 247, 0.45)", rim: "#f3e8ff" };
  }
  return { core: factionPrimary, glow: factionSecondary, rim: "#f8fafc" };
}

function tracePolygon(
  ctx: VectorDrawingContext,
  pts: ReadonlyArray<readonly [number, number]>
): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]![0], pts[i]![1]);
  }
  ctx.closePath();
}

function traceRegularPolygon(
  ctx: VectorDrawingContext,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sides: number,
  rotationOffset = 0
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotationOffset + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHazardBand(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  stripeW: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#eab308";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#090d16";
  for (let off = -h; off < w + h; off += stripeW * 2) {
    ctx.beginPath();
    ctx.moveTo(x + off, y + h);
    ctx.lineTo(x + off + stripeW, y + h);
    ctx.lineTo(x + off + stripeW + h, y);
    ctx.lineTo(x + off + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawMuzzleFlashEffect(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  scaleU: number,
  intensity: number,
  coreColor: string
): void {
  if (intensity <= 0.02) return;
  const r = (5.5 + intensity * 6.5) * scaleU;
  ctx.save();
  ctx.translate(x, y);

  // Outer blast halo
  const grad = ctx.createRadialGradient(0, 0, 0.5 * scaleU, 0, 0, r * 1.4);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.35, "#fef08a");
  grad.addColorStop(0.7, coreColor);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
  ctx.fill();

  // 3-prong directional muzzle flame (-Y)
  ctx.fillStyle = "#fef08a";
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.8);
  ctx.lineTo(r * 0.45, -r * 0.3);
  ctx.lineTo(r * 1.1, -r * 0.7);
  ctx.lineTo(r * 0.4, 0);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 1.1, -r * 0.7);
  ctx.lineTo(-r * 0.45, -r * 0.3);
  ctx.closePath();
  ctx.fill();

  // Tracer bolt flying forward
  const boltDist = (1 - intensity) * 18 * scaleU;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8 * scaleU;
  ctx.beginPath();
  ctx.moveTo(0, -r - boltDist);
  ctx.lineTo(0, -r - boltDist - 7 * scaleU);
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// 1. DISTINCT TERRAIN TILE MORPHOLOGIES & ANIMATIONS
// ============================================================================

export function drawTerrainTileAnimationOverlay(
  ctx: VectorDrawingContext,
  kind: number,
  sizePx: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  if (!anim) return;
  const s = sizePx;
  const u = s / 64;
  const phase = anim.phase;
  const dna = variant.dna;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);

  ctx.save();
  if (kind === TERRAIN_KIND.WATER) {
    // Animated rolling wave crests & expanding sonar ripples
    const shift = phase * 24 * u;
    ctx.strokeStyle = dna.terrainSecondaryHex;
    ctx.lineWidth = 1.5 * u;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 3; i++) {
      const wy = ((12 * u + i * 20 * u + shift) % (s - 8 * u)) + 4 * u;
      ctx.beginPath();
      ctx.moveTo(6 * u, wy);
      ctx.quadraticCurveTo(s * 0.5, wy - 5 * u * Math.sin(phase * Math.PI * 2 + i), s - 6 * u, wy);
      ctx.stroke();
    }
    if (anim.mode === "SPECIAL" || anim.mode === "ATTACK") {
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = 1.6 * u;
      ctx.globalAlpha = 1 - phase;
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, (6 + phase * 22) * u, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === TERRAIN_KIND.ORE || kind === TERRAIN_KIND.SILVER_ORE) {
    // Pulsing crystalline luminescence & jumping plasma arcs
    const glowR = (10 + pulse * 14) * u;
    const grad = ctx.createRadialGradient(s * 0.5, s * 0.5, 2 * u, s * 0.5, s * 0.5, glowR);
    grad.addColorStop(0, dna.terrainLipHighlightHex);
    grad.addColorStop(0.5, dna.terrainSecondaryHex);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = anim.mode === "IDLE" ? 0.38 : 0.68;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, glowR, 0, Math.PI * 2);
    ctx.fill();

    if (anim.mode === "ATTACK" || anim.mode === "SPECIAL") {
      // Electric crystal arcs between nodes
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4 * u;
      const a = phase * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.5);
      ctx.lineTo(s * 0.5 + Math.cos(a) * 18 * u, s * 0.5 + Math.sin(a) * 18 * u);
      ctx.lineTo(s * 0.5 + Math.cos(a + 2.1) * 16 * u, s * 0.5 + Math.sin(a + 2.1) * 16 * u);
      ctx.stroke();
    }
  } else if (kind === TERRAIN_KIND.CONCRETE_SLAB) {
    // Blinking tactical runway/pad corner beacons
    const beaconOn = Math.sin(phase * Math.PI * 4) > 0;
    ctx.fillStyle = beaconOn ? "#38bdf8" : "#f59e0b";
    for (const [bx, by] of [
      [8 * u, 8 * u],
      [s - 8 * u, 8 * u],
      [8 * u, s - 8 * u],
      [s - 8 * u, s - 8 * u],
    ] as const) {
      ctx.beginPath();
      ctx.arc(bx, by, (2.2 + pulse * 1.2) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === TERRAIN_KIND.SWAMP) {
    // Rising marsh gas bubbles
    const b1R = ((phase * 6) % 4.5) * u + 1 * u;
    const b2R = (((phase + 0.5) * 6) % 4.5) * u + 1 * u;
    ctx.strokeStyle = dna.terrainSecondaryHex;
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.arc(22 * u, 26 * u, b1R, 0, Math.PI * 2);
    ctx.arc(44 * u, 42 * u, b2R, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Wind streaks / botanical sway across grass, sand, dirt, stone, cliff
    const windShift = Math.sin(phase * Math.PI * 2) * 4 * u;
    ctx.strokeStyle = dna.terrainSecondaryHex;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(12 * u, 20 * u);
    ctx.quadraticCurveTo(28 * u, 16 * u + windShift, 48 * u, 20 * u + windShift * 0.5);
    ctx.moveTo(14 * u, 46 * u);
    ctx.quadraticCurveTo(32 * u, 42 * u + windShift, 52 * u, 46 * u + windShift * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawDistinctTerrainTileMorphology(
  ctx: VectorDrawingContext,
  kind: number,
  sizePx: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  const s = sizePx;
  const u = s / 64;
  const dna = variant.dna;
  const morph = resolveVariantMorphology(variant);
  const phase = anim?.phase ?? 0;
  const wind = Math.sin(phase * Math.PI * 2) * 2.5 * u;

  // Base gradient fill using the variant's distinct palette
  const bg = ctx.createLinearGradient(0, 0, s, s);
  bg.addColorStop(0, dna.terrainFillHex);
  bg.addColorStop(1, dna.terrainLipShadowHex);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);

  if (kind === TERRAIN_KIND.GRASS) {
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Terraced Hexagonal Bio-Steppe with Stone Retaining Ridges & Fern Rosettes
      for (const ry of [18 * u, 38 * u, 54 * u]) {
        ctx.strokeStyle = dna.terrainLipShadowHex;
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.moveTo(0, ry);
        ctx.lineTo(s * 0.35, ry - 4 * u);
        ctx.lineTo(s * 0.7, ry + 3 * u);
        ctx.lineTo(s, ry - 2 * u);
        ctx.stroke();

        ctx.strokeStyle = dna.terrainLipHighlightHex;
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.moveTo(0, ry - 1.5 * u);
        ctx.lineTo(s * 0.35, ry - 5.5 * u);
        ctx.lineTo(s * 0.7, ry + 1.5 * u);
        ctx.lineTo(s, ry - 3.5 * u);
        ctx.stroke();
      }
      // 3 Dense 6-frond Fern Rosettes
      for (const [fx, fy] of [
        [18 * u, 24 * u],
        [46 * u, 20 * u],
        [32 * u, 46 * u],
      ] as const) {
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2 + wind * 0.05;
          ctx.fillStyle = a % 2 === 0 ? dna.terrainSecondaryHex : dna.terrainLipHighlightHex;
          ctx.beginPath();
          ctx.ellipse(
            fx + Math.cos(ang) * 4.5 * u,
            fy + Math.sin(ang) * 4.5 * u,
            4.2 * u,
            1.8 * u,
            ang,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: Alien Bioluminescent Meadow with Hexagonal Ley-Lines & Glowing Spore Bulbs
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 1.2 * u;
      traceRegularPolygon(ctx, s * 0.5, s * 0.5, 22 * u, 22 * u, 6, Math.PI / 6);
      ctx.stroke();

      for (const [bx, by, r] of [
        [16 * u, 16 * u, 4 * u],
        [48 * u, 18 * u, 4.5 * u],
        [32 * u, 32 * u, 5.5 * u],
        [18 * u, 48 * u, 4 * u],
        [46 * u, 48 * u, 4.2 * u],
      ] as const) {
        ctx.fillStyle = dna.terrainLipShadowHex;
        ctx.beginPath();
        ctx.arc(bx, by, r * 1.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = dna.terrainSecondaryHex;
        ctx.beginPath();
        ctx.arc(bx + wind * 0.3, by, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(bx - r * 0.3 + wind * 0.3, by - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // V4+: Stepping-Stone Oasis Meadow with Wildflower Clusters & Stream Curve
      ctx.fillStyle = dna.terrainLipShadowHex;
      for (const [sx, sy, rx, ry] of [
        [16 * u, 32 * u, 7 * u, 5 * u],
        [32 * u, 24 * u, 8 * u, 5.5 * u],
        [48 * u, 36 * u, 7 * u, 5 * u],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, rx, ry, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dna.terrainLipHighlightHex;
        ctx.lineWidth = 1.2 * u;
        ctx.stroke();
      }
      // Wildflower blossoms
      for (const [wx, wy] of [
        [14 * u, 14 * u],
        [46 * u, 14 * u],
        [24 * u, 48 * u],
        [50 * u, 52 * u],
      ] as const) {
        ctx.fillStyle = dna.terrainSecondaryHex;
        ctx.beginPath();
        ctx.arc(wx + wind * 0.4, wy, 2.8 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawTerrainTileAnimationOverlay(ctx, kind, sizePx, variant, anim);
    return;
  }

  if (kind === TERRAIN_KIND.CONCRETE_SLAB) {
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Heavy Carrier Flight-Deck / Octagonal Helipad with Yellow Chevron Circle & Grates
      drawHazardBand(ctx, 4 * u, 4 * u, s - 8 * u, 5 * u, 4 * u);
      drawHazardBand(ctx, 4 * u, s - 9 * u, s - 8 * u, 5 * u, 4 * u);

      traceRegularPolygon(ctx, s * 0.5, s * 0.5, 22 * u, 22 * u, 8, Math.PI / 8);
      ctx.fillStyle = dna.terrainLipShadowHex;
      ctx.fill();
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 2 * u;
      ctx.stroke();

      // H-marking in center
      ctx.fillStyle = dna.terrainSecondaryHex;
      ctx.fillRect(23 * u, 20 * u, 4 * u, 24 * u);
      ctx.fillRect(37 * u, 20 * u, 4 * u, 24 * u);
      ctx.fillRect(23 * u, 30 * u, 18 * u, 4 * u);
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: High-Tech Mag-Lev Induction Pad with Concentric Glowing Rings & Circuit Bus
      ctx.strokeStyle = dna.terrainLipHighlightHex;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(s, s * 0.5);
      ctx.moveTo(s * 0.5, 0);
      ctx.lineTo(s * 0.5, s);
      ctx.stroke();

      for (const r of [24 * u, 16 * u, 8 * u]) {
        ctx.beginPath();
        ctx.arc(s * 0.5, s * 0.5, r, 0, Math.PI * 2);
        ctx.fillStyle = r === 24 * u ? dna.terrainLipShadowHex : "transparent";
        if (r === 24 * u) ctx.fill();
        ctx.strokeStyle = r === 8 * u ? dna.terrainSecondaryHex : dna.terrainLipHighlightHex;
        ctx.lineWidth = 2 * u;
        ctx.stroke();
      }
    } else {
      // V4+: Armored Bunker Blast Doors with Interlocking Diamond Plate & Caution Bars
      tracePolygon(ctx, [
        [s * 0.5, 4 * u],
        [s - 4 * u, s * 0.5],
        [s * 0.5, s - 4 * u],
        [4 * u, s * 0.5],
      ]);
      ctx.fillStyle = dna.terrainLipShadowHex;
      ctx.fill();
      ctx.strokeStyle = dna.terrainLipHighlightHex;
      ctx.lineWidth = 2 * u;
      ctx.stroke();

      drawHazardBand(ctx, 16 * u, 29 * u, 32 * u, 6 * u, 3.5 * u);
    }
    drawTerrainTileAnimationOverlay(ctx, kind, sizePx, variant, anim);
    return;
  }

  if (kind === TERRAIN_KIND.ORE || kind === TERRAIN_KIND.SILVER_ORE) {
    const cx = s * 0.5;
    const cy = s * 0.5;
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Giant Central Hexagonal Obelisk Crystal Spire + 4 Corner Bastion Shards
      traceRegularPolygon(ctx, cx, cy, 25 * u, 25 * u, 6);
      ctx.fillStyle = "rgba(9, 13, 22, 0.72)";
      ctx.fill();
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 1.6 * u;
      ctx.stroke();

      const shards = [
        [14 * u, 16 * u, 8 * u],
        [50 * u, 16 * u, 8 * u],
        [14 * u, 48 * u, 8 * u],
        [50 * u, 48 * u, 8 * u],
        [cx, cy, 16 * u],
      ] as const;
      for (const [sx, sy, sr] of shards) {
        tracePolygon(ctx, [
          [sx, sy - sr * 1.25],
          [sx + sr * 0.75, sy - sr * 0.2],
          [sx + sr * 0.5, sy + sr * 0.9],
          [sx - sr * 0.5, sy + sr * 0.9],
          [sx - sr * 0.75, sy - sr * 0.2],
        ]);
        ctx.fillStyle = dna.terrainFillHex;
        ctx.fill();
        ctx.strokeStyle = dna.terrainLipHighlightHex;
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();

        // Inner bright core facet
        tracePolygon(ctx, [
          [sx, sy - sr * 0.9],
          [sx + sr * 0.35, sy],
          [sx, sy + sr * 0.5],
          [sx - sr * 0.35, sy],
        ]);
        ctx.fillStyle = dna.terrainLipHighlightHex;
        ctx.fill();
      }
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: Open Crystalline Plasma Geode Ring (10 radial inward-pointing prisms around a glowing core)
      ctx.beginPath();
      ctx.arc(cx, cy, 26 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#090d16";
      ctx.fill();
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + phase * Math.PI * 0.5;
        const rOuter = 24 * u;
        const rInner = 9 * u;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        tracePolygon(ctx, [
          [0, -rInner],
          [4.5 * u, -rOuter],
          [-4.5 * u, -rOuter],
        ]);
        ctx.fillStyle = i % 2 === 0 ? dna.terrainFillHex : dna.terrainSecondaryHex;
        ctx.fill();
        ctx.strokeStyle = dna.terrainLipHighlightHex;
        ctx.lineWidth = 1 * u;
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 8.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = dna.terrainLipHighlightHex;
      ctx.fill();
    } else {
      // V4+: Twin Intersecting Star-Crystal Monoliths & Tectonic Vein
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 2.4 * u;
      ctx.beginPath();
      ctx.moveTo(6 * u, s - 6 * u);
      ctx.lineTo(s - 6 * u, 6 * u);
      ctx.stroke();

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        tracePolygon(ctx, [
          [0, -24 * u],
          [5 * u, -6 * u],
          [0, 0],
          [-5 * u, -6 * u],
        ]);
        ctx.fillStyle = i % 2 === 0 ? dna.terrainFillHex : dna.terrainLipHighlightHex;
        ctx.fill();
        ctx.strokeStyle = dna.terrainLipShadowHex;
        ctx.lineWidth = 1.2 * u;
        ctx.stroke();
        ctx.restore();
      }
    }
    drawTerrainTileAnimationOverlay(ctx, kind, sizePx, variant, anim);
    return;
  }

  if (kind === TERRAIN_KIND.WATER) {
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Submerged Coral / Rock Atoll Reef with Concentric Whitewater Foam Rings
      for (const [ax, ay, ar] of [
        [22 * u, 24 * u, 13 * u],
        [44 * u, 42 * u, 11 * u],
      ] as const) {
        ctx.beginPath();
        ctx.arc(ax, ay, ar, 0, Math.PI * 2);
        ctx.fillStyle = dna.terrainLipHighlightHex;
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = dna.terrainSecondaryHex;
        ctx.lineWidth = 1.6 * u;
        ctx.setLineDash([4 * u, 3 * u]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(ax, ay, ar * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = dna.terrainLipShadowHex;
        ctx.fill();
      }
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: Abyssal Whirlpool Vortex with Spiral Bioluminescent Currents
      for (let r = 6 * u; r <= 26 * u; r += 6.5 * u) {
        ctx.beginPath();
        ctx.arc(
          s * 0.5,
          s * 0.5,
          r,
          phase * Math.PI * 2 + r * 0.1,
          phase * Math.PI * 2 + r * 0.1 + Math.PI * 1.35
        );
        ctx.strokeStyle = r < 15 * u ? dna.terrainSecondaryHex : dna.terrainLipHighlightHex;
        ctx.lineWidth = 2.2 * u;
        ctx.stroke();
      }
    } else {
      // V4+: Geometric Canal / Tidal Lock with Diamond Specular Wave Grid
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 1.4 * u;
      for (let y = 12 * u; y < s; y += 14 * u) {
        ctx.beginPath();
        ctx.moveTo(4 * u, y);
        ctx.lineTo(20 * u, y - 6 * u);
        ctx.lineTo(36 * u, y);
        ctx.lineTo(52 * u, y - 6 * u);
        ctx.lineTo(60 * u, y);
        ctx.stroke();
      }
    }
    drawTerrainTileAnimationOverlay(ctx, kind, sizePx, variant, anim);
    return;
  }

  if (kind === TERRAIN_KIND.STONE || kind === TERRAIN_KIND.CLIFF) {
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Interlocking Giant's-Causeway Hexagonal Basalt Columns
      const hexCenters = [
        [18 * u, 18 * u],
        [44 * u, 18 * u],
        [31 * u, 32 * u],
        [18 * u, 46 * u],
        [46 * u, 46 * u],
      ] as const;
      for (const [hx, hy] of hexCenters) {
        traceRegularPolygon(ctx, hx, hy, 13 * u, 13 * u, 6);
        ctx.fillStyle = kind === TERRAIN_KIND.CLIFF ? dna.terrainLipShadowHex : dna.terrainFillHex;
        ctx.fill();
        ctx.strokeStyle = dna.terrainLipHighlightHex;
        ctx.lineWidth = 2 * u;
        ctx.stroke();

        traceRegularPolygon(ctx, hx - 1.5 * u, hy - 1.5 * u, 7 * u, 7 * u, 6);
        ctx.fillStyle = dna.terrainSecondaryHex;
        ctx.globalAlpha = 0.45;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: Crystalline Quartz / Glacier Escarpment with Glowing Fissures
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      ctx.moveTo(8 * u, 8 * u);
      ctx.lineTo(32 * u, 32 * u);
      ctx.lineTo(56 * u, 12 * u);
      ctx.moveTo(32 * u, 32 * u);
      ctx.lineTo(24 * u, 56 * u);
      ctx.stroke();

      for (const [px, py, pw, ph] of [
        [10 * u, 14 * u, 18 * u, 22 * u],
        [34 * u, 10 * u, 20 * u, 24 * u],
        [20 * u, 34 * u, 26 * u, 20 * u],
      ] as const) {
        tracePolygon(ctx, [
          [px + pw * 0.5, py],
          [px + pw, py + ph * 0.4],
          [px + pw * 0.75, py + ph],
          [px + pw * 0.15, py + ph * 0.85],
          [px, py + ph * 0.3],
        ]);
        ctx.fillStyle = dna.terrainLipShadowHex;
        ctx.fill();
        ctx.strokeStyle = dna.terrainLipHighlightHex;
        ctx.lineWidth = 1.6 * u;
        ctx.stroke();
      }
    } else {
      // V4+: Shattered Tectonic Crater / Layered Mesa Ledges
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, 22 * u, 0, Math.PI * 2);
      ctx.fillStyle = dna.terrainLipShadowHex;
      ctx.fill();
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, 12 * u, 0, Math.PI * 2);
      ctx.fillStyle = dna.terrainFillHex;
      ctx.fill();
      ctx.strokeStyle = dna.terrainLipHighlightHex;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
    }
    drawTerrainTileAnimationOverlay(ctx, kind, sizePx, variant, anim);
    return;
  }

  // DIRT, SAND, SWAMP distinct morphologies
  if (morph === "BASTION_CATAPHRACT") {
    // V2: Heavy Tank-Track Ruts & Stratified Canyon Boulders / Mangrove Roots
    ctx.fillStyle = dna.terrainLipShadowHex;
    for (let ty = 6 * u; ty < s - 4 * u; ty += 7 * u) {
      ctx.fillRect(12 * u, ty, 10 * u, 3.5 * u);
      ctx.fillRect(42 * u, ty, 10 * u, 3.5 * u);
    }
    ctx.strokeStyle = dna.terrainLipHighlightHex;
    ctx.lineWidth = 1.8 * u;
    ctx.strokeRect(11 * u, 4 * u, 12 * u, s - 8 * u);
    ctx.strokeRect(41 * u, 4 * u, 12 * u, s - 8 * u);
  } else if (morph === "TOKAMAK_MAGLEV") {
    // V3: Spiral Star-Dune / Volcanic Tectonic Magma Veins
    ctx.strokeStyle = dna.terrainSecondaryHex;
    ctx.lineWidth = 2.4 * u;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.5);
      ctx.quadraticCurveTo(
        s * 0.5 + Math.cos(a + 0.5) * 16 * u,
        s * 0.5 + Math.sin(a + 0.5) * 16 * u,
        s * 0.5 + Math.cos(a) * 28 * u,
        s * 0.5 + Math.sin(a) * 28 * u
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, 6 * u, 0, Math.PI * 2);
    ctx.fillStyle = dna.terrainLipHighlightHex;
    ctx.fill();
  } else {
    // V4+: Artillery Impact Crater & Barchan Crescent Dune / Geothermal Vent
    ctx.fillStyle = dna.terrainLipShadowHex;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, 22 * u, 16 * u, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dna.terrainLipHighlightHex;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    ctx.fillStyle = dna.terrainSecondaryHex;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, 10 * u, 7 * u, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  drawTerrainTileAnimationOverlay(ctx, kind, sizePx, variant, anim);
}

// ============================================================================
// 2. DISTINCT TREE MORPHOLOGIES & ANIMATIONS
// ============================================================================

export function drawDistinctTreeMorphology(
  ctx: VectorDrawingContext,
  kind: TreeKind,
  px: number,
  py: number,
  tileSizePx: number,
  scale: number,
  frameNowMs: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  const dna = variant.dna;
  const morph = resolveVariantMorphology(variant);
  const cx = px + tileSizePx * 0.5;
  const cy = py + tileSizePx * 0.5;
  const u = tileSizePx / 32;
  const eff = scale * u;
  const phase = anim ? anim.phase : (frameNowMs * 0.0006) % 1;
  const windAmp = anim?.mode === "MOVE" || anim?.mode === "ATTACK" ? 3.2 : 1.5;
  const sway = Math.sin(phase * Math.PI * 2 + px * 0.05) * windAmp * eff;

  ctx.save();

  // Ground shadow
  ctx.fillStyle = "rgba(8, 14, 10, 0.5)";
  ctx.beginPath();
  ctx.ellipse(cx + 3 * eff, cy + 5 * eff, 13 * eff, 7.5 * eff, 0, 0, Math.PI * 2);
  ctx.fill();

  if (morph === "BASTION_CATAPHRACT") {
    // V2: Multi-Trunk Ancient Grove (3 distinct trees clustered on mossy boulders!)
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.arc(cx - 6 * eff, cy + 5 * eff, 4 * eff, 0, Math.PI * 2);
    ctx.arc(cx + 7 * eff, cy + 4 * eff, 3.5 * eff, 0, Math.PI * 2);
    ctx.fill();

    const subTrees = [
      { ox: -6.5 * eff, oy: 2 * eff, sc: 0.72 },
      { ox: 6.5 * eff, oy: 1.5 * eff, sc: 0.76 },
      { ox: 0, oy: -2 * eff, sc: 1.05 },
    ] as const;

    for (const st of subTrees) {
      const tx = cx + st.ox;
      const ty = cy + st.oy;
      ctx.fillStyle = dna.treeTrunkHex;
      ctx.fillRect(tx - 1.8 * eff * st.sc, ty - 2 * eff * st.sc, 3.6 * eff * st.sc, 8 * eff * st.sc);

      // Layered octagonal/conical crown
      for (const [yOff, r, col] of [
        [-2 * eff * st.sc, 7.5 * eff * st.sc, dna.treeSecondaryFoliageHex],
        [-6 * eff * st.sc, 6 * eff * st.sc, dna.treePrimaryFoliageHex],
        [-9.5 * eff * st.sc, 4 * eff * st.sc, dna.treeAccentFoliageHex],
      ] as const) {
        traceRegularPolygon(ctx, tx + sway * st.sc, ty + yOff, r, r * 0.85, kind === "TREE_PINE" ? 3 : 7, -Math.PI / 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = "#052e16";
        ctx.lineWidth = 0.9 * u;
        ctx.stroke();
      }
    }
  } else if (morph === "TOKAMAK_MAGLEV") {
    // V3: Crystalline Bioluminescent Prism Tree with Orbiting Spore Orbs
    // Mineral crystalline base ring
    ctx.strokeStyle = dna.treeAccentFoliageHex;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4 * eff, 10 * eff, 5 * eff, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 5 Faceted Crystal Spires fanning out like a prism crown
    const spires = [
      { ang: -0.55, len: 13 * eff, w: 3.8 * eff, col: dna.treeSecondaryFoliageHex },
      { ang: 0.55, len: 13 * eff, w: 3.8 * eff, col: dna.treeSecondaryFoliageHex },
      { ang: -0.25, len: 16 * eff, w: 4.4 * eff, col: dna.treePrimaryFoliageHex },
      { ang: 0.25, len: 16 * eff, w: 4.4 * eff, col: dna.treePrimaryFoliageHex },
      { ang: 0, len: 19 * eff, w: 5.2 * eff, col: dna.treeAccentFoliageHex },
    ] as const;

    for (const sp of spires) {
      ctx.save();
      ctx.translate(cx, cy + 3 * eff);
      ctx.rotate(sp.ang + sway * 0.025);
      tracePolygon(ctx, [
        [0, -sp.len],
        [sp.w, -sp.len * 0.35],
        [sp.w * 0.6, 0],
        [-sp.w * 0.6, 0],
        [-sp.w, -sp.len * 0.35],
      ]);
      ctx.fillStyle = sp.col;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.9 * u;
      ctx.stroke();
      ctx.restore();
    }

    // 4 Levitating orbiting bioluminescent spores
    for (let i = 0; i < 4; i++) {
      const a = phase * Math.PI * 2 + (i * Math.PI) / 2;
      const sx = cx + Math.cos(a) * 11 * eff;
      const sy = cy - 6 * eff + Math.sin(a * 2) * 3.5 * eff;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.1 * eff, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = dna.treeAccentFoliageHex;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
    }
  } else if (morph === "STEALTH_DELTA_DRONE") {
    // V4: Giant Curved Weeping Autumn Bonsai with Root Arch & Drifting Leaves
    ctx.strokeStyle = dna.treeTrunkHex;
    ctx.lineWidth = 4.2 * eff;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 5 * eff, cy + 6 * eff);
    ctx.quadraticCurveTo(cx - 9 * eff, cy - 2 * eff, cx + 2 * eff + sway * 0.4, cy - 9 * eff);
    ctx.stroke();

    // Cascading horizontal bonsai cloud pads
    const pads = [
      { x: -7 * eff, y: -3 * eff, rx: 7.5 * eff, ry: 3.6 * eff, col: dna.treeSecondaryFoliageHex },
      { x: 6 * eff, y: -5 * eff, rx: 8.2 * eff, ry: 3.8 * eff, col: dna.treePrimaryFoliageHex },
      { x: 0, y: -10 * eff, rx: 9.5 * eff, ry: 4.4 * eff, col: dna.treeAccentFoliageHex },
    ] as const;

    for (const p of pads) {
      ctx.beginPath();
      ctx.ellipse(cx + p.x + sway * 0.7, cy + p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = p.col;
      ctx.fill();
      ctx.strokeStyle = "#1c1917";
      ctx.lineWidth = 1 * u;
      ctx.stroke();
    }

    // Falling / swirling autumn leaves
    for (let i = 0; i < 3; i++) {
      const fall = ((phase + i * 0.33) % 1) * 14 * eff;
      const lx = cx + (i - 1) * 7 * eff + Math.sin(phase * Math.PI * 2 + i) * 3 * eff;
      const ly = cy - 6 * eff + fall;
      ctx.fillStyle = dna.treeAccentFoliageHex;
      ctx.beginPath();
      ctx.arc(lx, ly, 1.6 * eff, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // V5+: Alien Bioluminescent Umbrella / Mushroom-Cap Flora with Glowing Gill Rings
    ctx.fillStyle = dna.treeTrunkHex;
    ctx.beginPath();
    ctx.moveTo(cx - 4 * eff, cy + 6 * eff);
    ctx.lineTo(cx - 2 * eff + sway * 0.3, cy - 8 * eff);
    ctx.lineTo(cx + 2 * eff + sway * 0.3, cy - 8 * eff);
    ctx.lineTo(cx + 4 * eff, cy + 6 * eff);
    ctx.closePath();
    ctx.fill();

    // Giant dome cap
    ctx.beginPath();
    ctx.ellipse(cx + sway * 0.7, cy - 7 * eff, 13 * eff, 6.5 * eff, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = dna.treePrimaryFoliageHex;
    ctx.fill();
    ctx.strokeStyle = dna.treeAccentFoliageHex;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Glowing spots on cap
    for (const ox of [-6 * eff, 0, 6 * eff]) {
      ctx.beginPath();
      ctx.arc(cx + ox + sway * 0.7, cy - 10 * eff, 2.2 * eff, 0, Math.PI * 2);
      ctx.fillStyle = dna.treeAccentFoliageHex;
      ctx.fill();
    }
  }

  ctx.restore();
}

// ============================================================================
// 3. DISTINCT BUILDING MORPHOLOGIES & ANIMATIONS (ALL 15 BUILDINGS)
// ============================================================================

export function drawBuildingAnimationEffects(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  if (!anim) return;
  const fSpec = FACTIONS[faction];
  const minDim = Math.min(w, h);
  const u = minDim / 64;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const phase = anim.phase;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const energy = resolveEnergyPalette(
    variant.dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  // 1. Rotating Radar Sweep / Telemetry Ring on RADAR_DOME, CONSTRUCTION_YARD, TECH_CENTER
  if (
    kind === "RADAR_DOME" ||
    kind === "CONSTRUCTION_YARD" ||
    kind === "TECH_CENTER" ||
    anim.mode === "SPECIAL"
  ) {
    const sweepAngle = phase * Math.PI * 2;
    const sweepR = minDim * 0.34;
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.8 * u;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * sweepR, cy + Math.sin(sweepAngle) * sweepR);
    ctx.stroke();

    ctx.fillStyle = energy.glow;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, sweepR, sweepAngle - 0.45, sweepAngle);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Power / Reactor Plasma Pulse on POWER_PLANT, OBELISK, TECH_CENTER
  if (kind === "POWER_PLANT" || kind === "OBELISK" || kind === "TECH_CENTER") {
    const r = (8 + pulse * 10) * u;
    const grad = ctx.createRadialGradient(cx, cy, 1 * u, cx, cy, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, energy.core);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, kind === "OBELISK" ? h * 0.18 : cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Attack Mode: Obelisk Ruby Laser Discharge / Defense Alert Shield
  if (anim.mode === "ATTACK") {
    if (kind === "OBELISK") {
      // High-intensity laser beam firing toward top-left / target
      const tipX = cx;
      const tipY = h * 0.16;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = (4.5 + pulse * 3) * u;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(w * 0.05, h * 0.05);
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(w * 0.05, h * 0.05);
      ctx.stroke();
    } else if (kind !== "GUARD_TOWER" && kind !== "SAM_SITE") {
      // Tactical perimeter defense shield pulse
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = (1.5 + pulse * 2) * u;
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeRect(3 * u, 3 * u, w - 6 * u, h - 6 * u);
      ctx.setLineDash([]);
    }
  }

  // 4. Move / Special Mode: Welding Sparks & Steam Plumes on Industrial Buildings
  if (
    kind === "REFINERY" ||
    kind === "WAR_FACTORY" ||
    kind === "CONSTRUCTION_YARD" ||
    kind === "SILVER_MINE"
  ) {
    // Rising smoke/steam rings
    for (let i = 0; i < 3; i++) {
      const p = (phase + i * 0.33) % 1;
      const sx = w * 0.25 + i * (w * 0.22);
      const sy = h * 0.3 - p * 18 * u;
      ctx.strokeStyle = `rgba(226, 232, 240, ${(1 - p) * 0.65})`;
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.arc(sx, sy, (2.5 + p * 5) * u, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (anim.mode === "SPECIAL" || anim.mode === "MOVE") {
      // Bright plasma welding arc & sparks at center
      const sparkX = cx + Math.sin(phase * Math.PI * 2) * (w * 0.16);
      const sparkY = cy + Math.cos(phase * Math.PI * 2) * (h * 0.12);
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(sparkX, sparkY, 3.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.4 * u;
      for (let sIdx = 0; sIdx < 6; sIdx++) {
        const sa = phase * Math.PI * 4 + (sIdx * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(sparkX, sparkY);
        ctx.lineTo(sparkX + Math.cos(sa) * 8 * u, sparkY + Math.sin(sa) * 8 * u);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

export function drawDistinctBuildingMorphology(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  const fSpec = FACTIONS[faction];
  const dna = variant.dna;
  const morph = resolveVariantMorphology(variant);
  const minDim = Math.min(w, h);
  const u = minDim / 64;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const phase = anim?.phase ?? 0;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const energy = resolveEnergyPalette(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  // ==========================================================================
  // STEP 1: RADICALLY DISTINCT BASE HULL / FOUNDATION SILHOUETTE
  // ==========================================================================
  if (morph === "BASTION_CATAPHRACT") {
    // V2: OCTAGONAL FORTRESS CITADEL WITH 4 CIRCULAR CORNER BASTION TOWERS
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    traceRegularPolygon(ctx, cx + 2.5 * u, cy + 3 * u, w * 0.48, h * 0.48, 8, Math.PI / 8);
    ctx.fill();

    // 4 Protruding Circular Corner Pillbox Bastions
    const bastionCoords = [
      [11 * u, 11 * u],
      [w - 11 * u, 11 * u],
      [11 * u, h - 11 * u],
      [w - 11 * u, h - 11 * u],
    ] as const;
    for (const [bx, by] of bastionCoords) {
      ctx.beginPath();
      ctx.arc(bx, by, 9.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx, by, 4 * u, 0, Math.PI * 2);
      ctx.fillStyle = energy.core;
      ctx.fill();
    }

    // Main Octagonal Armored Platform
    traceRegularPolygon(ctx, cx, cy, w * 0.45, h * 0.45, 8, Math.PI / 8);
    const octGrad = ctx.createLinearGradient(0, 0, w, h);
    octGrad.addColorStop(0, "#334155");
    octGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = octGrad;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();

    // N & S Hazard Blast Aprons
    drawHazardBand(ctx, cx - w * 0.24, 3.5 * u, w * 0.48, 4.5 * u, 4 * u);
    drawHazardBand(ctx, cx - w * 0.24, h - 8 * u, w * 0.48, 4.5 * u, 4 * u);
  } else if (morph === "TOKAMAK_MAGLEV") {
    // V3: CIRCULAR SCI-FI TOKAMAK RING PLATFORM WITH RADIAL MAGNETIC SPOKES
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.beginPath();
    ctx.ellipse(cx + 2.5 * u, cy + 3 * u, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer Titanium Ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
    const ringGrad = ctx.createLinearGradient(0, 0, w, h);
    ringGrad.addColorStop(0, "#475569");
    ringGrad.addColorStop(0.5, "#1e293b");
    ringGrad.addColorStop(1, "#090d16");
    ctx.fillStyle = ringGrad;
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.6 * u;
    ctx.stroke();

    // Glowing Plasma Trench Ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.37, h * 0.37, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#060b14";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 3.2 * u;
    ctx.stroke();

    // 6 Radial Magnetic Confinement Spokes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + phase * 0.4;
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 3.5 * u;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * w * 0.16, cy + Math.sin(a) * h * 0.16);
      ctx.lineTo(cx + Math.cos(a) * w * 0.45, cy + Math.sin(a) * h * 0.45);
      ctx.stroke();
    }
  } else if (morph === "STEALTH_DELTA_DRONE") {
    // V4: 45-DEGREE DIAMOND / RHOMBOID F-117 STEALTH COMPLEX WITH SWEPT CHEVRON WINGS
    const diamondPts: ReadonlyArray<readonly [number, number]> = [
      [cx, 2.5 * u],
      [w - 2.5 * u, cy],
      [cx, h - 2.5 * u],
      [2.5 * u, cy],
    ];
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    tracePolygon(
      ctx,
      diamondPts.map(([x, y]) => [x + 3 * u, y + 3.5 * u] as const)
    );
    ctx.fill();

    // Swept Forward Wing Stabilizers
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.6 * u;
    for (const sign of [-1, 1] as const) {
      tracePolygon(ctx, [
        [cx + sign * w * 0.18, h * 0.18],
        [cx + sign * w * 0.46, h * 0.1],
        [cx + sign * w * 0.38, h * 0.36],
      ]);
      ctx.fill();
      ctx.stroke();

      tracePolygon(ctx, [
        [cx + sign * w * 0.18, h * 0.82],
        [cx + sign * w * 0.46, h * 0.9],
        [cx + sign * w * 0.38, h * 0.64],
      ]);
      ctx.fill();
      ctx.stroke();
    }

    tracePolygon(ctx, diamondPts);
    const stGrad = ctx.createLinearGradient(0, 0, w, h);
    stGrad.addColorStop(0, "#1e293b");
    stGrad.addColorStop(0.5, "#0f172a");
    stGrad.addColorStop(1, "#020617");
    ctx.fillStyle = stGrad;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke();

    // Inner Laser Seam Diamond
    tracePolygon(ctx, [
      [cx, 10 * u],
      [w - 10 * u, cy],
      [cx, h - 10 * u],
      [10 * u, cy],
    ]);
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
  } else if (morph === "MECH_CATAMARAN") {
    // V5+: TWIN-HULL CATAMARAN INDUSTRIAL COMPLEX WITH CENTRAL PLASMA CANAL & SKYBRIDGE
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(4 * u, 5 * u, w * 0.34, h - 8 * u);
    ctx.fillRect(w * 0.62, 5 * u, w * 0.34, h - 8 * u);

    // Central Glowing Energy Trench
    ctx.fillStyle = "#040812";
    ctx.fillRect(w * 0.34, 6 * u, w * 0.32, h - 12 * u);
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(w * 0.34, 6 * u, w * 0.32, h - 12 * u);

    // Left & Right Catamaran Hulls
    for (const hx of [4 * u, w * 0.62]) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(hx, 4 * u, w * 0.34, h - 8 * u);
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2.2 * u;
      ctx.strokeRect(hx, 4 * u, w * 0.34, h - 8 * u);
      drawHazardBand(ctx, hx + 3 * u, h - 10 * u, w * 0.34 - 6 * u, 4 * u, 3.5 * u);
    }

    // Elevated Structural Sky-Bridge
    ctx.fillStyle = "#334155";
    ctx.fillRect(w * 0.18, cy - h * 0.18, w * 0.64, h * 0.36);
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.8 * u;
    ctx.strokeRect(w * 0.18, cy - h * 0.18, w * 0.64, h * 0.36);
  } else {
    // V6+ (ZIGGURAT_HEX_SWARM): 3-POD INTERLOCKING HEXAGONAL TRIAD & STEPPED ZIGGURAT
    const pods = [
      [cx, h * 0.28, w * 0.28, h * 0.24],
      [w * 0.28, h * 0.68, w * 0.26, h * 0.24],
      [w * 0.72, h * 0.68, w * 0.26, h * 0.24],
    ] as const;
    for (const [px, py, rx, ry] of pods) {
      traceRegularPolygon(ctx, px, py, rx, ry, 6);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      traceRegularPolygon(ctx, px, py, rx * 0.6, ry * 0.6, 6);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
    }
  }

  // ==========================================================================
  // STEP 2: KIND-SPECIFIC DISTINCT SUPERSTRUCTURE & ROOF ARCHITECTURE
  // ==========================================================================
  if (kind === "CONSTRUCTION_YARD") {
    const craneShift = Math.sin(phase * Math.PI * 2) * (w * 0.12);
    // Twin Overhead Bridge Gantry Rails + Sliding Laser/Heavy Crane
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(w * 0.16, h * 0.2, w * 0.68, h * 0.56);

    // Moving Gantry Bridge
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(w * 0.14, cy + craneShift - 4 * u, w * 0.72, 8 * u);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(w * 0.14, cy + craneShift - 4 * u, w * 0.72, 8 * u);

    // Central Holographic / Armored Command Citadel
    traceRegularPolygon(ctx, cx, cy, minDim * 0.2, minDim * 0.2, morph === "TOKAMAK_MAGLEV" ? 12 : 6);
    ctx.fillStyle = energy.core;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
  } else if (kind === "POWER_PLANT") {
    // 4 Radial / Quad Reactor Cores with Animated Plasma Arcs
    const cores =
      morph === "TOKAMAK_MAGLEV"
        ? ([
            [cx, cy, minDim * 0.22],
          ] as const)
        : ([
            [w * 0.32, h * 0.34, minDim * 0.14],
            [w * 0.68, h * 0.34, minDim * 0.14],
            [w * 0.32, h * 0.66, minDim * 0.14],
            [w * 0.68, h * 0.66, minDim * 0.14],
          ] as const);

    // Interconnecting high-voltage manifolds
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 3.2 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.34);
    ctx.lineTo(w * 0.68, h * 0.66);
    ctx.moveTo(w * 0.68, h * 0.34);
    ctx.lineTo(w * 0.32, h * 0.66);
    ctx.stroke();

    for (const [rx, ry, rr] of cores) {
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fillStyle = "#090d16";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      // Spinning turbine blades inside reactor
      for (let b = 0; b < 4; b++) {
        const ba = phase * Math.PI * 2 + (b * Math.PI) / 2;
        ctx.strokeStyle = energy.core;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(ba) * rr * 0.85, ry + Math.sin(ba) * rr * 0.85);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(rx, ry, rr * (0.35 + pulse * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  } else if (kind === "REFINERY" || kind === "SILVER_MINE") {
    // Twin Smelting Crucibles + Animated Rotary Ore Crusher Drum at South Dock
    for (const fx of [w * 0.3, w * 0.7]) {
      ctx.beginPath();
      ctx.arc(fx, h * 0.34, minDim * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2 * u;
      ctx.stroke();

      // Glowing molten ore core
      ctx.beginPath();
      ctx.arc(fx, h * 0.34, minDim * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = kind === "SILVER_MINE" ? "#e2e8f0" : energy.core;
      ctx.fill();
    }

    // Southern Rotary Crusher Bay
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(w * 0.24, h * 0.6, w * 0.52, h * 0.22);
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 1.8 * u;
    ctx.strokeRect(w * 0.24, h * 0.6, w * 0.52, h * 0.22);

    // Animated crusher teeth
    const toothShift = (phase * 8 * u) % (6 * u);
    ctx.fillStyle = "#cbd5e1";
    for (let tx = w * 0.26 + toothShift; tx < w * 0.72; tx += 6 * u) {
      ctx.fillRect(tx, h * 0.66, 3 * u, 6 * u);
    }
  } else if (kind === "WAR_FACTORY") {
    // Twin Side-by-Side Armored Roll-Out Hangars + Roof Helipad/Telemetry Arch
    for (const bx of [w * 0.2, w * 0.54]) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(bx, h * 0.16, w * 0.26, h * 0.64);
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(bx, h * 0.16, w * 0.26, h * 0.64);

      // Glowing internal assembly bay visible when doors open
      const doorOpen = anim?.mode === "SPECIAL" || anim?.mode === "MOVE" ? pulse * 10 * u : 3 * u;
      ctx.fillStyle = energy.core;
      ctx.fillRect(bx + 2 * u, h * 0.76 - doorOpen, w * 0.26 - 4 * u, doorOpen);
    }
    // Cross-arch bridge
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(w * 0.16, h * 0.38, w * 0.68, h * 0.16);
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(w * 0.16, h * 0.38, w * 0.68, h * 0.16);
  } else if (kind === "BARRACKS") {
    // 3 Drop-Pod / Bunker Bays + Illuminated Tactical Parade Holotable
    for (const [bx, by] of [
      [w * 0.28, h * 0.28],
      [w * 0.72, h * 0.28],
      [cx, h * 0.48],
    ] as const) {
      traceRegularPolygon(ctx, bx, by, 10 * u, 10 * u, 6);
      ctx.fillStyle = fSpec.secondaryColor;
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx, by, 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = energy.core;
      ctx.fill();
    }
    drawHazardBand(ctx, w * 0.26, h * 0.72, w * 0.48, 5 * u, 3.5 * u);
  } else if (kind === "RADAR_DOME") {
    // Twin Counter-Rotating Phased-Array Radar Dishes / Gyroscopic Rings
    for (const [dx, dy, dir] of [
      [w * 0.34, cy, 1],
      [w * 0.66, cy, -1],
    ] as const) {
      const ang = phase * Math.PI * 2 * dir;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, 13 * u, 8.5 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2 * u;
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.moveTo(-10 * u, 0);
      ctx.lineTo(10 * u, 0);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === "TECH_CENTER") {
    // 3 Triangular Crystal Spires converging on a Levitating Quantum Singularity Core
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const sx = cx + Math.cos(a) * minDim * 0.26;
      const sy = cy + Math.sin(a) * minDim * 0.26;
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2.4 * u;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      traceRegularPolygon(ctx, sx, sy, 8 * u, 8 * u, 6);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, (7 + pulse * 2.5) * u, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();
  } else if (kind === "SILO") {
    // Pressurized Quad-Sphere Ore/Cryo Containment Vaults with Animated Level Gauges
    const vaultRadius = minDim * 0.16;
    for (const [vx, vy] of [
      [cx - minDim * 0.18, cy - minDim * 0.18],
      [cx + minDim * 0.18, cy - minDim * 0.18],
      [cx - minDim * 0.18, cy + minDim * 0.18],
      [cx + minDim * 0.18, cy + minDim * 0.18],
    ] as const) {
      ctx.beginPath();
      ctx.arc(vx, vy, vaultRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#090d16";
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(vx, vy, vaultRadius * (0.45 + pulse * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = energy.core;
      ctx.fill();
    }
  } else if (kind === "CONCRETE_SLAB") {
    // Modular Interlocking Hex-Grid Reinforced Foundation Pad
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.3, 0, Math.PI * 2);
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([4 * u, 3 * u]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (kind === "OBELISK") {
    // Twin-Pronged / Levitating Ring Crystal Monolith
    for (const r of [18 * u, 13 * u, 8 * u]) {
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 1.8 * u;
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.5, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    tracePolygon(ctx, [
      [cx - 8 * u, h * 0.78],
      [cx - 5 * u, h * 0.16],
      [cx - 2 * u, h * 0.78],
    ]);
    ctx.fillStyle = "#18181b";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    tracePolygon(ctx, [
      [cx + 2 * u, h * 0.78],
      [cx + 5 * u, h * 0.16],
      [cx + 8 * u, h * 0.78],
    ]);
    ctx.fill();
    ctx.stroke();

    // Suspended Ruby/Plasma Orb between the twin prongs
    ctx.beginPath();
    ctx.arc(cx, h * 0.18, (5 + pulse * 2) * u, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();
  } else if (kind === "GUARD_TOWER" || kind === "SAM_SITE") {
    // Recessed Rotary Pedestal Ring (Turret is drawn by drawDistinctBuildingTurretMorphology)
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "#090d16";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
  } else {
    // Walls (SANDBAG_WALL / CONCRETE_WALL)
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.8 * u;
    ctx.beginPath();
    ctx.moveTo(6 * u, cy);
    ctx.lineTo(w - 6 * u, cy);
    ctx.moveTo(cx, 6 * u);
    ctx.lineTo(cx, h - 6 * u);
    ctx.stroke();
  }

  ctx.restore();

  // Apply kinematic & particle animation overlays
  drawBuildingAnimationEffects(ctx, faction, kind, w, h, variant, anim);
}

export function drawDistinctBuildingTurretMorphology(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  angleIndex: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  if (kind !== "GUARD_TOWER" && kind !== "SAM_SITE") return;
  const fSpec = FACTIONS[faction];
  const dna = variant.dna;
  const morph = resolveVariantMorphology(variant);
  const minDim = Math.min(w, h);
  const u = minDim / 64;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const phase = anim?.phase ?? 0;
  const isFiring = anim?.mode === "ATTACK";
  const fireCycle = (phase * 4) % 1;
  const recoil = isFiring ? Math.max(0, 1 - fireCycle * 3) * 4.5 * u : 0;
  const energy = resolveEnergyPalette(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  // In IDLE/MOVE/SPECIAL, sweep the turret smoothly if anim is active
  const dynamicAngle =
    anim && anim.mode !== "IDLE"
      ? (angleIndex / 16) * Math.PI * 2 + Math.sin(phase * Math.PI * 2) * 0.35
      : (angleIndex / 16) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(dynamicAngle);

  if (kind === "GUARD_TOWER") {
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Wide Twin-Cannon Heavy Flak Bunker Turret + Side Ammo Drums
      for (const bx of [-7.5 * u, 4.5 * u]) {
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(bx, -29 * u + recoil, 3.2 * u, 22 * u);
        ctx.fillStyle = energy.core;
        ctx.fillRect(bx - 0.8 * u, -31 * u + recoil, 4.8 * u, 3.5 * u);
        if (isFiring) {
          drawMuzzleFlashEffect(ctx, bx + 1.6 * u, -32 * u + recoil, u, 1 - fireCycle, energy.core);
        }
      }
      // Side cylindrical ammo drums
      ctx.fillStyle = "#334155";
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 1.5 * u;
      ctx.fillRect(-15 * u, -6 * u, 6 * u, 12 * u);
      ctx.strokeRect(-15 * u, -6 * u, 6 * u, 12 * u);
      ctx.fillRect(9 * u, -6 * u, 6 * u, 12 * u);
      ctx.strokeRect(9 * u, -6 * u, 6 * u, 12 * u);

      // Octagonal gunhouse
      traceRegularPolygon(ctx, 0, 0, 11 * u, 11 * u, 8);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: Split-Prong Electromagnetic Railgun Turret with Glowing Plasma Core
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 1.8 * u;
      ctx.fillRect(-6.5 * u, -30 * u + recoil * 0.5, 3.2 * u, 24 * u);
      ctx.strokeRect(-6.5 * u, -30 * u + recoil * 0.5, 3.2 * u, 24 * u);
      ctx.fillRect(3.3 * u, -30 * u + recoil * 0.5, 3.2 * u, 24 * u);
      ctx.strokeRect(3.3 * u, -30 * u + recoil * 0.5, 3.2 * u, 24 * u);

      // Glowing plasma rail conduit between prongs
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      ctx.moveTo(0, -6 * u);
      ctx.lineTo(0, -29 * u + recoil * 0.5);
      ctx.stroke();

      if (isFiring) {
        drawMuzzleFlashEffect(ctx, 0, -31 * u, u * 1.3, 1 - fireCycle, energy.core);
      }

      // Crescent energy turret body
      ctx.beginPath();
      ctx.arc(0, 2 * u, 12 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();
    } else {
      // V4+: Quad-Barrel Gatling / Stealth Diamond Laser Turret
      for (const bx of [-6 * u, -2 * u, 2 * u, 6 * u]) {
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(bx - 1 * u, -28 * u + recoil, 2 * u, 20 * u);
      }
      if (isFiring) {
        drawMuzzleFlashEffect(ctx, 0, -30 * u + recoil, u * 1.2, 1 - fireCycle, energy.core);
      }
      tracePolygon(ctx, [
        [0, -14 * u],
        [13 * u, 0],
        [0, 13 * u],
        [-13 * u, 0],
      ]);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
    }
  } else {
    // SAM_SITE distinct turret morphologies
    if (morph === "BASTION_CATAPHRACT") {
      // V2: Twin-Pod 8-Tube Heavy Patriot/S-400 Missile Battery
      for (const podX of [-13 * u, 3 * u]) {
        ctx.fillStyle = fSpec.primaryColor;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.6 * u;
        ctx.fillRect(podX, -14 * u + recoil, 10 * u, 24 * u);
        ctx.strokeRect(podX, -14 * u + recoil, 10 * u, 24 * u);

        // 4 Missile tips per pod
        ctx.fillStyle = energy.core;
        for (const mx of [podX + 2.5 * u, podX + 7.5 * u]) {
          ctx.beginPath();
          ctx.arc(mx, -15.5 * u + recoil, 2 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (morph === "TOKAMAK_MAGLEV") {
      // V3: Circular 6-Cell Rotary Plasma Torpedo Drum
      ctx.beginPath();
      ctx.arc(0, 0, 14 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2.4 * u;
      ctx.stroke();

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u, 3.2 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = energy.core;
        ctx.lineWidth = 1.4 * u;
        ctx.stroke();
      }
    } else {
      // V4+: Swept V-Wing Hypersonic Stealth Rail Launcher
      tracePolygon(ctx, [
        [0, -20 * u + recoil],
        [16 * u, 8 * u],
        [6 * u, 12 * u],
        [0, 4 * u],
        [-6 * u, 12 * u],
        [-16 * u, 8 * u],
      ]);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
    }

    if (isFiring) {
      // Launching missile with exhaust flame shooting along -Y
      const missileY = -16 * u - fireCycle * 22 * u;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-2 * u, missileY - 8 * u, 4 * u, 8 * u);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(0, missileY - 8 * u, 2.2 * u, 0, Math.PI * 2);
      ctx.fill();
      drawMuzzleFlashEffect(ctx, 0, missileY + 2 * u, u, 0.9, "#f59e0b");
    }
  }

  ctx.restore();
}

// ============================================================================
// 4. DISTINCT UNIT BODY & TURRET MORPHOLOGIES & ANIMATIONS (ALL 12 UNITS)
// ============================================================================

export function drawUnitAnimationEffects(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  if (!anim) return;
  const fSpec = FACTIONS[faction];
  const u = sizePx / 64;
  const phase = anim.phase;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const energy = resolveEnergyPalette(
    variant.dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  if (anim.mode === "MOVE") {
    // Trailing dust / thruster exhaust puffs at rear (+Y)
    for (let i = 0; i < 3; i++) {
      const p = (phase + i * 0.33) % 1;
      const ex = (i - 1) * 9 * u;
      const ey = 18 * u + p * 14 * u;
      ctx.fillStyle =
        resolveVariantMorphology(variant) === "TOKAMAK_MAGLEV"
          ? `rgba(56, 189, 248, ${(1 - p) * 0.65})`
          : `rgba(148, 163, 184, ${(1 - p) * 0.55})`;
      ctx.beginPath();
      ctx.arc(ex, ey, (2.5 + p * 4.5) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (anim.mode === "ATTACK") {
    if (kind === "BLOWER_TRUCK") {
      // Giant roaring thermal plasma drying stream along -Y!
      for (let i = 0; i < 6; i++) {
        const p = (phase * 2 + i * 0.16) % 1;
        const fy = -22 * u - p * 22 * u;
        const spread = Math.sin(phase * Math.PI * 4 + i) * 4 * u * p;
        const r = (3.5 + p * 7.5) * u;
        ctx.fillStyle = p < 0.35 ? "#fef08a" : p < 0.7 ? "#f97316" : "#ef4444";
        ctx.globalAlpha = Math.max(0.15, 1 - p * 0.75);
        ctx.beginPath();
        ctx.arc(spread, fy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (kind === "MCV") {
      // Mobile Command Vehicle deployment telemetry wave
      const fireCycle = (phase * 3) % 1;
      drawMuzzleFlashEffect(ctx, 0, -24 * u, u * 1.1, 1 - fireCycle, energy.core);
    } else if (
      kind === "HARVESTER" ||
      kind === "CONSTRUCTOR_BOT" ||
      kind === "FORESTRY_TRUCK"
    ) {
      // Industrial tool activation arc at front (-Y)
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(0, -24 * u, (6 + pulse * 5) * u, Math.PI * 0.8, Math.PI * 2.2);
      ctx.stroke();
    }
  }

  if (anim.mode === "SPECIAL") {
    // Holographic shield / special industrial aura ring
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.8 * u;
    ctx.setLineDash([5 * u, 3 * u]);
    ctx.beginPath();
    ctx.arc(0, 0, (22 + pulse * 4) * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

export function drawDistinctUnitBodyMorphology(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  angleIndex: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  const fSpec = FACTIONS[faction];
  const dna = variant.dna;
  const morph = resolveVariantMorphology(variant);
  const u = sizePx / 64;
  const radians = (angleIndex / 16) * Math.PI * 2;
  const phase = anim?.phase ?? 0;
  const stride = anim?.mode === "MOVE" ? Math.sin(phase * Math.PI * 2) * 3.2 * u : 0;
  const isFiring = anim?.mode === "ATTACK";
  const fireCycle = (phase * 4) % 1;
  const energy = resolveEnergyPalette(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  const isInfantry =
    kind === "RIFLE_INFANTRY" || kind === "ROCKET_SOLDIER" || kind === "ENGINEER";

  // ==========================================================================
  // A. INFANTRY SQUAD MORPHOLOGIES (EXO-JUGGERNAUT, JUMP-JET, SPEC-OPS + DRONE, BIPED MECHS)
  // ==========================================================================
  if (isInfantry) {
    ctx.save();
    ctx.rotate(-radians);

    if (morph === "MECH_CATAMARAN") {
      // V5+: 2 HEAVY BIPEDAL COMBAT EXO-MECHS (Instead of 3 small soldiers!)
      const mechPositions = [
        { x: -11 * u, y: 2 * u, phaseOff: 0 },
        { x: 11 * u, y: 2 * u, phaseOff: Math.PI },
      ] as const;

      for (const mp of mechPositions) {
        ctx.save();
        ctx.translate(mp.x, mp.y);
        ctx.rotate(radians);

        const legSwing =
          anim?.mode === "MOVE"
            ? Math.sin(phase * Math.PI * 2 + mp.phaseOff) * 4 * u
            : 0;

        // Articulated Mechanical Feet
        ctx.fillStyle = "#334155";
        ctx.fillRect(-7 * u, -4 * u + legSwing, 4 * u, 8 * u);
        ctx.fillRect(3 * u, -4 * u - legSwing, 4 * u, 8 * u);

        // Boxy Armored Exo-Mech Cockpit Torso
        traceRegularPolygon(ctx, 0, 0, 8.5 * u, 7.5 * u, 6);
        ctx.fillStyle = fSpec.primaryColor;
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();

        // Dual Shoulder Weapon Pods
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(-9.5 * u, -12 * u, 3.5 * u, 11 * u);
        ctx.fillRect(6 * u, -12 * u, 3.5 * u, 11 * u);

        // Glowing Cockpit Canopy
        ctx.fillStyle = energy.core;
        ctx.fillRect(-4 * u, -4.5 * u, 8 * u, 3 * u);

        if (isFiring) {
          drawMuzzleFlashEffect(ctx, -7.8 * u, -13 * u, u * 0.75, 1 - fireCycle, energy.core);
          drawMuzzleFlashEffect(ctx, 7.8 * u, -13 * u, u * 0.75, fireCycle, energy.core);
        }
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    const squadOffsets =
      morph === "ZIGGURAT_HEX_SWARM"
        ? ([
            { x: 0, y: -12 * u },
            { x: -12 * u, y: 0 },
            { x: 12 * u, y: 0 },
            { x: 0, y: 12 * u },
          ] as const)
        : ([
            { x: 0, y: -10 * u },
            { x: -10 * u, y: 8 * u },
            { x: 10 * u, y: 8 * u },
          ] as const);

    squadOffsets.forEach((pos, idx) => {
      const soldierStride =
        anim?.mode === "MOVE"
          ? Math.sin(phase * Math.PI * 2 + idx * 2.1) * 2.8 * u
          : 0;

      ctx.save();
      ctx.translate(pos.x, pos.y);

      // Ground shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.ellipse(1.5 * u, 2.2 * u, 6.5 * u, 5 * u, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(radians);

      // Animated boots during MOVE
      if (anim?.mode === "MOVE") {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(-4.5 * u, -2 * u + soldierStride, 3 * u, 5 * u);
        ctx.fillRect(1.5 * u, -2 * u - soldierStride, 3 * u, 5 * u);
      }

      if (morph === "BASTION_CATAPHRACT") {
        // V2: HEAVY EXO-JUGGERNAUT WITH FRONT BALLISTIC RIOT SHIELD & HEAVY ROTARY GUN
        // Wide Octagonal Shoulder Exo-Frame
        ctx.fillStyle = fSpec.secondaryColor;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.2 * u;
        ctx.fillRect(-8 * u, -4.5 * u, 16 * u, 9 * u);
        ctx.strokeRect(-8 * u, -4.5 * u, 16 * u, 9 * u);

        // Front Left Armored Riot Shield (-Y)
        ctx.fillStyle = fSpec.primaryColor;
        ctx.fillRect(-8.5 * u, -9 * u, 8.5 * u, 4.2 * u);
        ctx.strokeStyle = energy.core;
        ctx.lineWidth = 1.2 * u;
        ctx.strokeRect(-8.5 * u, -9 * u, 8.5 * u, 4.2 * u);

        // Right-Arm Heavy Minigun / Quad-Rocket Pod
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(2.5 * u, -14 * u, 4 * u, 12 * u);

        // Heavy Horned Siege Helmet
        ctx.beginPath();
        ctx.arc(0, 0, 4.8 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#1e293b";
        ctx.fill();
        ctx.fillStyle = energy.core;
        ctx.fillRect(-3 * u, -3.5 * u, 6 * u, 2 * u);
      } else if (morph === "TOKAMAK_MAGLEV") {
        // V3: CYBER JUMP-JET TROOPERS WITH SWEPT V-WINGS & PLASMA LANCES
        // Swept V-Wings on back (+Y)
        tracePolygon(ctx, [
          [0, -2 * u],
          [11 * u, 6 * u],
          [8 * u, 9 * u],
          [0, 4 * u],
          [-8 * u, 9 * u],
          [-11 * u, 6 * u],
        ]);
        ctx.fillStyle = fSpec.primaryColor;
        ctx.fill();
        ctx.strokeStyle = energy.core;
        ctx.lineWidth = 1.1 * u;
        ctx.stroke();

        // Thruster glow
        ctx.fillStyle = energy.core;
        ctx.beginPath();
        ctx.arc(-4 * u, 6 * u, 2 * u, 0, Math.PI * 2);
        ctx.arc(4 * u, 6 * u, 2 * u, 0, Math.PI * 2);
        ctx.fill();

        // Long Plasma Lance
        ctx.strokeStyle = energy.core;
        ctx.lineWidth = 2.2 * u;
        ctx.beginPath();
        ctx.moveTo(2.5 * u, 2 * u);
        ctx.lineTo(2.5 * u, -15 * u);
        ctx.stroke();

        // Triangular Cyber Helmet
        traceRegularPolygon(ctx, 0, 0, 4.6 * u, 4.6 * u, 3, -Math.PI / 2);
        ctx.fillStyle = "#0f172a";
        ctx.fill();
        ctx.strokeStyle = energy.core;
        ctx.stroke();
      } else {
        // V4+: SPEC-OPS STEALTH CLOAKED OPERATIVES WITH PANORAMIC QUAD-NVG
        tracePolygon(ctx, [
          [0, -6 * u],
          [7.5 * u, 5 * u],
          [0, 3 * u],
          [-7.5 * u, 5 * u],
        ]);
        ctx.fillStyle = "#1e293b";
        ctx.fill();
        ctx.strokeStyle = fSpec.primaryColor;
        ctx.lineWidth = 1.1 * u;
        ctx.stroke();

        // Suppressed carbine
        ctx.fillStyle = "#64748b";
        ctx.fillRect(1.8 * u, -14 * u, 2.2 * u, 11 * u);

        // Helmet + 4-dot Emerald NVG Goggles
        ctx.beginPath();
        ctx.arc(0, 0, 4 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#090d16";
        ctx.fill();
        ctx.fillStyle = energy.core;
        ctx.fillRect(-3.2 * u, -4.2 * u, 2.4 * u, 1.8 * u);
        ctx.fillRect(0.8 * u, -4.2 * u, 2.4 * u, 1.8 * u);
      }

      if (isFiring) {
        drawMuzzleFlashEffect(ctx, 3 * u, -15 * u, u * 0.65, ((fireCycle + idx * 0.3) % 1), energy.core);
      }

      ctx.restore();
    });

    // V4+ Bonus: Autonomous Orbiting Recon/Combat Tri-Rotor Drone above the squad!
    if (morph === "STEALTH_DELTA_DRONE" || morph === "ZIGGURAT_HEX_SWARM") {
      const droneAng = phase * Math.PI * 2;
      const dx = Math.cos(droneAng) * 14 * u;
      const dy = Math.sin(droneAng) * 10 * u - 6 * u;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 1.4 * u;
      for (let r = 0; r < 3; r++) {
        const ra = (r / 3) * Math.PI * 2 + phase * 12;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ra) * 5.5 * u, Math.sin(ra) * 5.5 * u);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 2.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    return;
  }

  // ==========================================================================
  // B. VEHICLE CHASSIS MORPHOLOGIES (CATAPHRACT, MAG-LEV HOVER, DELTA 8x8, SPIDER MECH, ZIGGURAT)
  // ==========================================================================
  const isLargeVehicle =
    kind === "HARVESTER" || kind === "MAMMOTH_TANK" || kind === "CONSTRUCTOR_BOT";
  const hw = (isLargeVehicle ? 21 : 16) * u * dna.hullWidthScale;
  const hh = (isLargeVehicle ? 25 : 20) * u * dna.hullLengthScale;
  const hoverBob =
    morph === "TOKAMAK_MAGLEV" ? Math.sin(phase * Math.PI * 2) * 1.8 * u : 0;

  ctx.save();
  ctx.translate(0, hoverBob);

  // 1. PROPULSION SYSTEM (4 Outrigger Tracks vs 4 Mag-Lev Ion Thrusters vs 8 Wheels vs 4 Articulated Mech Legs)
  if (morph === "BASTION_CATAPHRACT") {
    // V2: 4 Wide Outrigger Articulated Tracks + Massive V-Shaped Front Dozer Plow!
    const cleatShift = anim?.mode === "MOVE" ? (phase * 4 * u) % (4 * u) : 0;
    for (const [tx, ty] of [
      [-hw - 5 * u, -hh + 2 * u],
      [hw - 1 * u, -hh + 2 * u],
      [-hw - 5 * u, 2 * u],
      [hw - 1 * u, 2 * u],
    ] as const) {
      ctx.fillStyle = "#18181b";
      ctx.fillRect(tx, ty, 6 * u, hh - 4 * u);
      ctx.strokeStyle = "#09090b";
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(tx, ty, 6 * u, hh - 4 * u);

      ctx.fillStyle = "#52525b";
      for (let cyOff = ty + cleatShift; cyOff < ty + hh - 5 * u; cyOff += 4 * u) {
        ctx.fillRect(tx + 0.8 * u, cyOff, 4.4 * u, 1.8 * u);
      }
    }

    // Massive Serrated Front V-Dozer Ram Blade (-Y)
    tracePolygon(ctx, [
      [-hw - 4 * u, -hh + 1 * u],
      [0, -hh - 8 * u],
      [hw + 4 * u, -hh + 1 * u],
      [hw + 1 * u, -hh + 5 * u],
      [0, -hh - 3 * u],
      [-hw - 1 * u, -hh + 5 * u],
    ]);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    drawHazardBand(ctx, -hw * 0.7, -hh + 1 * u, hw * 1.4, 3.5 * u, 3 * u);
  } else if (morph === "TOKAMAK_MAGLEV") {
    // V3: 4 GLOWING MAGNETIC-LEVITATION / ION-HOVER THRUSTER PODS (No tracks!)
    const pods = [
      [-hw - 1 * u, -hh * 0.65],
      [hw + 1 * u, -hh * 0.65],
      [-hw - 1 * u, hh * 0.65],
      [hw + 1 * u, hh * 0.65],
    ] as const;

    for (const [px, py] of pods) {
      // Glowing Ion Ring beneath pod
      ctx.beginPath();
      ctx.arc(px, py, 6.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#090d16";
      ctx.fill();
      ctx.strokeStyle = energy.core;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, 3.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  } else if (morph === "STEALTH_DELTA_DRONE") {
    // V4: 8x8 ARMORED MULTI-WHEEL STRIKER SUSPENSION (4 large wheels per side)
    for (const wy of [-hh * 0.72, -hh * 0.24, hh * 0.24, hh * 0.72]) {
      for (const wx of [-hw - 3.5 * u, hw - 0.5 * u]) {
        ctx.fillStyle = "#090d16";
        ctx.fillRect(wx, wy - 3.5 * u, 4 * u, 7 * u);
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1 * u;
        ctx.strokeRect(wx, wy - 3.5 * u, 4 * u, 7 * u);
      }
    }
  } else if (morph === "MECH_CATAMARAN") {
    // V5+: 4 ARTICULATED MECHANICAL SPIDER / SIEGE WALKER LEGS!
    const legPairs = [
      { sx: -hw * 0.7, sy: -hh * 0.45, ex: -hw - 9 * u, ey: -hh * 0.75, dir: 1 },
      { sx: hw * 0.7, sy: -hh * 0.45, ex: hw + 9 * u, ey: -hh * 0.75, dir: -1 },
      { sx: -hw * 0.7, sy: hh * 0.45, ex: -hw - 9 * u, ey: hh * 0.75, dir: -1 },
      { sx: hw * 0.7, sy: hh * 0.45, ex: hw + 9 * u, ey: hh * 0.75, dir: 1 },
    ] as const;

    for (const leg of legPairs) {
      const footY = leg.ey + stride * leg.dir * 1.4;
      const kneeX = (leg.sx + leg.ex) * 0.55;
      const kneeY = (leg.sy + footY) * 0.5 - 3 * u;

      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3.8 * u;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(leg.sx, leg.sy);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(leg.ex, footY);
      ctx.stroke();

      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();

      // Mechanical foot pad
      ctx.beginPath();
      ctx.arc(leg.ex, footY, 3.2 * u, 0, Math.PI * 2);
      ctx.fillStyle = energy.core;
      ctx.fill();
    }
  } else {
    // V6+ (ZIGGURAT_HEX_SWARM): Tri-Track Siege Wedge (Front heavy armored roller + twin rear tracks)
    ctx.fillStyle = "#18181b";
    ctx.fillRect(-hw * 0.65, -hh - 3 * u, hw * 1.3, 6 * u);
    ctx.fillRect(-hw - 4 * u, 0, 5 * u, hh);
    ctx.fillRect(hw - 1 * u, 0, 5 * u, hh);
  }

  // 2. MAIN CHASSIS HULL SILHOUETTE
  if (morph === "BASTION_CATAPHRACT") {
    // Wide Octagonal Casemate Hull with ERA Reactive Armor Grid
    traceRegularPolygon(ctx, 0, 0, hw, hh, 8, Math.PI / 8);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // ERA Armor Blocks along flanks
    for (let ey = -hh * 0.6; ey <= hh * 0.4; ey += 6 * u) {
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fillRect(-hw + 2 * u, ey, 4.5 * u, 4.5 * u);
      ctx.fillRect(hw - 6.5 * u, ey, 4.5 * u, 4.5 * u);
    }
  } else if (morph === "TOKAMAK_MAGLEV") {
    // Futuristic Split-Prong Catamaran Hover-Hull with Exposed Central Plasma Core
    tracePolygon(ctx, [
      [-hw, -hh * 0.4],
      [-hw * 0.45, -hh],
      [-hw * 0.2, -hh],
      [-hw * 0.2, -hh * 0.2],
      [hw * 0.2, -hh * 0.2],
      [hw * 0.2, -hh],
      [hw * 0.45, -hh],
      [hw, -hh * 0.4],
      [hw * 0.85, hh],
      [-hw * 0.85, hh],
    ]);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Glowing Central Tokamak Core
    ctx.beginPath();
    ctx.arc(0, hh * 0.25, 6.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = energy.core;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, hh * 0.25, 3.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  } else if (morph === "STEALTH_DELTA_DRONE") {
    // Sharp F-117 Arrowhead / Delta Stealth Hull
    tracePolygon(ctx, [
      [0, -hh - 4 * u],
      [hw + 1 * u, hh * 0.3],
      [hw * 0.65, hh + 2 * u],
      [0, hh * 0.7],
      [-hw * 0.65, hh + 2 * u],
      [-hw - 1 * u, hh * 0.3],
    ]);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Internal angular radar-deflecting facets
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.3 * u;
    ctx.beginPath();
    ctx.moveTo(0, -hh - 2 * u);
    ctx.lineTo(0, hh * 0.7);
    ctx.moveTo(-hw * 0.8, hh * 0.2);
    ctx.lineTo(0, -hh * 0.3);
    ctx.lineTo(hw * 0.8, hh * 0.2);
    ctx.stroke();
  } else {
    // Hexagonal Mech Torso / Stepped Pyramid Hull
    traceRegularPolygon(ctx, 0, 0, hw, hh * 0.88, 6);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    traceRegularPolygon(ctx, 0, 0, hw * 0.62, hh * 0.55, 6);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
  }

  // 3. SPECIALIZED EQUIPMENT FOR NON-TURRET VEHICLES (HARVESTER, CONSTRUCTOR_BOT, FLAME_TANK, APC, LIGHT_TANK, TRUCKS)
  if (kind === "HARVESTER") {
    // Animated front crystal-crusher mandibles / tractor beam + glowing rear ore vault
    const jawSpread = anim?.mode === "SPECIAL" || anim?.mode === "ATTACK" ? Math.sin(phase * Math.PI * 4) * 3.5 * u : 0;
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -hh * 0.7);
    ctx.lineTo(-hw * 0.7 - jawSpread, -hh - 7 * u);
    ctx.lineTo(-hw * 0.2, -hh - 9 * u);
    ctx.moveTo(hw * 0.5, -hh * 0.7);
    ctx.lineTo(hw * 0.7 + jawSpread, -hh - 7 * u);
    ctx.lineTo(hw * 0.2, -hh - 9 * u);
    ctx.stroke();

    // Glowing Ore Containment Chamber on Rear Deck (+Y)
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(0, hh * 0.35, 7 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "BLOWER_TRUCK") {
    // Twin Pressurized Thermal Tanks + Dual Front Jet-Turbine Drying Nozzles
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(-hw * 0.75, -hh * 0.3, 4.5 * u, hh * 0.9);
    ctx.fillRect(hw * 0.75 - 4.5 * u, -hh * 0.3, 4.5 * u, hh * 0.9);
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(-5 * u, -hh - 5 * u, 3.5 * u, 9 * u);
    ctx.fillRect(1.5 * u, -hh - 5 * u, 3.5 * u, 9 * u);
  } else if (kind === "MCV") {
    // Mobile Construction Vehicle Command Crane & Folding Base Gantry
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-5.5 * u, -hh * 0.65, 11 * u, hh * 1.3);
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.2 * u;
    ctx.strokeRect(-5.5 * u, -hh * 0.65, 11 * u, hh * 1.3);
  } else if (kind === "CONSTRUCTOR_BOT" || kind === "FORESTRY_TRUCK") {
    // Twin Articulated Servo-Arms / Turbine Nozzle
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -hh * 0.5);
    ctx.lineTo(-hw * 0.6, -hh - 6 * u);
    ctx.moveTo(hw * 0.5, -hh * 0.5);
    ctx.lineTo(hw * 0.6, -hh - 6 * u);
    ctx.stroke();
  }

  ctx.restore();

  // Apply unit movement/attack/special particle effects
  drawUnitAnimationEffects(ctx, faction, kind, sizePx, variant, anim);
}

export function drawDistinctUnitTurretMorphology(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  _angleIndex: number,
  variant: VectorVariantProposal,
  anim?: VectorAnimationParams
): void {
  if (
    kind !== "RECON_BUGGY" &&
    kind !== "MEDIUM_TANK" &&
    kind !== "ARTILLERY" &&
    kind !== "MAMMOTH_TANK"
  ) {
    return;
  }

  const fSpec = FACTIONS[faction];
  const dna = variant.dna;
  const morph = resolveVariantMorphology(variant);
  const u = sizePx / 64;
  const bScale = dna.barrelLengthScale;
  const phase = anim?.phase ?? 0;
  const isFiring = anim?.mode === "ATTACK";
  const fireCycle = (phase * 3) % 1;
  const recoil = isFiring ? Math.max(0, 1 - fireCycle * 3) * 5 * u : 0;
  const energy = resolveEnergyPalette(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  if (morph === "BASTION_CATAPHRACT") {
    // V2: WIDE HEXAGONAL SIEGE TURRET WITH TWIN HEAVY CANNONS + SIDE ROCKET POD
    for (const bx of [-5.5 * u, 2.3 * u]) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(bx, -27 * u * bScale + recoil, 3.2 * u, 19 * u * bScale);
      ctx.fillStyle = "#475569";
      ctx.fillRect(bx - 0.8 * u, -29 * u * bScale + recoil, 4.8 * u, 3.8 * u);
      if (isFiring) {
        drawMuzzleFlashEffect(ctx, bx + 1.6 * u, -30 * u * bScale + recoil, u, 1 - fireCycle, energy.core);
      }
    }

    // Side-mounted 4-tube Rocket Pod
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.4 * u;
    ctx.fillRect(-15.5 * u, -8 * u, 4.5 * u, 13 * u);
    ctx.strokeRect(-15.5 * u, -8 * u, 4.5 * u, 13 * u);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-15 * u, -9.5 * u, 3.5 * u, 2 * u);

    traceRegularPolygon(ctx, 0, 0, 11.5 * u, 10.5 * u, 6);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();
  } else if (morph === "TOKAMAK_MAGLEV") {
    // V3: SPLIT-RAIL ELECTROMAGNETIC RAILGUN TURRET WITH GLOWING ACCELERATOR COILS
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.5 * u;
    ctx.fillRect(-6 * u, -29 * u * bScale + recoil * 0.4, 3 * u, 22 * u * bScale);
    ctx.strokeRect(-6 * u, -29 * u * bScale + recoil * 0.4, 3 * u, 22 * u * bScale);
    ctx.fillRect(3 * u, -29 * u * bScale + recoil * 0.4, 3 * u, 22 * u * bScale);
    ctx.strokeRect(3 * u, -29 * u * bScale + recoil * 0.4, 3 * u, 22 * u * bScale);

    // Electromagnetic coil rungs bridging the rails
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8 * u;
    for (const cyOff of [-14 * u, -19 * u, -24 * u]) {
      ctx.beginPath();
      ctx.moveTo(-4.5 * u, cyOff);
      ctx.lineTo(4.5 * u, cyOff);
      ctx.stroke();
    }

    if (isFiring) {
      drawMuzzleFlashEffect(ctx, 0, -30 * u * bScale, u * 1.35, 1 - fireCycle, energy.core);
    }

    // Crescent Plasma Capacitor Turret Dome
    ctx.beginPath();
    ctx.arc(0, 1 * u, 10.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 1 * u, 4.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = energy.core;
    ctx.fill();
  } else if (morph === "STEALTH_DELTA_DRONE") {
    // V4: UNMANNED ANGULAR DIAMOND WEAPON STATION WITH FIN-STABILIZED HYPER-VELOCITY CANNON
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(-1.8 * u, -30 * u * bScale + recoil, 3.6 * u, 22 * u * bScale);

    // Swept barrel stabilizer fins
    tracePolygon(ctx, [
      [-6 * u, -14 * u],
      [0, -24 * u * bScale + recoil],
      [6 * u, -14 * u],
    ]);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();

    if (isFiring) {
      drawMuzzleFlashEffect(ctx, 0, -31 * u * bScale + recoil, u * 1.15, 1 - fireCycle, energy.core);
    }

    tracePolygon(ctx, [
      [0, -13 * u],
      [11 * u, 0],
      [6 * u, 12 * u],
      [-6 * u, 12 * u],
      [-11 * u, 0],
    ]);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Laser designator optic
    ctx.fillStyle = energy.core;
    ctx.fillRect(-3.5 * u, -5 * u, 7 * u, 2.5 * u);
  } else {
    // V5+: TRIPLE-BARREL DREADNOUGHT / GATLING TURRET
    for (const bx of [-6 * u, -1.2 * u, 3.6 * u]) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(bx, -28 * u * bScale + recoil, 2.4 * u, 20 * u * bScale);
      if (isFiring) {
        drawMuzzleFlashEffect(ctx, bx + 1.2 * u, -29 * u * bScale + recoil, u * 0.85, 1 - fireCycle, energy.core);
      }
    }
    traceRegularPolygon(ctx, 0, 0, 11 * u, 11 * u, 8);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawV1TurretAttackEffects(
  ctx: VectorDrawingContext,
  faction: FactionId,
  scaleU: number,
  isDualBarrel: boolean,
  anim?: VectorAnimationParams
): void {
  if (!anim || anim.mode !== "ATTACK") return;
  const fSpec = FACTIONS[faction];
  const fireCycle = (anim.phase * 3) % 1;
  if (isDualBarrel) {
    drawMuzzleFlashEffect(ctx, -4.2 * scaleU, -28 * scaleU, scaleU * 0.9, 1 - fireCycle, fSpec.primaryColor);
    drawMuzzleFlashEffect(ctx, 4.2 * scaleU, -28 * scaleU, scaleU * 0.9, fireCycle, fSpec.primaryColor);
  } else {
    drawMuzzleFlashEffect(ctx, 0, -27 * scaleU, scaleU * 1.1, 1 - fireCycle, fSpec.primaryColor);
  }
}
