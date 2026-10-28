import {
  BUILDINGS,
  computeTerrainNeighborMask,
  FACTIONS,
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
import type { EntityState, ProjectileVisual } from "../shared/schemas/deltas";
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
    cornerRadiusRatio: 0.36,
    thicknessPx: 2.4,
  },
  [TERRAIN_KIND.STONE]: {
    fill: "#333c48",
    lipShadow: "#1d232b",
    lipHighlight: "#4b5869",
    cornerRadiusRatio: 0.32,
    thicknessPx: 1.8,
  },
  [TERRAIN_KIND.CLIFF]: {
    fill: "#1a212b",
    lipShadow: "#090c12",
    lipHighlight: "#64748b",
    cornerRadiusRatio: 0.3,
    thicknessPx: 3.5,
  },
  [TERRAIN_KIND.GRASS]: {
    fill: "#2f4f2d",
    lipShadow: "#1b301a",
    lipHighlight: "#467342",
    cornerRadiusRatio: 0.38,
    thicknessPx: 3.0,
  },
  [TERRAIN_KIND.CONCRETE_SLAB]: {
    fill: "#525e6e",
    lipShadow: "#28303d",
    lipHighlight: "#8292a8",
    cornerRadiusRatio: 0.18,
    thicknessPx: 2.2,
  },
};

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

  // Concave inner corner fillets so interior bends of a zone are also smoothly rounded
  const innerR = Math.max(4, Math.round(r * 0.45));
  if (mask.concaveTL) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx - 1, ty - 1)).fill;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + innerR, py);
    ctx.quadraticCurveTo(px, py, px, py + innerR);
    ctx.closePath();
    ctx.fill();
  }
  if (mask.concaveTR) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx + 1, ty - 1)).fill;
    ctx.beginPath();
    ctx.moveTo(px + s, py);
    ctx.lineTo(px + s - innerR, py);
    ctx.quadraticCurveTo(px + s, py, px + s, py + innerR);
    ctx.closePath();
    ctx.fill();
  }
  if (mask.concaveBR) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx + 1, ty + 1)).fill;
    ctx.beginPath();
    ctx.moveTo(px + s, py + s);
    ctx.lineTo(px + s - innerR, py + s);
    ctx.quadraticCurveTo(px + s, py + s, px + s, py + s - innerR);
    ctx.closePath();
    ctx.fill();
  }
  if (mask.concaveBL) {
    ctx.fillStyle = getStratumPalette(neighborAt(tx - 1, ty + 1)).fill;
    ctx.beginPath();
    ctx.moveTo(px, py + s);
    ctx.lineTo(px + innerR, py + s);
    ctx.quadraticCurveTo(px, py + s, px, py + s - innerR);
    ctx.closePath();
    ctx.fill();
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

  const oreBmp = atlas.terrainTiles.get(3);
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
      if (oreBmp && (oreGrid[idx] ?? 0) > 0) {
        ctx.drawImage(oreBmp, tx * s, ty * s, s, s);
      }
    }
  }

  // 1b. Persistent ground scorch craters beneath buildings & units
  vfxManager?.renderCraters(ctx, frameNowMs, visibleCells, exploredCells, bounds);

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
      const bmp = atlas.buildings.get(`${ent.faction}:${ent.kind}`);
      if (bmp) {
        ctx.drawImage(bmp, px, py, bw, bh);
      }

      if (spec.category === "DEFENSE") {
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
      drawHealthBar(ctx, px + 4, py - 6, bw - 8, 4, ent.hp, ent.maxHp);

      if (selectedIds.has(ent.id)) {
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

      const bodyBmp = atlas.unitBodies.get(`${ent.faction}:${ent.kind}:${bodyAngle}`);
      if (bodyBmp) {
        ctx.drawImage(bodyBmp, px, py, s, s);
      }
      const turretBmp = atlas.unitTurrets.get(`${ent.faction}:${ent.kind}:${turretAngle}`);
      if (turretBmp) {
        ctx.drawImage(turretBmp, px, py, s, s);
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
        const pips = Math.min(5, Math.ceil((ent.cargoOre / 500) * 5));
        ctx.fillStyle = "#22c55e";
        for (let i = 0; i < pips; i++) {
          ctx.fillRect(px + 4 + i * 5, py + s - 4, 4, 3);
        }
      }

      if (selectedIds.has(ent.id)) {
        drawSelectionBracket(ctx, px + 1, py + 1, s - 2, s - 2, "#22c55e");
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

  // 5. Two-layer Fog of War & Shroud overlay using Horizontal Span Batching (Run-Length Encoding)
  // Batches contiguous horizontal runs of Shroud or Fog into single fillRect calls (~96% fewer draw calls).
  if (hasFog) {
    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      const rowOffset = ty * MAP_WIDTH_TILES;
      let runState = 0; // 0 = clear, 1 = shroud, 2 = fog
      let runStartX = bounds.minX;
      let runLen = 0;

      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const idx = rowOffset + tx;
        const cellState = !exploredCells.has(idx) ? 1 : !visibleCells.has(idx) ? 2 : 0;
        if (cellState === runState) {
          runLen++;
        } else {
          if (runState !== 0 && runLen > 0) {
            ctx.fillStyle = runState === 1 ? "#040609" : "rgba(7, 10, 18, 0.56)";
            ctx.fillRect(runStartX * s, ty * s, runLen * s, s);
          }
          runState = cellState;
          runStartX = tx;
          runLen = 1;
        }
      }

      if (runState !== 0 && runLen > 0) {
        ctx.fillStyle = runState === 1 ? "#040609" : "rgba(7, 10, 18, 0.56)";
        ctx.fillRect(runStartX * s, ty * s, runLen * s, s);
      }
    }
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
