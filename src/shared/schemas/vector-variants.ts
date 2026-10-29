import { z } from "zod";
import {
  BUILDING_LIST,
  TERRAIN_KIND,
  TREES,
  UNIT_LIST,
  type BuildingKind,
  type TreeKind,
  type UnitKind,
} from "../constants";

export const VectorAssetCategorySchema = z.enum([
  "BUILDING",
  "UNIT",
  "TERRAIN",
  "TREE",
]);
export type VectorAssetCategory = z.infer<typeof VectorAssetCategorySchema>;

export const TerrainElementCodeSchema = z.enum([
  "DIRT",
  "STONE",
  "CLIFF",
  "ORE",
  "GRASS",
  "CONCRETE_SLAB",
  "SILVER_ORE",
  "WATER",
  "SAND",
  "SWAMP",
]);
export type TerrainElementCode = z.infer<typeof TerrainElementCodeSchema>;

export interface VectorAssetElementDescriptor {
  assetKey: string;
  category: VectorAssetCategory;
  elementCode: string;
  terrainNumericCode?: number;
  name: string;
  shortName: string;
  subtitle: string;
  supportsFactions: boolean;
  supports16Angles: boolean;
  footprintW: number;
  footprintH: number;
}

export const TERRAIN_ASSET_DESCRIPTORS: ReadonlyArray<VectorAssetElementDescriptor> = [
  {
    assetKey: "TERRAIN:GRASS",
    category: "TERRAIN",
    elementCode: "GRASS",
    terrainNumericCode: TERRAIN_KIND.GRASS,
    name: "Herbe (Plaine Naturelle)",
    shortName: "Herbe",
    subtitle: "Strate organique superficielle franchissable avec touffes botaniques éparses.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:DIRT",
    category: "TERRAIN",
    elementCode: "DIRT",
    terrainNumericCode: TERRAIN_KIND.DIRT,
    name: "Terre (Vallée Aride)",
    shortName: "Terre",
    subtitle: "Sol minéral ocre sous-jacent avec cailloux facettés et strates éoliennes.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:STONE",
    category: "TERRAIN",
    elementCode: "STONE",
    terrainNumericCode: TERRAIN_KIND.STONE,
    name: "Pierre (Socle Rocheux)",
    shortName: "Pierre",
    subtitle: "Socle minéral dense entourant les plateaux et gisements métallifères.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:CLIFF",
    category: "TERRAIN",
    elementCode: "CLIFF",
    terrainNumericCode: TERRAIN_KIND.CLIFF,
    name: "Falaise (Crête Infranchissable)",
    shortName: "Falaise",
    subtitle: "Escarpement rocheux stratifié bloquant le passage et structurant les couloirs.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:CONCRETE_SLAB",
    category: "TERRAIN",
    elementCode: "CONCRETE_SLAB",
    terrainNumericCode: TERRAIN_KIND.CONCRETE_SLAB,
    name: "Dalle de Béton (Sol)",
    shortName: "Sol Béton",
    subtitle: "Fondation industrielle porteuse requise sous les structures militaires.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:WATER",
    category: "TERRAIN",
    elementCode: "WATER",
    terrainNumericCode: TERRAIN_KIND.WATER,
    name: "Eau Profonde (Infranchissable)",
    shortName: "Eau",
    subtitle: "Plan d'eau abyssal à reflets spéculaires et crêtes d'écume.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:SAND",
    category: "TERRAIN",
    elementCode: "SAND",
    terrainNumericCode: TERRAIN_KIND.SAND,
    name: "Sable Dunaire (Vitesse ×0.8)",
    shortName: "Sable",
    subtitle: "Dunes dorées façonnées par le vent ralentissant les véhicules terrestres.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:SWAMP",
    category: "TERRAIN",
    elementCode: "SWAMP",
    terrainNumericCode: TERRAIN_KIND.SWAMP,
    name: "Marais Boueux (Asséchable)",
    shortName: "Marais",
    subtitle: "Zone humide marécageuse avec flaques saumâtres et roseaux.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:ORE",
    category: "TERRAIN",
    elementCode: "ORE",
    terrainNumericCode: TERRAIN_KIND.ORE,
    name: "Minerai Cristallin (Ressource)",
    shortName: "Minerai",
    subtitle: "Prismes cristallins luminescents récoltables par les Moissonneuses.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  },
  {
    assetKey: "TERRAIN:SILVER_ORE",
    category: "TERRAIN",
    elementCode: "SILVER_ORE",
    terrainNumericCode: TERRAIN_KIND.SILVER_ORE,
    name: "Rocher d'Argent 2×2 (Mine)",
    shortName: "Rocher Argent",
    subtitle: "Massif rocheux 2×2 incrusté de pépites d'argent pur pour Mine d'Argent.",
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 2,
    footprintH: 2,
  },
];

export const VECTOR_ASSET_ELEMENTS: ReadonlyArray<VectorAssetElementDescriptor> = [
  ...BUILDING_LIST.map((b): VectorAssetElementDescriptor => ({
    assetKey: `BUILDING:${b.kind}`,
    category: "BUILDING",
    elementCode: b.kind,
    name: b.name,
    shortName: b.shortName,
    subtitle: `${b.category === "DEFENSE" ? "Défense" : "Bâtiment"} ${b.footprintW}×${b.footprintH} — ${b.description}`,
    supportsFactions: true,
    supports16Angles: b.kind === "GUARD_TOWER" || b.kind === "SAM_SITE",
    footprintW: b.footprintW,
    footprintH: b.footprintH,
  })),
  ...UNIT_LIST.map((u): VectorAssetElementDescriptor => ({
    assetKey: `UNIT:${u.kind}`,
    category: "UNIT",
    elementCode: u.kind,
    name: u.name,
    shortName: u.shortName,
    subtitle: `${u.category === "INFANTRY" ? "Escouade d'infanterie" : "Véhicule blindé"} 16 angles — ${u.description}`,
    supportsFactions: true,
    supports16Angles: true,
    footprintW: 1,
    footprintH: 1,
  })),
  ...TERRAIN_ASSET_DESCRIPTORS,
  ...(Object.keys(TREES) as TreeKind[]).map((tk): VectorAssetElementDescriptor => ({
    assetKey: `TREE:${tk}`,
    category: "TREE",
    elementCode: tk,
    name: TREES[tk].name,
    shortName: TREES[tk].name,
    subtitle: `Végétation destructible (${TREES[tk].baseHp} PV) avec croissance botanique.`,
    supportsFactions: false,
    supports16Angles: false,
    footprintW: 1,
    footprintH: 1,
  })),
];

export const SilhouetteProfileSchema = z.enum([
  "STANDARD",
  "OCTAGONAL_BEVEL",
  "ANGULAR_STEALTH",
  "WIDENED_HEAVY",
  "COMPACT_REINFORCED",
]);
export type SilhouetteProfile = z.infer<typeof SilhouetteProfileSchema>;

export const TurretProfileSchema = z.enum([
  "STANDARD",
  "TWIN_BARREL",
  "ARMORED_MANTLET",
  "COIL_OVERCHARGE",
  "FINNED_STABILIZER",
]);
export type TurretProfile = z.infer<typeof TurretProfileSchema>;

export const SuperstructureStyleSchema = z.enum([
  "CLASSIC",
  "DUAL_REACTOR",
  "COMMAND_ANTENNA",
  "REACTIVE_ERA_BLOCKS",
  "CRYO_CONDUITS",
  "SOLAR_VANES",
]);
export type SuperstructureStyle = z.infer<typeof SuperstructureStyleSchema>;

export const HazardStripeModeSchema = z.enum([
  "STANDARD",
  "DOUBLE_CHEVRON",
  "PERIMETER_WARNING",
  "MINIMAL_SPECULAR",
]);
export type HazardStripeMode = z.infer<typeof HazardStripeModeSchema>;

export const RivetDensitySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "HEAVY_BOLTED",
]);
export type RivetDensity = z.infer<typeof RivetDensitySchema>;

