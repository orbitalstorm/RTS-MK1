import {
  BUILDING_LIST,
  SPRITE_ATLAS_SCALE,
  TILE_PIXEL_SIZE,
  UNIT_LIST,
  type BuildingKind,
  type FactionId,
  type UnitKind,
} from "../../shared/constants";
import {
  drawLeonardoBuilding,
  drawLeonardoExplosionFrame,
  drawLeonardoTerrainTile,
  drawLeonardoUnitBody,
  drawLeonardoUnitTurret,
} from "./leonardo-vector-art";

export interface ProceduralSpriteAtlas {
  buildings: Map<string, ImageBitmap>; // key: `${faction}:${buildingKind}`
  unitBodies: Map<string, ImageBitmap>; // key: `${faction}:${unitKind}:${angleIndex}`
  unitTurrets: Map<string, ImageBitmap>; // key: `${faction}:${unitKind}:${angleIndex}`
  terrainTiles: Map<number, ImageBitmap>; // key: 0=sand, 1=rock, 2=ridge, 3=ore
  explosionFrames: ImageBitmap[]; // 12 multi-layer vector explosion frames (0..11)
  disposed: boolean;
  dispose: () => void;
}

type DrawingSurface = OffscreenCanvas | HTMLCanvasElement;
type DrawingContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createSurface(width: number, height: number): {
  surface: DrawingSurface;
  ctx: DrawingContext;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const surface = new OffscreenCanvas(width, height);
    const ctx = surface.getContext("2d");
    if (!ctx) throw new Error("Unable to initialize OffscreenCanvas 2D context");
    return { surface, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to initialize HTMLCanvasElement 2D context");
  return { surface: canvas, ctx };
}

async function surfaceToBitmap(surface: DrawingSurface): Promise<ImageBitmap> {
  if (surface instanceof OffscreenCanvas && typeof surface.transferToImageBitmap === "function") {
    return surface.transferToImageBitmap();
  }
  return await createImageBitmap(surface);
}

function drawTerrainTile(kind: number): Promise<ImageBitmap> {
  const s = TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const { surface, ctx } = createSurface(s, s);
  drawLeonardoTerrainTile(ctx, kind, s);
  return surfaceToBitmap(surface);
}

function drawBuildingBitmap(faction: FactionId, kind: BuildingKind): Promise<ImageBitmap> {
  const spec = BUILDING_LIST.find((b) => b.kind === kind)!;
  const w = spec.footprintW * TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const h = spec.footprintH * TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const { surface, ctx } = createSurface(w, h);
  drawLeonardoBuilding(ctx, faction, kind, w, h);
  return surfaceToBitmap(surface);
}

function drawUnitBodyBitmap(
  faction: FactionId,
  kind: UnitKind,
  angleIndex: number
): Promise<ImageBitmap> {
  const s = TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const { surface, ctx } = createSurface(s, s);
  const cx = s * 0.5;
  const cy = s * 0.5;
  const radians = (angleIndex / 16) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);
  drawLeonardoUnitBody(ctx, faction, kind, s);
  ctx.restore();

  return surfaceToBitmap(surface);
}

function drawUnitTurretBitmap(
  faction: FactionId,
  kind: UnitKind,
  angleIndex: number
): Promise<ImageBitmap> {
  const s = TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const { surface, ctx } = createSurface(s, s);
  const cx = s * 0.5;
  const cy = s * 0.5;
  const radians = (angleIndex / 16) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);
  drawLeonardoUnitTurret(ctx, faction, kind, s);
  ctx.restore();

  return surfaceToBitmap(surface);
}

function drawExplosionFrameBitmap(frameIndex: number, totalFrames: number): Promise<ImageBitmap> {
  const sizePx = TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE * 2;
  const { surface, ctx } = createSurface(sizePx, sizePx);
  drawLeonardoExplosionFrame(ctx, frameIndex, totalFrames, sizePx);
  return surfaceToBitmap(surface);
}

/**
 * Generates the entire hybrid vector/bitmap Sprite Atlas asynchronously in chunks
 * (`requestAnimationFrame`) so the main thread never freezes, reporting live progress `0..100`.
 */
export async function generateProceduralSpriteAtlasAsync(
  onProgress?: (percent: number, stageLabel: string) => void
): Promise<ProceduralSpriteAtlas> {
  const buildings = new Map<string, ImageBitmap>();
  const unitBodies = new Map<string, ImageBitmap>();
  const unitTurrets = new Map<string, ImageBitmap>();
  const terrainTiles = new Map<number, ImageBitmap>();
  const explosionFrames: ImageBitmap[] = new Array<ImageBitmap>(12);

  const factions: FactionId[] = ["GDI", "NOD", "ORDOS"];
  const tasks: Array<{ label: string; run: () => Promise<void> }> = [];

  for (const tKind of [0, 1, 2, 3]) {
    tasks.push({
      label: `Rastérisation tuiles terrain HD (#${tKind})`,
      run: async () => {
        terrainTiles.set(tKind, await drawTerrainTile(tKind));
      },
    });
  }

  tasks.push({
    label: "Rastérisation séquence d'explosions thermiques (12 frames)",
    run: async () => {
      for (let frameIdx = 0; frameIdx < 12; frameIdx++) {
        explosionFrames[frameIdx] = await drawExplosionFrameBitmap(frameIdx, 12);
      }
    },
  });

  for (const faction of factions) {
    for (const b of BUILDING_LIST) {
      tasks.push({
        label: `Atlas Bâtiment ${faction} — ${b.name}`,
        run: async () => {
          buildings.set(`${faction}:${b.kind}`, await drawBuildingBitmap(faction, b.kind));
        },
      });
    }

    for (const u of UNIT_LIST) {
      tasks.push({
        label: `Spritesheet 16-angles ${faction} — ${u.name}`,
        run: async () => {
          for (let angle = 0; angle < 16; angle++) {
            const key = `${faction}:${u.kind}:${angle}`;
            unitBodies.set(key, await drawUnitBodyBitmap(faction, u.kind, angle));
            unitTurrets.set(key, await drawUnitTurretBitmap(faction, u.kind, angle));
          }
        },
      });
    }
  }

  const total = tasks.length;
  const batchSize = 4;

  for (let i = 0; i < total; i += batchSize) {
    const slice = tasks.slice(i, i + batchSize);
    await Promise.all(slice.map((t) => t.run()));
    const pct = Math.min(100, Math.round(((i + slice.length) / total) * 100));
    onProgress?.(pct, slice[slice.length - 1]!.label);

    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  const atlas: ProceduralSpriteAtlas = {
    buildings,
    unitBodies,
    unitTurrets,
    terrainTiles,
    explosionFrames,
    disposed: false,
    dispose: () => {
      if (atlas.disposed) return;
      atlas.disposed = true;
      for (const bmp of buildings.values()) bmp.close();
      for (const bmp of unitBodies.values()) bmp.close();
      for (const bmp of unitTurrets.values()) bmp.close();
      for (const bmp of terrainTiles.values()) bmp.close();
      for (const bmp of explosionFrames) {
        if (bmp) bmp.close();
      }
      buildings.clear();
      unitBodies.clear();
      unitTurrets.clear();
      terrainTiles.clear();
      explosionFrames.length = 0;
    },
  };

  return atlas;
}
