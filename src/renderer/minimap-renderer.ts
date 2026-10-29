import {
  FACTIONS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TERRAIN_KIND,
  TILE_PIXEL_SIZE,
} from "../shared/constants";
import type { EntityState } from "../shared/schemas/deltas";
import type { TacticalCamera } from "./camera";

export interface MinimapRenderInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  radarActive: boolean;
  lowPower: boolean;
  localPlayerId: string;
  terrainGrid: readonly number[];
  oreGrid: readonly number[];
  entities: ReadonlyMap<string, EntityState>;
  exploredCells: ReadonlySet<number>;
  visibleCells: ReadonlySet<number>;
  camera: TacticalCamera;
  nowMs?: number;
}

type MinimapSurface = OffscreenCanvas | HTMLCanvasElement;
type MinimapContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

let cachedMinimapSurface: MinimapSurface | null = null;
let cachedMinimapCtx: MinimapContext | null = null;
let cachedWidth = 0;
let cachedHeight = 0;
let cachedTerrainSig = 0;

let cachedCompositeSurface: MinimapSurface | null = null;
let cachedCompositeCtx: MinimapContext | null = null;
let cachedCompositeWidth = 0;
let cachedCompositeHeight = 0;
let cachedCompositeTerrainSig = 0;
let cachedCompositeOreSig = 0;
let cachedCompositeExploredSize = -1;

function computeTerrainSignature(grid: readonly number[]): number {
  let hash = 2166136261;
  for (let i = 0; i < grid.length; i++) {
    const raw = grid[i] ?? 0;
    const normalized = raw === 3 ? 0 : raw;
    hash ^= normalized;
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function computeOrePresenceSignature(oreGrid: readonly number[]): number {
  let hash = 2166136261;
  for (let i = 0; i < oreGrid.length; i++) {
    if ((oreGrid[i] ?? 0) > 0) {
      hash ^= i;
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash | 0;
}

function createMinimapSurface(
  width: number,
  height: number
): { surface: MinimapSurface; ctx: MinimapContext } | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const surface = new OffscreenCanvas(width, height);
      const ctx = surface.getContext("2d");
      if (ctx) return { surface, ctx };
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) return { surface: canvas, ctx };
    }
  } catch {
    return null;
  }
  return null;
}

function getOrBuildMinimapTerrainCache(
  width: number,
  height: number,
  terrainGrid: readonly number[]
): MinimapSurface | null {
  if (width <= 0 || height <= 0 || terrainGrid.length === 0) {
    return null;
  }

  const sig = computeTerrainSignature(terrainGrid);
  if (
    cachedMinimapSurface !== null &&
    cachedWidth === width &&
    cachedHeight === height &&
    cachedTerrainSig === sig
  ) {
    return cachedMinimapSurface;
  }

  if (!cachedMinimapSurface || !cachedMinimapCtx || cachedWidth !== width || cachedHeight !== height) {
    const created = createMinimapSurface(width, height);
    if (!created) return null;
    cachedMinimapSurface = created.surface;
    cachedMinimapCtx = created.ctx;
  }

  const surface = cachedMinimapSurface;
  const offCtx = cachedMinimapCtx;

  const scaleX = width / MAP_WIDTH_TILES;
  const scaleY = height / MAP_HEIGHT_TILES;
  const cellH = Math.ceil(scaleY);

  offCtx.fillStyle = "#33261a";
  offCtx.fillRect(0, 0, width, height);

  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    const rowOffset = y * MAP_WIDTH_TILES;
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      const idx = rowOffset + x;
      const t = terrainGrid[idx] ?? 0;
      if (t === TERRAIN_KIND.DIRT || t === TERRAIN_KIND.ORE) continue; // Base dirt color already filled (#33261a); dynamic ore drawn in composite layer
      offCtx.fillStyle =
        t === TERRAIN_KIND.GRASS
          ? "#274225"
          : t === TERRAIN_KIND.SILVER_ORE
            ? "#e2e8f0"
            : t === TERRAIN_KIND.CONCRETE_SLAB
              ? "#64748b"
              : t === TERRAIN_KIND.CLIFF
                ? "#475569"
                : "#334155";
      offCtx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), cellH);
    }
  }

  cachedWidth = width;
  cachedHeight = height;
  cachedTerrainSig = sig;
  return surface;
}

