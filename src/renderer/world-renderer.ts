import {
  BUILDINGS,
  computeTerrainNeighborMask,
  FACTIONS,
  HARVESTER_MAX_LOAD,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  normalizeBaseTerrainKind,
  TERRAIN_KIND,
  TILE_PIXEL_SIZE,
  UNITS,
  UNIT_SPAWN_PROTECTION_TICKS,
  interpolateAngleIndex16,
  type BuildingKind,
  type FactionId,
  type UnitKind,
} from "../shared/constants";
import type {
  EntityState,
  PlayerEconomyDelta,
  ProjectileVisual,
} from "../shared/schemas/deltas";
import type { TacticalCamera } from "./camera";
import type { ProceduralSpriteAtlas } from "./generator/atlas-generator";
import type { BattlefieldVfxManager } from "./vfx-manager";

export interface WorldRenderInput {
  ctx: CanvasRenderingContext2D;
  camera: TacticalCamera;
  atlas: ProceduralSpriteAtlas;
  localPlayerId: string;
  terrainGrid: readonly number[];
  oreGrid: readonly number[];
  prevEntities: ReadonlyMap<string, EntityState>;
  currEntities: ReadonlyMap<string, EntityState>;
  playersEconomy?: ReadonlyMap<string, PlayerEconomyDelta>;
  interpolationAlpha: number; // 0.0 .. 1.0 between tick N-1 and tick N
  selectedIds: ReadonlySet<string>;
  exploredCells: ReadonlySet<number>;
  visibleCells: ReadonlySet<number>;
  projectiles: readonly ProjectileVisual[];
  dragBox: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
  placementPreview: {
    faction: FactionId;
    buildingKind: BuildingKind;
    tileX: number;
    tileY: number;
    valid: boolean;
  } | null;
  vfxManager?: BattlefieldVfxManager;
  nowMs?: number;
  dtSec?: number;
}

export const WORLD_TOTAL_PIXELS_W = MAP_WIDTH_TILES * TILE_PIXEL_SIZE;
export const WORLD_TOTAL_PIXELS_H = MAP_HEIGHT_TILES * TILE_PIXEL_SIZE;

type CacheSurface = OffscreenCanvas | HTMLCanvasElement;
type CacheContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

let cachedTerrainSurface: CacheSurface | null = null;
let cachedTerrainCtx: CacheContext | null = null;
let cachedTerrainAtlas: ProceduralSpriteAtlas | null = null;
let cachedTerrainSignature = 0;
let cachedNormalizedGrid: Int8Array | null = null;

interface StratumPalette {
  fill: string;
  lipShadow: string;
  lipHighlight: string;
  cornerRadiusRatio: number;
  thicknessPx: number;
}

const STRATUM_PALETTES: Record<number, StratumPalette> = {
  [TERRAIN_KIND.DIRT]: {
    fill: "#463525",
    lipShadow: "#281c12",
    lipHighlight: "#614a35",
    cornerRadiusRatio: 0.5,
    thicknessPx: 2.4,
  },
  [TERRAIN_KIND.STONE]: {
    fill: "#333c48",
    lipShadow: "#1d232b",
    lipHighlight: "#4b5869",
    cornerRadiusRatio: 0.5,
    thicknessPx: 1.8,
  },
  [TERRAIN_KIND.CLIFF]: {
    fill: "#1a212b",
    lipShadow: "#090c12",
    lipHighlight: "#64748b",
    cornerRadiusRatio: 0.48,
    thicknessPx: 3.5,
  },
  [TERRAIN_KIND.GRASS]: {
    fill: "#2f4f2d",
    lipShadow: "#1b301a",
    lipHighlight: "#467342",
    cornerRadiusRatio: 0.5,
    thicknessPx: 3.0,
  },
  [TERRAIN_KIND.CONCRETE_SLAB]: {
    fill: "#525e6e",
    lipShadow: "#28303d",
    lipHighlight: "#8292a8",
    cornerRadiusRatio: 0.34,
    thicknessPx: 2.2,
  },
};

function getTerrainVisualPriority(kind: number): number {
  const norm = normalizeBaseTerrainKind(kind);
  if (norm === TERRAIN_KIND.CLIFF) return 5;
  if (norm === TERRAIN_KIND.CONCRETE_SLAB) return 4;
  if (norm === TERRAIN_KIND.GRASS) return 3;
  if (norm === TERRAIN_KIND.DIRT) return 2;
  return 1; // STONE
}

function getStratumPalette(kind: number): StratumPalette {
  const norm = normalizeBaseTerrainKind(kind);
  return STRATUM_PALETTES[norm] ?? STRATUM_PALETTES[TERRAIN_KIND.DIRT]!;
}

