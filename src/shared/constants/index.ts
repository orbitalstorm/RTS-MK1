export type FactionId = "GDI" | "NOD" | "ORDOS";
export type ProductionCategory = "BUILDING" | "DEFENSE" | "INFANTRY" | "VEHICLE";

export type BuildingKind =
  | "CONSTRUCTION_YARD"
  | "POWER_PLANT"
  | "REFINERY"
  | "SILO"
  | "BARRACKS"
  | "WAR_FACTORY"
  | "RADAR_DOME"
  | "TECH_CENTER"
  | "CONCRETE_SLAB"
  | "SANDBAG_WALL"
  | "CONCRETE_WALL"
  | "GUARD_TOWER"
  | "SAM_SITE"
  | "OBELISK";

export type UnitKind =
  | "RIFLE_INFANTRY"
  | "ROCKET_SOLDIER"
  | "ENGINEER"
  | "CONSTRUCTOR_BOT"
  | "HARVESTER"
  | "RECON_BUGGY"
  | "MEDIUM_TANK"
  | "ARTILLERY"
  | "MAMMOTH_TANK"
  | "MCV";

export interface FactionSpec {
  id: FactionId;
  name: string;
  motto: string;
  primaryColor: string;
  secondaryColor: string;
  accentClass: string;
  badgeClass: string;
  armorBonus: number;
  speedBonus: number;
  harvestBonus: number;
}

export interface BuildingSpec {
  kind: BuildingKind;
  name: string;
  category: "BUILDING" | "DEFENSE";
  cost: number;
  buildTimeTicks: number;
  maxHp: number;
  powerDelta: number; // positive = produces power, negative = consumes power
  sightRadius: number;
  footprintW: number;
  footprintH: number;
  storageCapacity: number;
  detectionRange: number; // pre-activation / target-lock range (>= attackRange)
  attackRange: number;
  attackDamage: number;
  attackCooldownTicks: number;
  prerequisites: BuildingKind[];
  description: string;
}

export interface UnitSpec {
  kind: UnitKind;
  name: string;
  category: "INFANTRY" | "VEHICLE";
  cost: number;
  buildTimeTicks: number;
  maxHp: number;
  speedTilesPerTick: number;
  sightRadius: number;
  detectionRange: number; // threat acquisition range (>= attackRange)
  attackRange: number;
  attackDamage: number;
  attackCooldownTicks: number;
  harvestCapacity: number;
  prerequisites: BuildingKind[];
  description: string;
}

export const APP_VERSION = "1.7.0";
export const SIM_TICK_RATE_HZ = 20;
export const SIM_TICK_MS = 50;
export const MAP_WIDTH_TILES = 72;
export const MAP_HEIGHT_TILES = 72;
export const TILE_PIXEL_SIZE = 32;
export const SPRITE_ATLAS_SCALE = 2; // 64px per tile internal vector rasterization for crisp 2x zoom
export const BASE_BUILD_RADIUS_TILES = 18;
export const AI_ATTACK_GRACE_PERIOD_SECONDS = 120; // 2 minutes opening grace period before any enemy AI attack
export const AI_ATTACK_GRACE_PERIOD_TICKS = AI_ATTACK_GRACE_PERIOD_SECONDS * SIM_TICK_RATE_HZ; // 2400 ticks
export const UNIT_SPAWN_PROTECTION_TICKS = 20; // 1.0s (20 ticks at 20 Hz) spawn protection cooldown during which a newly created unit cannot be targeted
export const BUILDING_REPAIR_HP_PER_TICK = 10;
export const BUILDING_REPAIR_COST_PER_TICK = 2;

export function isRepeatableBuildingKind(kind: BuildingKind): boolean {
  return (
    kind === "CONCRETE_SLAB" ||
    kind === "SANDBAG_WALL" ||
    kind === "CONCRETE_WALL"
  );
}

/**
 * Returns the number of simulation ticks required for a Constructor Bot to assemble
 * a floor slab or defensive wall/sandbag on site.
 */
export function getTimedConstructionTicks(kind: BuildingKind): number {
  if (kind === "CONCRETE_SLAB") return 16; // 0.8s per slab
  if (kind === "SANDBAG_WALL") return 20; // 1.0s per sandbag
  if (kind === "CONCRETE_WALL") return 28; // 1.4s per heavy wall
  return 0;
}

