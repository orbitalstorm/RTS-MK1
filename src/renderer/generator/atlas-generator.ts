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
  drawLeonardoBuildingTurret,
  drawLeonardoExplosionFrame,
  drawLeonardoUnitBody,
  drawLeonardoUnitTurret,
} from "./leonardo-vector-art";

export interface ProceduralSpriteAtlas {
  buildings: Map<string, ImageBitmap>; // key: `${faction}:${buildingKind}`
  buildingTurrets: Map<string, ImageBitmap>; // key: `${faction}:${buildingKind}:${angleIndex}` (16 angles for GUARD_TOWER, SAM_SITE)
  unitBodies: Map<string, ImageBitmap>; // key: `${faction}:${unitKind}:${angleIndex}`
  unitTurrets: Map<string, ImageBitmap>; // key: `${faction}:${unitKind}:${angleIndex}`
  explosionFrames: ImageBitmap[]; // 12 multi-layer vector explosion frames (0..11)
  disposed: boolean;
  dispose: () => void;
}

const ROTATING_DEFENSE_TURRET_KINDS: ReadonlyArray<BuildingKind> = [
  "GUARD_TOWER",
  "SAM_SITE",
];

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

function drawBuildingBitmap(faction: FactionId, kind: BuildingKind): Promise<ImageBitmap> {
  const spec = BUILDING_LIST.find((b) => b.kind === kind)!;
  const w = spec.footprintW * TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const h = spec.footprintH * TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const { surface, ctx } = createSurface(w, h);
  drawLeonardoBuilding(ctx, faction, kind, w, h);
  return surfaceToBitmap(surface);
}

function drawBuildingTurretBitmap(
  faction: FactionId,
  kind: BuildingKind,
  angleIndex: number
): Promise<ImageBitmap> {
  const spec = BUILDING_LIST.find((b) => b.kind === kind)!;
  const w = spec.footprintW * TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const h = spec.footprintH * TILE_PIXEL_SIZE * SPRITE_ATLAS_SCALE;
  const { surface, ctx } = createSurface(w, h);
  drawLeonardoBuildingTurret(ctx, faction, kind, w, h, angleIndex);
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
  drawLeonardoUnitBody(ctx, faction, kind, s, angleIndex);
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
  drawLeonardoUnitTurret(ctx, faction, kind, s, angleIndex);
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
  const buildingTurrets = new Map<string, ImageBitmap>();
  const unitBodies = new Map<string, ImageBitmap>();
  const unitTurrets = new Map<string, ImageBitmap>();
  const explosionFrames: ImageBitmap[] = new Array<ImageBitmap>(12);

  const factions: FactionId[] = ["GDI", "NOD", "ORDOS"];
  const tasks: Array<{ label: string; run: () => Promise<void> }> = [];

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
          if (ROTATING_DEFENSE_TURRET_KINDS.includes(b.kind)) {
            for (let angle = 0; angle < 16; angle++) {
              buildingTurrets.set(
                `${faction}:${b.kind}:${angle}`,
                await drawBuildingTurretBitmap(faction, b.kind, angle)
              );
            }
          }
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
    buildingTurrets,
    unitBodies,
    unitTurrets,
    explosionFrames,
    disposed: false,
    dispose: () => {
      if (atlas.disposed) return;
      atlas.disposed = true;
      for (const bmp of buildings.values()) bmp.close();
      for (const bmp of buildingTurrets.values()) bmp.close();
      for (const bmp of unitBodies.values()) bmp.close();
      for (const bmp of unitTurrets.values()) bmp.close();
      for (const bmp of explosionFrames) {
        if (bmp) bmp.close();
      }
      buildings.clear();
      buildingTurrets.clear();
      unitBodies.clear();
      unitTurrets.clear();
      explosionFrames.length = 0;
    },
  };

  return atlas;
}