function getOrBuildMinimapCompositeCache(
  width: number,
  height: number,
  terrainGrid: readonly number[],
  oreGrid: readonly number[],
  exploredCells: ReadonlySet<number>
): MinimapSurface | null {
  const terrainCache = getOrBuildMinimapTerrainCache(width, height, terrainGrid);
  if (!terrainCache) return null;

  const terrainSig = cachedTerrainSig;
  const oreSig = computeOrePresenceSignature(oreGrid);
  const exploredSize = exploredCells.size;

  if (
    cachedCompositeSurface !== null &&
    cachedCompositeWidth === width &&
    cachedCompositeHeight === height &&
    cachedCompositeTerrainSig === terrainSig &&
    cachedCompositeOreSig === oreSig &&
    cachedCompositeExploredSize === exploredSize
  ) {
    return cachedCompositeSurface;
  }

  if (
    !cachedCompositeSurface ||
    !cachedCompositeCtx ||
    cachedCompositeWidth !== width ||
    cachedCompositeHeight !== height
  ) {
    const created = createMinimapSurface(width, height);
    if (!created) return null;
    cachedCompositeSurface = created.surface;
    cachedCompositeCtx = created.ctx;
  }

  const compCtx = cachedCompositeCtx;
  compCtx.drawImage(terrainCache, 0, 0, width, height);

  const scaleX = width / MAP_WIDTH_TILES;
  const scaleY = height / MAP_HEIGHT_TILES;
  const cellH = Math.ceil(scaleY);
  const hasFog = exploredSize > 0;

  // Horizontal span batching for live ore tiles
  compCtx.fillStyle = "#16a34a";
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    const rowOffset = y * MAP_WIDTH_TILES;
    let spanStart = -1;
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      const idx = rowOffset + x;
      const isVisibleOre = (oreGrid[idx] ?? 0) > 0 && (!hasFog || exploredCells.has(idx));
      if (isVisibleOre) {
        if (spanStart === -1) spanStart = x;
      } else if (spanStart !== -1) {
        compCtx.fillRect(
          spanStart * scaleX,
          y * scaleY,
          Math.ceil((x - spanStart) * scaleX),
          cellH
        );
        spanStart = -1;
      }
    }
    if (spanStart !== -1) {
      compCtx.fillRect(
        spanStart * scaleX,
        y * scaleY,
        Math.ceil((MAP_WIDTH_TILES - spanStart) * scaleX),
        cellH
      );
    }
  }

  // Horizontal span batching for unexplored shroud tiles
  if (hasFog) {
    compCtx.fillStyle = "#070a0f";
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      const rowOffset = y * MAP_WIDTH_TILES;
      let spanStart = -1;
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const idx = rowOffset + x;
        if (!exploredCells.has(idx)) {
          if (spanStart === -1) spanStart = x;
        } else if (spanStart !== -1) {
          compCtx.fillRect(
            spanStart * scaleX,
            y * scaleY,
            Math.ceil((x - spanStart) * scaleX),
            cellH
          );
          spanStart = -1;
        }
      }
      if (spanStart !== -1) {
        compCtx.fillRect(
          spanStart * scaleX,
          y * scaleY,
          Math.ceil((MAP_WIDTH_TILES - spanStart) * scaleX),
          cellH
        );
      }
    }
  }

  cachedCompositeWidth = width;
  cachedCompositeHeight = height;
  cachedCompositeTerrainSig = terrainSig;
  cachedCompositeOreSig = oreSig;
  cachedCompositeExploredSize = exploredSize;
  return cachedCompositeSurface;
}