export const EnergyCoreHueSchema = z.enum([
  "FACTION",
  "CYAN_PLASMA",
  "AMBER_THERMAL",
  "EMERALD_TIBERIUM",
  "CRIMSON_LASER",
  "VIOLET_QUANTUM",
]);
export type EnergyCoreHue = z.infer<typeof EnergyCoreHueSchema>;

export const TerrainGeometryStyleSchema = z.enum([
  "CLASSIC",
  "STRATIFIED_HEX",
  "CRYSTALLINE_PRISM",
  "ORGANIC_LUSH",
  "ARID_FRACTURED",
]);
export type TerrainGeometryStyle = z.infer<typeof TerrainGeometryStyleSchema>;

export const TreeCanopyStyleSchema = z.enum([
  "CLASSIC",
  "DENSE_MULTI_TIER",
  "CRYSTAL_MUTATED",
  "ANCIENT_AUTUMN",
  "WIND_SWEPT",
]);
export type TreeCanopyStyle = z.infer<typeof TreeCanopyStyleSchema>;

export const StyleArchetypeSchema = z.enum([
  "MILITARY_MK1",
  "HEAVY_BASTION",
  "APEX_PLASMA",
  "TACTICAL_VANGUARD",
  "BRUTALIST_BUNKER",
  "CYBER_STEALTH",
  "DESERT_STORM",
]);
export type StyleArchetype = z.infer<typeof StyleArchetypeSchema>;

export const VectorAnimationModeSchema = z.enum([
  "IDLE",
  "MOVE",
  "ATTACK",
  "SPECIAL",
]);
export type VectorAnimationMode = z.infer<typeof VectorAnimationModeSchema>;

export interface VectorAnimationModeDescriptor {
  id: VectorAnimationMode;
  label: string;
  shortLabel: string;
  description: string;
}

export const VECTOR_ANIMATION_MODES: ReadonlyArray<VectorAnimationModeDescriptor> = [
  {
    id: "IDLE",
    label: "Veille & Systèmes Actifs",
    shortLabel: "Veille (Idle)",
    description:
      "Rotation radar, pulsation des réacteurs, balayage optique, houle et brise.",
  },
  {
    id: "MOVE",
    label: "Déplacement & Cinématique",
    shortLabel: "Mouvement",
    description:
      "Marche articulée de l'infanterie/méchas, roulement des chenilles, lévitation Mag-Lev et poussière.",
  },
  {
    id: "ATTACK",
    label: "Combat, Tir & Surcharge",
    shortLabel: "Attaque / Tir",
    description:
      "Recul des canons, flashs de bouche, salves de missiles, jet de flammes et faisceaux laser.",
  },
  {
    id: "SPECIAL",
    label: "Action Spéciale & Production",
    shortLabel: "Spécial / Prod.",
    description:
      "Ouverture des hangars, grues de soudure plasma, concassage de minerai et résonance cristalline.",
  },
];

export const StructuralMorphologySchema = z.enum([
  "CLASSIC_MK1",
  "BASTION_CATAPHRACT",
  "TOKAMAK_MAGLEV",
  "STEALTH_DELTA_DRONE",
  "MECH_CATAMARAN",
  "ZIGGURAT_HEX_SWARM",
]);
export type StructuralMorphology = z.infer<typeof StructuralMorphologySchema>;

export const MORPHOLOGY_LABELS: Record<StructuralMorphology, string> = {
  CLASSIC_MK1: "Architecture Classique MK1",
  BASTION_CATAPHRACT: "Citadelle Octogonale / Cataphracte Lourd",
  TOKAMAK_MAGLEV: "Anneau Tokamak / Aéroglisseur Mag-Lev",
  STEALTH_DELTA_DRONE: "Losange Furtif / Delta 8×8 & Drone",
  MECH_CATAMARAN: "Double-Coque Catamaran / Marcheur Mécha",
  ZIGGURAT_HEX_SWARM: "Pyramide Ziggurat / Tri-Pod & Phalange",
};

export const VectorVariantDnaSchema = z.object({
  silhouetteProfile: SilhouetteProfileSchema,
  armorChamferScale: z.number().min(0.4).max(2.0),
  hullWidthScale: z.number().min(0.84).max(1.18),
  hullLengthScale: z.number().min(0.84).max(1.18),
  turretProfile: TurretProfileSchema,
  barrelLengthScale: z.number().min(0.8).max(1.38),
  superstructureStyle: SuperstructureStyleSchema,
  hazardStripeMode: HazardStripeModeSchema,
  rivetDensity: RivetDensitySchema,
  energyCoreHue: EnergyCoreHueSchema,
  specularContrast: z.number().min(0.65).max(1.5),
  terrainFillHex: z.string(),
  terrainLipShadowHex: z.string(),
  terrainLipHighlightHex: z.string(),
  terrainSecondaryHex: z.string(),
  terrainGeometryStyle: TerrainGeometryStyleSchema,
  treeCanopyStyle: TreeCanopyStyleSchema,
  treePrimaryFoliageHex: z.string(),
  treeSecondaryFoliageHex: z.string(),
  treeAccentFoliageHex: z.string(),
  treeTrunkHex: z.string(),
  customSeed: z.number().int(),
});
export type VectorVariantDna = z.infer<typeof VectorVariantDnaSchema>;

export const VectorVariantProposalSchema = z.object({
  variantId: z.string().min(1),
  assetKey: z.string().min(3),
  category: VectorAssetCategorySchema,
  elementCode: z.string().min(1),
  versionNumber: z.number().int().min(1),
  title: z.string().min(1),
  styleArchetype: StyleArchetypeSchema,
  author: z.string().min(1),
  leonardoNote: z.string().min(1),
  directivePrompt: z.string().default(""),
  isBuiltIn: z.boolean().default(false),
  createdAt: z.string(),
  dna: VectorVariantDnaSchema,
});
export type VectorVariantProposal = z.infer<typeof VectorVariantProposalSchema>;

export const VectorVariantsStateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(1),
  updatedAt: z.string(),
  activeVariants: z.record(z.string(), z.string()),
  catalog: z.record(z.string(), z.array(VectorVariantProposalSchema)),
});
export type VectorVariantsState = z.infer<typeof VectorVariantsStateSchema>;

export const VectorVariantsMutationRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SAVE_SELECTIONS"),
    activeVariants: z.record(z.string(), z.string()),
  }),
  z.object({
    action: z.literal("SELECT_SINGLE_VARIANT"),
    assetKey: z.string().min(3),
    variantId: z.string().min(1),
  }),
  z.object({
    action: z.literal("PROPOSE_NEW_VARIANTS"),
    targetScope: z.enum(["ASSET", "CATEGORY", "ALL"]),
    assetKey: z.string().optional(),
    category: VectorAssetCategorySchema.optional(),
    count: z.number().int().min(1).max(6).default(1),
    styleArchetype: StyleArchetypeSchema.optional(),
    directivePrompt: z.string().max(400).optional(),
    autoSelectNewest: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("RESET_TO_DEFAULT"),
    targetScope: z.enum(["ASSET", "CATEGORY", "ALL"]),
    assetKey: z.string().optional(),
    category: VectorAssetCategorySchema.optional(),
  }),
]);
export type VectorVariantsMutationRequest = z.infer<
  typeof VectorVariantsMutationRequestSchema
>;

