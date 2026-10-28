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

  // Draw terrain & ore
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
      ctx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
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

  // Draw camera viewport box
  const camTileX = camera.x / TILE_PIXEL_SIZE;
  const camTileY = camera.y / TILE_PIXEL_SIZE;
  const camTileW = camera.viewportWidth / ( camera.zoom * TILE_PIXEL_SIZE );
  const camTileH = camera.viewportHeight / ( camera.zoom * TILE_PIXEL_SIZE );

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