/**
 * Returns true if the building requires a solid Stone or Concrete Slab foundation
 * on every tile under its footprint.
 * Standard buildings and defensive turrets require Stone/Concrete; slabs and walls can be placed on Dirt/Grass/Stone/Concrete.
 */
export function requiresStoneOrConcreteFoundation(kind: BuildingKind): boolean {
  return !isRepeatableBuildingKind(kind);
}

/**
 * Returns true if `rawKind` is a valid load-bearing foundation (Stone or Concrete Slab).
 */
export function isFoundationTerrainKind(rawKind: number): boolean {
  return rawKind === TERRAIN_KIND.STONE || rawKind === TERRAIN_KIND.CONCRETE_SLAB;
}

export const TERRAIN_KIND = {
  DIRT: 0, // Terre / Sol aride (sous l'herbe)
  STONE: 1, // Pierre / Socle rocheux (sous la terre)
  CLIFF: 2, // Falaise / Crête infranchissable
  ORE: 3, // Gisement de minerai
  GRASS: 4, // Herbe / Prairie naturelle (couche superficielle organique)
  CONCRETE_SLAB: 5, // Dalle de béton armé posée par le joueur
} as const;
export type TerrainKindCode = (typeof TERRAIN_KIND)[keyof typeof TERRAIN_KIND];

export interface TerrainNeighborMask {
  centerKind: number;
  underlyingKind: number;
  sameN: boolean;
  sameE: boolean;
  sameS: boolean;
  sameW: boolean;
  sameNE: boolean;
  sameSE: boolean;
  sameSW: boolean;
  sameNW: boolean;
  roundTL: boolean;
  roundTR: boolean;
  roundBR: boolean;
  roundBL: boolean;
  concaveTL: boolean;
  concaveTR: boolean;
  concaveBR: boolean;
  concaveBL: boolean;
  isInterior: boolean;
}

/**
 * Normalizes a terrainGrid code for base-ground rendering: dynamic ore (3) rests on a dirt/earth (0) bed.
 */
export function normalizeBaseTerrainKind(rawKind: number): number {
  return rawKind === TERRAIN_KIND.ORE ? TERRAIN_KIND.DIRT : rawKind;
}

/**
 * Returns the geological stratum directly underneath `kind`.
 * Grass (4) -> Dirt (0) -> Stone (1). Concrete Slab (5) -> Stone (1).
 */
export function getUnderlyingTerrainKind(kind: number): number {
  const norm = normalizeBaseTerrainKind(kind);
  if (norm === TERRAIN_KIND.GRASS) return TERRAIN_KIND.DIRT;
  if (norm === TERRAIN_KIND.DIRT) return TERRAIN_KIND.STONE;
  if (norm === TERRAIN_KIND.CONCRETE_SLAB) return TERRAIN_KIND.STONE;
  return TERRAIN_KIND.STONE;
}

/**
 * Returns the layer thickness (impact wear threshold) before a terrain layer deteriorates into the underlying stratum.
 */
export function getTerrainLayerThickness(kind: number): number {
  if (kind === TERRAIN_KIND.GRASS) return 1;
  if (kind === TERRAIN_KIND.DIRT) return 2;
  if (kind === TERRAIN_KIND.CONCRETE_SLAB) return 3;
  return Infinity;
}

/**
 * Deteriorates a terrain layer by one geological step when blasted by projectiles:
 * Grass (4) -> Dirt (0) -> Stone (1). Concrete Slab (5) -> Stone (1).
 */
export function degradeTerrainLayer(currentKind: number): number {
  if (currentKind === TERRAIN_KIND.GRASS) return TERRAIN_KIND.DIRT;
  if (currentKind === TERRAIN_KIND.DIRT) return TERRAIN_KIND.STONE;
  if (currentKind === TERRAIN_KIND.CONCRETE_SLAB) return TERRAIN_KIND.STONE;
  return currentKind;
}

/**
 * Computes the 8-neighbor auto-tiling & organic corner rounding mask for tile `(tx, ty)`.
 * Identical neighboring tiles share `same* = true` so no internal borders or seams are drawn inside a contiguous zone,
 * while outer corners (`!sameA && !sameB`) are rounded organically.
 */