function computeBaseTerrainSignature(grid: readonly number[]): number {
  let hash = 2166136261;
  for (let i = 0; i < grid.length; i++) {
    const baseKind = normalizeBaseTerrainKind(grid[i] ?? 0);
    hash ^= baseKind;
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function hashTileCoord(tx: number, ty: number, salt: number): number {
  let h = Math.imul(tx + 374761393, 668265263) ^ Math.imul(ty + 1274126177, 2246822519) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Draws sparse, non-repetitive organic micro-details on unified ground strata:
 * - Darker grass tufts ("touffes d'herbe plus foncées éparses") on GRASS tiles.
 * - Random lighter pebbles ("cailloux plus clairs aléatoires") on DIRT tiles.
 */
function drawSparseOrganicTerrainDetail(
  ctx: CacheContext,
  centerKind: number,
  tx: number,
  ty: number,
  px: number,
  py: number,
  s: number
): void {
  const h0 = hashTileCoord(tx, ty, 0x9e3779b9);

  if (centerKind === TERRAIN_KIND.GRASS) {
    // Sparse darker grass tufts (~42% of grass tiles get 1 or 2 light tufts)
    if ((h0 & 255) > 108) return;
    const tuftCount = (h0 & 255) < 34 ? 2 : 1;
    for (let i = 0; i < tuftCount; i++) {
      const hi = hashTileCoord(tx, ty, 0x517cc1b7 + i * 7919);
      const gx = px + 7 + ((hi & 0xff) / 255) * (s - 14);
      const gy = py + 8 + (((hi >>> 8) & 0xff) / 255) * (s - 15);
      const scale = 0.85 + (((hi >>> 16) & 0x3f) / 63) * 0.4;

      // Subtle base shadow dot
      ctx.fillStyle = "rgba(18, 34, 17, 0.55)";
      ctx.beginPath();
      ctx.ellipse(gx, gy + 0.8, 2.4 * scale, 1.0 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3 delicate darker grass blades fanning upward
      ctx.strokeStyle = (hi & 1) === 0 ? "#1b331a" : "#213c1f";
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(gx - 0.8 * scale, gy + 0.5);
      ctx.lineTo(gx - 2.3 * scale, gy - 2.8 * scale);
      ctx.moveTo(gx, gy + 0.6);
      ctx.lineTo(gx + 0.2 * scale, gy - 3.6 * scale);
      ctx.moveTo(gx + 0.8 * scale, gy + 0.5);
      ctx.lineTo(gx + 2.4 * scale, gy - 2.5 * scale);
      ctx.stroke();
    }
    return;
  }

  if (centerKind === TERRAIN_KIND.DIRT) {
    // Random lighter pebbles on dirt tiles (~48% of dirt tiles get 1 to 3 small pebbles)
    if ((h0 & 255) > 122) return;
    const pebbleCount = (h0 & 255) < 28 ? 3 : (h0 & 255) < 76 ? 2 : 1;
    for (let i = 0; i < pebbleCount; i++) {
      const hi = hashTileCoord(tx, ty, 0x85ebca6b + i * 6151);
      const rx = px + 6.5 + ((hi & 0xff) / 255) * (s - 13);
      const ry = py + 6.5 + (((hi >>> 8) & 0xff) / 255) * (s - 13);
      const radX = 1.2 + (((hi >>> 16) & 0x1f) / 31) * 1.15;
      const radY = radX * (0.68 + (((hi >>> 21) & 0x0f) / 15) * 0.24);
      const rot = (((hi >>> 25) & 0x1f) / 31) * Math.PI;

      // Cast shadow
      ctx.fillStyle = "rgba(22, 15, 9, 0.48)";
      ctx.beginPath();
      ctx.ellipse(rx + 0.7, ry + 0.8, radX, radY, rot, 0, Math.PI * 2);
      ctx.fill();

      // Lighter pebble body
      ctx.fillStyle = (hi & 1) === 0 ? "#6e563e" : "#785f46";
      ctx.beginPath();
      ctx.ellipse(rx, ry, radX, radY, rot, 0, Math.PI * 2);
      ctx.fill();

      // Crisp sunlit NW highlight
      ctx.fillStyle = "#96795b";
      ctx.beginPath();
      ctx.arc(rx - radX * 0.28, ry - radY * 0.28, Math.max(0.55, radX * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function traceRoundedTilePath(
  ctx: CacheContext,
  x: number,
  y: number,
  s: number,
  rTL: number,
  rTR: number,
  rBR: number,
  rBL: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + rTL, y);
  ctx.lineTo(x + s - rTR, y);
  if (rTR > 0) {
    ctx.quadraticCurveTo(x + s, y, x + s, y + rTR);
  }
  ctx.lineTo(x + s, y + s - rBR);
  if (rBR > 0) {
    ctx.quadraticCurveTo(x + s, y + s, x + s - rBR, y + s);
  }
  ctx.lineTo(x + rBL, y + s);
  if (rBL > 0) {
    ctx.quadraticCurveTo(x, y + s, x, y + s - rBL);
  }
  ctx.lineTo(x, y + rTL);
  if (rTL > 0) {
    ctx.quadraticCurveTo(x, y, x + rTL, y);
  }
  ctx.closePath();
}

/**
 * Renders a single tile `(tx, ty)` as part of a continuous, unified geological stratum.
 * - Interior tiles (`mask.isInterior === true`) are filled as a pure solid surface with zero borders or repeated textures.
 * - Zone boundaries (`!sameN/E/S/W`) display stratigraphic thickness lips and rounded organic corners (`quadraticCurveTo`),
 *   revealing the underlying geological layer beneath rounded outer corners.
 */
function drawUnifiedOrganicTerrainCell(
  ctx: CacheContext,
  terrainGrid: readonly number[],
  tx: number,
  ty: number,
  s: number
): void {
  const px = tx * s;
  const py = ty * s;
  const mask = computeTerrainNeighborMask(terrainGrid, tx, ty, MAP_WIDTH_TILES, MAP_HEIGHT_TILES);
  const palette = getStratumPalette(mask.centerKind);

  if (mask.isInterior) {
    ctx.fillStyle = palette.fill;
    ctx.fillRect(px, py, s, s);
    drawSparseOrganicTerrainDetail(ctx, mask.centerKind, tx, ty, px, py, s);
    return;
  }

  // 1. Fill underlying geological stratum beneath rounded outer corners
  const underPalette = getStratumPalette(mask.underlyingKind);
  ctx.fillStyle = underPalette.fill;
  ctx.fillRect(px, py, s, s);

  // Also blend corner background with the exact adjacent neighbor when two neighboring sides share a stratum
  const neighborAt = (nx: number, ny: number): number => {
    const cx = Math.max(0, Math.min(MAP_WIDTH_TILES - 1, nx));
    const cy = Math.max(0, Math.min(MAP_HEIGHT_TILES - 1, ny));
    return normalizeBaseTerrainKind(terrainGrid[cy * MAP_WIDTH_TILES + cx] ?? 0);
  };
  const half = s * 0.5;
  if (mask.roundTL) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx, ty - 1)).fill;
    ctx.fillRect(px, py, half, half);
  }
  if (mask.roundTR) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx, ty - 1)).fill;
    ctx.fillRect(px + half, py, half, half);
  }
  if (mask.roundBR) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx, ty + 1)).fill;
    ctx.fillRect(px + half, py + half, half, half);
  }
  if (mask.roundBL) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx, ty + 1)).fill;
    ctx.fillRect(px, py + half, half, half);
  }

  const r = Math.round(s * palette.cornerRadiusRatio);
  const rTL = mask.roundTL ? r : 0;
  const rTR = mask.roundTR ? r : 0;
  const rBR = mask.roundBR ? r : 0;
  const rBL = mask.roundBL ? r : 0;

  // 2. Main unified stratum fill with rounded organic outer corners
  traceRoundedTilePath(ctx, px, py, s, rTL, rTR, rBR, rBL);
  ctx.fillStyle = palette.fill;
  ctx.fill();

  // 3. Demarcation & Stratigraphic Thickness ONLY along outer zone boundaries
  ctx.save();
  traceRoundedTilePath(ctx, px, py, s, rTL, rTR, rBR, rBL);
  ctx.clip();

  drawSparseOrganicTerrainDetail(ctx, mask.centerKind, tx, ty, px, py, s);

  // Sunlit NW upper rim highlight along North & West zone boundaries
  if (!mask.sameN || !mask.sameW || rTL > 0) {
    ctx.strokeStyle = palette.lipHighlight;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (!mask.sameW) {
      ctx.moveTo(px + 0.8, py + s - rBL);
      ctx.lineTo(px + 0.8, py + rTL);
    }
    if (rTL > 0) {
      ctx.moveTo(px + 0.8, py + rTL);
      ctx.quadraticCurveTo(px + 0.8, py + 0.8, px + rTL, py + 0.8);
    }
    if (!mask.sameN) {
      ctx.moveTo(px + rTL, py + 0.8);
      ctx.lineTo(px + s - rTR, py + 0.8);
    }
    ctx.stroke();
  }

  // Physical layer thickness shadow lip along South & East zone boundaries
  if (!mask.sameS || !mask.sameE || rBR > 0 || rTR > 0 || rBL > 0) {
    ctx.strokeStyle = palette.lipShadow;
    ctx.lineWidth = palette.thicknessPx;
    ctx.beginPath();
    if (!mask.sameE) {
      ctx.moveTo(px + s - 1, py + rTR);
      ctx.lineTo(px + s - 1, py + s - rBR);
    }
    if (rBR > 0) {
      ctx.moveTo(px + s - 1, py + s - rBR);
      ctx.quadraticCurveTo(px + s - 1, py + s - 1, px + s - rBR, py + s - 1);
    }
    if (!mask.sameS) {
      ctx.moveTo(px + s - rBR, py + s - 1);
      ctx.lineTo(px + rBL, py + s - 1);
    }
    if (rTR > 0) {
      ctx.moveTo(px + s - rTR, py + 1);
      ctx.quadraticCurveTo(px + s - 1, py + 1, px + s - 1, py + rTR);
    }
    if (rBL > 0) {
      ctx.moveTo(px + rBL, py + s - 1);
      ctx.quadraticCurveTo(px + 1, py + s - 1, px + 1, py + s - rBL);
    }
    ctx.stroke();
  }

  // Concave inner corner fillets + diagonal inter-layer bridges so layer transitions are diagonal without staircase steps
  const nKind = neighborAt(tx, ty - 1);
  const eKind = neighborAt(tx + 1, ty);
  const sKind = neighborAt(tx, ty + 1);
  const wKind = neighborAt(tx - 1, ty);
  const centerPriority = getTerrainVisualPriority(mask.centerKind);

  // Diagonal bridges when two adjacent cardinal neighbors belong to a higher stratum (eliminates 90° staircase)
  if (nKind === wKind && nKind !== mask.centerKind && getTerrainVisualPriority(nKind) > centerPriority) {
    const bridgePal = getStratumPalette(nKind);
    const br = Math.round(s * bridgePal.cornerRadiusRatio);
    ctx.fillStyle = bridgePal.fill;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + br, py);
    ctx.quadraticCurveTo(px + br * 0.32, py + br * 0.32, px, py + br);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = bridgePal.lipShadow;
    ctx.lineWidth = bridgePal.thicknessPx;
    ctx.beginPath();
    ctx.moveTo(px + br, py);
    ctx.quadraticCurveTo(px + br * 0.32, py + br * 0.32, px, py + br);
    ctx.stroke();
  }
  if (nKind === eKind && nKind !== mask.centerKind && getTerrainVisualPriority(nKind) > centerPriority) {
    const bridgePal = getStratumPalette(nKind);
    const br = Math.round(s * bridgePal.cornerRadiusRatio);
    ctx.fillStyle = bridgePal.fill;
    ctx.beginPath();
    ctx.moveTo(px + s, py);
    ctx.lineTo(px + s - br, py);
    ctx.quadraticCurveTo(px + s - br * 0.32, py + br * 0.32, px + s, py + br);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = bridgePal.lipShadow;
    ctx.lineWidth = bridgePal.thicknessPx;
    ctx.beginPath();
    ctx.moveTo(px + s - br, py);
    ctx.quadraticCurveTo(px + s - br * 0.32, py + br * 0.32, px + s, py + br);
    ctx.stroke();
  }
  if (sKind === eKind && sKind !== mask.centerKind && getTerrainVisualPriority(sKind) > centerPriority) {
    const bridgePal = getStratumPalette(sKind);
    const br = Math.round(s * bridgePal.cornerRadiusRatio);
    ctx.fillStyle = bridgePal.fill;
    ctx.beginPath();
    ctx.moveTo(px + s, py + s);
    ctx.lineTo(px + s - br, py + s);
    ctx.quadraticCurveTo(px + s - br * 0.32, py + s - br * 0.32, px + s, py + s - br);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = bridgePal.lipHighlight;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px + s - br, py + s);
    ctx.quadraticCurveTo(px + s - br * 0.32, py + s - br * 0.32, px + s, py + s - br);
    ctx.stroke();
  }
  if (sKind === wKind && sKind !== mask.centerKind && getTerrainVisualPriority(sKind) > centerPriority) {
    const bridgePal = getStratumPalette(sKind);
    const br = Math.round(s * bridgePal.cornerRadiusRatio);
    ctx.fillStyle = bridgePal.fill;
    ctx.beginPath();
    ctx.moveTo(px, py + s);
    ctx.lineTo(px + br, py + s);
    ctx.quadraticCurveTo(px + br * 0.32, py + s - br * 0.32, px, py + s - br);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = bridgePal.lipShadow;
    ctx.lineWidth = bridgePal.thicknessPx;
    ctx.beginPath();
    ctx.moveTo(px + br, py + s);
    ctx.quadraticCurveTo(px + br * 0.32, py + s - br * 0.32, px, py + s - br);
    ctx.stroke();
  }

  ctx.restore();
}

