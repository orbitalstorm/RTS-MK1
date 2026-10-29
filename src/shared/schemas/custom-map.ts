import { z } from "zod";
import {
  DEFAULT_MAP_SIZE_PRESET,
  generateProceduralMap,
  generateRandomMapSeed,
  MAP_GENERATION_RULES,
  MAP_SIZE_PRESETS,
  normalizeMapSeed,
  type MapSizePresetId,
} from "../map-generator";
import {
  BuildingKindSchema,
  FactionIdSchema,
  TreeKindSchema,
  UnitKindSchema,
} from "./commands";

export const SpawnFactionChoiceSchema = z.enum(["GDI", "NOD", "ORDOS", "ANY"]);

export const MapSizePresetChoiceSchema = z.enum([
  "LEGACY_1X",
  "SKIRMISH_4X",
  "TACTICAL_5X",
  "STRATEGIC_7X",
  "COLOSSAL_9X",
  "CUSTOM",
]);

export const SpawnPointSpecSchema = z.object({
  slotIndex: z.number().int().min(0).max(3), // 0 = Slot 1 (NW), 1 = Slot 2 (SE), 2 = Slot 3 (NE), 3 = Slot 4 (SW)
  label: z.string().min(1).max(40),
  x: z.number().int().min(0).max(511), // Top-left X of the 8x8 spawn pad
  y: z.number().int().min(0).max(511), // Top-left Y of the 8x8 spawn pad
  faction: SpawnFactionChoiceSchema.default("ANY"),
  startingCredits: z.number().int().min(500).max(50000).default(5000),
  includeConcretePad: z.boolean().default(true),
  includeStoneHalo: z.boolean().default(true),
  includeInitialBase: z.boolean().default(true),
});

export const EditorTreePlacementSchema = z.object({
  id: z.string().min(1),
  x: z.number().int().min(0).max(511),
  y: z.number().int().min(0).max(511),
  kind: TreeKindSchema,
  scale: z.number().min(0.3).max(1.6).default(1.0),
});

export const EditorSilverDepositSchema = z.object({
  id: z.string().min(1),
  x: z.number().int().min(0).max(511), // Top-left tile X of the 2x2 SILVER_ORE boulder
  y: z.number().int().min(0).max(511), // Top-left tile Y of the 2x2 SILVER_ORE boulder
  kind: z.enum(["REGIONAL", "CONTESTED_CENTRAL"]).default("REGIONAL"),
  includeStoneApron: z.boolean().default(true),
});

export const EditorPlacedEntitySchema = z.object({
  id: z.string().min(1),
  x: z.number().int().min(0).max(511),
  y: z.number().int().min(0).max(511),
  ownerSlot: z.union([z.number().int().min(0).max(3), z.literal("NEUTRAL")]).default(0),
  faction: FactionIdSchema.default("GDI"),
  entityType: z.enum(["BUILDING", "UNIT"]),
  kind: z.union([BuildingKindSchema, UnitKindSchema]),
  angleIndex: z.number().int().min(0).max(15).default(4),
  hpRatio: z.number().min(0.1).max(1.0).default(1.0),
});

export const CustomMapDocumentSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    author: z.string().min(1).max(48).default("Architecte RTS-MK1"),
    description: z.string().max(400).default(""),
    version: z.string().min(1).max(24).default("1.0.0"),
    seed: z.number().int().positive(),
    sizePreset: MapSizePresetChoiceSchema.default("TACTICAL_5X"),
    width: z.number().int().min(32).max(256),
    height: z.number().int().min(32).max(256),
    terrainGrid: z.array(z.number().int().min(0).max(9)),
    oreGrid: z.array(z.number().int().min(0).max(5000)),
    spawns: z.array(SpawnPointSpecSchema).max(4),
    trees: z.array(EditorTreePlacementSchema),
    silverDeposits: z.array(EditorSilverDepositSchema),
    placedEntities: z.array(EditorPlacedEntitySchema).default([]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((doc, ctx) => {
    const expectedTotal = doc.width * doc.height;
    if (doc.terrainGrid.length !== expectedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `terrainGrid (${doc.terrainGrid.length}) ne correspond pas à width*height (${expectedTotal}).`,
        path: ["terrainGrid"],
      });
    }
    if (doc.oreGrid.length !== expectedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `oreGrid (${doc.oreGrid.length}) ne correspond pas à width*height (${expectedTotal}).`,
        path: ["oreGrid"],
      });
    }
  });

export const CustomMapSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1),
  description: z.string(),
  version: z.string(),
  seed: z.number().int().positive(),
  sizePreset: MapSizePresetChoiceSchema,
  width: z.number().int().min(32).max(256),
  height: z.number().int().min(32).max(256),
  spawnCount: z.number().int().min(0).max(4),
  oreTotalCredits: z.number().int().min(0),
  silverDepositCount: z.number().int().min(0),
  treeCount: z.number().int().min(0),
  entityCount: z.number().int().min(0),
  rulesValid: z.boolean(),
  updatedAt: z.string().min(1),
});