export function computeTerrainNeighborMask(
  terrainGrid: readonly number[],
  tx: number,
  ty: number,
  width = MAP_WIDTH_TILES,
  height = MAP_HEIGHT_TILES
): TerrainNeighborMask {
  const centerKind = normalizeBaseTerrainKind(terrainGrid[ty * width + tx] ?? 0);
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return centerKind;
    return normalizeBaseTerrainKind(terrainGrid[y * width + x] ?? 0);
  };

  const n = at(tx, ty - 1);
  const e = at(tx + 1, ty);
  const s = at(tx, ty + 1);
  const w = at(tx - 1, ty);
  const ne = at(tx + 1, ty - 1);
  const se = at(tx + 1, ty + 1);
  const sw = at(tx - 1, ty + 1);
  const nw = at(tx - 1, ty - 1);

  const sameN = n === centerKind;
  const sameE = e === centerKind;
  const sameS = s === centerKind;
  const sameW = w === centerKind;
  const sameNE = ne === centerKind;
  const sameSE = se === centerKind;
  const sameSW = sw === centerKind;
  const sameNW = nw === centerKind;

  const roundTL = !sameN && !sameW;
  const roundTR = !sameN && !sameE;
  const roundBR = !sameS && !sameE;
  const roundBL = !sameS && !sameW;

  const concaveTL = sameN && sameW && !sameNW;
  const concaveTR = sameN && sameE && !sameNE;
  const concaveBR = sameS && sameE && !sameSE;
  const concaveBL = sameS && sameW && !sameSW;

  const isInterior =
    sameN && sameE && sameS && sameW && sameNE && sameSE && sameSW && sameNW;

  return {
    centerKind,
    underlyingKind: getUnderlyingTerrainKind(centerKind),
    sameN,
    sameE,
    sameS,
    sameW,
    sameNE,
    sameSE,
    sameSW,
    sameNW,
    roundTL,
    roundTR,
    roundBR,
    roundBL,
    concaveTL,
    concaveTR,
    concaveBR,
    concaveBL,
    isInterior,
  };
}
export const ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const EDGE_SCROLL_MARGIN_PX = 36;
export const EDGE_SCROLL_MAX_SPEED_PX = 3.2;
export const CAMERA_SHAKE_MAX_OFFSET_PX = 14;
export const CAMERA_SHAKE_DECAY_PER_SEC = 2.6;
export const CAMERA_SHAKE_FALLOFF_TILES = 22;

export const TOUCH_INTERACTION_MODES = ["AUTO", "PAN", "SELECT", "COMMAND"] as const;
export type TouchInteractionMode = (typeof TOUCH_INTERACTION_MODES)[number];
export const TOUCH_TAP_MAX_DISTANCE_PX = 14;

export interface TouchTapResolutionInput {
  mode: TouchInteractionMode;
  hasPlacementBuilding: boolean;
  sellMode: boolean;
  repairMode?: boolean;
  forceAttackMode?: boolean;
  tappedOwnUnitId: string | null;
  tappedOwnBuildingId: string | null;
  tappedEnemyEntityId: string | null;
  selectedUnitCount: number;
}

export type TouchTapResolvedAction =
  | "PLACE_BUILDING"
  | "SELL_BUILDING"
  | "REPAIR_BUILDING"
  | "SELECT_ENTITY"
  | "ATTACK_ENEMY"
  | "ATTACK_GROUND"
  | "MOVE_UNITS"
  | "CLEAR_SELECTION"
  | "NONE";

/**
 * Pure deterministic decision function for mobile touch taps on the tactical canvas.
 * Allows effortless 1-tap unit selection, movement, attack, force-attack ground, building placement, repair, and selling.
 */