function getOrBuildStaticTerrainCache(
  atlas: ProceduralSpriteAtlas,
  terrainGrid: readonly number[]
): CacheSurface | null {
  if (atlas.disposed || atlas.terrainTiles.size === 0) {
    return null;
  }

  const sig = computeBaseTerrainSignature(terrainGrid);
  if (
    cachedTerrainSurface !== null &&
    cachedTerrainAtlas === atlas &&
    cachedTerrainSignature === sig
  ) {
    return cachedTerrainSurface;
  }

  let isFreshSurface = false;
  if (!cachedTerrainSurface || !cachedTerrainCtx) {
    isFreshSurface = true;
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        cachedTerrainSurface = new OffscreenCanvas(WORLD_TOTAL_PIXELS_W, WORLD_TOTAL_PIXELS_H);
        cachedTerrainCtx = cachedTerrainSurface.getContext("2d");
      } else if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = WORLD_TOTAL_PIXELS_W;
        canvas.height = WORLD_TOTAL_PIXELS_H;
        cachedTerrainSurface = canvas;
        cachedTerrainCtx = canvas.getContext("2d");
      }
    } catch {
      return null;
    }
  }

  if (!cachedTerrainSurface || !cachedTerrainCtx) {
    return null;
  }

  cachedTerrainCtx.imageSmoothingEnabled = true;
  cachedTerrainCtx.imageSmoothingQuality = "high";

  const s = TILE_PIXEL_SIZE;
  const total = MAP_WIDTH_TILES * MAP_HEIGHT_TILES;

  // Incremental 3x3 neighborhood update when a few tiles degrade or are paved with Concrete Slabs
  if (!isFreshSurface && cachedTerrainAtlas === atlas && cachedNormalizedGrid?.length === total) {
    const dirtyTiles = new Set<number>();
    for (let i = 0; i < total; i++) {
      const norm = normalizeBaseTerrainKind(terrainGrid[i] ?? 0);
      if (cachedNormalizedGrid[i] !== norm) {
        cachedNormalizedGrid[i] = norm;
        const cx = i % MAP_WIDTH_TILES;
        const cy = Math.floor(i / MAP_WIDTH_TILES);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH_TILES && ny < MAP_HEIGHT_TILES) {
              dirtyTiles.add(ny * MAP_WIDTH_TILES + nx);
            }
          }
        }
      }
    }

    if (dirtyTiles.size > 0 && dirtyTiles.size <= 64) {
      for (const idx of dirtyTiles) {
        const tx = idx % MAP_WIDTH_TILES;
        const ty = Math.floor(idx / MAP_WIDTH_TILES);
        drawUnifiedOrganicTerrainCell(cachedTerrainCtx, terrainGrid, tx, ty, s);
      }
      cachedTerrainSignature = sig;
      return cachedTerrainSurface;
    }
  }

  if (!cachedNormalizedGrid || cachedNormalizedGrid.length !== total) {
    cachedNormalizedGrid = new Int8Array(total);
  }
  for (let i = 0; i < total; i++) {
    cachedNormalizedGrid[i] = normalizeBaseTerrainKind(terrainGrid[i] ?? 0);
  }

  for (let ty = 0; ty < MAP_HEIGHT_TILES; ty++) {
    for (let tx = 0; tx < MAP_WIDTH_TILES; tx++) {
      drawUnifiedOrganicTerrainCell(cachedTerrainCtx, terrainGrid, tx, ty, s);
    }
  }

  cachedTerrainAtlas = atlas;
  cachedTerrainSignature = sig;
  return cachedTerrainSurface;
}