function hashDeterministic(input: string, salt = 0x9e3779b9): number {
  let h = salt ^ 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

interface TerrainDefaultColors {
  fill: string;
  shadow: string;
  highlight: string;
  secondary: string;
}

const DEFAULT_TERRAIN_COLORS: Record<string, TerrainDefaultColors> = {
  DIRT: {
    fill: "#463525",
    shadow: "#281c12",
    highlight: "#614a35",
    secondary: "#856a47",
  },
  STONE: {
    fill: "#333c48",
    shadow: "#1d232b",
    highlight: "#4b5869",
    secondary: "#64748b",
  },
  CLIFF: {
    fill: "#1a212b",
    shadow: "#090c12",
    highlight: "#64748b",
    secondary: "#9ca3af",
  },
  ORE: {
    fill: "#10b981",
    shadow: "#064e3b",
    highlight: "#86efac",
    secondary: "#34d399",
  },
  GRASS: {
    fill: "#2f4f2d",
    shadow: "#1b301a",
    highlight: "#467342",
    secondary: "#22c55e",
  },
  CONCRETE_SLAB: {
    fill: "#525e6e",
    shadow: "#28303d",
    highlight: "#8292a8",
    secondary: "#94a3b8",
  },
  SILVER_ORE: {
    fill: "#475569",
    shadow: "#1e293b",
    highlight: "#e2e8f0",
    secondary: "#f8fafc",
  },
  WATER: {
    fill: "#0b3b5b",
    shadow: "#051e32",
    highlight: "#38bdf8",
    secondary: "#7dd3fc",
  },
  SAND: {
    fill: "#a8843e",
    shadow: "#6b501d",
    highlight: "#d4b06a",
    secondary: "#fef08a",
  },
  SWAMP: {
    fill: "#213628",
    shadow: "#111f16",
    highlight: "#3a5a44",
    secondary: "#0e7490",
  },
};

const TERRAIN_VARIANT_PALETTES: Record<
  string,
  ReadonlyArray<{
    title: string;
    note: string;
    style: TerrainGeometryStyle;
    colors: TerrainDefaultColors;
  }>
> = {
  GRASS: [
    {
      title: "V1 — Prairie Tactique Classique (Référence v1.12)",
      note: "Surface herbeuse tempérée équilibrée avec touffes sombres éparses et biseaux doux.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.GRASS!,
    },
    {
      title: "V2 — Steppe Boréale Émeraude Dense",
      note: "Végétation boréale profonde à contraste accru, fougères denses et lèvres stratigraphiques fraîches.",
      style: "ORGANIC_LUSH",
      colors: {
        fill: "#23442a",
        shadow: "#122617",
        highlight: "#3e784b",
        secondary: "#34d399",
      },
    },
    {
      title: "V3 — Savane Sub-Aride Olive & Or",
      note: "Prairie sèche de plateau avec herbes hautes dorées et sous-couche ocre chaude.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#445428",
        shadow: "#283315",
        highlight: "#6c8240",
        secondary: "#a3e635",
      },
    },
    {
      title: "V4 — Jungle Bioluminescente de Frontière",
      note: "Couvert végétal luxuriant enrichi de spores cyan/émeraude et de micro-reliefs organiques.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#1d4638",
        shadow: "#0d261e",
        highlight: "#2dd4bf",
        secondary: "#5eead4",
      },
    },
  ],
  DIRT: [
    {
      title: "V1 — Terre de Vallée Ocre (Référence v1.12)",
      note: "Sol aride classique avec galets facettés et strates sablonneuses.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.DIRT!,
    },
    {
      title: "V2 — Canyon Ferrugineux Rouge-Brun",
      note: "Terre riche en oxyde de fer façon Mars/Arrakis avec éclats rocheux cuivrés.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#542f22",
        shadow: "#2e1710",
        highlight: "#7c4734",
        secondary: "#d97706",
      },
    },
    {
      title: "V3 — Cendre Basaltique Volcanique",
      note: "Sol sombre de caldeira avec graviers anguleux gris-ambre et sillons tectoniques.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#36302a",
        shadow: "#1c1815",
        highlight: "#574e46",
        secondary: "#a8a29e",
      },
    },
    {
      title: "V4 — Limon Désertique Craquelé",
      note: "Lit d'oued asséché aux plaques polygonales chaudes et cailloux polis.",
      style: "ORGANIC_LUSH",
      colors: {
        fill: "#59442b",
        shadow: "#332515",
        highlight: "#806440",
        secondary: "#fbbf24",
      },
    },
  ],
  STONE: [
    {
      title: "V1 — Socle Rocheux Minéral (Référence v1.12)",
      note: "Plateau de pierre ardoise biseauté avec joints de dilatation et micro-fissures.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.STONE!,
    },
    {
      title: "V2 — Basalte Hexagonal Stratifié",
      note: "Colonnes basaltiques sombres à arêtes géométriques franches et reflets acier.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#27303f",
        shadow: "#111722",
        highlight: "#566782",
        secondary: "#93c5fd",
      },
    },
    {
      title: "V3 — Granit Impérial Gris-Clair",
      note: "Socle granitique haute-lisibilité à grain quartzique et biseaux lumineux.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#434d5b",
        shadow: "#242b35",
        highlight: "#738296",
        secondary: "#cbd5e1",
      },
    },
    {
      title: "V4 — Schiste Obsidienne de Cratère",
      note: "Pierre métamorphique sombre à veines ambrées et fractures obliques.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#2c2b38",
        shadow: "#16151f",
        highlight: "#525068",
        secondary: "#f59e0b",
      },
    },
  ],
  CLIFF: [
    {
      title: "V1 — Escarpement Rocheux (Référence v1.12)",
      note: "Crête de canyon stratifiée à double éperon et éclairage zénithal Nord-Ouest.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.CLIFF!,
    },
    {
      title: "V2 — Muraille d'Obsidienne Acérée",
      note: "Aiguilles rocheuses noires à fort contraste spéculaire blanc-argent.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#111622",
        shadow: "#05070c",
        highlight: "#94a3b8",
        secondary: "#e2e8f0",
      },
    },
    {
      title: "V3 — Mesa Gréseuse Rougeoyante",
      note: "Falaises tabulaires de grès ferrugineux aux strates horizontales marquées.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#2b1c19",
        shadow: "#120a08",
        highlight: "#9a5b45",
        secondary: "#fdba74",
      },
    },
    {
      title: "V4 — Crête Cristalline Glaciaire",
      note: "Paroi rocheuse froide aux arêtes bleutées et veines de quartz.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#172536",
        shadow: "#08101a",
        highlight: "#60a5fa",
        secondary: "#bae6fd",
      },
    },
  ],
  CONCRETE_SLAB: [
    {
      title: "V1 — Dalle de Béton Armé Standard (Référence v1.12)",
      note: "Tablier industriel gris-acier à 4 rivets d'angle et joint de dilatation en croix.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.CONCRETE_SLAB!,
    },
    {
      title: "V2 — Blindage de Pont d'Envol Hexagonal",
      note: "Plaques de ferro-titane biseautées avec marquages d'arrimage jaunes et boulons lourds.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#475569",
        shadow: "#1e293b",
        highlight: "#94a3b8",
        secondary: "#eab308",
      },
    },
    {
      title: "V3 — Fondation Modulaire Haute-Technologie",
      note: "Dalle composite sombre parcourue de sillons énergétiques cyan subtils.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#3b495e",
        shadow: "#1b2432",
        highlight: "#38bdf8",
        secondary: "#7dd3fc",
      },
    },
    {
      title: "V4 — Béton Bunker Brutaliste Renforcé",
      note: "Dalle massive ocre-gris à nervures anti-souffle et chanfrein profond.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#57534e",
        shadow: "#292524",
        highlight: "#a8a29e",
        secondary: "#f59e0b",
      },
    },
  ],
  WATER: [
    {
      title: "V1 — Eau Abyssale Céruléenne (Référence v1.13)",
      note: "Plan d'eau profond bleu marine avec ondulations spéculaires douces.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.WATER!,
    },
    {
      title: "V2 — Lagon Turquoise & Écume Côtière",
      note: "Eaux claires à reflets cyan intenses et crêtes d'écume lumineuses.",
      style: "ORGANIC_LUSH",
      colors: {
        fill: "#0d4f6e",
        shadow: "#062a3d",
        highlight: "#22d3ee",
        secondary: "#a5f3fc",
      },
    },
    {
      title: "V3 — Océan Nocturne & Courants Magnétiques",
      note: "Fosse océanique sombre indigo parcourue de courants bioluminescents.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#11284c",
        shadow: "#071226",
        highlight: "#60a5fa",
        secondary: "#93c5fd",
      },
    },
    {
      title: "V4 — Bassin Industriel Refroidissant",
      note: "Canal hydraulique vert-émeraude à clapots géométriques serrés.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#0f444c",
        shadow: "#062328",
        highlight: "#2dd4bf",
        secondary: "#99f6e4",
      },
    },
  ],
  SAND: [
    {
      title: "V1 — Sable Dunaire Doré (Référence v1.13)",
      note: "Dunes ocre-or à rides éoliennes douces ralentissant les blindés.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.SAND!,
    },
    {
      title: "V2 — Erg Impérial d'Arrakis (Ambre Intense)",
      note: "Sable d'épice cuivré à crêtes de dunes prononcées et éclats de quartz.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#b4782c",
        shadow: "#704512",
        highlight: "#f59e0b",
        secondary: "#fde68a",
      },
    },
    {
      title: "V3 — Sable Blanc Siliceux de Sebkha",
      note: "Dunes claires à haute réflectance solaire et ombres portées nettes.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#bfa56b",
        shadow: "#7d683b",
        highlight: "#e7d3a1",
        secondary: "#fef9c3",
      },
    },
    {
      title: "V4 — Dunes Volcaniques Bicolores",
      note: "Sable ocre mêlé de stries basaltiques sombres sculptées par le vent.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#8f7034",
        shadow: "#4f3c18",
        highlight: "#c49f58",
        secondary: "#fcd34d",
      },
    },
  ],
  SWAMP: [
    {
      title: "V1 — Marais Boueux Classique (Référence v1.13)",
      note: "Tourbière olive-sombre avec flaques saumâtres et touffes de roseaux.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.SWAMP!,
    },
    {
      title: "V2 — Mangrove Toxique au Tiberium",
      note: "Marécage saturé d'effluves émeraude avec bulles bioluminescentes.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#183829",
        shadow: "#0b1f16",
        highlight: "#10b981",
        secondary: "#34d399",
      },
    },
    {
      title: "V3 — Bayou Tourbeux Sombre & Nénuphars",
      note: "Eau stagnante brune riche en végétation flottante et mousses denses.",
      style: "ORGANIC_LUSH",
      colors: {
        fill: "#293320",
        shadow: "#151b0f",
        highlight: "#576b42",
        secondary: "#84cc16",
      },
    },
    {
      title: "V4 — Bourbier Soufré Géothermique",
      note: "Vase volcanique olive-ambre à mares thermales fumantes.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#333522",
        shadow: "#1b1c10",
        highlight: "#6b7045",
        secondary: "#eab308",
      },
    },
  ],
  ORE: [
    {
      title: "V1 — Cristaux d'Émeraude Tiberium (Référence v1.12)",
      note: "7 prismes hexagonaux émeraude sur réseau de fractures tectoniques luminescentes.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.ORE!,
    },
    {
      title: "V2 — Minerai d'Or Solaire & Pépites Impériales",
      note: "Cristaux aurifères ambre-or à facettes incandescentes haute-visibilité.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#f59e0b",
        shadow: "#78350f",
        highlight: "#fef08a",
        secondary: "#fbbf24",
      },
    },
    {
      title: "V3 — Tiberium Bleu Haute-Densité (Cruentus)",
      note: "Monolithes cristallins cyan-saphir surchargés en énergie ionique.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#06b6d4",
        shadow: "#164e63",
        highlight: "#cffafe",
        secondary: "#38bdf8",
      },
    },
    {
      title: "V4 — Veine Cristalline Pourpre Quantique",
      note: "Amas de géodes améthyste/magenta à halo énergétique pulsé.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#a855f7",
        shadow: "#4c1d95",
        highlight: "#f3e8ff",
        secondary: "#e879f9",
      },
    },
  ],
  SILVER_ORE: [
    {
      title: "V1 — Massif Argentifère 2×2 Classique (Référence v1.12)",
      note: "Gros rocher fracturé 2×2 incrusté de 5 pépites d'argent pur.",
      style: "CLASSIC",
      colors: DEFAULT_TERRAIN_COLORS.SILVER_ORE!,
    },
    {
      title: "V2 — Affleurement de Platine & Titane Pur",
      note: "Monolithe octogonal acier-blanc à larges veines métalliques spéculaires.",
      style: "STRATIFIED_HEX",
      colors: {
        fill: "#64748b",
        shadow: "#0f172a",
        highlight: "#f8fafc",
        secondary: "#38bdf8",
      },
    },
    {
      title: "V3 — Géode d'Argent Cristallin Luminescent",
      note: "Rocher d'extraction ouvert révélant un cœur de cristaux d'argent poli.",
      style: "CRYSTALLINE_PRISM",
      colors: {
        fill: "#334155",
        shadow: "#090d16",
        highlight: "#ffffff",
        secondary: "#a5f3fc",
      },
    },
    {
      title: "V4 — Veine Météoritique Ferro-Argent",
      note: "Bloc d'astéroïde métallique sombre constellé d'inclusions argent-or.",
      style: "ARID_FRACTURED",
      colors: {
        fill: "#3f3f46",
        shadow: "#18181b",
        highlight: "#e4e4e7",
        secondary: "#fde047",
      },
    },
  ],
};