export function resolveTouchTapAction(input: TouchTapResolutionInput): TouchTapResolvedAction {
  if (input.hasPlacementBuilding) {
    return "PLACE_BUILDING";
  }
  if (input.sellMode) {
    return input.tappedOwnBuildingId ? "SELL_BUILDING" : "NONE";
  }
  if (input.repairMode) {
    return input.tappedOwnBuildingId ? "REPAIR_BUILDING" : "NONE";
  }
  if (input.forceAttackMode) {
    return input.selectedUnitCount > 0 ? "ATTACK_GROUND" : "NONE";
  }

  if (input.mode === "COMMAND") {
    if (input.selectedUnitCount <= 0) {
      return input.tappedOwnUnitId ? "SELECT_ENTITY" : "NONE";
    }
    return input.tappedEnemyEntityId ? "ATTACK_ENEMY" : "MOVE_UNITS";
  }

  if (input.mode === "SELECT") {
    if (input.tappedOwnUnitId || input.tappedOwnBuildingId) {
      return "SELECT_ENTITY";
    }
    return "CLEAR_SELECTION";
  }

  // "AUTO" or "PAN" mode: tap friendly unit -> select it; if units already selected -> tap enemy to attack or ground to move
  if (input.tappedOwnUnitId) {
    return "SELECT_ENTITY";
  }
  if (input.selectedUnitCount > 0) {
    if (input.tappedEnemyEntityId) {
      return "ATTACK_ENEMY";
    }
    return "MOVE_UNITS";
  }
  if (input.tappedOwnBuildingId) {
    return "SELECT_ENTITY";
  }
  return "NONE";
}

/**
 * Pure deterministic trauma-based camera shake calculation (quadratic trauma^2 model).
 * Produces high-frequency damped harmonic displacement without permanent camera drift.
 */
export function computeCameraShakeOffset(
  trauma: number,
  elapsedSec: number,
  maxOffsetPx = CAMERA_SHAKE_MAX_OFFSET_PX
): { offsetX: number; offsetY: number } {
  const clamped = Math.max(0, Math.min(1, trauma));
  if (clamped <= 0.001) {
    return { offsetX: 0, offsetY: 0 };
  }
  const intensity = clamped * clamped * maxOffsetPx;
  const waveX =
    Math.sin(elapsedSec * 53.0) * 0.62 +
    Math.cos(elapsedSec * 89.0 + 1.3) * 0.38;
  const waveY =
    Math.cos(elapsedSec * 61.0 + 0.7) * 0.62 +
    Math.sin(elapsedSec * 97.0 + 2.1) * 0.38;
  return {
    offsetX: Number((intensity * waveX).toFixed(3)),
    offsetY: Number((intensity * waveY).toFixed(3)),
  };
}

/**
 * Distance-attenuated camera trauma contribution when an explosion or heavy weapon
 * fires at `(eventTileX, eventTileY)` relative to `(cameraCenterTileX, cameraCenterTileY)`.
 */
export function computeDistanceAttenuatedShakeTrauma(
  baseIntensity: number,
  eventTileX: number,
  eventTileY: number,
  cameraCenterTileX: number,
  cameraCenterTileY: number,
  falloffTiles = CAMERA_SHAKE_FALLOFF_TILES
): number {
  if (baseIntensity <= 0) return 0;
  const dist = Math.hypot(eventTileX - cameraCenterTileX, eventTileY - cameraCenterTileY);
  if (dist >= falloffTiles) return 0;
  const attenuation = 1 - dist / falloffTiles;
  return Number(Math.max(0, Math.min(1, baseIntensity * (0.35 + 0.65 * attenuation))).toFixed(3));
}

/**
 * Shortest-arc interpolation across the 16 discrete orientation indices (0..15)
 * so rotating chassis and turrets never flip backwards when crossing North (15 -> 0).
 */
export function interpolateAngleIndex16(
  prevAngleIndex: number,
  currAngleIndex: number,
  alpha: number
): number {
  const t = Math.max(0, Math.min(1, alpha));
  let diff = ((currAngleIndex - prevAngleIndex + 24) % 16) - 8;
  if (diff === -8) diff = 8;
  const interp = (prevAngleIndex + diff * t + 16) % 16;
  return Math.round(interp) % 16;
}

export interface EntityPose {
  x: number;
  y: number;
  angleIndex: number;
  turretAngleIndex: number;
}

/**
 * Computes C0-continuous interpolated entity pose at sub-tick factor `alpha` (0..1).
 * Used both for 60+ FPS rendering and to capture the exact visual pose when a new
 * 20 Hz network tick arrives so units never jump or rubberband on packet jitter.
 */
