import {
  FACTIONS,
  TERRAIN_KIND,
  type BuildingKind,
  type FactionId,
  type TreeKind,
  type UnitKind,
} from "../../shared/constants";
import {
  getActiveBuildingVariant,
  getActiveTerrainVariantByNumericKind,
  getActiveTreeVariant,
  getActiveUnitVariant,
  type EnergyCoreHue,
  type VectorVariantProposal,
} from "../../shared/schemas/vector-variants";

function resolveEnergyHueColors(
  hue: EnergyCoreHue,
  factionPrimary: string,
  factionSecondary: string
): { core: string; glow: string; rim: string } {
  if (hue === "CYAN_PLASMA") {
    return { core: "#38bdf8", glow: "rgba(56, 189, 248, 0.42)", rim: "#e0f2fe" };
  }
  if (hue === "AMBER_THERMAL") {
    return { core: "#f59e0b", glow: "rgba(245, 158, 11, 0.42)", rim: "#fef08a" };
  }
  if (hue === "EMERALD_TIBERIUM") {
    return { core: "#10b981", glow: "rgba(16, 185, 129, 0.42)", rim: "#a7f3d0" };
  }
  if (hue === "CRIMSON_LASER") {
    return { core: "#ef4444", glow: "rgba(239, 68, 68, 0.42)", rim: "#fecaca" };
  }
  if (hue === "VIOLET_QUANTUM") {
    return { core: "#a855f7", glow: "rgba(168, 85, 247, 0.42)", rim: "#f3e8ff" };
  }
  return { core: factionPrimary, glow: factionSecondary, rim: "#f8fafc" };
}

export type VectorDrawingContext =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

/**
 * Draws a chamfered (beveled) octagonal rectangle path for military hard-surface armor plates.
 */