export type SpawnFactionChoice = z.infer<typeof SpawnFactionChoiceSchema>;
export type MapSizePresetChoice = z.infer<typeof MapSizePresetChoiceSchema>;
export type SpawnPointSpec = z.infer<typeof SpawnPointSpecSchema>;
export type EditorTreePlacement = z.infer<typeof EditorTreePlacementSchema>;
export type EditorSilverDeposit = z.infer<typeof EditorSilverDepositSchema>;
export type EditorPlacedEntity = z.infer<typeof EditorPlacedEntitySchema>;
export type CustomMapDocument = z.infer<typeof CustomMapDocumentSchema>;
export type CustomMapSummary = z.infer<typeof CustomMapSummarySchema>;

const SPAWN_SLOT_DEFAULTS: ReadonlyArray<{
  slotIndex: number;
  label: string;
  defaultFaction: SpawnFactionChoice;
}> = [
  { slotIndex: 0, label: "Spawn 1 (Nord-Ouest)", defaultFaction: "GDI" },
  { slotIndex: 1, label: "Spawn 2 (Sud-Est)", defaultFaction: "NOD" },
  { slotIndex: 2, label: "Spawn 3 (Nord-Est)", defaultFaction: "ORDOS" },
  { slotIndex: 3, label: "Spawn 4 (Sud-Ouest)", defaultFaction: "ANY" },
];

export function createStarterCustomMapFromSeed(options: {
  id: string;
  name: string;
  author?: string;
  description?: string;
  seed?: number | string;
  sizePreset?: MapSizePresetChoice;
  width?: number;
  height?: number;
}): CustomMapDocument {
  const presetKey =
    options.sizePreset && options.sizePreset !== "CUSTOM"
      ? (options.sizePreset as MapSizePresetId)
      : DEFAULT_MAP_SIZE_PRESET;
  const spec = MAP_SIZE_PRESETS[presetKey] ?? MAP_SIZE_PRESETS[DEFAULT_MAP_SIZE_PRESET];
  const width = options.width ?? spec.widthTiles;
  const height = options.height ?? spec.heightTiles;
  const seed =
    options.seed !== undefined ? normalizeMapSeed(options.seed) : generateRandomMapSeed();

  const proc = generateProceduralMap({
    seed,
    width,
    height,
  });

  const now = new Date().toISOString();
  const spawns: SpawnPointSpec[] = proc.spawnPads.slice(0, 4).map((pad, idx) => {
    const meta = SPAWN_SLOT_DEFAULTS[idx] ?? SPAWN_SLOT_DEFAULTS[0]!;
    return {
      slotIndex: idx,
      label: meta.label,
      x: pad.x,
      y: pad.y,
      faction: meta.defaultFaction,
      startingCredits: 5000,
      includeConcretePad: true,
      includeStoneHalo: true,
      includeInitialBase: true,
    };
  });

  const trees: EditorTreePlacement[] = proc.trees.map((t, idx) => ({
    id: `tree_${idx + 1}_${t.x}_${t.y}`,
    x: t.x,
    y: t.y,
    kind: t.kind,
    scale: t.scale,
  }));

  const silverDeposits: EditorSilverDeposit[] = proc.silverDeposits.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    kind: s.kind,
    includeStoneApron: true,
  }));

  return CustomMapDocumentSchema.parse({
    id: options.id,
    name: options.name,
    author: options.author ?? "Lead System Architect",
    description:
      options.description ??
      `Carte tactique officielle #${proc.seed} (${proc.width}×${proc.height} tuiles) issue de l'Éditeur de Cartes RTS-MK1.`,
    version: "1.0.0",
    seed: proc.seed,
    sizePreset: options.sizePreset ?? presetKey,
    width: proc.width,
    height: proc.height,
    terrainGrid: [...proc.terrainGrid],
    oreGrid: [...proc.oreGrid],
    spawns,
    trees,
    silverDeposits,
    placedEntities: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function summarizeCustomMapDocument(doc: CustomMapDocument): CustomMapSummary {
  let oreTotalCredits = 0;
  for (let i = 0; i < doc.oreGrid.length; i++) {
    oreTotalCredits += doc.oreGrid[i] ?? 0;
  }

  const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
  const rulesValid = doc.spawns.length >= 2 && doc.width >= 32 && doc.height >= 32 && padSize > 0;

  return CustomMapSummarySchema.parse({
    id: doc.id,
    name: doc.name,
    author: doc.author,
    description: doc.description,
    version: doc.version,
    seed: doc.seed,
    sizePreset: doc.sizePreset,
    width: doc.width,
    height: doc.height,
    spawnCount: doc.spawns.length,
    oreTotalCredits,
    silverDepositCount: doc.silverDeposits.length,
    treeCount: doc.trees.length,
    entityCount: doc.placedEntities.length,
    rulesValid,
    updatedAt: doc.updatedAt,
  });
}