export function renderMinimapRadar(input: MinimapRenderInput): void {
  const {
    ctx,
    width,
    height,
    radarActive,
    lowPower,
    localPlayerId,
    terrainGrid,
    oreGrid,
    entities,
    exploredCells,
    visibleCells,
    camera,
    nowMs,
  } = input;

  ctx.save();
  ctx.fillStyle = "#070a0f";
  ctx.fillRect(0, 0, width, height);

  if (!radarActive) {
    // Classic C&C offline radar grid display
    ctx.strokeStyle = lowPower ? "rgba(239, 68, 68, 0.25)" : "rgba(56, 189, 248, 0.16)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = lowPower ? "#ef4444" : "#cbd5e1";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      lowPower ? "ÉNERGIE FAIBLE — RADAR COUPÉ" : "DÔME RADAR REQUIS",
      width * 0.5,
      height * 0.5 + 4
    );
    ctx.restore();
    return;
  }

  const scaleX = width / MAP_WIDTH_TILES;
  const scaleY = height / MAP_HEIGHT_TILES;
  const cellW = Math.ceil(scaleX);
  const cellH = Math.ceil(scaleY);

  const compositeCache =
    typeof ctx.drawImage === "function"
      ? getOrBuildMinimapCompositeCache(width, height, terrainGrid, oreGrid, exploredCells)
      : null;

  if (compositeCache) {
    ctx.drawImage(compositeCache, 0, 0, width, height);
  } else {
    // Fallback direct tile fill when OffscreenCanvas is unavailable
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const idx = y * MAP_WIDTH_TILES + x;
        if (exploredCells.size > 0 && !exploredCells.has(idx)) {
          continue;
        }
        const ore = oreGrid[idx] ?? 0;
        const t = terrainGrid[idx] ?? 0;
        if (ore > 0) {
          ctx.fillStyle = "#16a34a";
        } else if (t === TERRAIN_KIND.SILVER_ORE) {
          ctx.fillStyle = "#e2e8f0";
        } else if (t === TERRAIN_KIND.GRASS) {
          ctx.fillStyle = "#274225";
        } else if (t === TERRAIN_KIND.CONCRETE_SLAB) {
          ctx.fillStyle = "#64748b";
        } else if (t === TERRAIN_KIND.CLIFF) {
          ctx.fillStyle = "#475569";
        } else if (t === TERRAIN_KIND.STONE) {
          ctx.fillStyle = "#334155";
        } else {
          ctx.fillStyle = "#33261a";
        }
        ctx.fillRect(x * scaleX, y * scaleY, cellW, cellH);
      }
    }
  }

  // Draw units, buildings & trees blips
  for (const ent of entities.values()) {
    const idx = Math.round(ent.y) * MAP_WIDTH_TILES + Math.round(ent.x);
    if (ent.ownerId !== localPlayerId && exploredCells.size > 0 && !visibleCells.has(idx)) {
      continue;
    }
    if (ent.entityType === "TREE") {
      ctx.fillStyle = "#15803d";
      ctx.fillRect(ent.x * scaleX, ent.y * scaleY, scaleX * 1.2, scaleY * 1.2);
      continue;
    }
    ctx.fillStyle = FACTIONS[ent.faction].primaryColor;
    const blipSize = ent.entityType === "BUILDING" ? scaleX * 2.4 : scaleX * 1.5;
    ctx.fillRect(ent.x * scaleX, ent.y * scaleY, blipSize, blipSize);
  }

  // Subtle animated radar sweep line when radarActive is true
  const timestampMs =
    nowMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
  const sweepY = ((timestampMs * 0.04) % Math.max(1, height));
  ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, sweepY);
  ctx.lineTo(width, sweepY);
  ctx.stroke();

  // Draw camera viewport box
  const camTileX = camera.x / TILE_PIXEL_SIZE;
  const camTileY = camera.y / TILE_PIXEL_SIZE;
  const camTileW = camera.viewportWidth / (camera.zoom * TILE_PIXEL_SIZE);
  const camTileH = camera.viewportHeight / (camera.zoom * TILE_PIXEL_SIZE);

  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    camTileX * scaleX,
    camTileY * scaleY,
    camTileW * scaleX,
    camTileH * scaleY
  );

  ctx.restore();
}