const TREE_VARIANT_PRESETS: ReadonlyArray<{
  suffix: string;
  title: string;
  archetype: StyleArchetype;
  canopyStyle: TreeCanopyStyle;
  primary: string;
  secondary: string;
  accent: string;
  trunk: string;
  note: string;
}> = [
  {
    suffix: "v1_classic_mk1",
    title: "V1 — Silhouette Botanique Classique (Tronc Unique)",
    archetype: "MILITARY_MK1",
    canopyStyle: "CLASSIC",
    primary: "#15803d",
    secondary: "#14532d",
    accent: "#22c55e",
    trunk: "#5c4028",
    note: "Canopée étagée de référence à tronc unique, balancement éolien doux et ombre portée elliptique.",
  },
  {
    suffix: "v2_heavy_bastion",
    title: "V2 — Bosquet Ancien Multi-Troncs & Racines Apparentes",
    archetype: "HEAVY_BASTION",
    canopyStyle: "DENSE_MULTI_TIER",
    primary: "#166534",
    secondary: "#052e16",
    accent: "#4ade80",
    trunk: "#452c1a",
    note: "Morphologie forestière complète : groupe de 3 troncs anciens entrelacés sur contreforts rocheux moussus et triple canopée.",
  },
  {
    suffix: "v3_experimental_apex",
    title: "V3 — Obélisque Végétal Cristallin & Spores en Lévitation",
    archetype: "APEX_PLASMA",
    canopyStyle: "CRYSTAL_MUTATED",
    primary: "#0d9488",
    secondary: "#115e59",
    accent: "#5eead4",
    trunk: "#334155",
    note: "Architecture xéno-botanique : cristaux prismatiques émeraude-cyan poussant sur un tronc minéralisé avec orbes de spores en orbite.",
  },
  {
    suffix: "v4_tactical_vanguard",
    title: "V4 — Bonsaï Géant Pleureur d'Automne & Arche Racinaire",
    archetype: "DESERT_STORM",
    canopyStyle: "ANCIENT_AUTUMN",
    primary: "#b45309",
    secondary: "#78350f",
    accent: "#fbbf24",
    trunk: "#4a3222",
    note: "Grand arbre pleureur asymétrique sculpté par le vent avec tronc courbe, lanternes de résine dorée et chute de feuilles ambrées.",
  },
];