export function interpolateEntityPose(
  prev: EntityPose,
  curr: EntityPose,
  alpha: number
): EntityPose {
  if (Math.hypot(curr.x - prev.x, curr.y - prev.y) >= 3.5) {
    return {
      x: curr.x,
      y: curr.y,
      angleIndex: curr.angleIndex,
      turretAngleIndex: curr.turretAngleIndex,
    };
  }
  const t = Math.max(0, Math.min(1, alpha));
  return {
    x: Number((prev.x + (curr.x - prev.x) * t).toFixed(4)),
    y: Number((prev.y + (curr.y - prev.y) * t).toFixed(4)),
    angleIndex: interpolateAngleIndex16(prev.angleIndex, curr.angleIndex, t),
    turretAngleIndex: interpolateAngleIndex16(prev.turretAngleIndex, curr.turretAngleIndex, t),
  };
}

/**
 * Pure deterministic edge-scroll velocity calculation with quadratic easing
 * so camera panning near screen borders is progressive and never violent.
 */
export function computeEdgeScrollVelocity(
  cursorX: number,
  cursorY: number,
  viewportW: number,
  viewportH: number,
  marginPx = EDGE_SCROLL_MARGIN_PX,
  maxSpeedPx = EDGE_SCROLL_MAX_SPEED_PX
): { vx: number; vy: number } {
  let vx = 0;
  let vy = 0;

  if (cursorX >= 0 && cursorX < marginPx) {
    const t = (marginPx - cursorX) / marginPx;
    vx = -Number((t * t * maxSpeedPx).toFixed(3));
  } else if (cursorX <= viewportW && cursorX > viewportW - marginPx) {
    const t = (cursorX - (viewportW - marginPx)) / marginPx;
    vx = Number((t * t * maxSpeedPx).toFixed(3));
  }

  if (cursorY >= 0 && cursorY < marginPx) {
    const t = (marginPx - cursorY) / marginPx;
    vy = -Number((t * t * maxSpeedPx).toFixed(3));
  } else if (cursorY <= viewportH && cursorY > viewportH - marginPx) {
    const t = (cursorY - (viewportH - marginPx)) / marginPx;
    vy = Number((t * t * maxSpeedPx).toFixed(3));
  }

  return { vx, vy };
}
export const BASE_STORAGE_CAPACITY = 2000;
export const SILO_STORAGE_BONUS = 1500;
export const STARTING_CREDITS = 2500;
export const HARVESTER_LOAD_PER_TICK = 25;
export const HARVESTER_UNLOAD_PER_TICK = 25;
export const HARVESTER_MAX_LOAD = 500;
export const WATCHDOG_INTERVAL_MS = 10_000;
export const WATCHDOG_DISCONNECT_TIMEOUT_MS = 60_000;

export const FACTIONS: Record<FactionId, FactionSpec> = {
  GDI: {
    id: "GDI",
    name: "GDI — Global Defense Coalition",
    motto: "Supériorité Blindée & Canon lourd",
    primaryColor: "#f59e0b",
    secondaryColor: "#78350f",
    accentClass: "text-amber-400 border-amber-500/50",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    armorBonus: 1.1,
    speedBonus: 1.0,
    harvestBonus: 1.0,
  },
  NOD: {
    id: "NOD",
    name: "NOD — Confrérie de l'Ombre",
    motto: "Frappe Rapide, Laser & Guérilla",
    primaryColor: "#ef4444",
    secondaryColor: "#7f1d1d",
    accentClass: "text-red-400 border-red-500/50",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
    armorBonus: 0.95,
    speedBonus: 1.15,
    harvestBonus: 1.0,
  },
  ORDOS: {
    id: "ORDOS",
    name: "ORDOS — Cartel Technologique",
    motto: "Économie Haute-Fréquence & Blindés Véloces",
    primaryColor: "#06b6d4",
    secondaryColor: "#164e63",
    accentClass: "text-cyan-400 border-cyan-500/50",
    badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    armorBonus: 1.0,
    speedBonus: 1.08,
    harvestBonus: 1.15,
  },
};

