import {
  BUILDING_LIST,
  FACTIONS,
  TILE_PIXEL_SIZE,
  UNIT_LIST,
  type BuildingKind,
  type FactionId,
  type UnitKind,
} from "../../shared/constants";

export interface ProceduralSpriteAtlas {
  buildings: Map<string, ImageBitmap>; // key: `${faction}:${buildingKind}`
  unitBodies: Map<string, ImageBitmap>; // key: `${faction}:${unitKind}:${angleIndex}`
  unitTurrets: Map<string, ImageBitmap>; // key: `${faction}:${unitKind}:${angleIndex}`
  terrainTiles: Map<number, ImageBitmap>; // key: 0=sand, 1=rock, 2=ridge, 3=ore
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
  const { surface, ctx } = createSurface(TILE_PIXEL_SIZE, TILE_PIXEL_SIZE);
  const s = TILE_PIXEL_SIZE;

  if (kind === 0) {
    // Arid tactical desert / sand
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, "#29231a");
    grad.addColorStop(1, "#211c14");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "rgba(255, 215, 140, 0.04)";
    ctx.fillRect(4, 6, 6, 2);
    ctx.fillRect(18, 20, 8, 2);
  } else if (kind === 1) {
    // Rock / concrete foundation plateau
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, "#2c333d");
    grad.addColorStop(1, "#222831");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  } else if (kind === 2) {
    // Impassable tactical canyon ridge
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, "#11141a");
    grad.addColorStop(0.5, "#374151");
    grad.addColorStop(1, "#090b0e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(2, s - 4);
    ctx.lineTo(s * 0.5, 4);
    ctx.lineTo(s - 2, s - 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(75, 85, 99, 0.55)";
    ctx.fill();
  } else {
    // Rich Tiberium / Spice Ore crystalline tile
    ctx.fillStyle = "#242016";
    ctx.fillRect(0, 0, s, s);
    const points = [
      { x: 8, y: 10, r: 4 },
      { x: 22, y: 9, r: 5 },
      { x: 15, y: 20, r: 5.5 },
      { x: 24, y: 23, r: 4 },
    ];
    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x - 1, pt.y - 1, pt.r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#86efac";
      ctx.fill();
    }
  }

  return surfaceToBitmap(surface);
}

function drawBuildingBitmap(faction: FactionId, kind: BuildingKind): Promise<ImageBitmap> {
  const spec = BUILDING_LIST.find((b) => b.kind === kind)!;
  const fSpec = FACTIONS[faction];
  const w = spec.footprintW * TILE_PIXEL_SIZE;
  const h = spec.footprintH * TILE_PIXEL_SIZE;
  const { surface, ctx } = createSurface(w, h);

  // Drop shadow & concrete slab base
  ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
  ctx.fillRect(3, 4, w - 4, h - 4);

  const slabGrad = ctx.createLinearGradient(0, 0, w, h);
  slabGrad.addColorStop(0, "#334155");
  slabGrad.addColorStop(1, "#1e293b");
  ctx.fillStyle = slabGrad;
  ctx.fillRect(2, 2, w - 4, h - 4);

  ctx.strokeStyle = fSpec.primaryColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  // Team color trim corners
  ctx.fillStyle = fSpec.primaryColor;
  ctx.fillRect(3, 3, 10, 4);
  ctx.fillRect(w - 13, 3, 10, 4);
  ctx.fillRect(3, h - 7, 10, 4);
  ctx.fillRect(w - 13, h - 7, 10, 4);

  const cx = w * 0.5;
  const cy = h * 0.5;

  if (kind === "CONSTRUCTION_YARD") {
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(16, 16, w * 0.35, h * 0.35);
    // Crane boom
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(w - 14, 14);
    ctx.stroke();
  } else if (kind === "POWER_PLANT") {
    for (const offset of [-12, 12]) {
      ctx.beginPath();
      ctx.arc(cx + offset, cy, 11, 0, Math.PI * 2);
      ctx.fillStyle = "#0ea5e9";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = fSpec.primaryColor;
      ctx.stroke();
    }
  } else if (kind === "REFINERY") {
    ctx.fillStyle = "#475569";
    ctx.fillRect(8, 8, w * 0.55, h - 16);
    // Unloading dock pad
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(w * 0.62, 10, w * 0.3, h - 20);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(w * 0.66, 14, w * 0.22, h - 28);
  } else if (kind === "SILO") {
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
    ctx.strokeStyle = fSpec.primaryColor;
    ctx.stroke();
  } else if (kind === "BARRACKS") {
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(8, 10, w - 16, h - 20);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(w - 10, cy);
    ctx.lineTo(cx, h - 10);
    ctx.lineTo(10, cy);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "WAR_FACTORY") {
    ctx.fillStyle = "#3f3f46";
    ctx.fillRect(8, 8, w - 16, h - 16);
    // Assembly bay stripes
    ctx.fillStyle = fSpec.primaryColor;
    for (let x = 14; x < w - 18; x += 14) {
      ctx.fillRect(x, 12, 7, h - 24);
    }
  } else if (kind === "RADAR_DOME") {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
  } else if (kind === "TECH_CENTER") {
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#a855f7";
    ctx.fill();
  } else if (kind === "OBELISK") {
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.lineTo(w - 6, h - 5);
    ctx.lineTo(6, h - 5);
    ctx.closePath();
    ctx.fillStyle = "#7f1d1d";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, 8, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
  } else {
    // GUARD_TOWER or SAM_SITE
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(cx - 2, 4, 4, cy);
  }

  return surfaceToBitmap(surface);
}