const BUILDING_AND_UNIT_BUILT_IN_ARCHETYPES: ReadonlyArray<{
  suffix: string;
  versionNumber: number;
  titlePrefix: string;
  styleArchetype: StyleArchetype;
  silhouetteProfile: SilhouetteProfile;
  armorChamferScale: number;
  hullWidthScale: number;
  hullLengthScale: number;
  turretProfile: TurretProfile;
  barrelLengthScale: number;
  superstructureStyle: SuperstructureStyle;
  hazardStripeMode: HazardStripeMode;
  rivetDensity: RivetDensity;
  energyCoreHue: EnergyCoreHue;
  specularContrast: number;
  describeBuilding: (name: string) => string;
  describeUnit: (name: string) => string;
}> = [
  {
    suffix: "v1_classic_mk1",
    versionNumber: 1,
    titlePrefix: "V1 — Standard Militaire MK1 (Architecture Classique)",
    styleArchetype: "MILITARY_MK1",
    silhouetteProfile: "STANDARD",
    armorChamferScale: 1.0,
    hullWidthScale: 1.0,
    hullLengthScale: 1.0,
    turretProfile: "STANDARD",
    barrelLengthScale: 1.0,
    superstructureStyle: "CLASSIC",
    hazardStripeMode: "STANDARD",
    rivetDensity: "MEDIUM",
    energyCoreHue: "FACTION",
    specularContrast: 1.0,
    describeBuilding: (name) =>
      `Architecture vectorielle officielle v1.12 de ${name} : fondation rectangulaire différenciée par clan et superstructure militaire standard.`,
    describeUnit: (name) =>
      `Châssis vectoriel officiel v1.12 de ${name} : propulsion militaire standard et tourelle/armement de série sur 16 angles.`,
  },
  {
    suffix: "v2_heavy_bastion",
    versionNumber: 2,
    titlePrefix: "V2 — Citadelle Octogonale & Châssis Cataphracte Quadri-Chenilles",
    styleArchetype: "HEAVY_BASTION",
    silhouetteProfile: "WIDENED_HEAVY",
    armorChamferScale: 1.35,
    hullWidthScale: 1.09,
    hullLengthScale: 1.04,
    turretProfile: "ARMORED_MANTLET",
    barrelLengthScale: 1.16,
    superstructureStyle: "REACTIVE_ERA_BLOCKS",
    hazardStripeMode: "DOUBLE_CHEVRON",
    rivetDensity: "HEAVY_BOLTED",
    energyCoreHue: "AMBER_THERMAL",
    specularContrast: 1.25,
    describeBuilding: (name) =>
      `Refonte architecturale complète de ${name} en Citadelle Octogonale de Siège : 4 bastions d'angle circulaires, casemates en blindage réactif ERA, double portique industriel lourd et cheminées thermiques.`,
    describeUnit: (name) =>
      `Refonte complète de ${name} en Cataphracte Lourd : 4 chenilles articulées déportées (ou exo-armures Juggernaut à bouclier balistique), lame de bulldozer en V à l'avant et tourelle casemate bimoteur + pod lance-roquettes.`,
  },
  {
    suffix: "v3_experimental_apex",
    versionNumber: 3,
    titlePrefix: "V3 — Anneau Tokamak & Aéroglisseur Mag-Lev à Turbines Ioniques",
    styleArchetype: "APEX_PLASMA",
    silhouetteProfile: "OCTAGONAL_BEVEL",
    armorChamferScale: 1.5,
    hullWidthScale: 1.04,
    hullLengthScale: 1.08,
    turretProfile: "COIL_OVERCHARGE",
    barrelLengthScale: 1.24,
    superstructureStyle: "DUAL_REACTOR",
    hazardStripeMode: "MINIMAL_SPECULAR",
    rivetDensity: "HIGH",
    energyCoreHue: "CYAN_PLASMA",
    specularContrast: 1.38,
    describeBuilding: (name) =>
      `Refonte haute-technologie de ${name} en Complexe Annulaire Tokamak : plateforme circulaire à confinement magnétique, anneau de plasma exposé en rotation et dômes énergétiques en lévitation.`,
    describeUnit: (name) =>
      `Refonte futuriste de ${name} en Aéroglisseur Mag-Lev (sans chenilles) : lévitation sur 4 turbines ioniques lumineuses (ou propulseurs Jump-Jet ailés pour l'infanterie), coque catamaran fendue et canon Railgun électromagnétique.`,
  },
  {
    suffix: "v4_tactical_vanguard",
    versionNumber: 4,
    titlePrefix: "V4 — Forteresse Losange Furtive & Châssis Delta 8×8 + Drone",
    styleArchetype: "TACTICAL_VANGUARD",
    silhouetteProfile: "ANGULAR_STEALTH",
    armorChamferScale: 0.82,
    hullWidthScale: 0.96,
    hullLengthScale: 1.12,
    turretProfile: "FINNED_STABILIZER",
    barrelLengthScale: 1.2,
    superstructureStyle: "COMMAND_ANTENNA",
    hazardStripeMode: "PERIMETER_WARNING",
    rivetDensity: "MEDIUM",
    energyCoreHue: "EMERALD_TIBERIUM",
    specularContrast: 1.18,
    describeBuilding: (name) =>
      `Refonte furtive de ${name} en Losange Angulaire F-117 : plateforme rhomboïde orientée à 45°, ailes déflectrices radar en flèche inversée, baies souterraines et réseau laser télémétrique.`,
    describeUnit: (name) =>
      `Refonte tactique de ${name} en Châssis Delta Furtif 8×8 / Escouade Spec-Ops : facettes furtives angulaires, roues blindées multi-essieux (ou drone de combat tri-rotor accompagnant l'infanterie) et tourelle téléopérée à canon long.`,
  },
];

export function resolveVariantMorphology(
  proposal: VectorVariantProposal
): StructuralMorphology {
  if (proposal.variantId === "v1_classic_mk1" || proposal.versionNumber === 1) {
    return "CLASSIC_MK1";
  }
  if (proposal.versionNumber === 2) {
    return "BASTION_CATAPHRACT";
  }
  if (proposal.versionNumber === 3) {
    return "TOKAMAK_MAGLEV";
  }
  if (proposal.versionNumber === 4) {
    return "STEALTH_DELTA_DRONE";
  }

  const prompt = (proposal.directivePrompt ?? "").toLowerCase();
  if (
    prompt.includes("mecha") ||
    prompt.includes("mécha") ||
    prompt.includes("patte") ||
    prompt.includes("walker") ||
    prompt.includes("catamaran")
  ) {
    return "MECH_CATAMARAN";
  }
  if (
    prompt.includes("ziggurat") ||
    prompt.includes("pyramide") ||
    prompt.includes("essaim") ||
    prompt.includes("hex")
  ) {
    return "ZIGGURAT_HEX_SWARM";
  }
  if (
    prompt.includes("hover") ||
    prompt.includes("maglev") ||
    prompt.includes("lévitation") ||
    prompt.includes("plasma") ||
    prompt.includes("tokamak")
  ) {
    return "TOKAMAK_MAGLEV";
  }
  if (
    prompt.includes("furtif") ||
    prompt.includes("stealth") ||
    prompt.includes("drone") ||
    prompt.includes("delta")
  ) {
    return "STEALTH_DELTA_DRONE";
  }
  if (
    prompt.includes("bastion") ||
    prompt.includes("bunker") ||
    prompt.includes("dozer") ||
    prompt.includes("lourd")
  ) {
    return "BASTION_CATAPHRACT";
  }

  const cycle: readonly StructuralMorphology[] = [
    "MECH_CATAMARAN",
    "ZIGGURAT_HEX_SWARM",
    "BASTION_CATAPHRACT",
    "TOKAMAK_MAGLEV",
    "STEALTH_DELTA_DRONE",
  ];
  return cycle[(proposal.versionNumber - 5 + (proposal.dna.customSeed & 3)) % cycle.length]!;
}

