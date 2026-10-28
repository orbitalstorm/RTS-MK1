import {
  BUILDINGS,
  FACTIONS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE_PIXEL_SIZE,
  interpolateAngleIndex16,
  type BuildingKind,
  type FactionId,
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
let cachedTerrainAtlas: ProceduralSpriteAtlas | null = null;
let cachedTerrainGridRef: readonly number[] | null = null;
let cachedTerrainSignature = 0;

function computeGridSignature(grid: readonly number[]): number {
  let hash = grid.length | 0;
  const step = Math.max(1, Math.floor(grid.length / 64));
  for (let i = 0; i < grid.length; i += step) {
    hash = ((hash << 5) - hash + (grid[i] ?? 0)) | 0;
  }
  return hash;
}

function getOrBuildStaticTerrainCache(
  atlas: ProceduralSpriteAtlas,
  terrainGrid: readonly number[]
): CacheSurface | null {
  if (atlas.disposed || atlas.terrainTiles.size === 0) {
    return null;
  }

  const sig = computeGridSignature(terrainGrid);
  if (
    cachedTerrainSurface !== null &&
    cachedTerrainAtlas === atlas &&
    (cachedTerrainGridRef === terrainGrid || cachedTerrainSignature === sig)
  ) {
    return cachedTerrainSurface;
  }

  let surface: CacheSurface | null = null;
  let ctx: CacheContext | null = null;

  try {
    if (typeof OffscreenCanvas !== "undefined") {
      surface = new OffscreenCanvas(WORLD_TOTAL_PIXELS_W, WORLD_TOTAL_PIXELS_H);
      ctx = surface.getContext("2d");
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = WORLD_TOTAL_PIXELS_W;
      canvas.height = WORLD_TOTAL_PIXELS_H;
      surface = canvas;
      ctx = canvas.getContext("2d");
    }
  } catch {
    return null;
  }

  if (!surface || !ctx) {
    return null;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const s = TILE_PIXEL_SIZE;
  for (let ty = 0; ty < MAP_HEIGHT_TILES; ty++) {
    for (let tx = 0; tx < MAP_WIDTH_TILES; tx++) {
      const idx = ty * MAP_WIDTH_TILES + tx;
      const tKind = terrainGrid[idx] ?? 0;
      const bmp = atlas.terrainTiles.get(tKind);
      if (bmp) {
        ctx.drawImage(bmp, tx * s, ty * s, s, s);
      }
    }
  }

  cachedTerrainSurface = surface;
  cachedTerrainAtlas = atlas;
  cachedTerrainGridRef = terrainGrid;
  cachedTerrainSignature = sig;
  return surface;
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

  for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
    for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
      const idx = ty * MAP_WIDTH_TILES + tx;
      if (!exploredCells.has(idx) && exploredCells.size > 0) {
        continue;
      }
      const tKind = terrainGrid[idx] ?? 0;
      if (!staticTerrainCache) {
        const bmp = atlas.terrainTiles.get(tKind);
        if (bmp) {
          ctx.drawImage(bmp, tx * s, ty * s, s, s);
        }
      }
      const oreAmount = oreGrid[idx] ?? 0;
      if (oreAmount > 0 && tKind !== 3) {
        const oreBmp = atlas.terrainTiles.get(3);
        if (oreBmp) {
          ctx.drawImage(oreBmp, tx * s, ty * s, s, s);
        }
      }
    }
  }

  // 1b. Persistent ground scorch craters beneath buildings & units
  vfxManager?.renderCraters(ctx, frameNowMs, visibleCells, exploredCells);

  // 2. Draw buildings & units with linear position + shortest-arc angular interpolation
  const alpha = Math.max(0, Math.min(1, interpolationAlpha));
  for (const ent of currEntities.values()) {
    const prev = prevEntities.get(ent.id);
    const interpX = prev ? prev.x + (ent.x - prev.x) * alpha : ent.x;
    const interpY = prev ? prev.y + (ent.y - prev.y) * alpha : ent.y;

    const tileIdx = Math.round(interpY) * MAP_WIDTH_TILES + Math.round(interpX);
    const isAllied = ent.ownerId === localPlayerId;
    if (!isAllied && exploredCells.size > 0 && !visibleCells.has(tileIdx)) {
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
      if (ent.hp < ent.maxHp * 0.55) {
        vfxManager?.renderDamageSmoke(ctx, px, py, bw, bh, ent.hp, ent.maxHp, frameNowMs);
      }
      drawHealthBar(ctx, px + 4, py - 6, bw - 8, 4, ent.hp, ent.maxHp);

      if (selectedIds.has(ent.id)) {
        drawSelectionBracket(ctx, px, py, bw, bh, FACTIONS[ent.faction].primaryColor);
      }
    } else {
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
      exploredCells
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
  }

  // 5. Two-layer Fog of War & Shroud overlay
  if (exploredCells.size > 0) {
    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const idx = ty * MAP_WIDTH_TILES + tx;
        if (!exploredCells.has(idx)) {
          // Layer 1: Unexplored Black Shroud
          ctx.fillStyle = "#040609";
          ctx.fillRect(tx * s, ty * s, s, s);
        } else if (!visibleCells.has(idx)) {
          // Layer 2: Explored Grey Fog of War
          ctx.fillStyle = "rgba(7, 10, 18, 0.56)";
          ctx.fillRect(tx * s, ty * s, s, s);
        }
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