function drawUnitBodyBitmap(
  faction: FactionId,
  kind: UnitKind,
  angleIndex: number
): Promise<ImageBitmap> {
  const fSpec = FACTIONS[faction];
  const s = TILE_PIXEL_SIZE;
  const { surface, ctx } = createSurface(s, s);
  const cx = s * 0.5;
  const cy = s * 0.5;
  const radians = (angleIndex / 16) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);

  if (kind === "RIFLE_INFANTRY" || kind === "ROCKET_SOLDIER" || kind === "ENGINEER") {
    // 3-soldier squad formation
    const offsets = [
      { x: 0, y: -5 },
      { x: -5, y: 4 },
      { x: 5, y: 4 },
    ];
    for (const pos of offsets) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = fSpec.primaryColor;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else {
    // Tracked / wheeled armored vehicle chassis
    const hullW = kind === "MAMMOTH_TANK" || kind === "HARVESTER" || kind === "MCV" ? 18 : 14;
    const hullH = kind === "MAMMOTH_TANK" || kind === "HARVESTER" || kind === "MCV" ? 22 : 18;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(-hullW * 0.5 + 2, -hullH * 0.5 + 2, hullW, hullH);

    // Treads
    ctx.fillStyle = "#18181b";
    ctx.fillRect(-hullW * 0.5 - 2, -hullH * 0.5 + 1, 3, hullH - 2);
    ctx.fillRect(hullW * 0.5 - 1, -hullH * 0.5 + 1, 3, hullH - 2);

    // Armored hull with team color masking
    ctx.fillStyle = fSpec.secondaryColor;
    ctx.fillRect(-hullW * 0.5, -hullH * 0.5, hullW, hullH);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fillRect(-hullW * 0.5 + 2, -hullH * 0.5 + 2, hullW - 4, hullH - 6);

    if (kind === "HARVESTER") {
      // Harvester ore scoop prongs at front (North = negative Y)
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(-5, -hullH * 0.5 - 3, 10, 4);
    }
  }

  ctx.restore();
  return surfaceToBitmap(surface);
}

function drawUnitTurretBitmap(
  faction: FactionId,
  kind: UnitKind,
  angleIndex: number
): Promise<ImageBitmap> {
  const fSpec = FACTIONS[faction];
  const s = TILE_PIXEL_SIZE;
  const { surface, ctx } = createSurface(s, s);
  const cx = s * 0.5;
  const cy = s * 0.5;
  const radians = (angleIndex / 16) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);

  if (kind === "MEDIUM_TANK" || kind === "MAMMOTH_TANK" || kind === "ARTILLERY" || kind === "RECON_BUGGY") {
    ctx.beginPath();
    ctx.arc(0, 0, kind === "MAMMOTH_TANK" ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = fSpec.primaryColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#e2e8f0";
    if (kind === "MAMMOTH_TANK") {
      // Twin 120mm barrels
      ctx.fillRect(-3.5, -13, 2.2, 10);
      ctx.fillRect(1.3, -13, 2.2, 10);
    } else {
      ctx.fillRect(-1.5, -12, 3, 9);
    }
  }

  ctx.restore();
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

  const factions: FactionId[] = ["GDI", "NOD", "ORDOS"];
  const tasks: Array<{ label: string; run: () => Promise<void> }> = [];

  for (const tKind of [0, 1, 2, 3]) {
    tasks.push({
      label: `Rastérisation tuiles terrain (#${tKind})`,
      run: async () => {
        terrainTiles.set(tKind, await drawTerrainTile(tKind));
      },
    });
  }

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
    disposed: false,
    dispose: () => {
      if (atlas.disposed) return;
      atlas.disposed = true;
      for (const bmp of buildings.values()) bmp.close();
      for (const bmp of unitBodies.values()) bmp.close();
      for (const bmp of unitTurrets.values()) bmp.close();
      for (const bmp of terrainTiles.values()) bmp.close();
      buildings.clear();
      unitBodies.clear();
      unitTurrets.clear();
      terrainTiles.clear();
    },
  };

  return atlas;
}