export function createBuiltInVariantsForAsset(
  descriptor: VectorAssetElementDescriptor
): VectorVariantProposal[] {
  const baseTimestamp = "2026-10-29T12:00:00.000Z";

  if (descriptor.category === "TERRAIN") {
    const presets =
      TERRAIN_VARIANT_PALETTES[descriptor.elementCode] ??
      TERRAIN_VARIANT_PALETTES.DIRT!;
    const suffixes = [
      "v1_classic_mk1",
      "v2_heavy_bastion",
      "v3_experimental_apex",
      "v4_tactical_vanguard",
    ];
    const archetypes: StyleArchetype[] = [
      "MILITARY_MK1",
      "HEAVY_BASTION",
      "APEX_PLASMA",
      "DESERT_STORM",
    ];

    return presets.map((p, idx): VectorVariantProposal => ({
      variantId: suffixes[idx] ?? `v${idx + 1}_terrain`,
      assetKey: descriptor.assetKey,
      category: "TERRAIN",
      elementCode: descriptor.elementCode,
      versionNumber: idx + 1,
      title: p.title,
      styleArchetype: archetypes[idx] ?? "MILITARY_MK1",
      author: "Leonardo (Illustrateur Vectoriel)",
      leonardoNote: p.note,
      directivePrompt: "",
      isBuiltIn: true,
      createdAt: baseTimestamp,
      dna: {
        silhouetteProfile: idx === 1 ? "OCTAGONAL_BEVEL" : idx === 2 ? "ANGULAR_STEALTH" : "STANDARD",
        armorChamferScale: 1 + idx * 0.15,
        hullWidthScale: 1,
        hullLengthScale: 1,
        turretProfile: "STANDARD",
        barrelLengthScale: 1,
        superstructureStyle: "CLASSIC",
        hazardStripeMode: "STANDARD",
        rivetDensity: "MEDIUM",
        energyCoreHue: idx === 2 ? "CYAN_PLASMA" : "FACTION",
        specularContrast: 1 + idx * 0.1,
        terrainFillHex: p.colors.fill,
        terrainLipShadowHex: p.colors.shadow,
        terrainLipHighlightHex: p.colors.highlight,
        terrainSecondaryHex: p.colors.secondary,
        terrainGeometryStyle: p.style,
        treeCanopyStyle: "CLASSIC",
        treePrimaryFoliageHex: "#15803d",
        treeSecondaryFoliageHex: "#14532d",
        treeAccentFoliageHex: "#22c55e",
        treeTrunkHex: "#5c4028",
        customSeed: hashDeterministic(`${descriptor.assetKey}:v${idx + 1}`),
      },
    }));
  }

  if (descriptor.category === "TREE") {
    return TREE_VARIANT_PRESETS.map((preset, idx): VectorVariantProposal => ({
      variantId: preset.suffix,
      assetKey: descriptor.assetKey,
      category: "TREE",
      elementCode: descriptor.elementCode,
      versionNumber: idx + 1,
      title: preset.title,
      styleArchetype: preset.archetype,
      author: "Leonardo (Illustrateur Vectoriel)",
      leonardoNote: `${descriptor.name} — ${preset.note}`,
      directivePrompt: "",
      isBuiltIn: true,
      createdAt: baseTimestamp,
      dna: {
        silhouetteProfile: "STANDARD",
        armorChamferScale: 1,
        hullWidthScale: 1 + idx * 0.04,
        hullLengthScale: 1 + idx * 0.04,
        turretProfile: "STANDARD",
        barrelLengthScale: 1,
        superstructureStyle: "CLASSIC",
        hazardStripeMode: "STANDARD",
        rivetDensity: "MEDIUM",
        energyCoreHue: idx === 2 ? "EMERALD_TIBERIUM" : "FACTION",
        specularContrast: 1.05,
        terrainFillHex: "#2f4f2d",
        terrainLipShadowHex: "#1b301a",
        terrainLipHighlightHex: "#467342",
        terrainSecondaryHex: "#22c55e",
        terrainGeometryStyle: "CLASSIC",
        treeCanopyStyle: preset.canopyStyle,
        treePrimaryFoliageHex: preset.primary,
        treeSecondaryFoliageHex: preset.secondary,
        treeAccentFoliageHex: preset.accent,
        treeTrunkHex: preset.trunk,
        customSeed: hashDeterministic(`${descriptor.assetKey}:v${idx + 1}`),
      },
    }));
  }

  return BUILDING_AND_UNIT_BUILT_IN_ARCHETYPES.map((arch): VectorVariantProposal => ({
    variantId: arch.suffix,
    assetKey: descriptor.assetKey,
    category: descriptor.category,
    elementCode: descriptor.elementCode,
    versionNumber: arch.versionNumber,
    title: arch.titlePrefix,
    styleArchetype: arch.styleArchetype,
    author: "Leonardo (Illustrateur Vectoriel)",
    leonardoNote:
      descriptor.category === "BUILDING"
        ? arch.describeBuilding(descriptor.name)
        : arch.describeUnit(descriptor.name),
    directivePrompt: "",
    isBuiltIn: true,
    createdAt: baseTimestamp,
    dna: {
      silhouetteProfile: arch.silhouetteProfile,
      armorChamferScale: arch.armorChamferScale,
      hullWidthScale: arch.hullWidthScale,
      hullLengthScale: arch.hullLengthScale,
      turretProfile: arch.turretProfile,
      barrelLengthScale: arch.barrelLengthScale,
      superstructureStyle: arch.superstructureStyle,
      hazardStripeMode: arch.hazardStripeMode,
      rivetDensity: arch.rivetDensity,
      energyCoreHue: arch.energyCoreHue,
      specularContrast: arch.specularContrast,
      terrainFillHex: "#334155",
      terrainLipShadowHex: "#1e293b",
      terrainLipHighlightHex: "#64748b",
      terrainSecondaryHex: "#94a3b8",
      terrainGeometryStyle: "CLASSIC",
      treeCanopyStyle: "CLASSIC",
      treePrimaryFoliageHex: "#15803d",
      treeSecondaryFoliageHex: "#14532d",
      treeAccentFoliageHex: "#22c55e",
      treeTrunkHex: "#5c4028",
      customSeed: hashDeterministic(`${descriptor.assetKey}:${arch.suffix}`),
    },
  }));
}

export function createInitialVectorVariantsState(): VectorVariantsState {
  const activeVariants: Record<string, string> = {};
  const catalog: Record<string, VectorVariantProposal[]> = {};

  for (const descriptor of VECTOR_ASSET_ELEMENTS) {
    const variants = createBuiltInVariantsForAsset(descriptor);
    catalog[descriptor.assetKey] = variants;
    activeVariants[descriptor.assetKey] = variants[0]!.variantId;
  }

  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date().toISOString(),
    activeVariants,
    catalog,
  };
}

const ARCHETYPE_LABELS: Record<StyleArchetype, string> = {
  MILITARY_MK1: "Standard Militaire Revu",
  HEAVY_BASTION: "Bastion Blindé Lourd",
  APEX_PLASMA: "Prototype Apex Plasma",
  TACTICAL_VANGUARD: "Avant-Garde Tactique",
  BRUTALIST_BUNKER: "Bunker Brutaliste Renforcé",
  CYBER_STEALTH: "Furtif Cybernétique",
  DESERT_STORM: "Tempête du Désert & Camo",
};

