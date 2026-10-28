import {
  FACTIONS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
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
let cachedWidth = 0;
let cachedHeight = 0;
let cachedTerrainRef: readonly number[] | null = null;
let cachedTerrainSig = 0;

function computeTerrainSignature(grid: readonly number[]): number {
  let hash = grid.length | 0;
  const step = Math.max(1, Math.floor(grid.length / 64));
  for (let i = 0; i < grid.length; i += step) {
    hash = ((hash << 5) - hash + (grid[i] ?? 0)) | 0;
  }
  return hash;
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
    (cachedTerrainRef === terrainGrid || cachedTerrainSig === sig)
  ) {
    return cachedMinimapSurface;
  }

  let surface: MinimapSurface | null = null;
  let offCtx: MinimapContext | null = null;

  try {
    if (typeof OffscreenCanvas !== "undefined") {
      surface = new OffscreenCanvas(width, height);
      offCtx = surface.getContext("2d");
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      surface = canvas;
      offCtx = canvas.getContext("2d");
    }
  } catch {
    return null;
  }

  if (!surface || !offCtx) {
    return null;
  }

  const scaleX = width / MAP_WIDTH_TILES;
  const scaleY = height / MAP_HEIGHT_TILES;
  const cellW = Math.ceil(scaleX);
  const cellH = Math.ceil(scaleY);

  offCtx.fillStyle = "#1e1b16";
  offCtx.fillRect(0, 0, width, height);

  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      const idx = y * MAP_WIDTH_TILES + x;
      const t = terrainGrid[idx] ?? 0;
      if (t === 0) continue; // Already filled with #1e1b16 base sand color
      if (t === 2) {
        offCtx.fillStyle = "#475569";
      } else if (t === 1) {
        offCtx.fillStyle = "#334155";
      } else {
        offCtx.fillStyle = "#16a34a";
      }
      offCtx.fillRect(x * scaleX, y * scaleY, cellW, cellH);
    }
  }

  cachedMinimapSurface = surface;
  cachedWidth = width;
  cachedHeight = height;
  cachedTerrainRef = terrainGrid;
  cachedTerrainSig = sig;
  return surface;
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

    ctx.fillStyle = lowPower ? "#ef4444" : "#94a3b8";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      lowPower ? "ÉNERGIE FAIBLE — RADAR COUPÉ" : "DÔME RADAR REQUIS",
      width * 0.5,
      height * 0.5
    );
    ctx.restore();
    return;
  }

  const scaleX = width / MAP_WIDTH_TILES;
  const scaleY = height / MAP_HEIGHT_TILES;
  const cellW = Math.ceil(scaleX);
  const cellH = Math.ceil(scaleY);

  const terrainCache =
    typeof ctx.drawImage === "function"
      ? getOrBuildMinimapTerrainCache(width, height, terrainGrid)
      : null;

  if (terrainCache) {
    ctx.drawImage(terrainCache, 0, 0, width, height);

    // Overlay dynamic ore & shroud masking
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const idx = y * MAP_WIDTH_TILES + x;
        if (exploredCells.size > 0 && !exploredCells.has(idx)) {
          ctx.fillStyle = "#070a0f";
          ctx.fillRect(x * scaleX, y * scaleY, cellW, cellH);
          continue;
        }
        const ore = oreGrid[idx] ?? 0;
        if (ore > 0) {
          ctx.fillStyle = "#16a34a";
          ctx.fillRect(x * scaleX, y * scaleY, cellW, cellH);
        }
      }
    }
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
        } else if (t === 2) {
          ctx.fillStyle = "#475569";
        } else if (t === 1) {
          ctx.fillStyle = "#334155";
        } else {
          ctx.fillStyle = "#1e1b16";
        }
        ctx.fillRect(x * scaleX, y * scaleY, cellW, cellH);
      }
    }
  }

  // Draw units & buildings blips
  for (const ent of entities.values()) {
    const idx = Math.round(ent.y) * MAP_WIDTH_TILES + Math.round(ent.x);
    if (ent.ownerId !== localPlayerId && exploredCells.size > 0 && !visibleCells.has(idx)) {
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