export function renderTacticalWorld(input: WorldRenderInput): void {
  const {
    ctx,
    camera,
    atlas,
    localPlayerId,
    terrainGrid,
    oreGrid,
    prevEntities,
    currEntities,
    playersEconomy,
    interpolationAlpha,
    selectedIds,
    exploredCells,
    visibleCells,
    projectiles,
    dragBox,
    placementPreview,
    vfxManager,
    nowMs,
    dtSec,
  } = input;

  const frameNowMs =
    nowMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
  const frameDtSec = dtSec ?? 0.016;

  // Step trauma-based quadratic camera shake
  camera.stepShake(frameDtSec, frameNowMs * 0.001);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = "#06080c";
  ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);

  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(
    -camera.x + camera.shakeOffsetX / camera.zoom,
    -camera.y + camera.shakeOffsetY / camera.zoom
  );

  const bounds = camera.getVisibleTileBounds();
  const s = TILE_PIXEL_SIZE;

  // 1. Draw static terrain from OffscreenCanvas cache in a single blit + dynamic crystalline ore overlay
  const staticTerrainCache = getOrBuildStaticTerrainCache(atlas, terrainGrid);
  if (staticTerrainCache) {
    const srcX = bounds.minX * s;
    const srcY = bounds.minY * s;
    const srcW = (bounds.maxX - bounds.minX + 1) * s;
    const srcH = (bounds.maxY - bounds.minY + 1) * s;
    ctx.drawImage(staticTerrainCache, srcX, srcY, srcW, srcH, srcX, srcY, srcW, srcH);
  }

  const hasFog = exploredCells.size > 0;
  for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
    const rowOffset = ty * MAP_WIDTH_TILES;
    for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
      const idx = rowOffset + tx;
      if (hasFog && !exploredCells.has(idx)) {
        continue;
      }
      if (!staticTerrainCache) {
        drawUnifiedOrganicTerrainCell(ctx, terrainGrid, tx, ty, s);
      }
      const oreAmt = oreGrid[idx] ?? 0;
      if (oreAmt > 0) {
        drawActiveOreFormation(ctx, tx, ty, tx * s, ty * s, s, oreAmt, frameNowMs);
      }
    }
  }

  // 1b. Persistent ground scorch craters + glowing ore nuggets dropped behind Harvesters
  vfxManager?.renderCraters(ctx, frameNowMs, visibleCells, exploredCells, bounds);
  vfxManager?.renderOreNuggets(ctx, frameNowMs, visibleCells, exploredCells, bounds);

  // Build spatial lookup of wall tiles so contiguous walls connect seamlessly into a unified structure
  const wallTileMap = new Map<number, BuildingKind>();
  for (const ent of currEntities.values()) {
    if (
      ent.entityType === "BUILDING" &&
      (ent.kind === "CONCRETE_WALL" || ent.kind === "SANDBAG_WALL")
    ) {
      const wIdx = Math.round(ent.y) * MAP_WIDTH_TILES + Math.round(ent.x);
      wallTileMap.set(wIdx, ent.kind as BuildingKind);
    }
  }

  // 2. Draw buildings & units with linear position + shortest-arc angular interpolation & frustum culling
  const alpha = Math.max(0, Math.min(1.12, interpolationAlpha));
  for (const ent of currEntities.values()) {
    const prev = prevEntities.get(ent.id);
    const interpX = prev ? prev.x + (ent.x - prev.x) * alpha : ent.x;
    const interpY = prev ? prev.y + (ent.y - prev.y) * alpha : ent.y;

    const footW =
      ent.entityType === "BUILDING" ? BUILDINGS[ent.kind as BuildingKind].footprintW : 1;
    const footH =
      ent.entityType === "BUILDING" ? BUILDINGS[ent.kind as BuildingKind].footprintH : 1;

    // Camera viewport frustum culling: skip off-screen entities
    if (
      interpX + footW < bounds.minX - 1 ||
      interpX > bounds.maxX + 1.5 ||
      interpY + footH < bounds.minY - 1 ||
      interpY > bounds.maxY + 1.5
    ) {
      continue;
    }

    const tileIdx = Math.round(interpY) * MAP_WIDTH_TILES + Math.round(interpX);
    const isAllied = ent.ownerId === localPlayerId;
    if (!isAllied && hasFog && !visibleCells.has(tileIdx)) {
      // Enemy units & structures hidden beneath Fog of War / Shroud when outside allied sight
      continue;
    }

    const px = interpX * s;
    const py = interpY * s;

    if (ent.entityType === "BUILDING") {
      const spec = BUILDINGS[ent.kind as BuildingKind];
      const bw = spec.footprintW * s;
      const bh = spec.footprintH * s;
      const isWall = ent.kind === "CONCRETE_WALL" || ent.kind === "SANDBAG_WALL";
      const isSlabSite = ent.kind === "CONCRETE_SLAB";
      const buildProg = ent.buildProgress ?? 1;

      if (isWall) {
        const tx = Math.round(ent.x);
        const ty = Math.round(ent.y);
        const connN =
          ty > 0 && wallTileMap.get((ty - 1) * MAP_WIDTH_TILES + tx) === ent.kind;
        const connE =
          tx < MAP_WIDTH_TILES - 1 &&
          wallTileMap.get(ty * MAP_WIDTH_TILES + (tx + 1)) === ent.kind;
        const connS =
          ty < MAP_HEIGHT_TILES - 1 &&
          wallTileMap.get((ty + 1) * MAP_WIDTH_TILES + tx) === ent.kind;
        const connW =
          tx > 0 && wallTileMap.get(ty * MAP_WIDTH_TILES + (tx - 1)) === ent.kind;

        drawConnectedWallEntity(
          ctx,
          ent,
          px,
          py,
          s,
          connN,
          connE,
          connS,
          connW,
          buildProg
        );
      } else {
        const bmp = atlas.buildings.get(`${ent.faction}:${ent.kind}`);
        if (bmp) {
          ctx.save();
          if (buildProg < 1) {
            ctx.globalAlpha = 0.35 + buildProg * 0.65;
          }
          ctx.drawImage(bmp, px, py, bw, bh);
          ctx.restore();
        }
      }

      if (buildProg < 1) {
        drawConstructionProgressOverlay(ctx, px, py, bw, bh, buildProg, frameNowMs);
      }

      const ownerEcon = playersEconomy?.get(ent.ownerId);
      const storageFillRatio =
        ownerEcon && ownerEcon.maxStorage > 0
          ? Math.max(0, Math.min(1, ownerEcon.credits / ownerEcon.maxStorage))
          : 0.35;

      drawBuildingLiveAnimation(ctx, ent, px, py, bw, bh, frameNowMs, storageFillRatio);

      if (spec.category === "DEFENSE" && !isWall) {
        const turretAngle = prev
          ? interpolateAngleIndex16(prev.turretAngleIndex, ent.turretAngleIndex, alpha)
          : ent.turretAngleIndex;
        drawDefenseTurretActivationOverlay(
          ctx,
          ent,
          px,
          py,
          bw,
          bh,
          turretAngle,
          frameNowMs
        );
      }

      if (ent.hp < ent.maxHp * 0.55) {
        vfxManager?.renderDamageSmoke(ctx, px, py, bw, bh, ent.hp, ent.maxHp, frameNowMs);
      }

      const isSelected = selectedIds.has(ent.id);
      // Do not display health bar for walls or slab sites unless clicked/selected
      if (!isWall && !isSlabSite) {
        drawHealthBar(ctx, px + 4, py - 6, bw - 8, 4, ent.hp, ent.maxHp);
      } else if (isSelected) {
        drawHealthBar(ctx, px + 2, py - 8, bw - 4, 4, ent.hp, ent.maxHp);
        ctx.save();
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(9, 13, 22, 0.88)";
        ctx.fillRect(px - 4, py - 20, bw + 8, 11);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`${Math.ceil(ent.hp)}/${ent.maxHp}`, px + bw * 0.5, py - 12);
        ctx.restore();
      }

      if (isSelected) {
        drawSelectionBracket(ctx, px, py, bw, bh, FACTIONS[ent.faction].primaryColor);
        if (spec.attackRange > 0) {
          drawTacticalRangeCircles(
            ctx,
            px + bw * 0.5,
            py + bh * 0.5,
            spec.attackRange * s,
            spec.detectionRange * s,
            FACTIONS[ent.faction].primaryColor
          );
        }
      }
    } else {
      const unitSpec = UNITS[ent.kind as UnitKind];
      const bodyAngle = prev
        ? interpolateAngleIndex16(prev.angleIndex, ent.angleIndex, alpha)
        : ent.angleIndex;
      const turretAngle = prev
        ? interpolateAngleIndex16(prev.turretAngleIndex, ent.turretAngleIndex, alpha)
        : ent.turretAngleIndex;

      // Imposing Harvester renders at 1.24x tile size so its dump-bed & twin cisterns stand out on the battlefield
      const renderScale = ent.kind === "HARVESTER" ? 1.24 : 1.0;
      const drawS = s * renderScale;
      const drawPx = px - (drawS - s) * 0.5;
      const drawPy = py - (drawS - s) * 0.5;

      const bodyBmp = atlas.unitBodies.get(`${ent.faction}:${ent.kind}:${bodyAngle}`);
      if (bodyBmp) {
        ctx.drawImage(bodyBmp, drawPx, drawPy, drawS, drawS);
      }
      const turretBmp = atlas.unitTurrets.get(`${ent.faction}:${ent.kind}:${turretAngle}`);
      if (turretBmp) {
        ctx.drawImage(turretBmp, drawPx, drawPy, drawS, drawS);
      }

      drawUnitLiveAnimation(ctx, ent, px, py, s, bodyAngle, frameNowMs);

      if (ent.kind === "HARVESTER" && vfxManager) {
        const isMoving =
          ent.stateLabel === "MOVING" ||
          ent.stateLabel === "RETURNING" ||
          (prev !== undefined && Math.hypot(ent.x - prev.x, ent.y - prev.y) > 0.01);
        vfxManager.maybeSpawnHarvesterOreTrail(
          ent.id,
          interpX,
          interpY,
          bodyAngle,
          ent.cargoOre,
          isMoving,
          frameNowMs
        );
      }

      // Spawn protection cooldown shield effect (1s target-immunity ring on newly created units)
      if ((ent.spawnProtectionTicks ?? 0) > 0) {
        const protRatio = Math.max(
          0,
          Math.min(1, (ent.spawnProtectionTicks ?? 0) / UNIT_SPAWN_PROTECTION_TICKS)
        );
        const cx = px + s * 0.5;
        const cy = py + s * 0.5;
        const shieldR = s * 0.46;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, shieldR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, shieldR, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * protRatio);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }

      if (ent.hp < ent.maxHp * 0.55) {
        vfxManager?.renderDamageSmoke(ctx, px, py, s, s, ent.hp, ent.maxHp, frameNowMs);
      }

      drawHealthBar(ctx, px + 4, py - 5, s - 8, 3, ent.hp, ent.maxHp);

      // Harvester ore cargo pips
      if (ent.kind === "HARVESTER" && ent.cargoOre > 0) {
        const pips = Math.min(5, Math.ceil((ent.cargoOre / HARVESTER_MAX_LOAD) * 5));
        ctx.fillStyle = "#22c55e";
        for (let i = 0; i < pips; i++) {
          ctx.fillRect(px + 4 + i * 5, py + s - 4, 4, 3);
        }
      }

      if (selectedIds.has(ent.id)) {
        drawSelectionBracket(ctx, drawPx + 1, drawPy + 1, drawS - 2, drawS - 2, "#22c55e");
        if (unitSpec && unitSpec.attackRange > 0) {
          drawTacticalRangeCircles(
            ctx,
            px + s * 0.5,
            py + s * 0.5,
            unitSpec.attackRange * s,
            unitSpec.detectionRange * s,
            "#22c55e"
          );
        }
      }
    }
  }

  // 3. Draw active weapon projectiles, multi-phase explosions, shockwaves & particles
  if (vfxManager) {
    vfxManager.stepAndRenderEffects(
      ctx,
      atlas,
      frameNowMs,
      frameDtSec,
      visibleCells,
      exploredCells,
      bounds
    );
  } else {
    // Fallback static projectile lines if no BattlefieldVfxManager is provided
    for (const proj of projectiles) {
      const x1 = (proj.fromX + 0.5) * s;
      const y1 = (proj.fromY + 0.5) * s;
      const x2 = (proj.toX + 0.5) * s;
      const y2 = (proj.toY + 0.5) * s;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      if (proj.weaponStyle === "LASER") {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3.2;
      } else if (proj.weaponStyle === "ROCKET") {
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2.2;
      } else {
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x2, y2, proj.weaponStyle === "LASER" ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = proj.weaponStyle === "LASER" ? "#fca5a5" : "#fef08a";
      ctx.fill();
    }
  }

  // 4. Draw building placement grid footprint preview inside the canvas (zero DOM inline styles!)
  if (placementPreview) {
    const spec = BUILDINGS[placementPreview.buildingKind];
    const ghostBmp = atlas.buildings.get(
      `${placementPreview.faction}:${placementPreview.buildingKind}`
    );
    if (ghostBmp) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.drawImage(
        ghostBmp,
        placementPreview.tileX * s,
        placementPreview.tileY * s,
        spec.footprintW * s,
        spec.footprintH * s
      );
      ctx.restore();
    }
    for (let dy = 0; dy < spec.footprintH; dy++) {
      for (let dx = 0; dx < spec.footprintW; dx++) {
        const tx = placementPreview.tileX + dx;
        const ty = placementPreview.tileY + dy;
        ctx.fillStyle = placementPreview.valid
          ? "rgba(34, 197, 94, 0.35)"
          : "rgba(239, 68, 68, 0.42)";
        ctx.fillRect(tx * s, ty * s, s, s);
        ctx.strokeStyle = placementPreview.valid ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx * s + 1, ty * s + 1, s - 2, s - 2);
      }
    }
    if (spec.attackRange > 0) {
      drawTacticalRangeCircles(
        ctx,
        (placementPreview.tileX + spec.footprintW * 0.5) * s,
        (placementPreview.tileY + spec.footprintH * 0.5) * s,
        spec.attackRange * s,
        spec.detectionRange * s,
        placementPreview.valid ? "#22c55e" : "#ef4444"
      );
    }
  }

  // 5. Smooth diagonal Fog of War & Unexplored Shroud (eliminates rectangular staircase effect)
  if (hasFog) {
    renderSmoothFogAndShroud(ctx, bounds, s, exploredCells, visibleCells);
  }

  ctx.restore();

  // 6. Screen-space tactical selection box
  if (dragBox) {
    const x = Math.min(dragBox.startX, dragBox.endX);
    const y = Math.min(dragBox.startY, dragBox.endY);
    const w = Math.abs(dragBox.endX - dragBox.startX);
    const h = Math.abs(dragBox.endY - dragBox.startY);
    ctx.fillStyle = "rgba(34, 197, 94, 0.14)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }
}