/**
 * Generates a brand-new, deterministic, never-reused version proposal (`V5`, `V6`, `V7`...)
 * signed by Leonardo for a given `descriptor` based on the next version number, optional archetype, and user prompt.
 */
export function synthesizeNewLeonardoVariantProposal(params: {
  descriptor: VectorAssetElementDescriptor;
  nextVersionNumber: number;
  styleArchetype?: StyleArchetype;
  directivePrompt?: string;
}): VectorVariantProposal {
  const { descriptor, nextVersionNumber } = params;
  const promptText = (params.directivePrompt ?? "").trim();
  const promptLower = promptText.toLowerCase();
  const seed = hashDeterministic(
    `${descriptor.assetKey}:v${nextVersionNumber}:${params.styleArchetype ?? "AUTO"}:${promptText}`,
    0x85ebca6b + nextVersionNumber * 7919
  );

  const archetypes: readonly StyleArchetype[] = [
    "HEAVY_BASTION",
    "APEX_PLASMA",
    "TACTICAL_VANGUARD",
    "BRUTALIST_BUNKER",
    "CYBER_STEALTH",
    "DESERT_STORM",
  ];
  const chosenArchetype: StyleArchetype =
    params.styleArchetype ??
    (promptLower.includes("plasma") || promptLower.includes("cyber") || promptLower.includes("laser")
      ? "APEX_PLASMA"
      : promptLower.includes("lourd") || promptLower.includes("blind") || promptLower.includes("bunker")
        ? "HEAVY_BASTION"
        : promptLower.includes("furtif") || promptLower.includes("stealth")
          ? "CYBER_STEALTH"
          : promptLower.includes("désert") || promptLower.includes("sable") || promptLower.includes("or")
            ? "DESERT_STORM"
            : archetypes[seed % archetypes.length]!);

  const silhouettes: readonly SilhouetteProfile[] = [
    "OCTAGONAL_BEVEL",
    "ANGULAR_STEALTH",
    "WIDENED_HEAVY",
    "COMPACT_REINFORCED",
  ];
  const turretProfiles: readonly TurretProfile[] = [
    "TWIN_BARREL",
    "ARMORED_MANTLET",
    "COIL_OVERCHARGE",
    "FINNED_STABILIZER",
  ];
  const superstructures: readonly SuperstructureStyle[] = [
    "DUAL_REACTOR",
    "COMMAND_ANTENNA",
    "REACTIVE_ERA_BLOCKS",
    "CRYO_CONDUITS",
    "SOLAR_VANES",
  ];
  const hazardModes: readonly HazardStripeMode[] = [
    "DOUBLE_CHEVRON",
    "PERIMETER_WARNING",
    "STANDARD",
    "MINIMAL_SPECULAR",
  ];
  const energyHues: readonly EnergyCoreHue[] = [
    "CYAN_PLASMA",
    "AMBER_THERMAL",
    "EMERALD_TIBERIUM",
    "CRIMSON_LASER",
    "VIOLET_QUANTUM",
    "FACTION",
  ];

  const silhouetteProfile: SilhouetteProfile =
    chosenArchetype === "CYBER_STEALTH"
      ? "ANGULAR_STEALTH"
      : chosenArchetype === "HEAVY_BASTION" || chosenArchetype === "BRUTALIST_BUNKER"
        ? "WIDENED_HEAVY"
        : silhouettes[seed % silhouettes.length]!;

  const turretProfile: TurretProfile =
    promptLower.includes("double") || promptLower.includes("twin")
      ? "TWIN_BARREL"
      : chosenArchetype === "APEX_PLASMA"
        ? "COIL_OVERCHARGE"
        : chosenArchetype === "HEAVY_BASTION"
          ? "ARMORED_MANTLET"
          : turretProfiles[(seed >>> 3) % turretProfiles.length]!;

  const superstructureStyle: SuperstructureStyle =
    chosenArchetype === "APEX_PLASMA"
      ? "DUAL_REACTOR"
      : chosenArchetype === "HEAVY_BASTION"
        ? "REACTIVE_ERA_BLOCKS"
        : chosenArchetype === "TACTICAL_VANGUARD"
          ? "COMMAND_ANTENNA"
          : superstructures[(seed >>> 6) % superstructures.length]!;

  const energyCoreHue: EnergyCoreHue =
    promptLower.includes("rouge") || promptLower.includes("laser")
      ? "CRIMSON_LASER"
      : promptLower.includes("vert") || promptLower.includes("tiberium")
        ? "EMERALD_TIBERIUM"
        : promptLower.includes("violet") || promptLower.includes("quantique")
          ? "VIOLET_QUANTUM"
          : promptLower.includes("ambre") || promptLower.includes("or")
            ? "AMBER_THERMAL"
            : energyHues[(seed >>> 9) % energyHues.length]!;

  const armorChamferScale = Number(
    (0.75 + ((seed & 0xff) / 255) * 0.95).toFixed(2)
  );
  const hullWidthScale = Number(
    (0.92 + (((seed >>> 8) & 0xff) / 255) * 0.22).toFixed(2)
  );
  const hullLengthScale = Number(
    (0.94 + (((seed >>> 16) & 0xff) / 255) * 0.2).toFixed(2)
  );
  const barrelLengthScale = Number(
    (0.95 + (((seed >>> 12) & 0xff) / 255) * 0.34).toFixed(2)
  );
  const specularContrast = Number(
    (0.95 + (((seed >>> 20) & 0xff) / 255) * 0.45).toFixed(2)
  );

  // Terrain procedural palette variation
  const terrainHuePairs: ReadonlyArray<TerrainDefaultColors> = [
    { fill: "#284b36", shadow: "#12261a", highlight: "#4ea870", secondary: "#6ee7b7" },
    { fill: "#4f3a24", shadow: "#291d10", highlight: "#8c6842", secondary: "#fcd34d" },
    { fill: "#2d3b4e", shadow: "#141c26", highlight: "#607d9e", secondary: "#7dd3fc" },
    { fill: "#3d2d4c", shadow: "#1d1426", highlight: "#7e5ea0", secondary: "#e879f9" },
    { fill: "#164e63", shadow: "#082f49", highlight: "#22d3ee", secondary: "#a5f3fc" },
    { fill: "#713f12", shadow: "#422006", highlight: "#eab308", secondary: "#fef08a" },
  ];
  const pickedTerrainColors =
    terrainHuePairs[seed % terrainHuePairs.length]!;
  const terrainStyles: readonly TerrainGeometryStyle[] = [
    "STRATIFIED_HEX",
    "CRYSTALLINE_PRISM",
    "ORGANIC_LUSH",
    "ARID_FRACTURED",
  ];
  const terrainGeometryStyle =
    terrainStyles[(seed >>> 4) % terrainStyles.length]!;

  // Tree procedural palette variation
  const treePalettes: ReadonlyArray<{
    style: TreeCanopyStyle;
    primary: string;
    secondary: string;
    accent: string;
    trunk: string;
  }> = [
    {
      style: "DENSE_MULTI_TIER",
      primary: "#15803d",
      secondary: "#052e16",
      accent: "#86efac",
      trunk: "#4a321f",
    },
    {
      style: "CRYSTAL_MUTATED",
      primary: "#0f766e",
      secondary: "#134e4a",
      accent: "#2dd4bf",
      trunk: "#334155",
    },
    {
      style: "ANCIENT_AUTUMN",
      primary: "#c2410c",
      secondary: "#7c2d12",
      accent: "#fdba74",
      trunk: "#432818",
    },
    {
      style: "WIND_SWEPT",
      primary: "#3f6212",
      secondary: "#1a2e05",
      accent: "#bef264",
      trunk: "#573d26",
    },
  ];
  const pickedTree = treePalettes[seed % treePalettes.length]!;

  const cycleMorph: readonly StructuralMorphology[] = [
    "MECH_CATAMARAN",
    "ZIGGURAT_HEX_SWARM",
    "BASTION_CATAPHRACT",
    "TOKAMAK_MAGLEV",
    "STEALTH_DELTA_DRONE",
  ];
  const previewMorph =
    cycleMorph[(nextVersionNumber - 5 + (seed & 3)) % cycleMorph.length]!;
  const morphLabel = MORPHOLOGY_LABELS[previewMorph];

  const archetypeLabel = ARCHETYPE_LABELS[chosenArchetype];
  const customTitleSuffix = promptText
    ? ` — « ${promptText.slice(0, 32)}${promptText.length > 32 ? "…" : ""} »`
    : ` (${morphLabel})`;

  const title = `V${nextVersionNumber} — ${archetypeLabel}${customTitleSuffix}`;

  const leonardoNote =
    descriptor.category === "TERRAIN"
      ? `Refonte topographique V${nextVersionNumber} (${morphLabel}) pour ${descriptor.name} : géométrie ${terrainGeometryStyle}, strates ${pickedTerrainColors.fill} et reliefs spéculaires ${pickedTerrainColors.highlight}.${promptText ? ` Consigne appliquée : "${promptText}".` : ""}`
      : descriptor.category === "TREE"
        ? `Refonte botanique V${nextVersionNumber} (${morphLabel}) pour ${descriptor.name} : canopée ${pickedTree.style}, feuillage ${pickedTree.primary}/${pickedTree.accent} et tronc ${pickedTree.trunk}.${promptText ? ` Consigne appliquée : "${promptText}".` : ""}`
        : `Refonte structurelle V${nextVersionNumber} (${morphLabel}) pour ${descriptor.name} : châssis ${silhouetteProfile} (×${hullWidthScale}×${hullLengthScale}), architecture ${superstructureStyle}, armement ${turretProfile} (canon ×${barrelLengthScale}) et noyau ${energyCoreHue}.${promptText ? ` Consigne appliquée : "${promptText}".` : ""}`;

  return {
    variantId: `v${nextVersionNumber}_leonardo_${seed.toString(16).slice(0, 6)}`,
    assetKey: descriptor.assetKey,
    category: descriptor.category,
    elementCode: descriptor.elementCode,
    versionNumber: nextVersionNumber,
    title,
    styleArchetype: chosenArchetype,
    author: "Leonardo (Illustrateur Vectoriel)",
    leonardoNote,
    directivePrompt: promptText,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    dna: {
      silhouetteProfile,
      armorChamferScale,
      hullWidthScale,
      hullLengthScale,
      turretProfile,
      barrelLengthScale,
      superstructureStyle,
      hazardStripeMode: hazardModes[(seed >>> 11) % hazardModes.length]!,
      rivetDensity: (seed & 1) === 0 ? "HEAVY_BOLTED" : "HIGH",
      energyCoreHue,
      specularContrast,
      terrainFillHex: pickedTerrainColors.fill,
      terrainLipShadowHex: pickedTerrainColors.shadow,
      terrainLipHighlightHex: pickedTerrainColors.highlight,
      terrainSecondaryHex: pickedTerrainColors.secondary,
      terrainGeometryStyle,
      treeCanopyStyle: pickedTree.style,
      treePrimaryFoliageHex: pickedTree.primary,
      treeSecondaryFoliageHex: pickedTree.secondary,
      treeAccentFoliageHex: pickedTree.accent,
      treeTrunkHex: pickedTree.trunk,
      customSeed: seed,
    },
  };
}