function traceChamferedRect(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  chamfer: number
): void {
  const c = Math.min(chamfer, w * 0.45, h * 0.45);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/**
 * Draws hazard chevron stripes inside a rectangular zone.
 */
function drawHazardStripes(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  stripeWidth: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = "#eab308";
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = "#18181b";
  const total = w + h;
  for (let offset = -h; offset < total; offset += stripeWidth * 2) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + h);
    ctx.lineTo(x + offset + stripeWidth, y + h);
    ctx.lineTo(x + offset + stripeWidth + h, y);
    ctx.lineTo(x + offset + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws structural rivets at the 4 corners of a plate.
 */
function drawCornerRivets(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  inset: number,
  radius: number
): void {
  const coords: Array<[number, number]> = [
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + inset, y + h - inset],
    [x + w - inset, y + h - inset],
  ];
  for (const [rx, ry] of coords) {
    ctx.beginPath();
    ctx.arc(rx, ry, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rx - radius * 0.25, ry - radius * 0.25, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
  }
}

/**
 * Draws parallel thermal exhaust louvers / cooling vents.
 */
function drawVentLouvers(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number
): void {
  ctx.fillStyle = "#090d16";
  ctx.fillRect(x, y, w, h);
  const step = h / (count + 1);
  for (let i = 1; i <= count; i++) {
    const ly = y + i * step;
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = Math.max(1, step * 0.35);
    ctx.beginPath();
    ctx.moveTo(x + 1, ly);
    ctx.lineTo(x + w - 1, ly);
    ctx.stroke();
  }
}

/**
 * Converts a fixed world-space vector `(wx, wy)` into the local coordinate space of a sprite
 * that has already been rotated by `radians = (angleIndex / 16) * Math.PI * 2`.
 */
function toLocalSunVector(wx: number, wy: number, radians: number): { x: number; y: number } {
  const cosInv = Math.cos(-radians);
  const sinInv = Math.sin(-radians);
  return {
    x: wx * cosInv - wy * sinInv,
    y: wx * sinInv + wy * cosInv,
  };
}

/**
 * Creates a linear gradient aligned with the fixed world-space North-West sun (`(-r, -r) -> (+r, +r)`)
 * inside a sprite context already rotated by `radians`.
 */
function createWorldSunLinearGradient(
  ctx: VectorDrawingContext,
  radians: number,
  radius: number,
  nwColor: string,
  seColor: string
): CanvasGradient {
  const nw = toLocalSunVector(-radius, -radius, radians);
  const se = toLocalSunVector(radius, radius, radians);
  const grad = ctx.createLinearGradient(nw.x, nw.y, se.x, se.y);
  grad.addColorStop(0, nwColor);
  grad.addColorStop(1, seColor);
  return grad;
}

/**
 * Draws a crisp world-space North-West specular rim highlight inside a rotated sprite context
 * by temporarily counter-rotating back to world orientation.
 */
function drawWorldSpaceNwSpecularArc(
  ctx: VectorDrawingContext,
  radians: number,
  boxHalfW: number,
  boxHalfH: number,
  u: number,
  opacity = 0.42
): void {
  ctx.save();
  ctx.rotate(-radians);
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.lineWidth = 1.3 * u;
  ctx.beginPath();
  ctx.moveTo(-boxHalfW, boxHalfH * 0.35);
  ctx.lineTo(-boxHalfW, -boxHalfH + 2.5 * u);
  ctx.lineTo(-boxHalfW + 2.5 * u, -boxHalfH);
  ctx.lineTo(boxHalfW * 0.35, -boxHalfH);
  ctx.stroke();
  ctx.restore();
}

/**
 * 1. High-Precision Vector Terrain Tile Renderer (Supports all 10 TERRAIN_KINDs + Leonardo Variants)
 */
export function drawLeonardoTerrainTile(
  ctx: VectorDrawingContext,
  kind: number,
  sizePx: number,
  variantOverride?: VectorVariantProposal
): void {
  const s = sizePx;
  const u = s / 64; // Normalized unit scale relative to 64px high-DPI tile
  const activeVariant =
    variantOverride ?? getActiveTerrainVariantByNumericKind(kind);
  const dna = activeVariant.dna;
  const isCustomVariant = activeVariant.variantId !== "v1_classic_mk1";

  if (kind === TERRAIN_KIND.GRASS) {
    const grassGrad = ctx.createLinearGradient(0, 0, s, s);
    grassGrad.addColorStop(0, dna.terrainFillHex);
    grassGrad.addColorStop(1, dna.terrainLipShadowHex);
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 0, s, s);

    // Botanical grass blade clusters
    const tufts: ReadonlyArray<[number, number, number]> = [
      [16 * u, 20 * u, 1.0],
      [44 * u, 26 * u, 1.15],
      [26 * u, 48 * u, 0.95],
      [48 * u, 50 * u, 1.05],
    ];
    for (const [gx, gy, sc] of tufts) {
      ctx.fillStyle = "rgba(8, 20, 10, 0.45)";
      ctx.beginPath();
      ctx.ellipse(gx, gy + 1.5 * u, 4.5 * u * sc, 2 * u * sc, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = dna.terrainLipHighlightHex;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(gx - 2 * u * sc, gy + 1 * u);
      ctx.lineTo(gx - 5 * u * sc, gy - 6 * u * sc);
      ctx.moveTo(gx, gy + 1 * u);
      ctx.lineTo(gx + 0.5 * u * sc, gy - 8 * u * sc);
      ctx.moveTo(gx + 2 * u * sc, gy + 1 * u);
      ctx.lineTo(gx + 5 * u * sc, gy - 5.5 * u * sc);
      ctx.stroke();

      if (dna.terrainGeometryStyle === "CRYSTALLINE_PRISM" || dna.terrainGeometryStyle === "ORGANIC_LUSH") {
        ctx.fillStyle = dna.terrainSecondaryHex;
        ctx.beginPath();
        ctx.arc(gx + 0.5 * u, gy - 7 * u * sc, 1.5 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (isCustomVariant) {
      drawTerrainVariantOverlayMotif(ctx, s, u, activeVariant);
    }
    return;
  }

  if (kind === TERRAIN_KIND.CONCRETE_SLAB) {
    const slabGrad = ctx.createLinearGradient(0, 0, s, s);
    slabGrad.addColorStop(0, dna.terrainFillHex);
    slabGrad.addColorStop(1, dna.terrainLipShadowHex);
    ctx.fillStyle = slabGrad;
    ctx.fillRect(0, 0, s, s);

    traceChamferedRect(ctx, 4 * u, 4 * u, s - 8 * u, s - 8 * u, 6 * u * dna.armorChamferScale);
    ctx.strokeStyle = dna.terrainLipHighlightHex;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    drawCornerRivets(ctx, 5 * u, 5 * u, s - 10 * u, s - 10 * u, 5 * u, 2 * u);

    if (dna.terrainGeometryStyle === "STRATIFIED_HEX") {
      drawHazardStripes(ctx, 14 * u, s - 11 * u, s - 28 * u, 4.5 * u, 4 * u);
    } else if (dna.terrainGeometryStyle === "CRYSTALLINE_PRISM") {
      ctx.strokeStyle = dna.terrainSecondaryHex;
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.moveTo(12 * u, s * 0.5);
      ctx.lineTo(s - 12 * u, s * 0.5);
      ctx.moveTo(s * 0.5, 12 * u);
      ctx.lineTo(s * 0.5, s - 12 * u);
      ctx.stroke();
    }
    return;
  }

  if (kind === TERRAIN_KIND.SILVER_ORE) {
    const bgGrad = ctx.createLinearGradient(0, 0, s, s);
    bgGrad.addColorStop(0, "#1e293b");
    bgGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, s, s);

    // Massive faceted silver boulder
    ctx.beginPath();
    ctx.moveTo(s * 0.14, s * 0.82);
    ctx.lineTo(s * 0.08, s * 0.42);
    ctx.lineTo(s * 0.28, s * 0.12);
    ctx.lineTo(s * 0.72, s * 0.1);
    ctx.lineTo(s * 0.92, s * 0.44);
    ctx.lineTo(s * 0.82, s * 0.86);
    ctx.closePath();
    const rockGrad = ctx.createLinearGradient(0, 0, s, s);
    rockGrad.addColorStop(0, dna.terrainFillHex);
    rockGrad.addColorStop(1, dna.terrainLipShadowHex);
    ctx.fillStyle = rockGrad;
    ctx.fill();
    ctx.strokeStyle = dna.terrainLipHighlightHex;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    const nuggets: ReadonlyArray<[number, number, number]> = [
      [0.32, 0.34, 5 * u],
      [0.64, 0.28, 5.8 * u],
      [0.48, 0.52, 6.8 * u],
      [0.28, 0.66, 4.8 * u],
      [0.7, 0.64, 5.2 * u],
    ];
    for (const [nx, ny, nr] of nuggets) {
      ctx.beginPath();
      ctx.arc(s * nx, s * ny, nr, 0, Math.PI * 2);
      ctx.fillStyle = dna.terrainLipHighlightHex;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s * nx - nr * 0.25, s * ny - nr * 0.25, nr * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = dna.terrainSecondaryHex;
      ctx.fill();
    }
    return;
  }

  if (kind === 0) {
    // Arid tactical desert: deep ochre/amber gradient, Bezier dune strata, angular pebbles with cast shadows & warm highlights
    const bgGrad = ctx.createLinearGradient(0, 0, s, s);
    bgGrad.addColorStop(0, "#33281b");
    bgGrad.addColorStop(0.55, "#292015");
    bgGrad.addColorStop(1, "#1f1810");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, s, s);

    // Wind-rippled Bezier sand dune strata
    const dunes: Array<{ y0: number; cy1: number; cy2: number; y1: number; alpha: number }> = [
      { y0: 14 * u, cy1: 8 * u, cy2: 20 * u, y1: 14 * u, alpha: 0.14 },
      { y0: 34 * u, cy1: 27 * u, cy2: 41 * u, y1: 34 * u, alpha: 0.11 },
      { y0: 52 * u, cy1: 46 * u, cy2: 58 * u, y1: 52 * u, alpha: 0.12 },
    ];
    for (const d of dunes) {
      ctx.beginPath();
      ctx.moveTo(0, d.y0);
      ctx.bezierCurveTo(s * 0.33, d.cy1, s * 0.66, d.cy2, s, d.y1);
      ctx.lineTo(s, d.y1 + 5 * u);
      ctx.bezierCurveTo(s * 0.66, d.cy2 + 4 * u, s * 0.33, d.cy1 + 4 * u, 0, d.y0 + 5 * u);
      ctx.closePath();
      ctx.fillStyle = `rgba(245, 196, 115, ${d.alpha})`;
      ctx.fill();

      // Specular crest line
      ctx.beginPath();
      ctx.moveTo(0, d.y0);
      ctx.bezierCurveTo(s * 0.33, d.cy1, s * 0.66, d.cy2, s, d.y1);
      ctx.strokeStyle = "rgba(253, 224, 171, 0.16)";
      ctx.lineWidth = 1 * u;
      ctx.stroke();
    }

    // Angular desert pebbles with drop shadows & warm NW specular edge
    const pebbles: Array<{ x: number; y: number; r: number }> = [
      { x: 14 * u, y: 21 * u, r: 2.6 * u },
      { x: 47 * u, y: 15 * u, r: 2.1 * u },
      { x: 26 * u, y: 45 * u, r: 3.1 * u },
      { x: 52 * u, y: 48 * u, r: 1.9 * u },
    ];
    for (const p of pebbles) {
      // Shadow
      ctx.beginPath();
      ctx.moveTo(p.x + p.r * 0.3, p.y + p.r * 0.9);
      ctx.lineTo(p.x + p.r * 1.4, p.y + p.r * 0.6);
      ctx.lineTo(p.x + p.r * 0.6, p.y - p.r * 0.3);
      ctx.closePath();
      ctx.fillStyle = "rgba(10, 8, 5, 0.5)";
      ctx.fill();

      // Faceted rock body
      ctx.beginPath();
      ctx.moveTo(p.x - p.r, p.y + p.r * 0.3);
      ctx.lineTo(p.x - p.r * 0.3, p.y - p.r);
      ctx.lineTo(p.x + p.r, p.y - p.r * 0.2);
      ctx.lineTo(p.x + p.r * 0.4, p.y + p.r);
      ctx.closePath();
      ctx.fillStyle = "#57452e";
      ctx.fill();

      // NW specular facet
      ctx.beginPath();
      ctx.moveTo(p.x - p.r, p.y + p.r * 0.3);
      ctx.lineTo(p.x - p.r * 0.3, p.y - p.r);
      ctx.lineTo(p.x + p.r * 0.2, p.y);
      ctx.closePath();
      ctx.fillStyle = "#856a47";
      ctx.fill();
    }
  } else if (kind === 1) {
    // Rock / reinforced concrete foundation plateau: beveled modular slabs, expansion joints, corner rivets, micro-cracks
    const slabGrad = ctx.createLinearGradient(0, 0, s, s);
    slabGrad.addColorStop(0, "#333c4a");
    slabGrad.addColorStop(0.5, "#28303d");
    slabGrad.addColorStop(1, "#1e242e");
    ctx.fillStyle = slabGrad;
    ctx.fillRect(0, 0, s, s);

    // Dark expansion joint grid
    ctx.strokeStyle = "#11161d";
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(0.8 * u, 0.8 * u, s - 1.6 * u, s - 1.6 * u);

    // Inner beveled octagonal armor slab
    traceChamferedRect(ctx, 4 * u, 4 * u, s - 8 * u, s - 8 * u, 6 * u);
    const innerGrad = ctx.createLinearGradient(4 * u, 4 * u, s - 4 * u, s - 4 * u);
    innerGrad.addColorStop(0, "#384252");
    innerGrad.addColorStop(1, "#252c37");
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
    ctx.lineWidth = 1 * u;
    ctx.stroke();

    // Cross stress seam
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 1 * u;
    ctx.beginPath();
    ctx.moveTo(4 * u, s * 0.5);
    ctx.lineTo(s - 4 * u, s * 0.5);
    ctx.moveTo(s * 0.5, 4 * u);
    ctx.lineTo(s * 0.5, s - 4 * u);
    ctx.stroke();

    // Zenital NW rim lighting
    ctx.strokeStyle = "rgba(226, 232, 240, 0.28)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(4 * u, s - 10 * u);
    ctx.lineTo(4 * u, 10 * u);
    ctx.lineTo(10 * u, 4 * u);
    ctx.lineTo(s - 10 * u, 4 * u);
    ctx.stroke();

    // 4 Corner anchor rivets
    drawCornerRivets(ctx, 4 * u, 4 * u, s - 8 * u, s - 8 * u, 6 * u, 1.8 * u);

    // Subtle micro-fissure
    ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
    ctx.lineWidth = 0.9 * u;
    ctx.beginPath();
    ctx.moveTo(18 * u, 14 * u);
    ctx.lineTo(23 * u, 21 * u);
    ctx.lineTo(20 * u, 26 * u);
    ctx.stroke();
  } else if (kind === 2) {
    // Impassable canyon ridge: multi-layered stratified cliffs, deep crevices, sharp rim-lit rock ridges
    const cliffGrad = ctx.createLinearGradient(0, 0, s, s);
    cliffGrad.addColorStop(0, "#0b0e14");
    cliffGrad.addColorStop(0.5, "#1e2530");
    cliffGrad.addColorStop(1, "#07090d");
    ctx.fillStyle = cliffGrad;
    ctx.fillRect(0, 0, s, s);

    // Deep abyssal crevice shadow
    ctx.beginPath();
    ctx.moveTo(4 * u, s - 4 * u);
    ctx.lineTo(18 * u, 10 * u);
    ctx.lineTo(48 * u, 6 * u);
    ctx.lineTo(s - 4 * u, s - 6 * u);
    ctx.closePath();
    ctx.fillStyle = "#06080c";
    ctx.fill();

    // Primary stratified rock mass (Left-to-Center escarpment)
    ctx.beginPath();
    ctx.moveTo(3 * u, s - 5 * u);
    ctx.lineTo(12 * u, 14 * u);
    ctx.lineTo(34 * u, 7 * u);
    ctx.lineTo(42 * u, 28 * u);
    ctx.lineTo(28 * u, s - 5 * u);
    ctx.closePath();
    const rockGrad1 = ctx.createLinearGradient(6 * u, 8 * u, 38 * u, s - 5 * u);
    rockGrad1.addColorStop(0, "#4b5563");
    rockGrad1.addColorStop(0.6, "#374151");
    rockGrad1.addColorStop(1, "#1f2937");
    ctx.fillStyle = rockGrad1;
    ctx.fill();

    // Secondary jagged crag (Right escarpment)
    ctx.beginPath();
    ctx.moveTo(26 * u, s - 4 * u);
    ctx.lineTo(36 * u, 20 * u);
    ctx.lineTo(54 * u, 11 * u);
    ctx.lineTo(s - 4 * u, s - 6 * u);
    ctx.closePath();
    const rockGrad2 = ctx.createLinearGradient(30 * u, 12 * u, s - 4 * u, s - 4 * u);
    rockGrad2.addColorStop(0, "#374151");
    rockGrad2.addColorStop(1, "#111827");
    ctx.fillStyle = rockGrad2;
    ctx.fill();

    // Crisp NW Rim Lighting along protruding rock ridges
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(5 * u, s - 7 * u);
    ctx.lineTo(12 * u, 14 * u);
    ctx.lineTo(34 * u, 7 * u);
    ctx.moveTo(28 * u, s - 6 * u);
    ctx.lineTo(36 * u, 20 * u);
    ctx.lineTo(54 * u, 11 * u);
    ctx.stroke();

    // Internal geological strata lines
    ctx.strokeStyle = "rgba(17, 24, 39, 0.85)";
    ctx.lineWidth = 1.1 * u;
    ctx.beginPath();
    ctx.moveTo(10 * u, 30 * u);
    ctx.lineTo(26 * u, 22 * u);
    ctx.lineTo(38 * u, 34 * u);
    ctx.moveTo(33 * u, 42 * u);
    ctx.lineTo(48 * u, 32 * u);
    ctx.stroke();
  } else if (kind === 7) {
    // Deep Impassable Water (WATER): abyssal cerulean-navy gradient with specular wave ripples
    const waterGrad = ctx.createLinearGradient(0, 0, s, s);
    waterGrad.addColorStop(0, "#0b3b5b");
    waterGrad.addColorStop(0.55, "#082f49");
    waterGrad.addColorStop(1, "#051e32");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = "rgba(125, 211, 252, 0.25)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(8 * u, 16 * u);
    ctx.quadraticCurveTo(22 * u, 11 * u, 36 * u, 16 * u);
    ctx.moveTo(22 * u, 36 * u);
    ctx.quadraticCurveTo(38 * u, 31 * u, 54 * u, 36 * u);
    ctx.moveTo(10 * u, 52 * u);
    ctx.quadraticCurveTo(26 * u, 47 * u, 42 * u, 52 * u);
    ctx.stroke();
  } else if (kind === 8) {
    // Golden Dune Sand (SAND): warm ochre-gold sand with wind-rippled crests
    const sandGrad = ctx.createLinearGradient(0, 0, s, s);
    sandGrad.addColorStop(0, "#b89146");
    sandGrad.addColorStop(0.55, "#9e7a36");
    sandGrad.addColorStop(1, "#856428");
    ctx.fillStyle = sandGrad;
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = "rgba(254, 240, 138, 0.28)";
    ctx.lineWidth = 1.1 * u;
    ctx.beginPath();
    ctx.moveTo(4 * u, 18 * u);
    ctx.bezierCurveTo(22 * u, 12 * u, 42 * u, 24 * u, 60 * u, 18 * u);
    ctx.moveTo(4 * u, 44 * u);
    ctx.bezierCurveTo(22 * u, 38 * u, 42 * u, 50 * u, 60 * u, 44 * u);
    ctx.stroke();
  } else if (kind === 9) {
    // Murky Swamp Marsh (SWAMP): olive-teal bog with murky puddles & reed tufts
    const swampGrad = ctx.createLinearGradient(0, 0, s, s);
    swampGrad.addColorStop(0, "#253829");
    swampGrad.addColorStop(0.55, "#1b2a1f");
    swampGrad.addColorStop(1, "#131f16");
    ctx.fillStyle = swampGrad;
    ctx.fillRect(0, 0, s, s);

    ctx.fillStyle = "rgba(14, 116, 144, 0.28)";
    ctx.beginPath();
    ctx.ellipse(22 * u, 26 * u, 12 * u, 7 * u, 0.2, 0, Math.PI * 2);
    ctx.ellipse(44 * u, 44 * u, 11 * u, 6 * u, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // kind === 3: Rich Crystalline Tiberium / Spice Deposit
    const bedGrad = ctx.createRadialGradient(s * 0.5, s * 0.5, 4 * u, s * 0.5, s * 0.5, s * 0.46);
    bedGrad.addColorStop(0, "rgba(19, 42, 32, 0.78)");
    bedGrad.addColorStop(0.65, "rgba(31, 29, 22, 0.42)");
    bedGrad.addColorStop(1, "rgba(24, 21, 16, 0)");
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = bedGrad;
    ctx.fill();

    // Tectonic ground fractures glowing with subsurface emerald energy
    ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = 1.3 * u;
    ctx.beginPath();
    ctx.moveTo(10 * u, 14 * u);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(54 * u, 18 * u);
    ctx.moveTo(14 * u, 50 * u);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(50 * u, 52 * u);
    ctx.stroke();

    // Cluster of 7 hexagonal beveled crystal prisms
    const crystals: Array<{ x: number; y: number; len: number; w: number; angle: number }> = [
      { x: 18 * u, y: 20 * u, len: 13 * u, w: 4.5 * u, angle: -0.45 },
      { x: 44 * u, y: 18 * u, len: 14 * u, w: 4.8 * u, angle: 0.52 },
      { x: 16 * u, y: 42 * u, len: 12 * u, w: 4.2 * u, angle: -1.1 },
      { x: 46 * u, y: 44 * u, len: 13 * u, w: 4.6 * u, angle: 1.05 },
      { x: 28 * u, y: 48 * u, len: 11 * u, w: 4.0 * u, angle: -0.15 },
      { x: 35 * u, y: 16 * u, len: 11 * u, w: 3.8 * u, angle: 0.12 },
      { x: 32 * u, y: 32 * u, len: 16 * u, w: 5.8 * u, angle: -0.18 },
    ];

    for (const c of crystals) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);

      // Cast shadow
      ctx.beginPath();
      ctx.moveTo(-c.w * 0.6, c.len * 0.35);
      ctx.lineTo(c.w * 1.1, c.len * 0.5);
      ctx.lineTo(c.w * 0.8, -c.len * 0.45);
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fill();

      // Main hexagonal prism body
      ctx.beginPath();
      ctx.moveTo(0, -c.len * 0.65);
      ctx.lineTo(c.w, -c.len * 0.25);
      ctx.lineTo(c.w * 0.85, c.len * 0.45);
      ctx.lineTo(0, c.len * 0.6);
      ctx.lineTo(-c.w * 0.85, c.len * 0.45);
      ctx.lineTo(-c.w, -c.len * 0.25);
      ctx.closePath();
      const cGrad = ctx.createLinearGradient(-c.w, -c.len * 0.6, c.w, c.len * 0.6);
      cGrad.addColorStop(0, isCustomVariant ? dna.terrainSecondaryHex : "#34d399");
      cGrad.addColorStop(0.5, isCustomVariant ? dna.terrainFillHex : "#10b981");
      cGrad.addColorStop(1, isCustomVariant ? dna.terrainLipShadowHex : "#047857");
      ctx.fillStyle = cGrad;
      ctx.fill();
      ctx.strokeStyle = isCustomVariant ? dna.terrainLipShadowHex : "#064e3b";
      ctx.lineWidth = 0.9 * u;
      ctx.stroke();

      // Left sunlit specular facet
      ctx.beginPath();
      ctx.moveTo(0, -c.len * 0.65);
      ctx.lineTo(0, c.len * 0.6);
      ctx.lineTo(-c.w * 0.85, c.len * 0.45);
      ctx.lineTo(-c.w, -c.len * 0.25);
      ctx.closePath();
      ctx.fillStyle = isCustomVariant ? dna.terrainSecondaryHex : "#22c55e";
      ctx.fill();

      // Incandescent core & crisp top facet highlight
      ctx.beginPath();
      ctx.moveTo(0, -c.len * 0.65);
      ctx.lineTo(c.w * 0.45, -c.len * 0.15);
      ctx.lineTo(0, c.len * 0.15);
      ctx.lineTo(-c.w * 0.55, -c.len * 0.2);
      ctx.closePath();
      ctx.fillStyle = isCustomVariant ? dna.terrainLipHighlightHex : "#86efac";
      ctx.fill();

      ctx.restore();
    }
  }

  if (isCustomVariant && kind !== TERRAIN_KIND.ORE) {
    drawTerrainVariantOverlayMotif(ctx, s, u, activeVariant);
  }
}

function drawTerrainVariantOverlayMotif(
  ctx: VectorDrawingContext,
  s: number,
  u: number,
  variant: VectorVariantProposal
): void {
  const dna = variant.dna;
  ctx.save();

  // Subtle variant palette wash so the tile reflects the variant's stratum colors
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = dna.terrainFillHex;
  ctx.fillRect(0, 0, s, s);
  ctx.globalAlpha = 1;

  if (dna.terrainGeometryStyle === "STRATIFIED_HEX") {
    ctx.strokeStyle = dna.terrainLipHighlightHex;
    ctx.lineWidth = 1.3 * u;
    traceChamferedRect(ctx, 8 * u, 8 * u, s - 16 * u, s - 16 * u, 8 * u);
    ctx.stroke();

    ctx.fillStyle = dna.terrainSecondaryHex;
    ctx.beginPath();
    ctx.arc(16 * u, 16 * u, 2.2 * u, 0, Math.PI * 2);
    ctx.arc(s - 16 * u, s - 16 * u, 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (dna.terrainGeometryStyle === "CRYSTALLINE_PRISM") {
    ctx.fillStyle = dna.terrainSecondaryHex;
    const pts: ReadonlyArray<[number, number, number]> = [
      [18 * u, 22 * u, 4 * u],
      [44 * u, 18 * u, 3.5 * u],
      [36 * u, 46 * u, 4.5 * u],
    ];
    for (const [px, py, pr] of pts) {
      ctx.beginPath();
      ctx.moveTo(px, py - pr);
      ctx.lineTo(px + pr * 0.75, py);
      ctx.lineTo(px, py + pr);
      ctx.lineTo(px - pr * 0.75, py);
      ctx.closePath();
      ctx.fill();
    }
  } else if (dna.terrainGeometryStyle === "ARID_FRACTURED") {
    ctx.strokeStyle = dna.terrainLipShadowHex;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(8 * u, 26 * u);
    ctx.lineTo(28 * u, 18 * u);
    ctx.lineTo(54 * u, 30 * u);
    ctx.moveTo(14 * u, 48 * u);
    ctx.lineTo(36 * u, 40 * u);
    ctx.lineTo(52 * u, 52 * u);
    ctx.stroke();

    ctx.strokeStyle = dna.terrainSecondaryHex;
    ctx.lineWidth = 1.0 * u;
    ctx.beginPath();
    ctx.moveTo(8 * u, 24.5 * u);
    ctx.lineTo(28 * u, 16.5 * u);
    ctx.stroke();
  } else if (dna.terrainGeometryStyle === "ORGANIC_LUSH") {
    ctx.fillStyle = dna.terrainLipHighlightHex;
    ctx.beginPath();
    ctx.ellipse(22 * u, 30 * u, 6 * u, 3.2 * u, 0.25, 0, Math.PI * 2);
    ctx.ellipse(44 * u, 42 * u, 5 * u, 2.8 * u, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renders faction-specific corner anchor hardware & architectural motifs on a building foundation:
 * - GDI: Heavy beveled amber/steel gussets with twin bolt heads
 * - NOD: Sharp stealth crimson talon spurs & laser conduit channels
 * - ORDOS: Circular cyan cryogenic stabilizer nodes & gimbal rings
 */
function drawFactionFoundationMotifs(
  ctx: VectorDrawingContext,
  faction: FactionId,
  w: number,
  h: number,
  u: number,
  insetX: number,
  insetY: number
): void {
  const fSpec = FACTIONS[faction];
  const corners: Array<[number, number, number, number]> = [
    [insetX, insetY, 1, 1],
    [w - insetX, insetY, -1, 1],
    [insetX, h - insetY, 1, -1],
    [w - insetX, h - insetY, -1, -1],
  ];

  if (faction === "GDI") {
    const len = 11 * u;
    const thick = 3.4 * u;
    ctx.fillStyle = fSpec.primaryColor;
    for (const [cx, cy, dx, dy] of corners) {
      ctx.fillRect(dx > 0 ? cx : cx - len, dy > 0 ? cy : cy - thick, len, thick);
      ctx.fillRect(dx > 0 ? cx : cx - thick, dy > 0 ? cy : cy - len, thick, len);
    }
    drawCornerRivets(ctx, insetX, insetY, w - insetX * 2, h - insetY * 2, 4.5 * u, 1.7 * u);
  } else if (faction === "NOD") {
    const spur = 13 * u;
    ctx.fillStyle = fSpec.primaryColor;
    ctx.strokeStyle = "#fecaca";
    ctx.lineWidth = 0.9 * u;
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * spur, cy + dy * 2.4 * u);
      ctx.lineTo(cx + dx * 4.5 * u, cy + dy * 4.5 * u);
      ctx.lineTo(cx + dx * 2.4 * u, cy + dy * spur);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // ORDOS: Circular cryogenic stabilizer rings at each corner
    for (const [cx, cy, dx, dy] of corners) {
      const nx = cx + dx * 4.5 * u;
      const ny = cy + dy * 4.5 * u;
      ctx.beginPath();
      ctx.arc(nx, ny, 4 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#082f49";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(nx, ny, 1.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#67e8f9";
      ctx.fill();
    }
  }
}

/**
 * Layer 1 (Lot 4.1): Renders a differentiated, immediately recognizable foundation silhouette
 * tailored to both the building's tactical role (`kind`) and its clan (`GDI`, `NOD`, `ORDOS`).
 */
function drawDifferentiatedBuildingFoundation(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  u: number
): void {
  const fSpec = FACTIONS[faction];
  const cx = w * 0.5;
  const cy = h * 0.5;
  const minDim = Math.min(w, h);
  const fChamfer = faction === "NOD" ? 11 * u : faction === "ORDOS" ? 9 * u : 6 * u;

  const makeSlabGrad = () => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    if (faction === "NOD") {
      g.addColorStop(0, "#27272a");
      g.addColorStop(0.55, "#18181b");
      g.addColorStop(1, "#09090b");
    } else if (faction === "ORDOS") {
      g.addColorStop(0, "#1e3a4c");
      g.addColorStop(0.55, "#0f2537");
      g.addColorStop(1, "#081420");
    } else {
      g.addColorStop(0, "#334155");
      g.addColorStop(0.55, "#1e293b");
      g.addColorStop(1, "#0f172a");
    }
    return g;
  };

  if (kind === "SANDBAG_WALL") {
    // Compacted earth/gravel defensive trench berm with timber anchor stakes (no metallic slab)
    ctx.fillStyle = "rgba(12, 9, 5, 0.48)";
    ctx.beginPath();
    ctx.ellipse(cx + 1.5 * u, cy + 2 * u, w * 0.44, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4a381b";
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === "CONCRETE_WALL") {
    // Fortified anti-tank wall footing with lateral dragon's-tooth steel buttress anchors
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    traceChamferedRect(ctx, 5 * u, 6 * u, w - 8 * u, h - 8 * u, 5 * u);
    ctx.fill();

    traceChamferedRect(ctx, 4 * u, 4 * u, w - 8 * u, h - 8 * u, 5 * u);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    return;
  }

  if (kind === "CONCRETE_SLAB") {
    // Flush modular interlocking pavement tile
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    traceChamferedRect(ctx, 3 * u, 3.5 * u, w - 5 * u, h - 5 * u, 5 * u);
    ctx.fill();

    traceChamferedRect(ctx, 2 * u, 2 * u, w - 4 * u, h - 4 * u, 5 * u);
    ctx.fillStyle = "#334155";
    ctx.fill();
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
    return;
  }

  if (kind === "SILO") {
    // Circular/Octagonal pressurized containment ring foundation with 4 radial pipe flanges
    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    ctx.beginPath();
    ctx.arc(cx + 2 * u, cy + 2.5 * u, minDim * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // 4 Cardinal Pipe Anchor Outriggers
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 1.5 * u;
    ctx.fillRect(cx - 6 * u, 2 * u, 12 * u, h - 4 * u);
    ctx.strokeRect(cx - 6 * u, 2 * u, 12 * u, h - 4 * u);
    ctx.fillRect(2 * u, cy - 6 * u, w - 4 * u, 12 * u);
    ctx.strokeRect(2 * u, cy - 6 * u, w - 4 * u, 12 * u);

    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.43, 0, Math.PI * 2);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    return;
  }

  if (kind === "GUARD_TOWER") {
    // Cruciform/Octagonal fortified watchtower bunker pad with 4 splayed stabilizer legs
    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, 11 * u);
    ctx.fill();

    // 4 Diagonal Outrigger Stabilizer Struts
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 5 * u;
    ctx.beginPath();
    ctx.moveTo(6 * u, 6 * u);
    ctx.lineTo(w - 6 * u, h - 6 * u);
    ctx.moveTo(w - 6 * u, 6 * u);
    ctx.lineTo(6 * u, h - 6 * u);
    ctx.stroke();

    traceChamferedRect(ctx, 6 * u, 6 * u, w - 12 * u, h - 12 * u, 10 * u);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    return;
  }

  if (kind === "SAM_SITE") {
    // Circular blast deflector foundation with 4 exhaust flame channels
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.beginPath();
    ctx.arc(cx + 2 * u, cy + 2.5 * u, minDim * 0.46, 0, Math.PI * 2);
    ctx.fill();

    traceChamferedRect(ctx, 4 * u, 4 * u, w - 8 * u, h - 8 * u, 12 * u);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Circular yellow/black blast warning ring segment on N/S aprons
    drawHazardStripes(ctx, cx - 12 * u, h - 8.5 * u, 24 * u, 3.8 * u, 3.5 * u);
    drawFactionFoundationMotifs(ctx, faction, w, h, u, 5 * u, 5 * u);
    return;
  }

  if (kind === "OBELISK") {
    // Brotherhood Stepped Hexagonal/Triangular Obsidian Plinth with glowing crimson power conduits
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.beginPath();
    ctx.moveTo(cx + 2 * u, 4 * u);
    ctx.lineTo(w - 2 * u, h * 0.36);
    ctx.lineTo(w - 6 * u, h - 2 * u);
    ctx.lineTo(10 * u, h - 2 * u);
    ctx.lineTo(4 * u, h * 0.36);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, 3 * u);
    ctx.lineTo(w - 4 * u, h * 0.34);
    ctx.lineTo(w - 8 * u, h - 4 * u);
    ctx.lineTo(8 * u, h - 4 * u);
    ctx.lineTo(4 * u, h * 0.34);
    ctx.closePath();
    ctx.fillStyle = "#140709";
    ctx.fill();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Radial crimson high-voltage trenches feeding the monolith
    ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(cx, 5 * u);
    ctx.lineTo(cx, h - 5 * u);
    ctx.moveTo(8 * u, h * 0.36);
    ctx.lineTo(w - 8 * u, h * 0.78);
    ctx.moveTo(w - 8 * u, h * 0.36);
    ctx.lineTo(8 * u, h * 0.78);
    ctx.stroke();
    return;
  }

  if (kind === "SILVER_MINE") {
    // Rugged excavated bedrock & timber/steel mine-head embankment with southern rail-track apron
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.beginPath();
    ctx.moveTo(10 * u, 6 * u);
    ctx.lineTo(w - 8 * u, 6 * u);
    ctx.lineTo(w - 2 * u, h - 3 * u);
    ctx.lineTo(4 * u, h - 3 * u);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(8 * u, 4 * u);
    ctx.lineTo(w - 8 * u, 4 * u);
    ctx.lineTo(w - 3 * u, h - 4 * u);
    ctx.lineTo(3 * u, h - 4 * u);
    ctx.closePath();
    ctx.fillStyle = "#28303d";
    ctx.fill();
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Southern ore-cart loading dock hazard apron
    drawHazardStripes(ctx, w * 0.3, h - 9 * u, w * 0.4, 4.2 * u, 3.8 * u);
    return;
  }

  if (kind === "RADAR_DOME") {
    // Octagonal dish sensor platform with protruding East/West stabilizer outriggers
    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, 14 * u);
    ctx.fill();

    // East/West Outrigger Stabilizer Pods
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(1.5 * u, cy - 11 * u, w - 3 * u, 22 * u);
    ctx.fillRect(cx - 11 * u, 1.5 * u, 22 * u, h - 3 * u);

    traceChamferedRect(ctx, 4 * u, 4 * u, w - 8 * u, h - 8 * u, 13 * u);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();
    drawFactionFoundationMotifs(ctx, faction, w, h, u, 6 * u, 6 * u);
    return;
  }

  if (kind === "POWER_PLANT") {
    // Stepped turbine foundation with Northern cooling-intake grates & copper grounding busbars
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, fChamfer);
    ctx.fill();

    traceChamferedRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, fChamfer);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke();

    // Copper high-voltage grounding plates on East/West edges
    ctx.fillStyle = "#b45309";
    ctx.fillRect(2 * u, cy - 10 * u, 4 * u, 20 * u);
    ctx.fillRect(w - 6 * u, cy - 10 * u, 4 * u, 20 * u);

    drawVentLouvers(ctx, w * 0.24, 5 * u, w * 0.52, 5 * u, 3);
    drawFactionFoundationMotifs(ctx, faction, w, h, u, 4 * u, 4 * u);
    return;
  }

  if (kind === "REFINERY") {
    // Asymmetric split industrial dock: Heavy Smelter Plinth (West) + Sunken Harvester Unloading Ramp (East)
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    traceChamferedRect(ctx, 4 * u, 5 * u, w - 6 * u, h - 6 * u, fChamfer);
    ctx.fill();

    // West Smelter Heavy Plinth
    traceChamferedRect(ctx, 3 * u, 3 * u, w * 0.56, h - 6 * u, fChamfer);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // East Sunken Harvester Unloading Dock Apron with guide rails
    traceChamferedRect(ctx, w * 0.54, 6 * u, w * 0.43, h - 12 * u, 4 * u);
    ctx.fillStyle = "#090d16";
    ctx.fill();
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    drawHazardStripes(ctx, w * 0.58, h - 11 * u, w * 0.35, 4.5 * u, 4 * u);
    drawFactionFoundationMotifs(ctx, faction, w * 0.58, h, u, 4 * u, 4 * u);
    return;
  }

  if (kind === "WAR_FACTORY") {
    // Heavy industrial hangar apron with wide dual tank roll-out treadways extending to the Southern exit
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    traceChamferedRect(ctx, 4 * u, 5 * u, w - 6 * u, h - 6 * u, fChamfer);
    ctx.fill();

    traceChamferedRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, fChamfer);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.secondaryColor;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();

    // Wide Southern Tank Roll-Out Ramp & Chevron Apron
    drawHazardStripes(ctx, w * 0.2, h - 10 * u, w * 0.6, 5.5 * u, 4.5 * u);
    drawFactionFoundationMotifs(ctx, faction, w, h, u, 4 * u, 4 * u);
    return;
  }

  if (kind === "BARRACKS") {
    // Fortified compound base with Southern muster parade ground & defensive perimeter alcoves
    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, fChamfer);
    ctx.fill();

    traceChamferedRect(ctx, 3.5 * u, 3.5 * u, w - 7 * u, h - 7 * u, fChamfer);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Southern Infantry Muster Parade Deck
    ctx.fillStyle = "#091526";
    ctx.fillRect(w * 0.24, h - 12 * u, w * 0.52, 7.5 * u);
    drawHazardStripes(ctx, w * 0.26, h - 8.5 * u, w * 0.48, 3.8 * u, 3.5 * u);
    drawFactionFoundationMotifs(ctx, faction, w, h, u, 4.5 * u, 4.5 * u);
    return;
  }

  if (kind === "TECH_CENTER") {
    // Stepped octagonal clean-room research platform with glowing data-bus trenches
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, 13 * u);
    ctx.fill();

    traceChamferedRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, 12 * u);
    ctx.fillStyle = makeSlabGrad();
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Luminous cyan circuit bus lines on the foundation pad
    ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(6 * u, cy);
    ctx.lineTo(w - 6 * u, cy);
    ctx.moveTo(cx, 6 * u);
    ctx.lineTo(cx, h - 6 * u);
    ctx.stroke();
    drawFactionFoundationMotifs(ctx, faction, w, h, u, 5 * u, 5 * u);
    return;
  }

  // Default / CONSTRUCTION_YARD: Massive command bastion foundation with reinforced corner bastions
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  traceChamferedRect(ctx, 5 * u, 6 * u, w - 7 * u, h - 7 * u, fChamfer);
  ctx.fill();

  traceChamferedRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, fChamfer);
  ctx.fillStyle = makeSlabGrad();
  ctx.fill();
  ctx.strokeStyle = fSpec.secondaryColor;
  ctx.lineWidth = 2.6 * u;
  ctx.stroke();

  traceChamferedRect(ctx, 5.5 * u, 5.5 * u, w - 11 * u, h - 11 * u, 5 * u);
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1.2 * u;
  ctx.stroke();

  drawHazardStripes(ctx, w * 0.28, h - 9.5 * u, w * 0.44, 4.5 * u, 4 * u);
  drawFactionFoundationMotifs(ctx, faction, w, h, u, 4 * u, 4 * u);
}