/**
 * Renders Fog of War and Unexplored Shroud with diagonal/organic corner rounding and inner-corner
 * diagonal bridges so the boundary of visibility never shows a rectangular staircase effect.
 */
function renderSmoothFogAndShroud(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  s: number,
  exploredCells: ReadonlySet<number>,
  visibleCells: ReadonlySet<number>
): void {
  const r = s * 0.5;

  const renderSmoothMaskPass = (
    isMasked: (tx: number, ty: number) => boolean,
    fillStyle: string
  ): void => {
    ctx.fillStyle = fillStyle;
    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const px = tx * s;
        const py = ty * s;
        const maskedCenter = isMasked(tx, ty);
        const mN = isMasked(tx, ty - 1);
        const mE = isMasked(tx + 1, ty);
        const mS = isMasked(tx, ty + 1);
        const mW = isMasked(tx - 1, ty);

        if (maskedCenter) {
          const rTL = !mN && !mW ? r : 0;
          const rTR = !mN && !mE ? r : 0;
          const rBR = !mS && !mE ? r : 0;
          const rBL = !mS && !mW ? r : 0;
          if (rTL === 0 && rTR === 0 && rBR === 0 && rBL === 0) {
            ctx.fillRect(px, py, s, s);
          } else {
            traceRoundedTilePath(ctx, px, py, s, rTL, rTR, rBR, rBL);
            ctx.fill();
          }
        } else {
          // Clear tile: fill diagonal inner-corner wedges where two adjacent cardinal neighbors are masked
          if (mN && mW) {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + r, py);
            ctx.quadraticCurveTo(px + r * 0.34, py + r * 0.34, px, py + r);
            ctx.closePath();
            ctx.fill();
          }
          if (mN && mE) {
            ctx.beginPath();
            ctx.moveTo(px + s, py);
            ctx.lineTo(px + s - r, py);
            ctx.quadraticCurveTo(px + s - r * 0.34, py + r * 0.34, px + s, py + r);
            ctx.closePath();
            ctx.fill();
          }
          if (mS && mE) {
            ctx.beginPath();
            ctx.moveTo(px + s, py + s);
            ctx.lineTo(px + s - r, py + s);
            ctx.quadraticCurveTo(px + s - r * 0.34, py + s - r * 0.34, px + s, py + s - r);
            ctx.closePath();
            ctx.fill();
          }
          if (mS && mW) {
            ctx.beginPath();
            ctx.moveTo(px, py + s);
            ctx.lineTo(px + r, py + s);
            ctx.quadraticCurveTo(px + r * 0.34, py + s - r * 0.34, px, py + s - r);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  };

  const inBounds = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < MAP_WIDTH_TILES && ty < MAP_HEIGHT_TILES;

  // Pass 1: Fog of War (explored but outside current sight)
  renderSmoothMaskPass((tx, ty) => {
    if (!inBounds(tx, ty)) return true;
    return !visibleCells.has(ty * MAP_WIDTH_TILES + tx);
  }, "rgba(7, 10, 18, 0.56)");

  // Pass 2: Unexplored Shroud (completely undiscovered map area)
  renderSmoothMaskPass((tx, ty) => {
    if (!inBounds(tx, ty)) return true;
    return !exploredCells.has(ty * MAP_WIDTH_TILES + tx);
  }, "#040609");
}

/**
 * Renders diverse procedural crystalline/vein/geode ore formations with an active luminescent glow.
 */
function drawActiveOreFormation(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  px: number,
  py: number,
  s: number,
  oreAmt: number,
  frameNowMs: number
): void {
  const h = hashTileCoord(tx, ty, 0x27d4eb2d);
  const archetype = h & 3; // 4 distinct procedural mineral morphologies
  const richness = Math.max(0.32, Math.min(1, oreAmt / 750));
  const phase = ((h >>> 4) & 0xff) * 0.04;
  const pulse = 0.65 + 0.35 * Math.sin(frameNowMs * 0.0048 + phase);

  const cx = px + s * 0.5 + (((h >>> 12) & 0x0f) / 15 - 0.5) * 4;
  const cy = py + s * 0.5 + (((h >>> 16) & 0x0f) / 15 - 0.5) * 4;

  ctx.save();

  // 1. Active luminescent radial glow showing the energetic nature of the mineral
  const glowR = s * (0.36 + richness * 0.24) * (0.9 + pulse * 0.14);
  const glowGrad = ctx.createRadialGradient(cx, cy, 1.5, cx, cy, glowR);
  glowGrad.addColorStop(0, `rgba(110, 231, 183, ${(0.52 * pulse * richness).toFixed(3)})`);
  glowGrad.addColorStop(0.5, `rgba(16, 185, 129, ${(0.34 * pulse * richness).toFixed(3)})`);
  glowGrad.addColorStop(1, "rgba(5, 150, 105, 0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Diverse crystal clusters & veins based on tile hash
  const shardCount = archetype === 0 ? 6 : archetype === 1 ? 5 : archetype === 2 ? 7 : 4;
  for (let i = 0; i < shardCount; i++) {
    const sh = hashTileCoord(tx, ty, 0x9e3779b9 + i * 4099);
    const baseAngle =
      archetype === 1
        ? ((h & 1) === 0 ? 0.78 : -0.78) + ((sh & 0x1f) / 31 - 0.5) * 0.55
        : (i / shardCount) * Math.PI * 2 + ((sh & 0x1f) / 31) * 0.7;
    const dist =
      archetype === 2
        ? (5.5 + ((sh >>> 5) & 7) * 0.6) * richness
        : (((sh >>> 5) & 0x1f) / 31) * 8.5 * richness;
    const sx = cx + Math.cos(baseAngle) * dist;
    const sy = cy + Math.sin(baseAngle) * dist;
    const len = (4.2 + (((sh >>> 10) & 0x1f) / 31) * 5.2) * richness;
    const wid = 1.8 + (((sh >>> 15) & 0x0f) / 15) * 1.6;
    const tipX = sx + Math.cos(baseAngle) * len;
    const tipY = sy + Math.sin(baseAngle) * len;
    const perpX = -Math.sin(baseAngle) * wid;
    const perpY = Math.cos(baseAngle) * wid;

    // Crystal facet body
    ctx.beginPath();
    ctx.moveTo(sx + perpX, sy + perpY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(sx - perpX, sy - perpY);
    ctx.lineTo(sx - Math.cos(baseAngle) * 1.8, sy - Math.sin(baseAngle) * 1.8);
    ctx.closePath();
    ctx.fillStyle = (sh & 3) === 0 ? "#047857" : (sh & 1) === 0 ? "#10b981" : "#34d399";
    ctx.fill();

    // Glowing crystal tip
    ctx.beginPath();
    ctx.arc(tipX, tipY, 1.1 + pulse * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#ecfdf5";
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renders contiguous CONCRETE_WALL or SANDBAG_WALL segments that join across shared N/E/S/W edges
 * into a single continuous structure without gaps.
 */
function drawConnectedWallEntity(
  ctx: CanvasRenderingContext2D,
  ent: EntityState,
  px: number,
  py: number,
  s: number,
  connN: boolean,
  connE: boolean,
  connS: boolean,
  connW: boolean,
  buildProgress: number
): void {
  const fSpec = FACTIONS[ent.faction];
  const cx = px + s * 0.5;
  const cy = py + s * 0.5;

  ctx.save();
  if (buildProgress < 1) {
    ctx.globalAlpha = 0.4 + buildProgress * 0.6;
  }

  if (ent.kind === "CONCRETE_WALL") {
    const halfThick = 8; // 16px wide continuous armored ferro-concrete wall beam
    const x0 = connW ? px : cx - halfThick;
    const x1 = connE ? px + s : cx + halfThick;
    const y0 = connN ? py : cy - halfThick;
    const y1 = connS ? py + s : cy + halfThick;

    // Ground shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(x0 + 1, y0 + 2, x1 - x0, y1 - cy + halfThick);
    ctx.fillRect(cx - halfThick + 1, y0 + 2, halfThick * 2, y1 - y0);

    // Horizontal & vertical continuous ferro-concrete spans
    ctx.fillStyle = "#475569";
    ctx.fillRect(x0, cy - halfThick, x1 - x0, halfThick * 2);
    ctx.fillRect(cx - halfThick, y0, halfThick * 2, y1 - y0);

    // Raised armored parapet ridge along connected axes
    const innerThick = 4.5;
    const ix0 = connW ? px : cx - innerThick;
    const ix1 = connE ? px + s : cx + innerThick;
    const iy0 = connN ? py : cy - innerThick;
    const iy1 = connS ? py + s : cy + innerThick;

    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(ix0, cy - innerThick, ix1 - ix0, innerThick * 2);
    ctx.fillRect(cx - innerThick, iy0, innerThick * 2, iy1 - iy0);

    // Faction stripe along center line
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(ix0, cy - 1.5, ix1 - ix0, 3);
    ctx.fillRect(cx - 1.5, iy0, 3, iy1 - iy0);

    // Outer dark steel borders ONLY on non-connected edges so connected walls have zero internal seams
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (!connN) {
      ctx.moveTo(x0, cy - halfThick);
      ctx.lineTo(x1, cy - halfThick);
    }
    if (!connS) {
      ctx.moveTo(x0, cy + halfThick);
      ctx.lineTo(x1, cy + halfThick);
    }
    if (!connW) {
      ctx.moveTo(cx - halfThick, y0);
      ctx.lineTo(cx - halfThick, y1);
    }
    if (!connE) {
      ctx.moveTo(cx + halfThick, y0);
      ctx.lineTo(cx + halfThick, y1);
    }
    ctx.stroke();
  } else {
    // SANDBAG_WALL: continuous interlocking sandbag parapet extending to connected edges
    const halfThick = 7.5;
    const x0 = connW ? px : cx - halfThick;
    const x1 = connE ? px + s : cx + halfThick;
    const y0 = connN ? py : cy - halfThick;
    const y1 = connS ? py + s : cy + halfThick;

    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.fillRect(x0 + 1, cy - halfThick + 2, x1 - x0, halfThick * 2);
    ctx.fillRect(cx - halfThick + 1, y0 + 2, halfThick * 2, y1 - y0);

    // Continuous sandbag base course
    ctx.fillStyle = "#a38348";
    ctx.fillRect(x0, cy - halfThick, x1 - x0, halfThick * 2);
    ctx.fillRect(cx - halfThick, y0, halfThick * 2, y1 - y0);

    // Upper course of interlocking sandbags along the connected axes
    ctx.fillStyle = "#d6b87c";
    ctx.strokeStyle = "#5c4622";
    ctx.lineWidth = 1.1;

    const spanW = x1 - x0;
    const bagCountX = Math.max(2, Math.round(spanW / 8));
    const bagW = spanW / bagCountX;
    for (let i = 0; i < bagCountX; i++) {
      ctx.beginPath();
      ctx.ellipse(
        x0 + (i + 0.5) * bagW,
        cy,
        bagW * 0.48,
        halfThick * 0.68,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
    }

    if (connN || connS) {
      const spanH = y1 - y0;
      const bagCountY = Math.max(2, Math.round(spanH / 8));
      const bagH = spanH / bagCountY;
      for (let i = 0; i < bagCountY; i++) {
        ctx.beginPath();
        ctx.ellipse(
          cx,
          y0 + (i + 0.5) * bagH,
          halfThick * 0.68,
          bagH * 0.48,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * Renders scaffolding & a cyan assembly progress bar on floor slabs and walls while a Constructor Bot builds them.
 */
function drawConstructionProgressOverlay(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  bw: number,
  bh: number,
  buildProgress: number,
  frameNowMs: number
): void {
  const pulse = 0.5 + 0.5 * Math.sin(frameNowMs * 0.014);
  ctx.save();
  ctx.strokeStyle = `rgba(56, 189, 248, ${(0.5 + pulse * 0.4).toFixed(2)})`;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(px + 2, py + 2, bw - 4, bh - 4);
  ctx.setLineDash([]);

  // Progress bar at bottom of construction site
  const barW = bw - 6;
  const barX = px + 3;
  const barY = py + bh - 6;
  ctx.fillStyle = "rgba(9, 13, 22, 0.85)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, buildProgress)), 3);
  ctx.restore();
}

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  hp: number,
  maxHp: number
): void {
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
  ctx.fillRect(x, y, width * ratio, height);
}

function drawSelectionBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  const len = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  // Top-right
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  // Bottom-right
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);
  // Bottom-left
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);
  ctx.stroke();
}

/**
 * Renders pre-range activation ("ALERT") & active firing ("ATTACKING") sensor rings,
 * rotating barrel/launcher orientation, and Obelisk crystal pre-charge on defense turrets.
 */
function drawDefenseTurretActivationOverlay(
  ctx: CanvasRenderingContext2D,
  ent: EntityState,
  px: number,
  py: number,
  bw: number,
  bh: number,
  turretAngleIndex: number,
  frameNowMs: number
): void {
  const isAlert = ent.stateLabel === "ALERT";
  const isAttacking = ent.stateLabel === "ATTACKING";
  const cx = px + bw * 0.5;
  const cy = py + bh * 0.5;
  const radians = (turretAngleIndex / 16) * Math.PI * 2;
  const pulse = 0.5 + 0.5 * Math.sin(frameNowMs * 0.012);

  ctx.save();

  // 1. Pre-activation ("ALERT") or active firing ("ATTACKING") perimeter sensor ring & target-lock vector
  if (isAlert || isAttacking) {
    const ringRadius = Math.min(bw, bh) * (0.48 + pulse * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isAttacking ? "rgba(239, 68, 68, 0.85)" : "rgba(245, 158, 11, 0.8)";
    ctx.lineWidth = isAttacking ? 2.0 : 1.6;
    ctx.stroke();

    // Directional target-acquisition laser / sensor lock cone along turretAngleIndex
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(radians);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, -bw * 0.72);
    ctx.strokeStyle = isAttacking ? "rgba(248, 113, 113, 0.75)" : "rgba(56, 189, 248, 0.65)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // 2. Rotating turret weapon mount / Obelisk apex pre-charge
  if (ent.kind === "OBELISK") {
    if (isAlert || isAttacking) {
      const crystalY = py + bh * 0.16;
      const chargeR = (isAttacking ? 9 : 6.5) + pulse * 3.5;
      const grad = ctx.createRadialGradient(cx, crystalY, 1, cx, crystalY, chargeR);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, isAttacking ? "#ef4444" : "#f59e0b");
      grad.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, crystalY, chargeR, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.translate(cx, cy);
    ctx.rotate(radians);
    if (ent.kind === "GUARD_TOWER") {
      // Rotating Twin Vulcan Barrels & Active Sensor Pod
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(-3.2, -bh * 0.42, 2.0, bh * 0.36);
      ctx.fillRect(1.2, -bh * 0.42, 2.0, bh * 0.36);
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isAttacking ? "#ef4444" : isAlert ? "#f59e0b" : "#38bdf8";
      ctx.fill();
    } else if (ent.kind === "SAM_SITE") {
      // Rotating Missile Launcher Pod Orientation Indicator
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(-4.5, -bh * 0.34, 9.0, bh * 0.28);
      ctx.beginPath();
      ctx.arc(0, -bh * 0.34, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = isAttacking ? "#ef4444" : isAlert ? "#f59e0b" : "#38bdf8";
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draws concentric tactical range circles when a combat unit or defense turret is selected or placed:
 * - Inner dashed circle: weapon firing range (`attackRangePx`)
 * - Outer dotted circle: pre-activation / threat detection range (`detectionRangePx`)
 */
function drawTacticalRangeCircles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  attackRangePx: number,
  detectionRangePx: number,
  primaryColor: string
): void {
  ctx.save();

  if (detectionRangePx > attackRangePx + 4) {
    ctx.beginPath();
    ctx.setLineDash([3, 5]);
    ctx.arc(cx, cy, detectionRangePx, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.arc(cx, cy, attackRangePx, 0, Math.PI * 2);
  ctx.strokeStyle = primaryColor;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders live mechanical & luminescent animations on buildings so the battlefield feels alive:
 * - POWER_PLANT: rotating dual turbine rotors & pulsing plasma core
 * - CONSTRUCTION_YARD: articulated swinging crane boom, cable trolley & assembly arc strobe
 * - RADAR_DOME: rotating parabolic dish & 360° cyan radar sweep cone
 * - REFINERY: pulsing smelter blast furnaces, animated ore hopper & unloading dock beacons
 * - TECH_CENTER: rotating quantum particle ring & pulsing cryogenic nodes
 * - BARRACKS / WAR_FACTORY / SILO: sequential runway/muster lights & active repair overlay
 */
function drawBuildingLiveAnimation(
  ctx: CanvasRenderingContext2D,
  ent: EntityState,
  px: number,
  py: number,
  bw: number,
  bh: number,
  frameNowMs: number,
  storageFillRatio = 0.35
): void {
  const cx = px + bw * 0.5;
  const cy = py + bh * 0.5;
  const minDim = Math.min(bw, bh);
  const pulse = 0.5 + 0.5 * Math.sin(frameNowMs * 0.006);

  ctx.save();

  if (ent.kind === "POWER_PLANT") {
    const rOuter = minDim * 0.21;
    const baseSpin = frameNowMs * 0.0042;
    const centers: Array<[number, number]> = [
      [px + bw * 0.31, 1],
      [px + bw * 0.69, -1],
    ];
    for (const [tx, dir] of centers) {
      ctx.save();
      ctx.translate(tx, cy);
      ctx.rotate(baseSpin * dir);

      // Rotating 4-blade turbine rotor
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * rOuter * 0.22, Math.sin(ang) * rOuter * 0.22);
        ctx.lineTo(Math.cos(ang) * rOuter * 0.88, Math.sin(ang) * rOuter * 0.88);
        ctx.stroke();
      }
      ctx.restore();

      // Pulsing cyan plasma core
      ctx.beginPath();
      ctx.arc(tx, cy, rOuter * (0.34 + pulse * 0.14), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${(0.45 + pulse * 0.4).toFixed(2)})`;
      ctx.fill();
    }
  } else if (ent.kind === "CONSTRUCTION_YARD") {
    // Articulated crane boom swinging over the assembly bay
    const pivotX = px + bw * 0.44;
    const pivotY = py + bh * 0.72;
    const swing = Math.sin(frameNowMs * 0.0018) * 0.36;
    const boomLen = minDim * 0.46;
    const tipX = pivotX + Math.cos(-0.82 + swing) * boomLen;
    const tipY = pivotY + Math.sin(-0.82 + swing) * boomLen;

    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Trolley & welding spark at crane tip
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = pulse > 0.65 ? "#e0f2fe" : "#38bdf8";
    ctx.fill();

    // Blinking command telemetry beacon
    ctx.beginPath();
    ctx.arc(px + bw * 0.16, py + bh * 0.12, 2.4 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(56, 189, 248, ${(0.4 + pulse * 0.55).toFixed(2)})`;
    ctx.fill();
  } else if (ent.kind === "RADAR_DOME") {
    // Rotating parabolic dish & 360° cyan radar sweep cone
    const domeR = minDim * 0.3;
    const sweepAngle = (frameNowMs * 0.0028) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweepAngle);

    // Sweeping radar cone
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, domeR * 0.9, -0.35, 0.35);
    ctx.closePath();
    ctx.fillStyle = "rgba(56, 189, 248, 0.28)";
    ctx.fill();

    // Dish cross-axis bar
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-domeR * 0.78, 0);
    ctx.lineTo(domeR * 0.78, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(domeR * 0.55, 0, 2.0, 0, Math.PI * 2);
    ctx.fillStyle = "#e0f2fe";
    ctx.fill();
    ctx.restore();
  } else if (ent.kind === "REFINERY") {
    // Pulsing smelter furnace glow (left towers) & sequential unloading dock beacons
    for (const fy of [py + bh * 0.34, py + bh * 0.66]) {
      const furnaceR = 3.5 + pulse * 3.0;
      const fGrad = ctx.createRadialGradient(
        px + bw * 0.24,
        fy,
        0.8,
        px + bw * 0.24,
        fy,
        furnaceR
      );
      fGrad.addColorStop(0, "#fef08a");
      fGrad.addColorStop(0.5, "#f97316");
      fGrad.addColorStop(1, "rgba(249, 115, 22, 0)");
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(px + bw * 0.24, fy, furnaceR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fill-level dependent luminescent emerald glow on the Refinery ore hopper & storage vat
    const fillClamped = Math.max(0.08, Math.min(1, storageFillRatio));
    const hopperX = px + bw * 0.6;
    const hopperY = py + bh * 0.5;
    const glowR = (7 + fillClamped * 16) * (0.9 + pulse * 0.14);
    const hGrad = ctx.createRadialGradient(hopperX, hopperY, 1.2, hopperX, hopperY, glowR);
    hGrad.addColorStop(0, `rgba(167, 243, 208, ${(0.35 + fillClamped * 0.55).toFixed(3)})`);
    hGrad.addColorStop(0.45, `rgba(16, 185, 129, ${(0.22 + fillClamped * 0.45).toFixed(3)})`);
    hGrad.addColorStop(1, "rgba(5, 150, 105, 0)");
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.arc(hopperX, hopperY, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Sequential amber guide lights on harvester bay
    const activeLight = Math.floor(frameNowMs / 220) % 3;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === activeLight ? "#facc15" : "rgba(234, 179, 8, 0.28)";
      ctx.beginPath();
      ctx.arc(px + bw * 0.88, py + bh * (0.3 + i * 0.2), 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ent.kind === "SILO") {
    // Fill-level dependent luminescent emerald glow & level gauge on Silo
    const fillClamped = Math.max(0.05, Math.min(1, storageFillRatio));
    const siloGlowR = (6 + fillClamped * 14) * (0.9 + pulse * 0.14);
    const sGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, siloGlowR);
    sGrad.addColorStop(0, `rgba(167, 243, 208, ${(0.32 + fillClamped * 0.6).toFixed(3)})`);
    sGrad.addColorStop(0.5, `rgba(16, 185, 129, ${(0.2 + fillClamped * 0.48).toFixed(3)})`);
    sGrad.addColorStop(1, "rgba(5, 150, 105, 0)");
    ctx.fillStyle = sGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, siloGlowR, 0, Math.PI * 2);
    ctx.fill();

    // Dynamic vertical fill bar inside Silo sight-glass
    const gaugeH = bh * 0.48;
    const filledH = gaugeH * fillClamped;
    ctx.fillStyle = "#091526";
    ctx.fillRect(cx - 2.5, cy - gaugeH * 0.5, 5, gaugeH);
    ctx.fillStyle = fillClamped > 0.85 ? "#34d399" : "#10b981";
    ctx.fillRect(cx - 1.6, cy + gaugeH * 0.5 - filledH, 3.2, filledH);
  } else if (ent.kind === "TECH_CENTER") {
    // Rotating quantum ring & pulsing violet/cyan core
    const qR = minDim * 0.22;
    const qAngle = (frameNowMs * 0.0032) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(qAngle);
    ctx.strokeStyle = "#e879f9";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, qR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 3.5 + pulse * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240, 171, 252, ${(0.5 + pulse * 0.45).toFixed(2)})`;
    ctx.fill();
  } else if (ent.kind === "WAR_FACTORY" || ent.kind === "BARRACKS") {
    // Sequential roll-out / muster runway beacon lights
    const step = Math.floor(frameNowMs / 240) % 3;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === step ? "#38bdf8" : "rgba(56, 189, 248, 0.24)";
      ctx.fillRect(px + bw * (0.32 + i * 0.16), py + bh * 0.82, 3, 2);
    }
  }

  // Active Building Repair Overlay (golden/cyan wrench badge + welding sparks)
  if (ent.isRepairing) {
    ctx.strokeStyle = `rgba(56, 189, 248, ${(0.55 + pulse * 0.4).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(px + 2, py + 2, bw - 4, bh - 4);
    ctx.setLineDash([]);

    // Floating repair badge at top-right of structure
    const bx = px + bw - 10;
    const by = py + 10;
    ctx.beginPath();
    ctx.arc(bx, by, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 3.2, by);
    ctx.lineTo(bx + 3.2, by);
    ctx.moveTo(bx, by - 3.2);
    ctx.lineTo(bx, by + 3.2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders subtle live animations on mobile units (vehicle headlights, Harvester cargo glow & plasma cutter, Constructor Bot welding arc, MCV beacon).
 */
function drawUnitLiveAnimation(
  ctx: CanvasRenderingContext2D,
  ent: EntityState,
  px: number,
  py: number,
  s: number,
  bodyAngleIndex: number,
  frameNowMs: number
): void {
  const spec = UNITS[ent.kind as UnitKind];
  if (!spec || spec.category !== "VEHICLE") return;

  const cx = px + s * 0.5;
  const cy = py + s * 0.5;
  const rad = (bodyAngleIndex / 16) * Math.PI * 2;
  const pulse = 0.5 + 0.5 * Math.sin(frameNowMs * 0.01);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);

  // Subtle dual forward headlights (-Y is forward in sprite space)
  ctx.fillStyle = "rgba(254, 240, 138, 0.22)";
  ctx.beginPath();
  ctx.moveTo(-4, -s * 0.34);
  ctx.lineTo(-9, -s * 0.62);
  ctx.lineTo(0, -s * 0.62);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(4, -s * 0.34);
  ctx.lineTo(0, -s * 0.62);
  ctx.lineTo(9, -s * 0.62);
  ctx.closePath();
  ctx.fill();

  if (ent.kind === "HARVESTER") {
    // Dynamic fill-level glow on the Harvester's dump-bed (benne) & side cisterns
    if (ent.cargoOre > 0) {
      const cargoRatio = Math.max(0.15, Math.min(1, ent.cargoOre / HARVESTER_MAX_LOAD));
      const glowR = (5 + cargoRatio * 8) * (0.9 + pulse * 0.15);
      const bGrad = ctx.createRadialGradient(0, 4, 1, 0, 4, glowR);
      bGrad.addColorStop(0, `rgba(167, 243, 208, ${(0.38 + cargoRatio * 0.5).toFixed(3)})`);
      bGrad.addColorStop(0.55, `rgba(16, 185, 129, ${(0.22 + cargoRatio * 0.4).toFixed(3)})`);
      bGrad.addColorStop(1, "rgba(5, 150, 105, 0)");
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(0, 4, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (ent.stateLabel === "HARVESTING") {
      // Oscillating emerald plasma harvesting beam at front crusher drum
      const sweep = Math.sin(frameNowMs * 0.018) * 5.5;
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-5.5, -s * 0.38);
      ctx.lineTo(sweep, -s * 0.58);
      ctx.lineTo(5.5, -s * 0.38);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sweep, -s * 0.58, 2.4 + pulse * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = "#a7f3d0";
      ctx.fill();
    }
  } else if (ent.kind === "CONSTRUCTOR_BOT" && ent.stateLabel === "BUILDING") {
    // Oscillating cyan/amber robotic welding arc while assembling slabs or walls
    const arcX = Math.sin(frameNowMs * 0.024) * 3.5;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-3.5, -s * 0.32);
    ctx.lineTo(arcX, -s * 0.48);
    ctx.lineTo(3.5, -s * 0.32);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(arcX, -s * 0.48, 2.2 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#e0f2fe";
    ctx.fill();
  } else if (ent.kind === "MCV") {
    // Blinking amber command beacon on MCV roof
    ctx.beginPath();
    ctx.arc(0, 2, 2.2 + pulse * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(250, 204, 21, ${(0.45 + pulse * 0.5).toFixed(2)})`;
    ctx.fill();
  }

  ctx.restore();
}