export const BUILDINGS: Record<BuildingKind, BuildingSpec> = {
  CONSTRUCTION_YARD: {
    kind: "CONSTRUCTION_YARD",
    name: "Chantier de Construction",
    category: "BUILDING",
    cost: 2000,
    buildTimeTicks: 100,
    maxHp: 1500,
    powerDelta: 30,
    sightRadius: 8,
    footprintW: 3,
    footprintH: 3,
    storageCapacity: 1000,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: [],
    description: "Centre de commandement principal débloquant l'arbre technologique.",
  },
  POWER_PLANT: {
    kind: "POWER_PLANT",
    name: "Centrale Électrique",
    category: "BUILDING",
    cost: 300,
    buildTimeTicks: 50,
    maxHp: 600,
    powerDelta: 100,
    sightRadius: 5,
    footprintW: 2,
    footprintH: 2,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["CONSTRUCTION_YARD"],
    description: "Fournit +100 MW au réseau. Sans énergie, la production ralentit et le radar coupe.",
  },
  REFINERY: {
    kind: "REFINERY",
    name: "Raffinerie de Minerai",
    category: "BUILDING",
    cost: 1200,
    buildTimeTicks: 90,
    maxHp: 1000,
    powerDelta: -40,
    sightRadius: 7,
    footprintW: 3,
    footprintH: 2,
    storageCapacity: 1500,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["CONSTRUCTION_YARD", "POWER_PLANT"],
    description: "Convertit le minerai des moissonneuses en crédits. Livrée avec 1 Moissonneuse gratuite.",
  },
  SILO: {
    kind: "SILO",
    name: "Silo de Stockage",
    category: "BUILDING",
    cost: 150,
    buildTimeTicks: 35,
    maxHp: 400,
    powerDelta: -10,
    sightRadius: 4,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: SILO_STORAGE_BONUS,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["REFINERY"],
    description: "Augmente la capacité maximale de stockage de minerai raffiné (+1500 crédits).",
  },
  BARRACKS: {
    kind: "BARRACKS",
    name: "Caserne d'Infanterie",
    category: "BUILDING",
    cost: 400,
    buildTimeTicks: 60,
    maxHp: 750,
    powerDelta: -25,
    sightRadius: 6,
    footprintW: 2,
    footprintH: 2,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["POWER_PLANT"],
    description: "Entraîne l'infanterie de ligne, les soldats lance-roquettes et les ingénieurs.",
  },
  WAR_FACTORY: {
    kind: "WAR_FACTORY",
    name: "Usine d'Armement",
    category: "BUILDING",
    cost: 1400,
    buildTimeTicks: 100,
    maxHp: 1250,
    powerDelta: -50,
    sightRadius: 7,
    footprintW: 3,
    footprintH: 2,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["REFINERY"],
    description: "Assemble les moissonneuses, buggies, chars d'assaut, artilleries et VCM.",
  },
  RADAR_DOME: {
    kind: "RADAR_DOME",
    name: "Dôme Radar Tactique",
    category: "BUILDING",
    cost: 900,
    buildTimeTicks: 80,
    maxHp: 850,
    powerDelta: -60,
    sightRadius: 12,
    footprintW: 2,
    footprintH: 2,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["REFINERY"],
    description: "Active la minimap radar tactique et dévoile une large zone d'observation (12 tuiles).",
  },
  TECH_CENTER: {
    kind: "TECH_CENTER",
    name: "Centre Technologique",
    category: "BUILDING",
    cost: 1600,
    buildTimeTicks: 110,
    maxHp: 1000,
    powerDelta: -80,
    sightRadius: 8,
    footprintW: 2,
    footprintH: 2,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["WAR_FACTORY", "RADAR_DOME"],
    description: "Débloque le Char Mammouth lourd et l'Obélisque Laser haute énergie.",
  },
  CONCRETE_SLAB: {
    kind: "CONCRETE_SLAB",
    name: "Dalle de Béton",
    category: "BUILDING",
    cost: 25,
    buildTimeTicks: 16,
    maxHp: 300,
    powerDelta: 0,
    sightRadius: 2,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["CONSTRUCTION_YARD"],
    description: "Fondation en béton armé (1×1) assemblée par un Robot Constructeur pour accueillir les bâtiments.",
  },
  SANDBAG_WALL: {
    kind: "SANDBAG_WALL",
    name: "Sacs de Sable",
    category: "DEFENSE",
    cost: 40,
    buildTimeTicks: 20,
    maxHp: 350,
    powerDelta: 0,
    sightRadius: 2,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["CONSTRUCTION_YARD"],
    description: "Barricade continue érigée sur place par un Robot Constructeur pour canaliser l'ennemi.",
  },
  CONCRETE_WALL: {
    kind: "CONCRETE_WALL",
    name: "Mur d'Enceinte Blindé",
    category: "DEFENSE",
    cost: 80,
    buildTimeTicks: 28,
    maxHp: 850,
    powerDelta: 0,
    sightRadius: 2,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: 0,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    prerequisites: ["CONSTRUCTION_YARD"],
    description: "Rempart continu en ferro-béton (850 PV) érigé par un Robot Constructeur pour fortifier la base.",
  },
  GUARD_TOWER: {
    kind: "GUARD_TOWER",
    name: "Tourelle Vulcain",
    category: "DEFENSE",
    cost: 450,
    buildTimeTicks: 50,
    maxHp: 550,
    powerDelta: -20,
    sightRadius: 10,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: 0,
    detectionRange: 10.0,
    attackRange: 7.5,
    attackDamage: 24,
    attackCooldownTicks: 12,
    prerequisites: ["BARRACKS"],
    description: "Tourelle de périmètre rapide : s'active à 10 tuiles et ouvre le feu à 7.5 tuiles.",
  },
  SAM_SITE: {
    kind: "SAM_SITE",
    name: "Batterie Lance-Missiles",
    category: "DEFENSE",
    cost: 700,
    buildTimeTicks: 65,
    maxHp: 700,
    powerDelta: -35,
    sightRadius: 13,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: 0,
    detectionRange: 12.5,
    attackRange: 9.5,
    attackDamage: 55,
    attackCooldownTicks: 24,
    prerequisites: ["RADAR_DOME"],
    description: "Batterie lourde longue portée : verrouille à 12.5 tuiles et frappe les blindés à 9.5 tuiles.",
  },
  OBELISK: {
    kind: "OBELISK",
    name: "Obélisque de Lumière",
    category: "DEFENSE",
    cost: 1350,
    buildTimeTicks: 95,
    maxHp: 900,
    powerDelta: -90,
    sightRadius: 14,
    footprintW: 1,
    footprintH: 1,
    storageCapacity: 0,
    detectionRange: 14.0,
    attackRange: 11.0,
    attackDamage: 145,
    attackCooldownTicks: 38,
    prerequisites: ["TECH_CENTER"],
    description: "Défense thermique ultime : précharge son cristal à 14 tuiles et vaporise à 11 tuiles.",
  },
};