/**
 * 2. High-Precision 4-Layer Vector Building Renderer (All 15 BuildingKinds)
 */
export function drawLeonardoBuilding(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  variantOverride?: VectorVariantProposal
): void {
  const fSpec = FACTIONS[faction];
  const minDim = Math.min(w, h);
  const u = minDim / 64; // Proportional scale unit
  const cx = w * 0.5;
  const cy = h * 0.5;
  const activeVariant = variantOverride ?? getActiveBuildingVariant(kind);

  // ============================================================================
  // LAYER 1: DIFFERENTIATED FOUNDATION & CAST SHADOW (Lot 4.1)
  // ============================================================================
  drawDifferentiatedBuildingFoundation(ctx, faction, kind, w, h, u);

  // ============================================================================
  // LAYER 2: PRIMARY STRUCTURE & MECHANICAL SUB-ASSEMBLIES
  // ============================================================================
  if (kind === "CONSTRUCTION_YARD") {
    // Heavy Command Hull
    traceChamferedRect(ctx, w * 0.1, h * 0.12, w * 0.8, h * 0.74, 8 * u);
    const hullGrad = ctx.createLinearGradient(w * 0.1, h * 0.12, w * 0.9, h * 0.86);
    hullGrad.addColorStop(0, "#475569");
    hullGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Illuminated Assembly Bay (Right Wing)
    ctx.fillStyle = "#091526";
    ctx.fillRect(w * 0.48, h * 0.22, w * 0.34, h * 0.52);
    const bayGlow = ctx.createRadialGradient(
      w * 0.65,
      h * 0.48,
      2 * u,
      w * 0.65,
      h * 0.48,
      w * 0.22
    );
    bayGlow.addColorStop(0, "#38bdf8");
    bayGlow.addColorStop(0.5, "rgba(14, 165, 233, 0.35)");
    bayGlow.addColorStop(1, "rgba(14, 165, 233, 0)");
    ctx.fillStyle = bayGlow;
    ctx.fillRect(w * 0.48, h * 0.22, w * 0.34, h * 0.52);

    // Armored Command Dome (Left Wing)
    traceChamferedRect(ctx, w * 0.15, h * 0.18, w * 0.32, h * 0.58, 5 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(w * 0.19, h * 0.24, w * 0.24, h * 0.22);

    // Articulated Gantry Crane Base Pivot (live swinging boom rendered in world-renderer)
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.44, h * 0.72);
    ctx.lineTo(w * 0.78, h * 0.26);
    ctx.stroke();

    // Crane steel cables
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.44, h * 0.72);
    ctx.lineTo(w * 0.62, h * 0.42);
    ctx.lineTo(w * 0.78, h * 0.26);
    ctx.stroke();

    // Crane Hook & Turret Pivot
    ctx.beginPath();
    ctx.arc(w * 0.44, h * 0.72, 6 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#334155";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Telemetry Antenna Array
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h * 0.32);
    ctx.lineTo(w * 0.16, h * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.16, h * 0.12, 2.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  } else if (kind === "POWER_PLANT") {
    // Reactor Deck Housing
    traceChamferedRect(ctx, w * 0.12, h * 0.16, w * 0.76, h * 0.68, 6 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Copper High-Voltage Conduits
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 3.2 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, cy);
    ctx.lineTo(w * 0.72, cy);
    ctx.moveTo(cx, h * 0.22);
    ctx.lineTo(cx, h * 0.78);
    ctx.stroke();

    // 2 Cylindrical Plasma/Steam Turbines with Radial Cooling Fins
    const turbineCenters = [w * 0.31, w * 0.69];
    const rOuter = minDim * 0.22;
    for (const tx of turbineCenters) {
      // Turbine casing
      ctx.beginPath();
      ctx.arc(tx, cy, rOuter, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      // Radial cooling fins (8 blades)
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.4 * u;
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(ang) * rOuter * 0.35, cy + Math.sin(ang) * rOuter * 0.35);
        ctx.lineTo(tx + Math.cos(ang) * rOuter * 0.9, cy + Math.sin(ang) * rOuter * 0.9);
        ctx.stroke();
      }

      // Luminescent Cyan Energy Core
      const coreGrad = ctx.createRadialGradient(tx, cy, 1 * u, tx, cy, rOuter * 0.6);
      coreGrad.addColorStop(0, "#e0f2fe");
      coreGrad.addColorStop(0.5, "#38bdf8");
      coreGrad.addColorStop(1, "#0284c7");
      ctx.beginPath();
      ctx.arc(tx, cy, rOuter * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }
  } else if (kind === "REFINERY") {
    // Smelting Blast Furnaces (Left section)
    traceChamferedRect(ctx, w * 0.08, h * 0.14, w * 0.5, h * 0.72, 6 * u);
    ctx.fillStyle = "#334155";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Dual Smelting Towers
    for (const fy of [h * 0.34, h * 0.66]) {
      ctx.beginPath();
      ctx.arc(w * 0.24, fy, 10 * u, 0, Math.PI * 2);
      ctx.fillStyle = fSpec.secondaryColor;
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.6 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w * 0.24, fy, 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
    }

    // Industrial Piping connecting furnaces to hopper
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h * 0.34);
    ctx.lineTo(w * 0.46, h * 0.5);
    ctx.lineTo(w * 0.24, h * 0.66);
    ctx.stroke();

    // Harvester Unloading Dock & Warning Chevron Bay (Right section)
    drawHazardStripes(ctx, w * 0.6, h * 0.16, w * 0.32, h * 0.68, 4.5 * u);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(w * 0.64, h * 0.22, w * 0.24, h * 0.56);

    // Conveyor Belt & Green Ore Hopper
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(w * 0.52, h * 0.36, w * 0.16, h * 0.28);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(w * 0.6, h * 0.5, 5.5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(w * 0.59, h * 0.48, 2.5 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "SILO") {
    // Pressurized Brushed-Steel Cylindrical Vat
    const r = minDim * 0.34;
    const vatGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 2 * u, cx, cy, r);
    vatGrad.addColorStop(0, "#64748b");
    vatGrad.addColorStop(0.65, "#334155");
    vatGrad.addColorStop(1, "#0f172a");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = vatGrad;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Glowing Vertical Green Ore Level Gauge
    ctx.fillStyle = "#091526";
    ctx.fillRect(cx - 3.5 * u, cy - r * 0.68, 7 * u, r * 1.36);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(cx - 2 * u, cy - r * 0.5, 4 * u, r * 1.05);
    ctx.fillStyle = "#86efac";
    ctx.fillRect(cx - 1 * u, cy - r * 0.45, 2 * u, r * 0.9);

    // Upper Catwalk Bridge
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy);
    ctx.lineTo(cx + r * 0.85, cy);
    ctx.stroke();
  } else if (kind === "BARRACKS") {
    // Fortified Infantry Bunker with Ribbed Armored Roof
    traceChamferedRect(ctx, w * 0.12, h * 0.14, w * 0.76, h * 0.68, 7 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Ribbed roof plates
    ctx.fillStyle = "#334155";
    for (let ry = h * 0.22; ry <= h * 0.62; ry += h * 0.16) {
      ctx.fillRect(w * 0.18, ry, w * 0.64, h * 0.08);
    }

    // Firing Parapet & Squad Diamond Emblem
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.2);
    ctx.lineTo(w * 0.72, cy);
    ctx.lineTo(cx, h * 0.76);
    ctx.lineTo(w * 0.28, cy);
    ctx.closePath();
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Tactical Spotlight at Southern Muster Point
    ctx.beginPath();
    ctx.arc(cx, h * 0.76, 4.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#fef08a";
    ctx.fill();
  } else if (kind === "WAR_FACTORY") {
    // Heavy Industrial Shed Hangar
    traceChamferedRect(ctx, w * 0.08, h * 0.12, w * 0.84, h * 0.76, 7 * u);
    ctx.fillStyle = "#27272a";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Tank Roll-out Tracks on Eastern/Southern Apron
    ctx.fillStyle = "#18181b";
    ctx.fillRect(w * 0.3, h * 0.74, w * 0.12, h * 0.18);
    ctx.fillRect(w * 0.58, h * 0.74, w * 0.12, h * 0.18);

    // Sawtooth Industrial Shed Roof Bays
    const bayCount = 3;
    const bayW = (w * 0.72) / bayCount;
    for (let i = 0; i < bayCount; i++) {
      const bx = w * 0.14 + i * bayW;
      ctx.fillStyle = i % 2 === 0 ? "#3f3f46" : "#52525b";
      ctx.fillRect(bx, h * 0.18, bayW - 3 * u, h * 0.54);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fillRect(bx + 2 * u, h * 0.22, bayW - 7 * u, 4.5 * u);
    }

    // Twin Smokestacks on NW Corner
    for (const sx of [w * 0.18, w * 0.28]) {
      ctx.beginPath();
      ctx.arc(sx, h * 0.22, 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#18181b";
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
    }
  } else if (kind === "RADAR_DOME") {
    // Octagonal Armored Base
    traceChamferedRect(ctx, w * 0.14, h * 0.14, w * 0.72, h * 0.72, 12 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Geodesic Dome Understructure
    const domeR = minDim * 0.32;
    ctx.beginPath();
    ctx.arc(cx, cy, domeR, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Rotating Parabolic Dish & Cyan Sweep Grid
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.45);
    ctx.beginPath();
    ctx.ellipse(0, 0, domeR * 0.88, domeR * 0.56, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14, 165, 233, 0.22)";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Focal Tripod Struts & Receiver Feed Horn
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(-domeR * 0.65, 0);
    ctx.lineTo(0, -3 * u);
    ctx.moveTo(domeR * 0.65, 0);
    ctx.lineTo(0, -3 * u);
    ctx.moveTo(0, domeR * 0.45);
    ctx.lineTo(0, -3 * u);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -3 * u, 3 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#7dd3fc";
    ctx.fill();
    ctx.restore();
  } else if (kind === "TECH_CENTER") {
    // High-Tech Quantum Laboratory Hull
    traceChamferedRect(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 10 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // 4 Cryogenic Corner Coolers
    const cryoOffsets: Array<[number, number]> = [
      [w * 0.24, h * 0.24],
      [w * 0.76, h * 0.24],
      [w * 0.24, h * 0.76],
      [w * 0.76, h * 0.76],
    ];
    for (const [qx, qy] of cryoOffsets) {
      ctx.beginPath();
      ctx.arc(qx, qy, 6 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#0ea5e9";
      ctx.fill();
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
    }

    // Quantum Energy Dome (Violet / Cyan) & Data Beam
    const qR = minDim * 0.24;
    const qGrad = ctx.createRadialGradient(cx, cy, 2 * u, cx, cy, qR);
    qGrad.addColorStop(0, "#f0abfc");
    qGrad.addColorStop(0.55, "#a855f7");
    qGrad.addColorStop(1, "#3b0764");
    ctx.beginPath();
    ctx.arc(cx, cy, qR, 0, Math.PI * 2);
    ctx.fillStyle = qGrad;
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2 * u;
    ctx.stroke();
  } else if (kind === "SILVER_MINE") {
    // 2x2 Silver Mine featuring the prominent armored tunnel entrance ("l'entrée de la mine")
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.84);
    ctx.lineTo(w * 0.2, h * 0.16);
    ctx.lineTo(w * 0.8, h * 0.16);
    ctx.lineTo(w * 0.9, h * 0.84);
    ctx.closePath();
    const hillGrad = ctx.createLinearGradient(w * 0.1, h * 0.16, w * 0.9, h * 0.84);
    hillGrad.addColorStop(0, "#475569");
    hillGrad.addColorStop(0.55, "#334155");
    hillGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = hillGrad;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Heavy Steel Tunnel Portal Arch (L'Entrée de la Mine)
    ctx.beginPath();
    ctx.moveTo(w * 0.26, h * 0.84);
    ctx.lineTo(w * 0.3, h * 0.32);
    ctx.lineTo(w * 0.7, h * 0.32);
    ctx.lineTo(w * 0.74, h * 0.84);
    ctx.closePath();
    ctx.fillStyle = "#64748b";
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Deep dark subterranean tunnel mouth
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.84);
    ctx.lineTo(w * 0.35, h * 0.38);
    ctx.lineTo(w * 0.65, h * 0.38);
    ctx.lineTo(w * 0.68, h * 0.84);
    ctx.closePath();
    ctx.fillStyle = "#060911";
    ctx.fill();

    // Internal timber/steel support ribs inside the entrance
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.52);
    ctx.lineTo(w * 0.66, h * 0.52);
    ctx.moveTo(w * 0.33, h * 0.66);
    ctx.lineTo(w * 0.67, h * 0.66);
    ctx.stroke();

    // Minecart extraction rails emerging from the tunnel entrance
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.43, h * 0.55);
    ctx.lineTo(w * 0.4, h * 0.92);
    ctx.moveTo(w * 0.57, h * 0.55);
    ctx.lineTo(w * 0.6, h * 0.92);
    ctx.stroke();

    // Gleaming Silver Nuggets & Ore Hoppers flanking the entrance
    for (const [nx, ny] of [
      [w * 0.2, h * 0.72],
      [w * 0.8, h * 0.72],
      [w * 0.5, h * 0.76],
    ] as const) {
      ctx.beginPath();
      ctx.arc(nx, ny, 4.2 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#e2e8f0";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(nx - 1.2 * u, ny - 1.2 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  } else if (kind === "CONCRETE_SLAB") {
    // Heavy Reinforced Concrete Foundation Slab (Dalle de Béton Armé)
    traceChamferedRect(ctx, w * 0.08, h * 0.08, w * 0.84, h * 0.84, 6 * u);
    const slabGrad = ctx.createLinearGradient(0, 0, w, h);
    slabGrad.addColorStop(0, "#64748b");
    slabGrad.addColorStop(0.5, "#525e6e");
    slabGrad.addColorStop(1, "#334155");
    ctx.fillStyle = slabGrad;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Structural expansion seam & anchor bolts
    ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
    ctx.lineWidth = 1.1 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.16, cy);
    ctx.lineTo(w * 0.84, cy);
    ctx.moveTo(cx, h * 0.16);
    ctx.lineTo(cx, h * 0.84);
    ctx.stroke();
    drawCornerRivets(ctx, w * 0.12, h * 0.12, w * 0.76, h * 0.76, 4 * u, 1.6 * u);
  } else if (kind === "SANDBAG_WALL") {
    // Stacked Tactical Burlap Sandbag Barricade (2 staggered courses with canvas seams & shadow)
    const bagRows: Array<{ y: number; offsets: number[] }> = [
      { y: h * 0.28, offsets: [w * 0.24, w * 0.52, w * 0.76] },
      { y: h * 0.5, offsets: [w * 0.34, w * 0.66] },
      { y: h * 0.7, offsets: [w * 0.24, w * 0.5, w * 0.76] },
    ];
    for (const row of bagRows) {
      for (const bx of row.offsets) {
        // Bag cast shadow
        ctx.beginPath();
        ctx.ellipse(bx + 1 * u, row.y + 2 * u, 9.5 * u, 5.5 * u, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fill();

        // Sandbag body
        const bagGrad = ctx.createLinearGradient(
          bx - 8 * u,
          row.y - 5 * u,
          bx + 8 * u,
          row.y + 5 * u
        );
        bagGrad.addColorStop(0, "#d6b87c");
        bagGrad.addColorStop(0.55, "#b59457");
        bagGrad.addColorStop(1, "#7c6234");
        ctx.beginPath();
        ctx.ellipse(bx, row.y, 9 * u, 5 * u, 0, 0, Math.PI * 2);
        ctx.fillStyle = bagGrad;
        ctx.fill();
        ctx.strokeStyle = "#4a381b";
        ctx.lineWidth = 1.1 * u;
        ctx.stroke();

        // Burlap tie seam
        ctx.strokeStyle = "rgba(254, 243, 199, 0.45)";
        ctx.lineWidth = 0.9 * u;
        ctx.beginPath();
        ctx.moveTo(bx - 5 * u, row.y - 1 * u);
        ctx.lineTo(bx + 5 * u, row.y - 1 * u);
        ctx.stroke();
      }
    }
  } else if (kind === "CONCRETE_WALL") {
    // Heavy Ferro-Concrete Fortification Wall with Faction Buttresses & Anti-Tank Parapet
    traceChamferedRect(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 6 * u);
    const wallGrad = ctx.createLinearGradient(0, 0, w, h);
    wallGrad.addColorStop(0, "#94a3b8");
    wallGrad.addColorStop(0.5, "#64748b");
    wallGrad.addColorStop(1, "#334155");
    ctx.fillStyle = wallGrad;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Raised armored parapet core & steel buttress ribs
    traceChamferedRect(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, 4 * u);
    ctx.fillStyle = "#475569";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Cross reinforcement steel beams
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(cx - 3.5 * u, h * 0.12, 7 * u, h * 0.76);
    ctx.fillRect(w * 0.12, cy - 3.5 * u, w * 0.76, 7 * u);

    // Center armored cap
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
  } else if (kind === "GUARD_TOWER") {
    // Lot 3.1: Static Casemate Base ONLY (Rotating Twin Vulcan Turret is rendered via drawLeonardoBuildingTurret)
    traceChamferedRect(ctx, w * 0.16, h * 0.16, w * 0.68, h * 0.68, 8 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Lateral Ammo Magazine Feed Boxes
    ctx.fillStyle = "#334155";
    ctx.fillRect(cx - 14 * u, cy - 6 * u, 28 * u, 12 * u);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2 * u;
    ctx.strokeRect(cx - 14 * u, cy - 6 * u, 28 * u, 12 * u);

    // Recessed Rotary Turret Bearing Ring / Raceway (ready to receive buildingTurrets sprite)
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "#090d16";
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.18, 0, Math.PI * 2);
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.2 * u;
    ctx.setLineDash([3 * u, 2 * u]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (kind === "SAM_SITE") {
    // Lot 3.1: Static Armored Rotary Pedestal ONLY (Rotating Quad SAM Launcher is rendered via drawLeonardoBuildingTurret)
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    // Recessed Azimuth Turret Ring & Hydraulic Pivot Socket
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = "#090d16";
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Azimuth gear teeth markings
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.2 * u;
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * minDim * 0.16, cy + Math.sin(ang) * minDim * 0.16);
      ctx.lineTo(cx + Math.cos(ang) * minDim * 0.25, cy + Math.sin(ang) * minDim * 0.25);
      ctx.stroke();
    }
  } else if (kind === "OBELISK") {
    // Brotherhood Black/Ruby Pyramidal Monolith
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.08);
    ctx.lineTo(w * 0.82, h * 0.84);
    ctx.lineTo(w * 0.18, h * 0.84);
    ctx.closePath();
    const obGrad = ctx.createLinearGradient(w * 0.18, h * 0.08, w * 0.82, h * 0.84);
    obGrad.addColorStop(0, "#27272a");
    obGrad.addColorStop(0.5, "#18181b");
    obGrad.addColorStop(1, "#450a0a");
    ctx.fillStyle = obGrad;
    ctx.fill();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Golden/Copper Induction Coils along flanks
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2 * u;
    for (const ly of [h * 0.42, h * 0.56, h * 0.7]) {
      const span = ((ly - h * 0.08) / (h * 0.76)) * (w * 0.3);
      ctx.beginPath();
      ctx.moveTo(cx - span, ly);
      ctx.lineTo(cx + span, ly);
      ctx.stroke();
    }

    // Incandescent Ruby Focal Crystal & Specular Halo at Apex
    const halo = ctx.createRadialGradient(cx, h * 0.16, 1 * u, cx, h * 0.16, 13 * u);
    halo.addColorStop(0, "#fecaca");
    halo.addColorStop(0.4, "#ef4444");
    halo.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, h * 0.16, 13 * u, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, h * 0.16, 4.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  // ============================================================================
  // LAYER 3: MICRO-DETAILS (Active powered structures only)
  // ============================================================================
  const isPassiveFortification =
    kind === "SANDBAG_WALL" || kind === "CONCRETE_WALL" || kind === "CONCRETE_SLAB";

  if (!isPassiveFortification) {
    if (kind !== "SILO" && kind !== "OBELISK") {
      drawVentLouvers(ctx, 10 * u, h - 16 * u, 12 * u, 5 * u, 3);
    }
    // Illuminated tactical status LEDs
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(w - 16 * u, 9 * u, 4 * u, 2.2 * u);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(w - 11 * u, 9 * u, 4 * u, 2.2 * u);
  }

  // ============================================================================
  // LAYER 4: LIGHTING & SPECULAR HIGHLIGHTS (Crisp NW Rim Lighting)
  // ============================================================================
  if (kind !== "SANDBAG_WALL") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    if (kind === "SILO") {
      ctx.arc(cx, cy, minDim * 0.34, Math.PI * 0.85, Math.PI * 1.65);
    } else if (kind === "OBELISK") {
      ctx.moveTo(w * 0.2, h * 0.8);
      ctx.lineTo(cx, h * 0.1);
    } else {
      ctx.moveTo(4 * u, h * 0.65);
      ctx.lineTo(4 * u, 10 * u);
      ctx.lineTo(10 * u, 4 * u);
      ctx.lineTo(w * 0.65, 4 * u);
    }
    ctx.stroke();
  }

  // ============================================================================
  // LAYER 5: LEONARDO VARIANT EVOLUTION OVERLAY (V2, V3, V4, V5+)
  // ============================================================================
  if (activeVariant.variantId !== "v1_classic_mk1") {
    drawBuildingVariantEvolutionLayer(ctx, faction, kind, w, h, u, activeVariant);
  }
}

function drawBuildingVariantEvolutionLayer(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  u: number,
  variant: VectorVariantProposal
): void {
  const fSpec = FACTIONS[faction];
  const dna = variant.dna;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const minDim = Math.min(w, h);
  const energy = resolveEnergyHueColors(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  // 1. Silhouette / Perimeter Bastion Sponsons
  if (dna.silhouetteProfile === "WIDENED_HEAVY" || dna.silhouetteProfile === "OCTAGONAL_BEVEL") {
    const sponsonW = 5.5 * u;
    const sponsonH = h * 0.44;
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.6 * u;
    ctx.fillRect(1.5 * u, cy - sponsonH * 0.5, sponsonW, sponsonH);
    ctx.strokeRect(1.5 * u, cy - sponsonH * 0.5, sponsonW, sponsonH);
    ctx.fillRect(w - 1.5 * u - sponsonW, cy - sponsonH * 0.5, sponsonW, sponsonH);
    ctx.strokeRect(w - 1.5 * u - sponsonW, cy - sponsonH * 0.5, sponsonW, sponsonH);
  } else if (dna.silhouetteProfile === "ANGULAR_STEALTH") {
    // 4 Stealth Corner Deflector Vanes
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.0 * u;
    const inset = 6 * u;
    const span = 12 * u;
    ctx.beginPath();
    ctx.moveTo(inset, inset + span);
    ctx.lineTo(inset + span, inset);
    ctx.moveTo(w - inset, inset + span);
    ctx.lineTo(w - inset - span, inset);
    ctx.moveTo(inset, h - inset - span);
    ctx.lineTo(inset + span, h - inset);
    ctx.moveTo(w - inset, h - inset - span);
    ctx.lineTo(w - inset - span, h - inset);
    ctx.stroke();
  }

  // 2. Hazard Striping Evolution
  if (dna.hazardStripeMode === "DOUBLE_CHEVRON") {
    drawHazardStripes(ctx, w * 0.18, 4 * u, w * 0.64, 4.2 * u, 3.8 * u);
    drawHazardStripes(ctx, w * 0.18, h - 8.2 * u, w * 0.64, 4.2 * u, 3.8 * u);
  } else if (dna.hazardStripeMode === "PERIMETER_WARNING") {
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 1.6 * u;
    ctx.setLineDash([4 * u, 3 * u]);
    traceChamferedRect(ctx, 5 * u, 5 * u, w - 10 * u, h - 10 * u, 6 * u * dna.armorChamferScale);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. Superstructure Architectural Upgrades
  if (dna.superstructureStyle === "REACTIVE_ERA_BLOCKS") {
    // Explosive-Reactive Armor (ERA) casemate tiles along N/S flanks
    const blockCount = Math.max(3, Math.floor(w / (18 * u)));
    const blockW = (w * 0.68) / blockCount;
    for (let i = 0; i < blockCount; i++) {
      const bx = w * 0.16 + i * blockW;
      ctx.fillStyle = i % 2 === 0 ? fSpec.primaryColor : "#334155";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.1 * u;
      ctx.fillRect(bx + 1 * u, 9 * u, blockW - 2 * u, 5.5 * u);
      ctx.strokeRect(bx + 1 * u, 9 * u, blockW - 2 * u, 5.5 * u);
    }
  } else if (dna.superstructureStyle === "DUAL_REACTOR" || dna.superstructureStyle === "CRYO_CONDUITS") {
    // Glowing Energy Conduit Pipes & Central Plasma Ring
    const ringR = minDim * 0.19;
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.0 * u;
    ctx.beginPath();
    ctx.moveTo(8 * u, cy);
    ctx.lineTo(cx - ringR, cy);
    ctx.moveTo(cx + ringR, cy);
    ctx.lineTo(w - 8 * u, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(9, 13, 22, 0.78)";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = energy.core;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx - ringR * 0.15, cy - ringR * 0.15, ringR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = energy.rim;
    ctx.fill();
  } else if (dna.superstructureStyle === "COMMAND_ANTENNA" || dna.superstructureStyle === "SOLAR_VANES") {
    // Telemetry Radar Mast & Solar Radiator Vanes at NE corner
    const ax = w - 16 * u;
    const ay = 16 * u;
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(ax, ay, 7 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = energy.rim;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(ax - 5 * u, ay - 5 * u);
    ctx.lineTo(ax + 5 * u, ay + 5 * u);
    ctx.moveTo(ax + 5 * u, ay - 5 * u);
    ctx.lineTo(ax - 5 * u, ay + 5 * u);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ax, ay, 2.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = energy.core;
    ctx.fill();
  }

  // 4. Heavy Bolted Corner Rivets if HEAVY_BOLTED
  if (dna.rivetDensity === "HEAVY_BOLTED" && kind !== "SANDBAG_WALL") {
    drawCornerRivets(ctx, 6 * u, 6 * u, w - 12 * u, h - 12 * u, 4 * u, 2.3 * u);
  }

  ctx.restore();
}

/**
 * 2b. High-Precision Rotating Defense Building Turret Renderer (Lot 3.1: `GUARD_TOWER`, `SAM_SITE`)
 * Renders the 16-angle turret sprite (`angleIndex` 0..15) with fixed world-space NW lighting & SE drop shadow.
 */
export function drawLeonardoBuildingTurret(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: BuildingKind,
  w: number,
  h: number,
  angleIndex = 0,
  variantOverride?: VectorVariantProposal
): void {
  if (kind !== "GUARD_TOWER" && kind !== "SAM_SITE") {
    return;
  }

  const activeVariant = variantOverride ?? getActiveBuildingVariant(kind);
  const dna = activeVariant.dna;
  const isCustomVariant = activeVariant.variantId !== "v1_classic_mk1";
  const bScale = dna.barrelLengthScale;
  const fSpec = FACTIONS[faction];
  const energy = resolveEnergyHueColors(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );
  const minDim = Math.min(w, h);
  const u = minDim / 64;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const radians = (angleIndex / 16) * Math.PI * 2;
  const shadowVec = toLocalSunVector(2.5 * u, 3.0 * u, radians);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);

  if (kind === "GUARD_TOWER") {
    // 1. Fixed World-Space SE Cast Shadow of Turret & Barrels
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.beginPath();
    ctx.arc(shadowVec.x, shadowVec.y, minDim * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-5.5 * u + shadowVec.x, -h * 0.44 * bScale + shadowVec.y, 11 * u, h * 0.36 * bScale);

    // 2. Twin Rotary 30mm Vulcan Cannon Barrels & Cooling Jackets (-Y is aim vector)
    for (const bx of [-5.2 * u, 2.0 * u]) {
      // Barrel thermal cooling jacket
      ctx.fillStyle = "#475569";
      ctx.fillRect(bx - 0.6 * u, -h * 0.32 * bScale, 4.4 * u, h * 0.18 * bScale);
      // Multi-barrel rotary cluster
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(bx, -h * 0.44 * bScale, 3.2 * u, h * 0.36 * bScale);
      // Heavy muzzle flash suppressor
      ctx.fillStyle = isCustomVariant ? energy.core : "#94a3b8";
      ctx.fillRect(bx - 0.5 * u, -h * 0.46 * bScale, 4.2 * u, 3.2 * u);
    }

    // 3. Armored Gunhouse Dome (Shaded along fixed World NW-SE sun axis)
    const domeR = minDim * 0.22 * dna.hullWidthScale;
    ctx.beginPath();
    ctx.arc(0, 0, domeR, 0, Math.PI * 2);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      domeR,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Beveled armored mantlet plate
    traceChamferedRect(
      ctx,
      -7 * u * dna.hullWidthScale,
      -8 * u,
      14 * u * dna.hullWidthScale,
      13 * u,
      3 * u * dna.armorChamferScale
    );
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = isCustomVariant ? energy.core : fSpec.primaryColor;
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();

    // Electro-Optical Target Acquisition Sensor Dome
    ctx.beginPath();
    ctx.arc(0, 1.5 * u, 3.8 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#091526";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 1.5 * u, 2.6 * u, 0, Math.PI * 2);
    ctx.fillStyle = isCustomVariant ? energy.core : "#38bdf8";
    ctx.fill();

    // 4. Fixed World-Space NW Specular Rim Highlight
    drawWorldSpaceNwSpecularArc(ctx, radians, 9 * u, 9 * u, u, 0.48);
  } else if (kind === "SAM_SITE") {
    // 1. Fixed World-Space SE Cast Shadow of Launcher Box
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    traceChamferedRect(
      ctx,
      -14 * u + shadowVec.x,
      -13 * u + shadowVec.y,
      28 * u,
      25 * u,
      4 * u
    );
    ctx.fill();

    // 2. 4 Protruding Red/White Surface-to-Air Missile Warheads in Launch Tubes (-Y)
    const tubeX = [-9 * u, -3 * u, 3 * u, 9 * u];
    for (const tx of tubeX) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(tx - 1.7 * u, -17.5 * u * bScale, 3.4 * u, 9 * u * bScale);
      ctx.beginPath();
      ctx.arc(tx, -17.5 * u * bScale, 1.9 * u, 0, Math.PI * 2);
      ctx.fillStyle = isCustomVariant ? energy.core : "#ef4444";
      ctx.fill();
    }

    // 3. Quad Surface-to-Air Missile Launcher Box (Shaded along fixed World NW-SE sun axis)
    traceChamferedRect(
      ctx,
      -14 * u * dna.hullWidthScale,
      -12 * u,
      28 * u * dna.hullWidthScale,
      24 * u,
      4 * u * dna.armorChamferScale
    );
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      16 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = isCustomVariant ? energy.core : "#cbd5e1";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Inner armored launch cell divider ribs & rear blast exhaust louvers (+Y)
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-11 * u, -8 * u, 22 * u, 12 * u);
    drawVentLouvers(ctx, -10 * u, 5 * u, 20 * u, 5 * u, 3);

    // Side-mounted target-tracking radar dish pod
    ctx.fillStyle = isCustomVariant ? energy.core : "#38bdf8";
    ctx.fillRect(-5 * u, -5 * u, 10 * u, 3 * u);

    // 4. Fixed World-Space NW Specular Rim Highlight
    drawWorldSpaceNwSpecularArc(ctx, radians, 12 * u, 10 * u, u, 0.5);
  }

  ctx.restore();
}

/**
 * Helper to draw an articulated tank track with visible tread cleats.
 */
function drawDetailedTrack(
  ctx: VectorDrawingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  cleatCount: number
): void {
  ctx.fillStyle = "#18181b";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#09090b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = "#3f3f46";
  const step = h / cleatCount;
  for (let i = 0; i < cleatCount; i++) {
    ctx.fillRect(x + 0.5, y + i * step + 0.8, w - 1, step * 0.45);
  }
}

/**
 * 3. High-Precision Vector Unit Body Renderer (All 12 UnitKinds + Leonardo Variants)
 * Note: `ctx` is already translated to `(sizePx/2, sizePx/2)` and rotated by `radians = (angleIndex / 16) * Math.PI * 2`.
 * Lot 2: Uses `angleIndex` (`0..15`) so ground shadows and NW specular highlights remain locked to the
 * fixed world-space North-West sun, and each infantry soldier rotates on their own individual axis.
 */
export function drawLeonardoUnitBody(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  angleIndex = 0,
  variantOverride?: VectorVariantProposal
): void {
  const activeVariant = variantOverride ?? getActiveUnitVariant(kind);
  const isCustomVariant = activeVariant.variantId !== "v1_classic_mk1";
  const isInfantry =
    kind === "RIFLE_INFANTRY" || kind === "ROCKET_SOLDIER" || kind === "ENGINEER";

  ctx.save();
  if (isCustomVariant && !isInfantry) {
    ctx.scale(activeVariant.dna.hullWidthScale, activeVariant.dna.hullLengthScale);
  }
  drawLeonardoUnitBodyBase(ctx, faction, kind, sizePx, angleIndex);
  ctx.restore();

  if (isCustomVariant) {
    drawUnitBodyVariantEvolutionLayer(
      ctx,
      faction,
      kind,
      sizePx,
      angleIndex,
      activeVariant
    );
  }
}

function drawLeonardoUnitBodyBase(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  angleIndex = 0
): void {
  const fSpec = FACTIONS[faction];
  const u = sizePx / 64; // Normalized unit scale relative to 64px high-DPI sprite
  const radians = (angleIndex / 16) * Math.PI * 2;
  const shadowVec = toLocalSunVector(2.8 * u, 3.4 * u, radians);

  if (kind === "RIFLE_INFANTRY" || kind === "ROCKET_SOLDIER" || kind === "ENGINEER") {
    // Lot 2.2: Maintain fixed triangular 3-soldier formation in world space and rotate each soldier on their own axis!
    const squadOffsets: Array<{ x: number; y: number }> = [
      { x: 0, y: -10 * u },
      { x: -10 * u, y: 8 * u },
      { x: 10 * u, y: 8 * u },
    ];

    ctx.save();
    // Counter-rotate the canvas-level rotation so the triangle formation stays fixed in world space
    ctx.rotate(-radians);

    for (const pos of squadOffsets) {
      ctx.save();
      ctx.translate(pos.x, pos.y);

      // 1. Fixed World-Space South-East Ground Drop Shadow
      ctx.beginPath();
      ctx.ellipse(1.6 * u, 2.4 * u, 6.5 * u, 5 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fill();

      // 2. Rotate individual soldier on their own axis by `radians`
      ctx.save();
      ctx.rotate(radians);

      // Armored Shoulder Pauldrons (Faction Primary & Secondary)
      traceChamferedRect(ctx, -6.5 * u, -3.5 * u, 13 * u, 7 * u, 2.5 * u);
      ctx.fillStyle = fSpec.secondaryColor;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1 * u;
      ctx.stroke();

      ctx.fillStyle = fSpec.primaryColor;
      ctx.fillRect(-6 * u, -2.5 * u, 3.5 * u, 5 * u);
      ctx.fillRect(2.5 * u, -2.5 * u, 3.5 * u, 5 * u);

      // Weapon / Equipment assembly pointing along soldier's aim axis (-Y)
      if (kind === "RIFLE_INFANTRY") {
        // Long-barreled pulse assault rifle with muzzle flash suppressor
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(1.5 * u, -11 * u, 2.2 * u, 9 * u);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(1.8 * u, -13 * u, 1.5 * u, 3 * u);
      } else if (kind === "ROCKET_SOLDIER") {
        // Shoulder-mounted anti-tank missile tube + red warhead tip
        ctx.fillStyle = "#334155";
        ctx.fillRect(2.2 * u, -11 * u, 3.6 * u, 14 * u);
        ctx.beginPath();
        ctx.arc(4 * u, -12 * u, 2 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      } else {
        // ENGINEER: Yellow technical satchel on back + plasma cutting torch at front
        ctx.fillStyle = "#eab308";
        ctx.fillRect(-4 * u, 2 * u, 8 * u, 4 * u);
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(2.5 * u, -8 * u, 2 * u, 0, Math.PI * 2);
        ctx.fill();
      }

      // Helmet & Optical Visor
      ctx.beginPath();
      ctx.arc(0, 0, 4.2 * u, 0, Math.PI * 2);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.1 * u;
      ctx.stroke();

      // Glowing cyan optical visor strip on front side of helmet
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(-2.5 * u, -3.8 * u, 5 * u, 1.8 * u);

      ctx.restore();

      // 3. Fixed World-Space North-West Specular Helmet Highlight
      ctx.beginPath();
      ctx.arc(-1.4 * u, -1.4 * u, 1.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
    return;
  }

  if (kind === "CONSTRUCTOR_BOT") {
    // Fixed World-Space SE Ground Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    traceChamferedRect(ctx, -14 * u + shadowVec.x, -16 * u + shadowVec.y, 28 * u, 32 * u, 4 * u);
    ctx.fill();

    // Twin Heavy Servo Tracks
    drawDetailedTrack(ctx, -15 * u, -13 * u, 4.5 * u, 26 * u, 7);
    drawDetailedTrack(ctx, 10.5 * u, -13 * u, 4.5 * u, 26 * u, 7);

    // Articulated Front Robotic Welding & Paving Arms (-Y)
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 2.8 * u;
    ctx.beginPath();
    ctx.moveTo(-8 * u, -10 * u);
    ctx.lineTo(-10 * u, -20 * u);
    ctx.lineTo(-5 * u, -24 * u);
    ctx.moveTo(8 * u, -10 * u);
    ctx.lineTo(10 * u, -20 * u);
    ctx.lineTo(5 * u, -24 * u);
    ctx.stroke();

    // Plasma Welding Torches at Arm Tips
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(-5 * u, -24 * u, 2.4 * u, 0, Math.PI * 2);
    ctx.arc(5 * u, -24 * u, 2.4 * u, 0, Math.PI * 2);
    ctx.fill();

    // Main Robotic Hull shaded along World NW-SE Sun Axis
    traceChamferedRect(ctx, -11 * u, -12 * u, 22 * u, 25 * u, 4 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      14 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Industrial Hazard Chevrons on Rear Deck
    drawHazardStripes(ctx, -8.5 * u, 4 * u, 17 * u, 6.5 * u, 3 * u);

    // Central Rotating Servo Dome & Optical Sensor
    ctx.beginPath();
    ctx.arc(0, -2 * u, 7.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-4.5 * u, -6.5 * u, 9 * u, 2.6 * u);

    drawWorldSpaceNwSpecularArc(ctx, radians, 9.5 * u, 10.5 * u, u, 0.44);
    return;
  }

  if (kind === "HARVESTER") {
    // Super-Heavy Ore Harvester (Lot 2 fixed sun shadow + Lot 3.2 EMPTY grooved metallic rear dump-bed)
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    traceChamferedRect(ctx, -24 * u + shadowVec.x, -27 * u + shadowVec.y, 48 * u, 54 * u, 6 * u);
    ctx.fill();

    // 4 Wide Articulated Heavy Tracks
    drawDetailedTrack(ctx, -25 * u, -22 * u, 6 * u, 19 * u, 6);
    drawDetailedTrack(ctx, 19 * u, -22 * u, 6 * u, 19 * u, 6);
    drawDetailedTrack(ctx, -25 * u, 3 * u, 6 * u, 21 * u, 6);
    drawDetailedTrack(ctx, 19 * u, 3 * u, 6 * u, 21 * u, 6);

    // Heavy Front Rotary Crusher Drum & Mandibles (-Y)
    ctx.fillStyle = "#334155";
    ctx.fillRect(-16 * u, -28 * u, 32 * u, 6 * u);
    drawHazardStripes(ctx, -15 * u, -24 * u, 30 * u, 3.5 * u, 3.5 * u);

    ctx.fillStyle = "#64748b";
    for (let tx = -14 * u; tx <= 14 * u; tx += 5.5 * u) {
      ctx.beginPath();
      ctx.moveTo(tx - 2 * u, -26 * u);
      ctx.lineTo(tx, -31 * u);
      ctx.lineTo(tx + 2 * u, -26 * u);
      ctx.closePath();
      ctx.fill();
    }

    // Main Heavy Chassis Frame shaded along World NW-SE Sun Axis
    traceChamferedRect(ctx, -19 * u, -22 * u, 38 * u, 48 * u, 5 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      22 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Twin Pressurized Cylindrical Side Cisterns (Empty sight-glass in static sprite; filled dynamically in world-renderer)
    for (const cxOff of [-15.5 * u, 15.5 * u]) {
      traceChamferedRect(ctx, cxOff - 3.2 * u, -8 * u, 6.4 * u, 28 * u, 2.5 * u);
      ctx.fillStyle = "#475569";
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.fillStyle = "#091526";
      ctx.fillRect(cxOff - 1.2 * u, -4 * u, 2.4 * u, 20 * u);
    }

    // Sloped Armored Forward Command Cab
    traceChamferedRect(ctx, -14 * u, -20 * u, 28 * u, 12 * u, 4 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-10 * u, -18 * u, 20 * u, 3.2 * u);

    // Lot 3.2: EMPTY Rear Dump-Bed / Benne Industrielle (-6*u to +23*u) with grooved metallic floor
    traceChamferedRect(ctx, -13 * u, -6 * u, 26 * u, 29 * u, 3.5 * u);
    ctx.fillStyle = "#09101d";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    // Inner recessed metallic hopper floor & longitudinal/transverse steel ribs
    ctx.fillStyle = "#162032";
    ctx.fillRect(-10.5 * u, -3.5 * u, 21 * u, 24 * u);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.1 * u;
    ctx.beginPath();
    for (const rx of [-6.5 * u, -2.2 * u, 2.2 * u, 6.5 * u]) {
      ctx.moveTo(rx, -3 * u);
      ctx.lineTo(rx, 20 * u);
    }
    for (const ry of [1 * u, 6.5 * u, 12 * u, 17 * u]) {
      ctx.moveTo(-10 * u, ry);
      ctx.lineTo(10 * u, ry);
    }
    ctx.stroke();

    // Transverse Hydraulic Cross-Bars over the Dump Bed
    ctx.fillStyle = "#64748b";
    ctx.fillRect(-12 * u, 2 * u, 24 * u, 2.2 * u);
    ctx.fillRect(-12 * u, 12 * u, 24 * u, 2.2 * u);

    drawWorldSpaceNwSpecularArc(ctx, radians, 16 * u, 19 * u, u, 0.42);
    return;
  }

  if (kind === "FORESTRY_TRUCK") {
    // Forestry Truck (Camion Forestier): 6-wheel heavy forestry chassis with rear sapling nursery bed & planting auger arm
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    traceChamferedRect(ctx, -16 * u + shadowVec.x, -21 * u + shadowVec.y, 32 * u, 42 * u, 4 * u);
    ctx.fill();

    // 6 Heavy Off-Road Forestry Tires
    drawDetailedTrack(ctx, -18 * u, -17 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, 14 * u, -17 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, -18 * u, -3 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, 14 * u, -3 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, -18 * u, 9 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, 14 * u, 9 * u, 4 * u, 9 * u, 3);

    // Main Forestry Chassis Frame
    traceChamferedRect(ctx, -14 * u, -19 * u, 28 * u, 38 * u, 4 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      16 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Forward Armored Forestry Cab (-Y)
    traceChamferedRect(ctx, -11 * u, -17 * u, 22 * u, 10 * u, 3 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-8 * u, -15 * u, 16 * u, 3 * u);

    // Rear Open Nursery Bed carrying 3 Emerald Saplings
    ctx.fillStyle = "#14261c";
    ctx.fillRect(-11 * u, -5 * u, 22 * u, 21 * u);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.2 * u;
    ctx.strokeRect(-11 * u, -5 * u, 22 * u, 21 * u);

    const saplingSpots: Array<[number, number]> = [
      [-5 * u, 1 * u],
      [5 * u, 1 * u],
      [0, 9 * u],
    ];
    for (const [sx, sy] of saplingSpots) {
      ctx.beginPath();
      ctx.arc(sx, sy, 3.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#15803d";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx - 0.8 * u, sy - 0.8 * u, 2.2 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#4ade80";
      ctx.fill();
    }

    // Rear Hydraulic Planting Auger Boom
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    ctx.moveTo(0, 14 * u);
    ctx.lineTo(0, 21 * u);
    ctx.stroke();

    drawWorldSpaceNwSpecularArc(ctx, radians, 12 * u, 16 * u, u, 0.42);
    return;
  }

  if (kind === "BLOWER_TRUCK") {
    // Mobile Blower Truck (Soufflerie Mobile): Tracked amphibious engineering chassis with twin directional thermal turbo-blowers
    ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
    traceChamferedRect(ctx, -17 * u + shadowVec.x, -21 * u + shadowVec.y, 34 * u, 42 * u, 5 * u);
    ctx.fill();

    // Wide Low-Ground-Pressure Swamp Tracks
    drawDetailedTrack(ctx, -19 * u, -18 * u, 5 * u, 36 * u, 9);
    drawDetailedTrack(ctx, 14 * u, -18 * u, 5 * u, 36 * u, 9);

    // Main Engineering Hull
    traceChamferedRect(ctx, -14 * u, -19 * u, 28 * u, 38 * u, 4 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      16 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Front Directional Thermal Air-Jet Nozzle Shroud (-Y)
    drawHazardStripes(ctx, -12 * u, -21 * u, 24 * u, 4 * u, 3 * u);

    // Twin High-Velocity Turbo-Fan Cowlings on Dorsal Deck
    for (const txOff of [-6.5 * u, 6.5 * u]) {
      ctx.beginPath();
      ctx.arc(txOff, 2 * u, 5.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();

      // Turbine blades
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.1 * u;
      ctx.beginPath();
      ctx.moveTo(txOff - 3.8 * u, 2 * u);
      ctx.lineTo(txOff + 3.8 * u, 2 * u);
      ctx.moveTo(txOff, 2 * u - 3.8 * u);
      ctx.lineTo(txOff, 2 * u + 3.8 * u);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(txOff, 2 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
    }

    // Rear Thermal Generator Louvers
    drawVentLouvers(ctx, -9 * u, 11 * u, 18 * u, 5 * u, 3);

    drawWorldSpaceNwSpecularArc(ctx, radians, 12.5 * u, 16 * u, u, 0.44);
    return;
  }

  if (kind === "RECON_BUGGY") {
    // Fixed World-Space SE Ground Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    traceChamferedRect(ctx, -12 * u + shadowVec.x, -17 * u + shadowVec.y, 24 * u, 34 * u, 4 * u);
    ctx.fill();

    // 4 Lugged Off-Road Tires
    drawDetailedTrack(ctx, -14 * u, -14 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, 10 * u, -14 * u, 4 * u, 9 * u, 3);
    drawDetailedTrack(ctx, -14 * u, 5 * u, 4 * u, 10 * u, 3);
    drawDetailedTrack(ctx, 10 * u, 5 * u, 4 * u, 10 * u, 3);

    // Aggressive Tapered Body shaded along World NW-SE Sun Axis
    ctx.beginPath();
    ctx.moveTo(0, -19 * u);
    ctx.lineTo(10 * u, -9 * u);
    ctx.lineTo(10 * u, 16 * u);
    ctx.lineTo(-10 * u, 16 * u);
    ctx.lineTo(-10 * u, -9 * u);
    ctx.closePath();
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      14 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();

    // Faction Primary Hood Striping
    ctx.fillStyle = fSpec.primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -17 * u);
    ctx.lineTo(7 * u, -8 * u);
    ctx.lineTo(-7 * u, -8 * u);
    ctx.closePath();
    ctx.fill();

    // Tubular Roll Cage
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.4 * u;
    ctx.strokeRect(-6 * u, -5 * u, 12 * u, 14 * u);

    // Front Tactical Headlights
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-6 * u, -17 * u, 3 * u, 2 * u);
    ctx.fillRect(3 * u, -17 * u, 3 * u, 2 * u);

    drawWorldSpaceNwSpecularArc(ctx, radians, 8.5 * u, 12 * u, u, 0.42);
    return;
  }

  if (kind === "MAMMOTH_TANK") {
    // Fixed World-Space SE Ground Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    traceChamferedRect(ctx, -21 * u + shadowVec.x, -24 * u + shadowVec.y, 42 * u, 48 * u, 6 * u);
    ctx.fill();

    // 4 Independent Quad-Tracks
    drawDetailedTrack(ctx, -22 * u, -22 * u, 6 * u, 18 * u, 6);
    drawDetailedTrack(ctx, 16 * u, -22 * u, 6 * u, 18 * u, 6);
    drawDetailedTrack(ctx, -22 * u, 4 * u, 6 * u, 18 * u, 6);
    drawDetailedTrack(ctx, 16 * u, 4 * u, 6 * u, 18 * u, 6);

    // Heavy Armored Chassis shaded along World NW-SE Sun Axis
    traceChamferedRect(ctx, -17 * u, -20 * u, 34 * u, 42 * u, 5 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Double Reactive Front Glacis Plates
    traceChamferedRect(ctx, -14 * u, -17 * u, 28 * u, 32 * u, 4 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      18 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();

    // Dorsal Energy Core & Rear Exhaust Vents
    drawVentLouvers(ctx, -10 * u, 13 * u, 20 * u, 6 * u, 3);
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-11 * u, -19 * u, 4 * u, 2 * u);
    ctx.fillRect(7 * u, -19 * u, 4 * u, 2 * u);

    drawWorldSpaceNwSpecularArc(ctx, radians, 14.5 * u, 17.5 * u, u, 0.45);
    return;
  }

  if (kind === "MCV") {
    // Fixed World-Space SE Ground Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    traceChamferedRect(ctx, -20 * u + shadowVec.x, -24 * u + shadowVec.y, 40 * u, 48 * u, 5 * u);
    ctx.fill();

    drawDetailedTrack(ctx, -21 * u, -21 * u, 5 * u, 42 * u, 11);
    drawDetailedTrack(ctx, 16 * u, -21 * u, 5 * u, 42 * u, 11);

    traceChamferedRect(ctx, -16 * u, -21 * u, 32 * u, 44 * u, 5 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      20 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Armored Front Cab with Cyan Windshield
    traceChamferedRect(ctx, -13 * u, -19 * u, 26 * u, 12 * u, 3 * u);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-9 * u, -17 * u, 18 * u, 3.5 * u);

    // Dorsal Assembly Module & Folded Yellow Crane Boom
    ctx.fillStyle = "#334155";
    ctx.fillRect(-12 * u, -5 * u, 24 * u, 24 * u);
    drawHazardStripes(ctx, -10 * u, 14 * u, 20 * u, 5 * u, 3.5 * u);

    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3.5 * u;
    ctx.beginPath();
    ctx.moveTo(-6 * u, 12 * u);
    ctx.lineTo(6 * u, -3 * u);
    ctx.stroke();

    drawWorldSpaceNwSpecularArc(ctx, radians, 14 * u, 18 * u, u, 0.44);
    return;
  }

  // MEDIUM_TANK or ARTILLERY
  const hullW = 28 * u;
  const hullH = kind === "ARTILLERY" ? 40 * u : 36 * u;

  // Fixed World-Space SE Ground Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  traceChamferedRect(
    ctx,
    -hullW * 0.5 - 3 * u + shadowVec.x,
    -hullH * 0.5 + shadowVec.y,
    hullW + 6 * u,
    hullH,
    4 * u
  );
  ctx.fill();

  // Left & Right Cleated Tracks
  drawDetailedTrack(ctx, -hullW * 0.5 - 4 * u, -hullH * 0.5 + 1 * u, 4.5 * u, hullH - 2 * u, 9);
  drawDetailedTrack(ctx, hullW * 0.5 - 0.5 * u, -hullH * 0.5 + 1 * u, 4.5 * u, hullH - 2 * u, 9);

  // Main Armored Hull
  traceChamferedRect(ctx, -hullW * 0.5, -hullH * 0.5, hullW, hullH, 4 * u);
  ctx.fillStyle = fSpec.secondaryColor;
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.6 * u;
  ctx.stroke();

  // Beveled Front Glacis & Side Skirts shaded along fixed World NW-SE Sun Axis
  traceChamferedRect(
    ctx,
    -hullW * 0.5 + 3 * u,
    -hullH * 0.5 + 3 * u,
    hullW - 6 * u,
    hullH - 9 * u,
    3 * u
  );
  ctx.fillStyle = createWorldSunLinearGradient(
    ctx,
    radians,
    16 * u,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );
  ctx.fill();

  // Rear Engine Louvers & Exhaust Pipes
  drawVentLouvers(ctx, -8 * u, hullH * 0.5 - 6 * u, 16 * u, 4 * u, 3);

  drawWorldSpaceNwSpecularArc(ctx, radians, hullW * 0.42, hullH * 0.42, u, 0.44);
}

/**
 * 4. High-Precision Vector Unit Turret Renderer (+ Leonardo Variants)
 * Note: `ctx` is already translated to `(sizePx/2, sizePx/2)` and rotated (`-Y` = aim direction).
 * Lot 2: Uses `angleIndex` (`0..15`) so the turret cast shadow and NW specular highlight stay locked to the world sun.
 */
export function drawLeonardoUnitTurret(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  angleIndex = 0,
  variantOverride?: VectorVariantProposal
): void {
  const activeVariant = variantOverride ?? getActiveUnitVariant(kind);
  const isCustomVariant = activeVariant.variantId !== "v1_classic_mk1";

  ctx.save();
  if (isCustomVariant) {
    ctx.scale(1, activeVariant.dna.barrelLengthScale);
  }
  drawLeonardoUnitTurretBase(ctx, faction, kind, sizePx, angleIndex);
  ctx.restore();

  if (isCustomVariant) {
    drawUnitTurretVariantEvolutionLayer(
      ctx,
      faction,
      kind,
      sizePx,
      angleIndex,
      activeVariant
    );
  }
}

function drawLeonardoUnitTurretBase(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  angleIndex = 0
): void {
  const fSpec = FACTIONS[faction];
  const u = sizePx / 64;
  const radians = (angleIndex / 16) * Math.PI * 2;
  const shadowVec = toLocalSunVector(1.8 * u, 2.2 * u, radians);

  if (kind === "RECON_BUGGY") {
    // Rotary Heavy Machine Gun Mount with Frontal Shield & Ammo Belt
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-1.5 * u, -18 * u, 3 * u, 14 * u);

    // Frontal gun shield
    ctx.beginPath();
    ctx.moveTo(-6 * u, -7 * u);
    ctx.lineTo(0, -10 * u);
    ctx.lineTo(6 * u, -7 * u);
    ctx.lineTo(5 * u, -2 * u);
    ctx.lineTo(-5 * u, -2 * u);
    ctx.closePath();
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      6 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();

    // Brass ammo feed belt
    ctx.fillStyle = "#eab308";
    ctx.fillRect(2 * u, -5 * u, 3.5 * u, 4 * u);
    return;
  }

  if (kind === "MEDIUM_TANK") {
    // Fixed World-Space SE Turret Cast Shadow onto Hull Deck
    ctx.fillStyle = "rgba(0, 0, 0, 0.44)";
    traceChamferedRect(
      ctx,
      -9.5 * u + shadowVec.x,
      -9.5 * u + shadowVec.y,
      19 * u,
      19 * u,
      4.5 * u
    );
    ctx.fill();

    // 105mm Main Cannon with Thermal Sleeve & Muzzle Brake
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(-2.2 * u, -25 * u, 4.4 * u, 18 * u);
    // Muzzle brake
    ctx.fillStyle = "#475569";
    ctx.fillRect(-3.4 * u, -27 * u, 6.8 * u, 3.5 * u);
    // Reinforced gun mantlet
    ctx.fillStyle = "#334155";
    ctx.fillRect(-4.5 * u, -12 * u, 9 * u, 5 * u);

    // Beveled Octagonal Turret shaded along World NW-SE Sun Axis
    traceChamferedRect(ctx, -9.5 * u, -9.5 * u, 19 * u, 19 * u, 4.5 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      11 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Commander's Cupola Hatch
    ctx.beginPath();
    ctx.arc(3 * u, 2 * u, 3.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1 * u;
    ctx.stroke();

    drawWorldSpaceNwSpecularArc(ctx, radians, 7.5 * u, 7.5 * u, u, 0.48);
    return;
  }

  if (kind === "ARTILLERY") {
    // Fixed World-Space SE Launcher Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.44)";
    traceChamferedRect(
      ctx,
      -8.5 * u + shadowVec.x,
      -14 * u + shadowVec.y,
      17 * u,
      24 * u,
      3 * u
    );
    ctx.fill();

    // Long-Range Inclined Missile/Howitzer Launcher Ramp with Hydraulic Struts & Optics
    traceChamferedRect(ctx, -8.5 * u, -14 * u, 17 * u, 24 * u, 3 * u);
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();

    // Long Barrel / Launch Rail
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-3 * u, -26 * u, 6 * u, 20 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      10 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fillRect(-5.5 * u, -11 * u, 11 * u, 16 * u);

    // Targeting Optical Sensor
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(4 * u, -13 * u, 3 * u, 3 * u);

    drawWorldSpaceNwSpecularArc(ctx, radians, 6.5 * u, 10 * u, u, 0.45);
    return;
  }

  if (kind === "MAMMOTH_TANK") {
    // Fixed World-Space SE Heavy Turret Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    traceChamferedRect(
      ctx,
      -11.5 * u + shadowVec.x,
      -11.5 * u + shadowVec.y,
      23 * u,
      23 * u,
      5.5 * u
    );
    ctx.fill();

    // Twin 120mm Heavy Cannons with Double Muzzle Brakes & Thermal Sleeves
    for (const bx of [-6 * u, 2.4 * u]) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(bx, -27 * u, 3.6 * u, 18 * u);
      ctx.fillStyle = "#475569";
      ctx.fillRect(bx - 0.8 * u, -29 * u, 5.2 * u, 3.5 * u);
    }

    // Lateral Tusk Missile Pods
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(-15 * u, -8 * u, 4 * u, 12 * u);
    ctx.fillRect(11 * u, -8 * u, 4 * u, 12 * u);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-14.5 * u, -9.5 * u, 3 * u, 2 * u);
    ctx.fillRect(11.5 * u, -9.5 * u, 3 * u, 2 * u);

    // Massive Beveled Heavy Turret shaded along World NW-SE Sun Axis
    traceChamferedRect(ctx, -11.5 * u, -11.5 * u, 23 * u, 23 * u, 5.5 * u);
    ctx.fillStyle = createWorldSunLinearGradient(
      ctx,
      radians,
      13 * u,
      fSpec.primaryColor,
      fSpec.secondaryColor
    );
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();

    // Specular NW Turret Roof Highlight locked to World-Space North-West
    drawWorldSpaceNwSpecularArc(ctx, radians, 8.5 * u, 8.5 * u, u, 0.5);
  }
}

/**
 * 5. Multi-Layered Vector Explosion Frame Generator (Pre-rasterized into GPU Sprite Atlas)
 */
export function drawLeonardoExplosionFrame(
  ctx: VectorDrawingContext,
  frameIndex: number,
  totalFrames: number,
  sizePx: number
): void {
  const safeTotal = Math.max(1, totalFrames);
  const progress = Math.max(0, Math.min(1, frameIndex / (safeTotal - 1 || 1)));
  const cx = sizePx * 0.5;
  const cy = sizePx * 0.5;
  const maxR = sizePx * 0.46;

  ctx.save();

  // Layer 1: Expanding supersonic shockwave ring
  const shockR = maxR * (0.25 + progress * 0.75);
  const shockAlpha = Math.max(0, (1 - progress) * 0.85);
  ctx.beginPath();
  ctx.arc(cx, cy, shockR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(254, 240, 138, ${shockAlpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, (1 - progress) * (sizePx * 0.08));
  ctx.stroke();

  // Layer 2: Anthracite smoke billows (#1e293b) expanding outward
  const smokeCount = 6;
  for (let i = 0; i < smokeCount; i++) {
    const ang = (i * Math.PI * 2) / smokeCount + progress * 0.4;
    const dist = maxR * (0.18 + progress * 0.52);
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang) * dist;
    const sr = maxR * (0.18 + progress * 0.22) * (1 - progress * 0.35);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
  }

  // Layer 3: Red/Orange fire lobes (#ef4444 / #f97316)
  if (progress < 0.88) {
    const fireScale = Math.sin(progress * Math.PI);
    const lobeCount = 7;
    for (let i = 0; i < lobeCount; i++) {
      const ang = (i * Math.PI * 2) / lobeCount - progress * 0.25;
      const dist = maxR * 0.32 * progress;
      const fx = cx + Math.cos(ang) * dist;
      const fy = cy + Math.sin(ang) * dist;
      const fr = Math.max(1.5, maxR * 0.26 * (0.4 + fireScale * 0.6));
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? "#ef4444" : "#f97316";
      ctx.fill();
    }
  }

  // Layer 4: Incandescent geometric shrapnel sparks
  const sparkCount = 8;
  for (let i = 0; i < sparkCount; i++) {
    const ang = (i * Math.PI * 2) / sparkCount + 0.2;
    const r0 = maxR * (0.15 + progress * 0.55);
    const r1 = r0 + maxR * 0.16 * (1 - progress * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang + 0.09) * r1, cy + Math.sin(ang + 0.09) * r1);
    ctx.lineTo(cx + Math.cos(ang - 0.09) * r1, cy + Math.sin(ang - 0.09) * r1);
    ctx.closePath();
    ctx.fillStyle = "#fef08a";
    ctx.fill();
  }

  // Layer 5: White-yellow plasma core (#fef08a)
  if (progress < 0.65) {
    const coreR = Math.max(1, maxR * 0.36 * (1 - progress / 0.65));
    const coreGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, coreR);
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.55, "#fef08a");
    coreGrad.addColorStop(1, "rgba(249, 115, 22, 0)");
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();
  }

  ctx.restore();
}

function drawUnitBodyVariantEvolutionLayer(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  angleIndex: number,
  variant: VectorVariantProposal
): void {
  const fSpec = FACTIONS[faction];
  const dna = variant.dna;
  const u = sizePx / 64;
  const radians = (angleIndex / 16) * Math.PI * 2;
  const energy = resolveEnergyHueColors(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  if (kind === "RIFLE_INFANTRY" || kind === "ROCKET_SOLDIER" || kind === "ENGINEER") {
    const squadOffsets: ReadonlyArray<{ x: number; y: number }> = [
      { x: 0, y: -10 * u },
      { x: -10 * u, y: 8 * u },
      { x: 10 * u, y: 8 * u },
    ];
    ctx.rotate(-radians);
    for (const pos of squadOffsets) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(radians);

      // Exo-Pauldron Energy Trim & Dorsal Power Cell
      ctx.fillStyle = energy.core;
      ctx.fillRect(-7.2 * u, -2.2 * u, 1.8 * u, 4.4 * u);
      ctx.fillRect(5.4 * u, -2.2 * u, 1.8 * u, 4.4 * u);

      // Glowing Tactical Visor Crest on Helmet
      ctx.beginPath();
      ctx.arc(0, -1.5 * u, 2.0 * u, 0, Math.PI * 2);
      ctx.fillStyle = energy.core;
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // Vehicles: Armored Side Skirts, Glacis ERA / Dozer Edge & Dorsal Reactor Cell
  if (dna.silhouetteProfile === "WIDENED_HEAVY" || dna.superstructureStyle === "REACTIVE_ERA_BLOCKS") {
    // Up-armored side track/wheel skirts
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.lineWidth = 1.2 * u;
    ctx.fillRect(-19 * u, -14 * u, 3.2 * u, 28 * u);
    ctx.strokeRect(-19 * u, -14 * u, 3.2 * u, 28 * u);
    ctx.fillRect(15.8 * u, -14 * u, 3.2 * u, 28 * u);
    ctx.strokeRect(15.8 * u, -14 * u, 3.2 * u, 28 * u);

    // Front V-Shaped Ram / Dozer Bumper (-Y)
    ctx.beginPath();
    ctx.moveTo(-13 * u, -18 * u);
    ctx.lineTo(0, -22.5 * u);
    ctx.lineTo(13 * u, -18 * u);
    ctx.lineTo(11 * u, -15.5 * u);
    ctx.lineTo(0, -19 * u);
    ctx.lineTo(-11 * u, -15.5 * u);
    ctx.closePath();
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();
  }

  if (dna.hazardStripeMode === "DOUBLE_CHEVRON" || dna.hazardStripeMode === "PERIMETER_WARNING") {
    drawHazardStripes(ctx, -10 * u, 13 * u, 20 * u, 3.5 * u, 3 * u);
  }

  if (
    dna.superstructureStyle === "DUAL_REACTOR" ||
    dna.superstructureStyle === "CRYO_CONDUITS" ||
    dna.energyCoreHue !== "FACTION"
  ) {
    // Glowing Rear Deck Energy Core Node (+Y)
    ctx.beginPath();
    ctx.arc(0, 10 * u, 3.8 * u, 0, Math.PI * 2);
    ctx.fillStyle = "#090d16";
    ctx.fill();
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 10 * u, 2.0 * u, 0, Math.PI * 2);
    ctx.fillStyle = energy.core;
    ctx.fill();
  }

  if (dna.superstructureStyle === "COMMAND_ANTENNA" || dna.superstructureStyle === "SOLAR_VANES") {
    // Twin Rear Whip Antennas & Telemetry Pod
    ctx.strokeStyle = energy.rim;
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(-10 * u, 12 * u);
    ctx.lineTo(-13 * u, 20 * u);
    ctx.moveTo(10 * u, 12 * u);
    ctx.lineTo(13 * u, 20 * u);
    ctx.stroke();
  }

  ctx.restore();
}

function drawUnitTurretVariantEvolutionLayer(
  ctx: VectorDrawingContext,
  faction: FactionId,
  kind: UnitKind,
  sizePx: number,
  _angleIndex: number,
  variant: VectorVariantProposal
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
  const u = sizePx / 64;
  const energy = resolveEnergyHueColors(
    dna.energyCoreHue,
    fSpec.primaryColor,
    fSpec.secondaryColor
  );

  ctx.save();

  if (dna.turretProfile === "COIL_OVERCHARGE") {
    // Electromagnetic plasma accelerator rings along the main barrel(s)
    ctx.strokeStyle = energy.core;
    ctx.lineWidth = 1.6 * u;
    for (const ry of [-16 * u, -20 * u, -24 * u]) {
      ctx.beginPath();
      ctx.moveTo(-5.5 * u, ry);
      ctx.lineTo(5.5 * u, ry);
      ctx.stroke();
    }
  } else if (dna.turretProfile === "ARMORED_MANTLET") {
    // Heavy sloped cheek armor plates flanking the turret
    ctx.fillStyle = fSpec.primaryColor;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2 * u;
    ctx.fillRect(-12.5 * u, -7 * u, 3.2 * u, 13 * u);
    ctx.strokeRect(-12.5 * u, -7 * u, 3.2 * u, 13 * u);
    ctx.fillRect(9.3 * u, -7 * u, 3.2 * u, 13 * u);
    ctx.strokeRect(9.3 * u, -7 * u, 3.2 * u, 13 * u);
  } else if (dna.turretProfile === "FINNED_STABILIZER") {
    // Swept rear turret counter-weight stabilizer fins
    ctx.beginPath();
    ctx.moveTo(-8 * u, 4 * u);
    ctx.lineTo(-14 * u, 12 * u);
    ctx.lineTo(-7 * u, 10 * u);
    ctx.closePath();
    ctx.moveTo(8 * u, 4 * u);
    ctx.lineTo(14 * u, 12 * u);
    ctx.lineTo(7 * u, 10 * u);
    ctx.closePath();
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
  }

  // Glowing Roof Targeter Optic
  ctx.beginPath();
  ctx.arc(0, -2 * u, 2.3 * u, 0, Math.PI * 2);
  ctx.fillStyle = energy.core;
  ctx.fill();

  ctx.restore();
}

/**
 * 6. High-Precision Destructible Tree Renderer (Supports all 4 TreeKinds + Leonardo Variants)
 */
export function drawLeonardoTree(
  ctx: VectorDrawingContext,
  kind: TreeKind,
  px: number,
  py: number,
  tileSizePx: number,
  scale = 1.0,
  frameNowMs = 0,
  variantOverride?: VectorVariantProposal
): void {
  const activeVariant = variantOverride ?? getActiveTreeVariant(kind);
  const dna = activeVariant.dna;
  const isCustomVariant = activeVariant.variantId !== "v1_classic_mk1";
  const cx = px + tileSizePx * 0.5;
  const cy = py + tileSizePx * 0.5;
  const u = tileSizePx / 32;
  const effScale = scale * u;
  const sway =
    Math.sin(frameNowMs * 0.0022 + px * 0.04 + py * 0.03) * 1.2 * effScale;

  ctx.save();

  // Nursery sapling growth ring if young sapling
  if (scale < 0.95) {
    const growthRatio = Math.max(0.05, Math.min(1, (scale - 0.42) / (1.1 - 0.42)));
    ctx.strokeStyle = "rgba(74, 222, 128, 0.45)";
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(
      cx,
      cy + 2 * u,
      11 * effScale + 3 * u,
      -Math.PI * 0.5,
      -Math.PI * 0.5 + Math.PI * 2 * growthRatio
    );
    ctx.stroke();
  }

  // 1. Soft elliptical ground shadow
  ctx.fillStyle = "rgba(8, 14, 10, 0.45)";
  ctx.beginPath();
  ctx.ellipse(
    cx + 3 * effScale,
    cy + 4 * effScale,
    10 * effScale,
    6 * effScale,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // 2. Trunk
  ctx.fillStyle = isCustomVariant
    ? dna.treeTrunkHex
    : kind === "TREE_CYPRESS"
      ? "#4a3728"
      : "#5c4028";
  ctx.fillRect(cx - 2.2 * effScale, cy - 2 * effScale, 4.4 * effScale, 8 * effScale);

  const colDark = isCustomVariant ? dna.treeSecondaryFoliageHex : "#14532d";
  const colMid = isCustomVariant ? dna.treePrimaryFoliageHex : "#166534";
  const colLight = isCustomVariant ? dna.treeAccentFoliageHex : "#22c55e";

  // 3. Species-specific foliage canopy
  if (kind === "TREE_PINE") {
    const tiers = [
      { yOff: 3, w: 12, h: 11, color: colDark },
      { yOff: -2, w: 9.5, h: 10, color: colMid },
      { yOff: -7, w: 6.5, h: 8.5, color: colLight },
    ];
    if (dna.treeCanopyStyle === "DENSE_MULTI_TIER") {
      tiers.push({ yOff: -11, w: 4.5, h: 6.5, color: colLight });
    }
    for (const tier of tiers) {
      ctx.beginPath();
      ctx.moveTo(cx + sway, cy + (tier.yOff - tier.h) * effScale);
      ctx.lineTo(cx + tier.w * effScale + sway * 0.5, cy + tier.yOff * effScale);
      ctx.lineTo(cx - tier.w * effScale + sway * 0.5, cy + tier.yOff * effScale);
      ctx.closePath();
      ctx.fillStyle = tier.color;
      ctx.fill();
      ctx.strokeStyle = "#052e16";
      ctx.lineWidth = 1 * u;
      ctx.stroke();
    }
  } else if (kind === "TREE_PALM") {
    const crownX = cx + sway;
    const crownY = cy - 4 * effScale;
    const frondCount = dna.treeCanopyStyle === "DENSE_MULTI_TIER" ? 8 : 6;
    ctx.strokeStyle = colMid;
    ctx.lineWidth = 2.6 * effScale;
    ctx.lineCap = "round";
    for (let i = 0; i < frondCount; i++) {
      const ang = (i / frondCount) * Math.PI * 2 + 0.3;
      const tipX = crownX + Math.cos(ang) * 11.5 * effScale;
      const tipY = crownY + Math.sin(ang) * 9.5 * effScale;
      ctx.beginPath();
      ctx.moveTo(crownX, crownY);
      ctx.quadraticCurveTo(
        crownX + Math.cos(ang) * 6 * effScale,
        crownY + Math.sin(ang) * 4 * effScale - 2 * effScale,
        tipX,
        tipY
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(crownX, crownY, 3.2 * effScale, 0, Math.PI * 2);
    ctx.fillStyle = colLight;
    ctx.fill();
  } else if (kind === "TREE_CYPRESS") {
    const tiers: Array<[number, number, number, string]> = [
      [0, -1, 8.5, colDark],
      [-4, 1, 6.2, colMid],
      [4, 1, 6.2, colMid],
      [0, -6.5, 6.5, colMid],
      [0, -10.5, 4.2, colLight],
    ];
    for (const [lx, ly, lr, col] of tiers) {
      ctx.beginPath();
      ctx.ellipse(
        cx + lx * effScale + sway * 0.5,
        cy + ly * effScale,
        lr * effScale,
        lr * 1.15 * effScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = col;
      ctx.fill();
    }
    ctx.strokeStyle = colLight;
    ctx.lineWidth = Math.max(0.9, 1.1 * effScale);
    ctx.beginPath();
    ctx.moveTo(cx - 5 * effScale + sway * 0.5, cy + 1 * effScale);
    ctx.lineTo(cx - 5 * effScale + sway * 0.7, cy + 5.5 * effScale);
    ctx.moveTo(cx + 5 * effScale + sway * 0.5, cy + 1 * effScale);
    ctx.lineTo(cx + 5 * effScale + sway * 0.7, cy + 5.5 * effScale);
    ctx.stroke();
  } else {
    // TREE_OAK
    const lobes: Array<[number, number, number, string]> = [
      [-5, 1, 7.5, colDark],
      [5, 1, 7.5, colMid],
      [0, -4, 8.5, colMid],
      [-2.5, -2, 5.5, colLight],
    ];
    if (dna.treeCanopyStyle === "DENSE_MULTI_TIER") {
      lobes.push([3.5, -5.5, 5.0, colLight]);
    }
    for (const [lx, ly, lr, col] of lobes) {
      ctx.beginPath();
      ctx.arc(cx + lx * effScale + sway * 0.6, cy + ly * effScale, lr * effScale, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }

  // Bioluminescent / Crystal spore nodes when CRYSTAL_MUTATED
  if (dna.treeCanopyStyle === "CRYSTAL_MUTATED") {
    ctx.fillStyle = "#5eead4";
    ctx.beginPath();
    ctx.arc(cx - 3.5 * effScale, cy - 3 * effScale, 1.8 * effScale, 0, Math.PI * 2);
    ctx.arc(cx + 3.5 * effScale, cy - 1.5 * effScale, 1.6 * effScale, 0, Math.PI * 2);
    ctx.arc(cx, cy - 7 * effScale, 2.0 * effScale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

