import { z } from "zod";
import {
  BuildingKindSchema,
  FactionIdSchema,
  ProductionCategorySchema,
  UnitKindSchema,
} from "./commands";

export const EntityStateSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  faction: FactionIdSchema,
  entityType: z.enum(["BUILDING", "UNIT"]),
  kind: z.union([BuildingKindSchema, UnitKindSchema]),
  x: z.number(),
  y: z.number(),
  hp: z.number(),
  maxHp: z.number(),
  angleIndex: z.number().int().min(0).max(15), // 0..15 (16 orientations)
  turretAngleIndex: z.number().int().min(0).max(15),
  cargoOre: z.number().min(0).default(0),
  spawnProtectionTicks: z.number().int().min(0).default(0),
  stateLabel: z
    .enum(["IDLE", "MOVING", "HARVESTING", "RETURNING", "ALERT", "ATTACKING"])
    .default("IDLE"),
});

export const OreTileDeltaSchema = z.object({
  tileX: z.number().int().min(0),
  tileY: z.number().int().min(0),
  oreAmount: z.number().int().min(0),
});

export const TerrainTileDeltaSchema = z.object({
  tileX: z.number().int().min(0),
  tileY: z.number().int().min(0),
  terrainKind: z.number().int().min(0).max(5),
});

export const ProductionQueueSlotSchema = z.object({
  category: ProductionCategorySchema,
  activeItem: z.union([BuildingKindSchema, UnitKindSchema]).nullable(),
  progressRatio: z.number().min(0).max(1),
  readyToPlace: z.boolean(),
});

export const PlayerEconomyDeltaSchema = z.object({
  playerId: z.string().min(1),
  faction: FactionIdSchema,
  credits: z.number().int().min(0),
  maxStorage: z.number().int().min(0),
  powerProduced: z.number().int(),
  powerConsumed: z.number().int(),
  lowPower: z.boolean(),
  radarActive: z.boolean(),
  queues: z.array(ProductionQueueSlotSchema),
  harvestedTotal: z.number().int().min(0),
  defeated: z.boolean(),
});

export const AcousticEventSchema = z.object({
  id: z.string().min(1),
  soundKind: z.enum([
    "CANNON_FIRE",
    "ROCKET_LAUNCH",
    "LASER_BEAM",
    "RIFLE_BURST",
    "EXPLOSION_SMALL",
    "EXPLOSION_LARGE",
    "HARVEST_COLLECT",
    "CREDITS_TICK",
    "EVA_CONSTRUCTION_COMPLETE",
    "EVA_BUILDING_DEPLOYED",
    "EVA_UNIT_READY",
    "EVA_UNIT_LOST",
    "EVA_BASE_UNDER_ATTACK",
    "EVA_LOW_POWER",
    "EVA_SILOS_NEEDED",
    "EVA_VICTORY",
    "EVA_DEFEAT",
  ]),
  worldX: z.number(),
  worldY: z.number(),
  targetPlayerId: z.string().nullable().default(null),
});

export const ProjectileVisualSchema = z.object({
  id: z.string().min(1),
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
  weaponStyle: z.enum(["SHELL", "ROCKET", "LASER", "BULLET"]),
  faction: FactionIdSchema.optional(),
});

export const VisualEffectKindSchema = z.enum([
  "MUZZLE_FLASH",
  "SHELL_IMPACT",
  "ROCKET_EXPLOSION",
  "LASER_BURN",
  "UNIT_EXPLOSION",
  "BUILDING_DEMOLITION",
  "HARVEST_SPARKS",
]);

export const VisualEffectEventSchema = z.object({
  id: z.string().min(1),
  effectKind: VisualEffectKindSchema,
  worldX: z.number(),
  worldY: z.number(),
  radiusTiles: z.number().positive().default(1),
  shakeIntensity: z.number().min(0).max(1).default(0),
  faction: FactionIdSchema.nullable().default(null),
});

export const FogPlayerCellsSchema = z.object({
  playerId: z.string().min(1),
  // Newly revealed shroud tile indices (y * width + x)
  newlyExploredIndices: z.array(z.number().int().min(0)),
  // Currently visible tile indices (y * width + x)
  visibleIndices: z.array(z.number().int().min(0)),
});

export const TickDeltaSchema = z.object({
  type: z.literal("SIM_DELTA"),
  lobbyId: z.string().min(1),
  tickId: z.number().int().min(1),
  prevTickId: z.number().int().min(0),
  created: z.array(EntityStateSchema),
  updated: z.array(EntityStateSchema),
  destroyedIds: z.array(z.string().min(1)),
  oreUpdates: z.array(OreTileDeltaSchema),
  terrainUpdates: z.array(TerrainTileDeltaSchema).default([]),
  players: z.array(PlayerEconomyDeltaSchema),
  projectiles: z.array(ProjectileVisualSchema),
  visualEffects: z.array(VisualEffectEventSchema).default([]),
  acousticEvents: z.array(AcousticEventSchema),
  fogByPlayer: z.array(FogPlayerCellsSchema),
  winnerPlayerId: z.string().nullable(),
});

export const FullSnapshotSchema = z.object({
  type: z.literal("SIM_SNAPSHOT"),
  lobbyId: z.string().min(1),
  tickId: z.number().int().min(0),
  mapWidth: z.number().int().positive(),
  mapHeight: z.number().int().positive(),
  terrainGrid: z.array(z.number().int().min(0).max(5)), // 0=dirt/earth, 1=stone, 2=cliff(blocked), 3=ore, 4=grass, 5=concrete_slab
  oreGrid: z.array(z.number().int().min(0)),
  entities: z.array(EntityStateSchema),
  players: z.array(PlayerEconomyDeltaSchema),
  exploredByPlayer: z.record(z.string(), z.array(z.number().int().min(0))),
  visibleByPlayer: z.record(z.string(), z.array(z.number().int().min(0))),
  winnerPlayerId: z.string().nullable(),
});

export type EntityState = z.infer<typeof EntityStateSchema>;
export type OreTileDelta = z.infer<typeof OreTileDeltaSchema>;
export type TerrainTileDelta = z.infer<typeof TerrainTileDeltaSchema>;
export type ProductionQueueSlot = z.infer<typeof ProductionQueueSlotSchema>;
export type PlayerEconomyDelta = z.infer<typeof PlayerEconomyDeltaSchema>;
export type AcousticEvent = z.infer<typeof AcousticEventSchema>;
export type ProjectileVisual = z.infer<typeof ProjectileVisualSchema>;
export type VisualEffectKind = z.infer<typeof VisualEffectKindSchema>;
export type VisualEffectEvent = z.infer<typeof VisualEffectEventSchema>;
export type FogPlayerCells = z.infer<typeof FogPlayerCellsSchema>;
export type TickDelta = z.infer<typeof TickDeltaSchema>;
export type FullSnapshot = z.infer<typeof FullSnapshotSchema>;