export const UNITS: Record<UnitKind, UnitSpec> = {
  RIFLE_INFANTRY: {
    kind: "RIFLE_INFANTRY",
    name: "Escouade d'Infanterie",
    category: "INFANTRY",
    cost: 100,
    buildTimeTicks: 25,
    maxHp: 110,
    speedTilesPerTick: 0.11,
    sightRadius: 6,
    detectionRange: 5.5,
    attackRange: 3.2,
    attackDamage: 12,
    attackCooldownTicks: 10,
    harvestCapacity: 0,
    prerequisites: ["BARRACKS"],
    description: "Fusiliers d'assaut rapproché (tir 3.2t, vision 6t) à cadence rapide.",
  },
  ROCKET_SOLDIER: {
    kind: "ROCKET_SOLDIER",
    name: "Soldat Lance-Roquettes",
    category: "INFANTRY",
    cost: 280,
    buildTimeTicks: 40,
    maxHp: 130,
    speedTilesPerTick: 0.09,
    sightRadius: 7,
    detectionRange: 8.5,
    attackRange: 6.4,
    attackDamage: 38,
    attackCooldownTicks: 20,
    harvestCapacity: 0,
    prerequisites: ["BARRACKS"],
    description: "Antichar d'embuscade à missiles guidés (tir 6.4t, surclasse le Char MK1 en portée).",
  },
  ENGINEER: {
    kind: "ENGINEER",
    name: "Ingénieur de Combat",
    category: "INFANTRY",
    cost: 450,
    buildTimeTicks: 50,
    maxHp: 100,
    speedTilesPerTick: 0.1,
    sightRadius: 5,
    detectionRange: 4.5,
    attackRange: 1.4,
    attackDamage: 85,
    attackCooldownTicks: 25,
    harvestCapacity: 0,
    prerequisites: ["BARRACKS"],
    description: "Sapeur spécialisé capable de saboter lourdement les structures au contact (1.4t).",
  },
  CONSTRUCTOR_BOT: {
    kind: "CONSTRUCTOR_BOT",
    name: "Robot Constructeur",
    category: "VEHICLE",
    cost: 220,
    buildTimeTicks: 30,
    maxHp: 320,
    speedTilesPerTick: 0.16,
    sightRadius: 6,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    harvestCapacity: 0,
    prerequisites: ["CONSTRUCTION_YARD"],
    description: "Unité robotisée produite au Chantier : indispensable pour assembler les dalles de béton, murs et sacs de sable.",
  },
  HARVESTER: {
    kind: "HARVESTER",
    name: "Moissonneuse Lourde",
    category: "VEHICLE",
    cost: 950,
    buildTimeTicks: 75,
    maxHp: 850,
    speedTilesPerTick: 0.12,
    sightRadius: 5,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    harvestCapacity: HARVESTER_MAX_LOAD,
    prerequisites: ["WAR_FACTORY", "REFINERY"],
    description: "Convoi minier massif à benne articulée et citernes pressurisées récoltant le minerai actif.",
  },
  RECON_BUGGY: {
    kind: "RECON_BUGGY",
    name: "Buggy de Reconnaissance",
    category: "VEHICLE",
    cost: 420,
    buildTimeTicks: 45,
    maxHp: 280,
    speedTilesPerTick: 0.2,
    sightRadius: 9,
    detectionRange: 7.5,
    attackRange: 4.2,
    attackDamage: 22,
    attackCooldownTicks: 12,
    harvestCapacity: 0,
    prerequisites: ["WAR_FACTORY"],
    description: "Éclaireur ultra-rapide à longue vue (vision 9t, tir 4.2t) idéal pour guider l'Artillerie.",
  },
  MEDIUM_TANK: {
    kind: "MEDIUM_TANK",
    name: "Char de Combat MK1",
    category: "VEHICLE",
    cost: 750,
    buildTimeTicks: 65,
    maxHp: 560,
    speedTilesPerTick: 0.14,
    sightRadius: 6,
    detectionRange: 7.5,
    attackRange: 5.4,
    attackDamage: 52,
    attackCooldownTicks: 20,
    harvestCapacity: 0,
    prerequisites: ["WAR_FACTORY"],
    description: "Blindé de ligne mobile (tir 5.4t, détection 7.5t) à tourelle rotative 16 angles.",
  },
  ARTILLERY: {
    kind: "ARTILLERY",
    name: "Lance-Missiles Mobile",
    category: "VEHICLE",
    cost: 900,
    buildTimeTicks: 75,
    maxHp: 340,
    speedTilesPerTick: 0.11,
    sightRadius: 8,
    detectionRange: 11.5,
    attackRange: 9.8,
    attackDamage: 75,
    attackCooldownTicks: 30,
    harvestCapacity: 0,
    prerequisites: ["WAR_FACTORY", "RADAR_DOME"],
    description: "Artillerie de siège longue portée (tir 9.8t, détection 11.5t) capable de pilonner les tourelles.",
  },
  MAMMOTH_TANK: {
    kind: "MAMMOTH_TANK",
    name: "Char Lourd Mammouth",
    category: "VEHICLE",
    cost: 1500,
    buildTimeTicks: 105,
    maxHp: 1150,
    speedTilesPerTick: 0.09,
    sightRadius: 8,
    detectionRange: 9.0,
    attackRange: 7.0,
    attackDamage: 110,
    attackCooldownTicks: 24,
    harvestCapacity: 0,
    prerequisites: ["WAR_FACTORY", "TECH_CENTER"],
    description: "Forteresse roulante à double canon 120mm (tir 7.0t, détection 9.0t) et blindage lourd.",
  },
  MCV: {
    kind: "MCV",
    name: "VCM (Véhicule de Construction)",
    category: "VEHICLE",
    cost: 1800,
    buildTimeTicks: 110,
    maxHp: 1000,
    speedTilesPerTick: 0.09,
    sightRadius: 7,
    detectionRange: 0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownTicks: 0,
    harvestCapacity: 0,
    prerequisites: ["WAR_FACTORY", "TECH_CENTER"],
    description: "Peut établir un avant-poste avancé sur le champ de bataille (vision 7t).",
  },
};

export const BUILDING_LIST: BuildingSpec[] = Object.values(BUILDINGS);
export const UNIT_LIST: UnitSpec[] = Object.values(UNITS);
