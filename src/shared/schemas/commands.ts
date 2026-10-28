import { z } from "zod";

export const FactionIdSchema = z.enum(["GDI", "NOD", "ORDOS"]);
export const ProductionCategorySchema = z.enum(["BUILDING", "DEFENSE", "INFANTRY", "VEHICLE"]);

export const BuildingKindSchema = z.enum([
  "CONSTRUCTION_YARD",
  "POWER_PLANT",
  "REFINERY",
  "SILO",
  "BARRACKS",
  "WAR_FACTORY",
  "RADAR_DOME",
  "TECH_CENTER",
  "SILVER_MINE",
  "CONCRETE_SLAB",
  "SANDBAG_WALL",
  "CONCRETE_WALL",
  "GUARD_TOWER",
  "SAM_SITE",
  "OBELISK",
]);

export const TreeKindSchema = z.enum([
  "TREE_PINE",
  "TREE_OAK",
  "TREE_PALM",
]);

export const UnitKindSchema = z.enum([
  "RIFLE_INFANTRY",
  "ROCKET_SOLDIER",
  "ENGINEER",
  "CONSTRUCTOR_BOT",
  "HARVESTER",
  "RECON_BUGGY",
  "MEDIUM_TANK",
  "ARTILLERY",
  "MAMMOTH_TANK",
  "MCV",
]);

export const IssueMoveCommandSchema = z.object({
  type: z.literal("COMMAND_MOVE"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  entityIds: z.array(z.string().min(1)).min(1).max(64),
  targetTileX: z.number().int().min(0).max(127),
  targetTileY: z.number().int().min(0).max(127),
});

export const IssueAttackCommandSchema = z.object({
  type: z.literal("COMMAND_ATTACK"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  entityIds: z.array(z.string().min(1)).min(1).max(64),
  targetEntityId: z.string().min(1),
});

export const IssueAttackGroundCommandSchema = z.object({
  type: z.literal("COMMAND_ATTACK_GROUND"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  entityIds: z.array(z.string().min(1)).min(1).max(64),
  targetTileX: z.number().int().min(0).max(127),
  targetTileY: z.number().int().min(0).max(127),
});

export const IssueStartProductionCommandSchema = z.object({
  type: z.literal("COMMAND_START_PRODUCTION"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  category: ProductionCategorySchema,
  itemKind: z.union([BuildingKindSchema, UnitKindSchema]),
});

export const IssuePlaceBuildingCommandSchema = z.object({
  type: z.literal("COMMAND_PLACE_BUILDING"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  category: z.enum(["BUILDING", "DEFENSE"]),
  buildingKind: BuildingKindSchema,
  tileX: z.number().int().min(0).max(127),
  tileY: z.number().int().min(0).max(127),
});

export const IssueSellBuildingCommandSchema = z.object({
  type: z.literal("COMMAND_SELL_BUILDING"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  buildingEntityId: z.string().min(1),
});

export const IssueRepairBuildingCommandSchema = z.object({
  type: z.literal("COMMAND_REPAIR_BUILDING"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  buildingEntityId: z.string().min(1),
});

export const IssueCancelConstructionCommandSchema = z.object({
  type: z.literal("COMMAND_CANCEL_CONSTRUCTION"),
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
  buildingEntityId: z.string().min(1),
});

export const ClientLobbyActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LOBBY_CREATE"),
    playerId: z.string().min(1),
    commanderName: z.string().min(1).max(32),
    faction: FactionIdSchema,
    lobbyName: z.string().min(1).max(40),
    withAiBot: z.boolean().default(true),
    autoStart: z.boolean().optional().default(false),
  }),
  z.object({
    type: z.literal("LOBBY_JOIN"),
    lobbyId: z.string().min(1),
    playerId: z.string().min(1),
    commanderName: z.string().min(1).max(32),
    faction: FactionIdSchema,
  }),
  z.object({
    type: z.literal("LOBBY_SET_FACTION"),
    lobbyId: z.string().min(1),
    playerId: z.string().min(1),
    faction: FactionIdSchema,
  }),
  z.object({
    type: z.literal("LOBBY_START_MATCH"),
    lobbyId: z.string().min(1),
    playerId: z.string().min(1),
  }),
  z.object({
    type: z.literal("LOBBY_LEAVE"),
    lobbyId: z.string().min(1),
    playerId: z.string().min(1),
  }),
  z.object({
    type: z.literal("LOBBY_CHAT"),
    lobbyId: z.string().min(1),
    playerId: z.string().min(1),
    commanderName: z.string().min(1).max(32),
    message: z.string().min(1).max(240),
  }),
  z.object({
    type: z.literal("REQUEST_SNAPSHOT"),
    lobbyId: z.string().min(1),
    playerId: z.string().min(1),
    lastTickId: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("CLIENT_PING"),
    playerId: z.string().min(1),
    timestamp: z.number().int(),
  }),
  IssueMoveCommandSchema,
  IssueAttackCommandSchema,
  IssueAttackGroundCommandSchema,
  IssueStartProductionCommandSchema,
  IssuePlaceBuildingCommandSchema,
  IssueSellBuildingCommandSchema,
  IssueRepairBuildingCommandSchema,
  IssueCancelConstructionCommandSchema,
]);

export type ClientMessage = z.infer<typeof ClientLobbyActionSchema>;