// ============================================================================
// RUNTIME ACTIVE VECTOR VARIANT REGISTRY (Client & Server synchronized)
// ============================================================================

let runtimeVectorState: VectorVariantsState = createInitialVectorVariantsState();
let runtimeSignatureHash = 1;

function recomputeRuntimeSignature(state: VectorVariantsState): number {
  let h = 2166136261 ^ state.revision;
  for (const descriptor of VECTOR_ASSET_ELEMENTS) {
    const vid = state.activeVariants[descriptor.assetKey] ?? "v1_classic_mk1";
    for (let i = 0; i < vid.length; i++) {
      h ^= vid.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0) || 1;
}

export function setActiveVectorVariantConfig(state: VectorVariantsState): void {
  runtimeVectorState = state;
  runtimeSignatureHash = recomputeRuntimeSignature(state);
}

export function getActiveVectorVariantConfig(): VectorVariantsState {
  return runtimeVectorState;
}

export function getActiveVectorConfigSignature(): number {
  return runtimeSignatureHash;
}

export function getActiveVectorVariant(assetKey: string): VectorVariantProposal {
  const list = runtimeVectorState.catalog[assetKey];
  const activeId = runtimeVectorState.activeVariants[assetKey];
  if (list && list.length > 0) {
    const found = list.find((v) => v.variantId === activeId);
    if (found) return found;
    return list[0]!;
  }
  const descriptor =
    VECTOR_ASSET_ELEMENTS.find((d) => d.assetKey === assetKey) ??
    VECTOR_ASSET_ELEMENTS[0]!;
  return createBuiltInVariantsForAsset(descriptor)[0]!;
}

export function getActiveBuildingVariant(kind: BuildingKind): VectorVariantProposal {
  return getActiveVectorVariant(`BUILDING:${kind}`);
}

export function getActiveUnitVariant(kind: UnitKind): VectorVariantProposal {
  return getActiveVectorVariant(`UNIT:${kind}`);
}

const NUMERIC_TERRAIN_TO_ASSET_KEY: Record<number, string> = {
  [TERRAIN_KIND.DIRT]: "TERRAIN:DIRT",
  [TERRAIN_KIND.STONE]: "TERRAIN:STONE",
  [TERRAIN_KIND.CLIFF]: "TERRAIN:CLIFF",
  [TERRAIN_KIND.ORE]: "TERRAIN:ORE",
  [TERRAIN_KIND.GRASS]: "TERRAIN:GRASS",
  [TERRAIN_KIND.CONCRETE_SLAB]: "TERRAIN:CONCRETE_SLAB",
  [TERRAIN_KIND.SILVER_ORE]: "TERRAIN:SILVER_ORE",
  [TERRAIN_KIND.WATER]: "TERRAIN:WATER",
  [TERRAIN_KIND.SAND]: "TERRAIN:SAND",
  [TERRAIN_KIND.SWAMP]: "TERRAIN:SWAMP",
};

export function getActiveTerrainVariantByNumericKind(
  numericKind: number
): VectorVariantProposal {
  const key = NUMERIC_TERRAIN_TO_ASSET_KEY[numericKind] ?? "TERRAIN:DIRT";
  return getActiveVectorVariant(key);
}

export function getActiveTreeVariant(kind: TreeKind): VectorVariantProposal {
  return getActiveVectorVariant(`TREE:${kind}`);
}

export function summarizeVectorVariantsState(state: VectorVariantsState): {
  totalAssets: number;
  totalVariants: number;
  modifiedAssetsCount: number;
  customGeneratedCount: number;
  revision: number;
  updatedAt: string;
} {
  let totalVariants = 0;
  let modifiedAssetsCount = 0;
  let customGeneratedCount = 0;

  for (const descriptor of VECTOR_ASSET_ELEMENTS) {
    const list = state.catalog[descriptor.assetKey] ?? [];
    totalVariants += list.length;
    for (const v of list) {
      if (!v.isBuiltIn) customGeneratedCount++;
    }
    const activeId = state.activeVariants[descriptor.assetKey];
    if (activeId && activeId !== "v1_classic_mk1") {
      modifiedAssetsCount++;
    }
  }

  return {
    totalAssets: VECTOR_ASSET_ELEMENTS.length,
    totalVariants,
    modifiedAssetsCount,
    customGeneratedCount,
    revision: state.revision,
    updatedAt: state.updatedAt,
  };
}
