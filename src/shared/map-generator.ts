export interface MapCoord {
  x: number;
  y: number;
}

export interface ProceduralOrePatchSpec {
  id: string;
  kind: "NATURAL_EXPANSION" | "REGIONAL_EXPANSION" | "CONTESTED_BASIN";
  quadrantIndex: number | null;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  lobeDx: number;
  lobeDy: number;
  lobeR: number;
  amount: number;
}

export interface ProceduralSilverDepositSpec {
  id: string;
  kind: "REGIONAL" | "CONTESTED_CENTRAL";
  quadrantIndex: number | null;
  x: number; // Top-left tile X of the 2x2 SILVER_ORE boulder
  y: number; // Top-left tile Y of the 2x2 SILVER_ORE boulder
}

export interface ProceduralTreePlacement {
  x: number;
  y: number;
  kind: "TREE_PINE" | "TREE_OAK" | "TREE_PALM";
  scale: number;
}

export type MapSizePresetId =
  | "LEGACY_1X"
  | "SKIRMISH_4X"
  | "TACTICAL_5X"
  | "STRATEGIC_7X"
  | "COLOSSAL_9X";

export interface MapSizePresetSpec {
  id: MapSizePresetId;
  label: string;
  widthTiles: number;
  heightTiles: number;
  totalTiles: number;
  areaMultiplierVsLegacy: number;
  recommendedPlayers: readonly [number, number];
  offscreenCanvasPixels: string;
  description: string;
}

// ============================================================================
// SECTION SPÉCIALE : RÈGLES DE GÉNÉRATION PROCÉDURALE & TAILLES DE CARTES
// Cette section centralise l'ensemble des critères de base, distances de
// sécurité et paramètres d'équilibrage de la génération procédurale par seed.
// Elle est conçue pour être étudiée, auditée et affinée au fil des versions.
// ============================================================================

export const LEGACY_MAP_WIDTH_TILES = 72;
export const LEGACY_MAP_HEIGHT_TILES = 72;
export const LEGACY_MAP_TOTAL_TILES = LEGACY_MAP_WIDTH_TILES * LEGACY_MAP_HEIGHT_TILES; // 5,184 tiles

/**
 * Catalogue des tailles de cartes étudiées et adaptées au moteur RTS 20 Hz + OffscreenCanvas.
 * La taille active par défaut est `TACTICAL_5X` (160x160 = 25,600 tuiles, soit ~4.94x la surface de 72x72).
 */
export const MAP_SIZE_PRESETS: Record<MapSizePresetId, MapSizePresetSpec> = {
  LEGACY_1X: {
    id: "LEGACY_1X",
    label: "Compacte Historique (1×)",
    widthTiles: 72,
    heightTiles: 72,
    totalTiles: 5184,
    areaMultiplierVsLegacy: 1.0,
    recommendedPlayers: [2, 2],
    offscreenCanvasPixels: "2304×2304",
    description:
      "Ancien format compact (v1.7–v1.9). Conservé uniquement comme référence historique de comparaison.",
  },
  SKIRMISH_4X: {
    id: "SKIRMISH_4X",
    label: "Escarmouche Standard (4×)",
    widthTiles: 144,
    heightTiles: 144,
    totalTiles: 20736,
    areaMultiplierVsLegacy: 4.0,
    recommendedPlayers: [2, 4],
    offscreenCanvasPixels: "4608×4608",
    description:
      "Seuil minimal 4× en superficie (20 736 tuiles). Adapté aux duels 1v1 rapides avec expansions proches.",
  },
  TACTICAL_5X: {
    id: "TACTICAL_5X",
    label: "Théâtre Tactique Étendu (~5× — Défaut)",
    widthTiles: 160,
    heightTiles: 160,
    totalTiles: 25600,
    areaMultiplierVsLegacy: 4.94,
    recommendedPlayers: [2, 4],
    offscreenCanvasPixels: "5120×5120",
    description:
      "Taille optimale par défaut (25 600 tuiles, ~5× plus grande que 72×72) : offre une vraie profondeur stratégique (bases à >110 blocs, expansions multiples, mines d'argent régionales) tout en garantissant 60 FPS constants et un tick serveur < 2 ms.",
  },
  STRATEGIC_7X: {
    id: "STRATEGIC_7X",
    label: "Grand Théâtre Stratégique (7.1×)",
    widthTiles: 192,
    heightTiles: 192,
    totalTiles: 36864,
    areaMultiplierVsLegacy: 7.11,
    recommendedPlayers: [2, 4],
    offscreenCanvasPixels: "6144×6144",
    description:
      "Carte haute capacité (36 864 tuiles) privilégiant les manœuvres de contournement à longue portée et la guerre logistique.",
  },
  COLOSSAL_9X: {
    id: "COLOSSAL_9X",
    label: "Secteur Continental (9×)",
    widthTiles: 216,
    heightTiles: 216,
    totalTiles: 46656,
    areaMultiplierVsLegacy: 9.0,
    recommendedPlayers: [4, 4],
    offscreenCanvasPixels: "6912×6912",
    description:
      "Format géant (46 656 tuiles, plafond recommandé sous la limite matérielle 8K des textures GPU OffscreenCanvas mobiles).",
  },
};

export const DEFAULT_MAP_SIZE_PRESET: MapSizePresetId = "TACTICAL_5X";

export interface MapGenerationRules {
  /** Version du référentiel de règles procédurales */
  readonly rulesVersion: string;
  /** Dimensions actives par défaut (160×160 = 25 600 blocs, soit 4.94× l'ancienne carte 72×72) */
  readonly defaultWidthTiles: number;
  readonly defaultHeightTiles: number;

  /**
   * RÈGLE 1 — PLACEMENT DES BASES & SPAWNS ENNEMIS
   * Garantit que les bases ennemies ne sont jamais générées à moins de XX blocs
   * et disposent d'un périmètre de déploiement dégagé.
   */
  readonly spawnRules: {
    /** Distance minimale stricte (en blocs/tuiles) entre les centres de deux bases ennemies (>= 96 blocs) */
    readonly minEnemyBaseDistanceTiles: number;
    /** Marge minimale (en blocs) entre la bordure de la carte et la dalle 8×8 de départ */
    readonly minBorderMarginTiles: number;
    /** Variation aléatoire maximale (en blocs) de l'ancrage de chaque base dans son quadrant selon le seed */
    readonly maxSpawnAnchorJitterTiles: number;
    /** Taille de la dalle de béton armé de départ (8×8 blocs) */
    readonly spawnConcretePadSizeTiles: number;
    /** Rayon du socle rocheux (STONE) entourant la dalle de départ */
    readonly spawnStoneHaloRadiusTiles: number;
    /** Rayon de la zone de transition en terre (DIRT) autour du socle */
    readonly spawnDirtTransitionRadiusTiles: number;
    /** Rayon de sécurité autour du spawn interdit aux falaises et aux arbres */
    readonly minSpawnObstacleClearanceRadiusTiles: number;
  };

  /**
   * RÈGLE 2 — PLACEMENT DES GISEMENTS DE MINERAI CLASSIQUE (TERRAIN_KIND.ORE)
   * Interdit tout minerai trop proche du spawn tout en garantissant un premier filon
   * d'expansion naturelle à distance équitable pour chaque commandant.
   */
  readonly oreRules: {
    /** Distance minimale stricte (en blocs) entre le centre d'un spawn et toute tuile de minerai (>= 20 blocs) */
    readonly minDistanceFromSpawnTiles: number;
    /** Distance maximale (en blocs) entre un spawn et son premier filon naturel pour éviter une famine au départ */
    readonly maxNaturalOreDistanceFromSpawnTiles: number;
    /** Distance minimale (en blocs) entre les centres de deux gisements de minerai distincts */
    readonly minDistanceBetweenOrePatchesTiles: number;
    /** Nombre de filons de minerai par quadrant (1 filon naturel + 1 filon d'expansion régionale) */
    readonly expansionVeinsPerQuadrant: number;
    /** Nombre de grands bassins de minerai contestés au centre et sur les flancs */
    readonly contestedCentralBasinsCount: number;
    /** Plage de richesse (crédits par tuile) des filons naturels */
    readonly naturalVeinRichnessRange: readonly [number, number];
    /** Plage de richesse (crédits par tuile) des grands bassins centraux contestés */
    readonly contestedBasinRichnessRange: readonly [number, number];
  };

  /**
   * RÈGLE 3 — PLACEMENT DES MINES D'ARGENT (ROCHERS 2×2 TERRAIN_KIND.SILVER_ORE)
   * Interdit toute mine d'argent trop proche du spawn : les gisements 2×2 sont placés
   * en territoire d'expansion médian ou central contesté.
   */
  readonly silverMineRules: {
    /** Distance minimale stricte (en blocs) entre le centre d'un spawn et tout rocher 2×2 d'argent (>= 28 blocs) */
    readonly minDistanceFromSpawnTiles: number;
    /** Distance maximale (en blocs) entre le spawn d'un quadrant et son gisement d'argent régional */
    readonly maxRegionalDistanceFromSpawnTiles: number;
    /** Distance minimale (en blocs) entre deux gisements d'argent 2×2 */
    readonly minDistanceBetweenSilverDepositsTiles: number;
    /** Dégagement minimal (en blocs) autour du 2×2 sans aucune falaise ni minerai (pour l'arrimage du Robot Constructeur) */
    readonly minClearanceFromCliffsTiles: number;
    /** Nombre de gisements 2×2 d'argent régionaux par quadrant (1 par quadrant = 4) */
    readonly regionalDepositsPerQuadrant: number;
    /** Nombre de gisements 2×2 d'argent centraux contestés (2 au centre = 6 au total) */
    readonly contestedCentralDepositsCount: number;
  };

  /**
   * RÈGLE 4 — RELIEF, FALAISES (CLIFF) & VÉGÉTATION DESTRUCTIBLE (TREE)
   * Garantit des couloirs de manœuvre larges sans jamais bloquer les sorties de base.
   */
  readonly terrainAndCoverRules: {
    /** Distance minimale (en blocs) entre le centre d'un spawn et toute falaise infranchissable */
    readonly minCliffDistanceFromSpawnTiles: number;
    /** Largeur minimale (en blocs) des cols et passages tactiques entre deux crêtes rocheuses */
    readonly minTacticalPassWidthTiles: number;
    /** Rayon central dégagé de toute falaise au cœur de la carte */
    readonly minCentralBasinClearanceTiles: number;
    /** Nombre de crêtes rocheuses procédurales sur la carte */
    readonly cliffRidgeCount: number;
    /** Distance minimale (en blocs) entre le centre d'un spawn et tout arbre */
    readonly minTreeDistanceFromSpawnTiles: number;
    /** Nombre de bosquets d'arbres destructibles générés procéduralement */
    readonly treeGroveCount: number;
  };
}

export const MAP_GENERATION_RULES: MapGenerationRules = {
  rulesVersion: "1.10.0",
  defaultWidthTiles: MAP_SIZE_PRESETS[DEFAULT_MAP_SIZE_PRESET].widthTiles, // 160
  defaultHeightTiles: MAP_SIZE_PRESETS[DEFAULT_MAP_SIZE_PRESET].heightTiles, // 160

  spawnRules: {
    minEnemyBaseDistanceTiles: 96,
    minBorderMarginTiles: 6,
    maxSpawnAnchorJitterTiles: 8,
    spawnConcretePadSizeTiles: 8,
    spawnStoneHaloRadiusTiles: 9.2,
    spawnDirtTransitionRadiusTiles: 13.5,
    minSpawnObstacleClearanceRadiusTiles: 15,
  },

  oreRules: {
    minDistanceFromSpawnTiles: 20,
    maxNaturalOreDistanceFromSpawnTiles: 34,
    minDistanceBetweenOrePatchesTiles: 15,
    expansionVeinsPerQuadrant: 2,
    contestedCentralBasinsCount: 5,
    naturalVeinRichnessRange: [680, 860],
    contestedBasinRichnessRange: [880, 1150],
  },

  silverMineRules: {
    minDistanceFromSpawnTiles: 28,
    maxRegionalDistanceFromSpawnTiles: 52,
    minDistanceBetweenSilverDepositsTiles: 24,
    minClearanceFromCliffsTiles: 3,
    regionalDepositsPerQuadrant: 1,
    contestedCentralDepositsCount: 2,
  },

  terrainAndCoverRules: {
    minCliffDistanceFromSpawnTiles: 28,
    minTacticalPassWidthTiles: 8,
    minCentralBasinClearanceTiles: 14,
    cliffRidgeCount: 8,
    minTreeDistanceFromSpawnTiles: 15,
    treeGroveCount: 20,
  },
} as const;

// ============================================================================
// FIN DE LA SECTION SPÉCIALE DES RÈGLES DE GÉNÉRATION PROCÉDURALE
// ============================================================================

const TERRAIN_CODES = {
  DIRT: 0,
  STONE: 1,
  CLIFF: 2,
  ORE: 3,
  GRASS: 4,
  CONCRETE_SLAB: 5,
  SILVER_ORE: 6,
} as const;

export interface SeededRng {
  /** Returns a float in [0, 1) */
  next: () => number;
  /** Returns a float in [min, max) */
  range: (min: number, max: number) => number;
  /** Returns an integer in [min, max] inclusive */
  int: (min: number, max: number) => number;
}

/**
 * Normalizes any numeric or string seed into a strictly positive 32-bit integer (1 .. 2147483647).
 */
export function normalizeMapSeed(seedInput?: number | string | null): number {
  if (typeof seedInput === "number" && Number.isFinite(seedInput)) {
    const intVal = Math.abs(Math.trunc(seedInput)) % 2147483647;
    return intVal > 0 ? intVal : 104729;
  }
  if (typeof seedInput === "string" && seedInput.trim().length > 0) {
    const trimmed = seedInput.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        const clamped = parsed % 2147483647;
        return clamped > 0 ? clamped : 104729;
      }
    }
    // FNV-1a 32-bit hash
    let hash = 2166136261;
    for (let i = 0; i < trimmed.length; i++) {
      hash ^= trimmed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const positive = (hash >>> 0) % 2147483647;
    return positive > 0 ? positive : 104729;
  }
  return generateRandomMapSeed();
}

let seedEntropyCounter = 1;

/**
 * Generates a fresh 9-digit positive integer seed (100,000,000 .. 999,999,999) for a new match.
 */
export function generateRandomMapSeed(entropyHint = Date.now()): number {
  seedEntropyCounter = (seedEntropyCounter + 1) & 0x7fffffff;
  const randomBits = Math.floor(Math.random() * 0x7fffffff);
  const timeBits = Math.trunc(entropyHint) & 0x7fffffff;
  let mixed = (randomBits ^ Math.imul(timeBits, 2654435761) ^ Math.imul(seedEntropyCounter, 2246822519)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 2246822507) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 3266489909) >>> 0;
  mixed = (mixed ^ (mixed >>> 16)) >>> 0;
  return 100_000_000 + (mixed % 900_000_000);
}

/**
 * Deterministic Mulberry32 PRNG seeded with a 32-bit integer.
 */
export function createSeededRng(seed: number): SeededRng {
  let state = normalizeMapSeed(seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
  };
}

function hashGrid2D(ix: number, iy: number, seed: number): number {
  let h =
    (Math.imul(ix, 374761393) ^
      Math.imul(iy, 668265263) ^
      Math.imul(seed, 1274126177)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic 2D value noise in [-1, 1] parameterized by `seed`.
 */
export function seededValueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const v00 = hashGrid2D(ix, iy, seed);
  const v10 = hashGrid2D(ix + 1, iy, seed);
  const v01 = hashGrid2D(ix, iy + 1, seed);
  const v11 = hashGrid2D(ix + 1, iy + 1, seed);

  const nx0 = v00 + (v10 - v00) * fx;
  const nx1 = v01 + (v11 - v01) * fx;
  return (nx0 + (nx1 - nx0) * fy) * 2 - 1;
}

/**
 * 2-octave Fractional Brownian Motion (fBm) in [-1, 1] for organic terrain contours.
 */
export function seededFbm2D(x: number, y: number, seed: number): number {
  const n1 = seededValueNoise2D(x, y, seed);
  const n2 = seededValueNoise2D(x * 2.07 + 19.3, y * 2.07 - 11.7, seed ^ 0x5bf03635);
  return n1 * 0.68 + n2 * 0.32;
}

export interface ProceduralMapData {
  seed: number;
  width: number;
  height: number;
  terrainGrid: number[];
  oreGrid: number[];
  spawnPads: MapCoord[];
  orePatches: ProceduralOrePatchSpec[];
  silverDeposits: ProceduralSilverDepositSpec[];
  trees: ProceduralTreePlacement[];
}

export interface MapRuleValidationReport {
  valid: boolean;
  seed: number;
  width: number;
  height: number;
  areaMultiplierVsLegacy: number;
  minObservedEnemyBaseDistance: number;
  minObservedOreDistanceFromSpawn: number;
  maxObservedNaturalOreDistanceFromSpawn: number;
  minObservedSilverDistanceFromSpawn: number;
  minObservedBetweenSilverDistance: number;
  oreTileCount: number;
  silverDepositCount: number;
  treeCount: number;
  violations: string[];
}

function getPadCenter(pad: MapCoord, padSize: number): MapCoord {
  const half = (padSize - 1) * 0.5;
  return {
    x: pad.x + half,
    y: pad.y + half,
  };
}

/**
 * Generates a complete procedural RTS battlefield from a `seed` while enforcing
 * every constraint defined in `MAP_GENERATION_RULES`.
 */
export function generateProceduralMap(options?: {
  seed?: number | string;
  width?: number;
  height?: number;
  rules?: MapGenerationRules;
}): ProceduralMapData {
  const rules = options?.rules ?? MAP_GENERATION_RULES;
  const seed = normalizeMapSeed(options?.seed);
  const width = options?.width ?? rules.defaultWidthTiles;
  const height = options?.height ?? rules.defaultHeightTiles;
  const rng = createSeededRng(seed);

  const total = width * height;
  const terrainGrid = new Array<number>(total).fill(TERRAIN_CODES.GRASS);
  const oreGrid = new Array<number>(total).fill(0);

  const padSize = rules.spawnRules.spawnConcretePadSizeTiles;
  const minMargin = rules.spawnRules.minBorderMarginTiles;
  const maxJitter = rules.spawnRules.maxSpawnAnchorJitterTiles;

  // --------------------------------------------------------------------------
  // 1. PROCEDURAL SPAWN PADS (4 Quadrant Bases with Seeded Anchor Jitter)
  // --------------------------------------------------------------------------
  // Quadrant 0: NW, Quadrant 1: SE, Quadrant 2: NE, Quadrant 3: SW
  // Anchors are jittered deterministically while guaranteeing minEnemyBaseDistanceTiles.
  const maxAllowedMargin = Math.max(
    minMargin,
    Math.min(
      minMargin + maxJitter,
      Math.floor((Math.min(width, height) - rules.spawnRules.minEnemyBaseDistanceTiles - padSize) * 0.5)
    )
  );

  const rawQuadrantPads: MapCoord[] = [
    {
      x: rng.int(minMargin, maxAllowedMargin),
      y: rng.int(minMargin, maxAllowedMargin),
    },
    {
      x: width - padSize - rng.int(minMargin, maxAllowedMargin),
      y: height - padSize - rng.int(minMargin, maxAllowedMargin),
    },
    {
      x: width - padSize - rng.int(minMargin, maxAllowedMargin),
      y: rng.int(minMargin, maxAllowedMargin),
    },
    {
      x: rng.int(minMargin, maxAllowedMargin),
      y: height - padSize - rng.int(minMargin, maxAllowedMargin),
    },
  ];

  // Deterministic permutation of enemy quadrants (1, 2, 3) so a 2-player match can face SE, NE, or SW
  const enemyOrder = [1, 2, 3];
  for (let i = enemyOrder.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = enemyOrder[i]!;
    enemyOrder[i] = enemyOrder[j]!;
    enemyOrder[j] = tmp;
  }

  const spawnPads: MapCoord[] = [
    rawQuadrantPads[0]!,
    rawQuadrantPads[enemyOrder[0]!]!,
    rawQuadrantPads[enemyOrder[1]!]!,
    rawQuadrantPads[enemyOrder[2]!]!,
  ];

  const midX = (width - 1) * 0.5;
  const midY = (height - 1) * 0.5;

  // --------------------------------------------------------------------------
  // 2. ORGANIC GEOLOGICAL STRATA (GRASS -> DIRT VALLEYS -> STONE HALOS -> 8x8 CONCRETE PADS)
  // --------------------------------------------------------------------------
  const valleyAngle = rng.range(-0.45, 0.45);
  const cosV = Math.cos(valleyAngle);
  const sinV = Math.sin(valleyAngle);
  const secondaryValleyFlip = rng.next() < 0.5 ? 1 : -1;
  const centralBasinRadius = Math.min(width, height) * rng.range(0.14, 0.18);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dxMid = x - midX;
      const dyMid = y - midY;
      const distCenter = Math.hypot(dxMid, dyMid);

      const fbm = seededFbm2D(x * 0.045, y * 0.045, seed);
      const diagMain = Math.abs(dxMid * sinV - dyMid * cosV + fbm * 9.5);
      const diagCross = Math.abs(
        (x - midX) * secondaryValleyFlip - (y - midY) * 0.85 + fbm * 11.0
      );

      if (
        distCenter + fbm * 7.5 <= centralBasinRadius ||
        diagMain <= 5.4 ||
        (diagCross <= 4.2 && distCenter <= Math.min(width, height) * 0.36) ||
        fbm > 0.42
      ) {
        terrainGrid[idx] = TERRAIN_CODES.DIRT;
      }

      if (fbm < -0.52 && distCenter > 18) {
        terrainGrid[idx] = TERRAIN_CODES.STONE;
      }
    }
  }

  // Stamp Stone & Dirt transition halos and 8x8 Concrete Slab spawn pads
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let minSpawnCenterDist = Infinity;
      let onSpawnPad = false;

      for (const pad of spawnPads) {
        if (x >= pad.x && x < pad.x + padSize && y >= pad.y && y < pad.y + padSize) {
          onSpawnPad = true;
        }
        const center = getPadCenter(pad, padSize);
        const d = Math.hypot(x - center.x, y - center.y);
        if (d < minSpawnCenterDist) {
          minSpawnCenterDist = d;
        }
      }

      if (onSpawnPad) {
        terrainGrid[idx] = TERRAIN_CODES.CONCRETE_SLAB;
      } else if (minSpawnCenterDist <= rules.spawnRules.spawnStoneHaloRadiusTiles) {
        terrainGrid[idx] = TERRAIN_CODES.STONE;
      } else if (minSpawnCenterDist <= rules.spawnRules.spawnDirtTransitionRadiusTiles) {
        terrainGrid[idx] = TERRAIN_CODES.DIRT;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. PROCEDURAL ORE DEPOSITS (NATURAL EXPANSIONS, REGIONAL VEINS & CONTESTED BASINS)
  // Strictly enforces:
  // - minDistanceFromSpawnTiles (>= 20 tiles from any spawn center)
  // - maxNaturalOreDistanceFromSpawnTiles (<= 34 tiles for each base's natural vein)
  // - minDistanceBetweenOrePatchesTiles (>= 15 tiles between patch centers)
  // --------------------------------------------------------------------------
  const orePatches: ProceduralOrePatchSpec[] = [];
  const quadrantNaturalVeinHighAngle: boolean[] = [];

  for (let q = 0; q < 4; q++) {
    const pad = rawQuadrantPads[q]!;
    const center = getPadCenter(pad, padSize);
    const dirX = center.x < midX ? 1 : -1;
    const dirY = center.y < midY ? 1 : -1;

    // Pick whether the natural ore vein sits along the low-angle corridor (~14°..24°) or high-angle corridor (~66°..76°)
    const useHighAngle = rng.next() < 0.5;
    quadrantNaturalVeinHighAngle.push(useHighAngle);

    const natAngle = useHighAngle
      ? rng.range(1.12, 1.32) // ~64°..76°
      : rng.range(0.25, 0.45); // ~14°..26°
    const natDist = rng.range(
      rules.oreRules.minDistanceFromSpawnTiles + 5.2,
      rules.oreRules.maxNaturalOreDistanceFromSpawnTiles - 4.8
    ); // ~25.2 .. 29.2 tiles from spawn center

    const natCx = Math.max(
      8,
      Math.min(width - 9, Math.round(center.x + dirX * Math.cos(natAngle) * natDist))
    );
    const natCy = Math.max(
      8,
      Math.min(height - 9, Math.round(center.y + dirY * Math.sin(natAngle) * natDist))
    );

    orePatches.push({
      id: `ore_natural_q${q}`,
      kind: "NATURAL_EXPANSION",
      quadrantIndex: q,
      cx: natCx,
      cy: natCy,
      rx: rng.range(3.4, 4.1),
      ry: rng.range(2.2, 2.8),
      angle: rng.range(-0.85, 0.85),
      lobeDx: dirX * rng.int(1, 2),
      lobeDy: dirY * rng.int(1, 2),
      lobeR: rng.range(1.9, 2.4),
      amount:
        Math.round(
          rng.range(
            rules.oreRules.naturalVeinRichnessRange[0],
            rules.oreRules.naturalVeinRichnessRange[1]
          ) / 25
        ) * 25,
    });

    // Secondary regional expansion vein further out along the flank (~45..54 tiles from spawn center)
    const secAngle = rng.range(0.55, 1.02);
    const secDist = rng.range(45, 54);
    const secCx = Math.max(
      10,
      Math.min(width - 11, Math.round(center.x + dirX * Math.cos(secAngle) * secDist))
    );
    const secCy = Math.max(
      10,
      Math.min(height - 11, Math.round(center.y + dirY * Math.sin(secAngle) * secDist))
    );

    if (
      orePatches.every(
        (existing) =>
          Math.hypot(existing.cx - secCx, existing.cy - secCy) >=
          rules.oreRules.minDistanceBetweenOrePatchesTiles
      )
    ) {
      orePatches.push({
        id: `ore_regional_q${q}`,
        kind: "REGIONAL_EXPANSION",
        quadrantIndex: q,
        cx: secCx,
        cy: secCy,
        rx: rng.range(2.8, 3.6),
        ry: rng.range(1.9, 2.5),
        angle: rng.range(-1.1, 1.1),
        lobeDx: -dirX * rng.int(1, 2),
        lobeDy: dirY * rng.int(1, 2),
        lobeR: rng.range(1.6, 2.2),
        amount:
          Math.round(
            rng.range(
              rules.oreRules.naturalVeinRichnessRange[0] - 60,
              rules.oreRules.naturalVeinRichnessRange[1]
            ) / 25
          ) * 25,
      });
    }
  }

  // Contested central & flank basins (5 high-yield multi-lobed deposits)
  const centralCandidates: Array<{ cx: number; cy: number; rx: number; ry: number }> = [
    {
      cx: Math.round(midX + rng.range(-4, 4)),
      cy: Math.round(midY + rng.range(-4, 4)),
      rx: rng.range(4.6, 5.4),
      ry: rng.range(3.1, 3.8),
    },
    {
      cx: Math.round(midX + rng.range(-6, 6)),
      cy: Math.round(height * 0.22 + rng.range(-4, 4)),
      rx: rng.range(3.5, 4.2),
      ry: rng.range(2.2, 2.8),
    },
    {
      cx: Math.round(midX + rng.range(-6, 6)),
      cy: Math.round(height * 0.78 + rng.range(-4, 4)),
      rx: rng.range(3.5, 4.2),
      ry: rng.range(2.2, 2.8),
    },
    {
      cx: Math.round(width * 0.22 + rng.range(-4, 4)),
      cy: Math.round(midY + rng.range(-6, 6)),
      rx: rng.range(3.5, 4.2),
      ry: rng.range(2.2, 2.8),
    },
    {
      cx: Math.round(width * 0.78 + rng.range(-4, 4)),
      cy: Math.round(midY + rng.range(-6, 6)),
      rx: rng.range(3.5, 4.2),
      ry: rng.range(2.2, 2.8),
    },
  ];

  centralCandidates.forEach((cand, idx) => {
    const farFromSpawns = spawnPads.every((pad) => {
      const c = getPadCenter(pad, padSize);
      return Math.hypot(cand.cx - c.x, cand.cy - c.y) >= rules.oreRules.minDistanceFromSpawnTiles + 8;
    });
    const farFromOtherOre = orePatches.every(
      (existing) =>
        Math.hypot(existing.cx - cand.cx, existing.cy - cand.cy) >=
        rules.oreRules.minDistanceBetweenOrePatchesTiles
    );
    if (farFromSpawns && farFromOtherOre) {
      orePatches.push({
        id: `ore_contested_${idx}`,
        kind: "CONTESTED_BASIN",
        quadrantIndex: null,
        cx: cand.cx,
        cy: cand.cy,
        rx: cand.rx,
        ry: cand.ry,
        angle: rng.range(-0.9, 0.9),
        lobeDx: rng.next() < 0.5 ? -2 : 2,
        lobeDy: rng.next() < 0.5 ? -2 : 2,
        lobeR: rng.range(2.3, 3.0),
        amount:
          Math.round(
            rng.range(
              rules.oreRules.contestedBasinRichnessRange[0],
              rules.oreRules.contestedBasinRichnessRange[1]
            ) / 25
          ) * 25,
      });
    }
  });

  // Rasterize ore patches onto terrainGrid & oreGrid while strictly clipping against minDistanceFromSpawnTiles
  for (const patch of orePatches) {
    const bound = Math.ceil(Math.max(patch.rx, patch.ry, patch.lobeR + 2)) + 2;
    const cosA = Math.cos(patch.angle);
    const sinA = Math.sin(patch.angle);

    for (let dy = -bound; dy <= bound; dy++) {
      for (let dx = -bound; dx <= bound; dx++) {
        const tx = patch.cx + dx;
        const ty = patch.cy + dy;
        if (tx < 2 || ty < 2 || tx >= width - 2 || ty >= height - 2) continue;

        const idx = ty * width + tx;
        if (terrainGrid[idx] === TERRAIN_CODES.CONCRETE_SLAB) continue;

        // Strict enforcement of oreRules.minDistanceFromSpawnTiles
        let minSpawnDist = Infinity;
        for (const pad of spawnPads) {
          const c = getPadCenter(pad, padSize);
          const d = Math.hypot(tx - c.x, ty - c.y);
          if (d < minSpawnDist) minSpawnDist = d;
        }
        if (minSpawnDist < rules.oreRules.minDistanceFromSpawnTiles) {
          continue;
        }

        const rotX = dx * cosA - dy * sinA;
        const rotY = dx * sinA + dy * cosA;
        const eDist = Math.hypot(rotX / patch.rx, rotY / patch.ry);
        const lobeDist =
          Math.hypot(dx - patch.lobeDx, dy - patch.lobeDy) / Math.max(0.8, patch.lobeR);
        const jitter =
          seededValueNoise2D(tx * 0.45, ty * 0.45, seed ^ 0x27d4eb2d) * 0.14;
        const shapeMetric = Math.min(eDist, lobeDist) + jitter;

        if (shapeMetric <= 1.0) {
          terrainGrid[idx] = TERRAIN_CODES.ORE;
          const richness = Math.max(0.55, 1.15 - shapeMetric * 0.5);
          oreGrid[idx] = Math.max(100, Math.round((patch.amount * richness) / 25) * 25);
        } else if (shapeMetric <= 1.42 && terrainGrid[idx] === TERRAIN_CODES.GRASS) {
          terrainGrid[idx] = TERRAIN_CODES.DIRT;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. PROCEDURAL 2x2 SILVER ORE BOULDERS (TERRAIN_KIND.SILVER_ORE)
  // Strictly enforces:
  // - minDistanceFromSpawnTiles (>= 28 tiles from any spawn center)
  // - maxRegionalDistanceFromSpawnTiles (<= 52 tiles from quadrant spawn)
  // - minDistanceBetweenSilverDepositsTiles (>= 24 tiles between deposits)
  // --------------------------------------------------------------------------
  const silverDeposits: ProceduralSilverDepositSpec[] = [];

  for (let q = 0; q < 4; q++) {
    const pad = rawQuadrantPads[q]!;
    const center = getPadCenter(pad, padSize);
    const dirX = center.x < midX ? 1 : -1;
    const dirY = center.y < midY ? 1 : -1;

    // Place on the complementary corridor from the quadrant's natural ore vein so they never overlap
    const natUsedHighAngle = quadrantNaturalVeinHighAngle[q] ?? false;
    const silverAngle = natUsedHighAngle
      ? rng.range(0.22, 0.42)
      : rng.range(1.15, 1.35);
    const silverDist = rng.range(
      rules.silverMineRules.minDistanceFromSpawnTiles + 5.0,
      rules.silverMineRules.maxRegionalDistanceFromSpawnTiles - 6.0
    ); // ~33 .. 46 tiles from spawn center

    const sx = Math.max(
      6,
      Math.min(width - 8, Math.round(center.x + dirX * Math.cos(silverAngle) * silverDist))
    );
    const sy = Math.max(
      6,
      Math.min(height - 8, Math.round(center.y + dirY * Math.sin(silverAngle) * silverDist))
    );

    silverDeposits.push({
      id: `silver_regional_q${q}`,
      kind: "REGIONAL",
      quadrantIndex: q,
      x: sx,
      y: sy,
    });
  }

  // 2 Contested central/midfield 2x2 Silver Ore deposits
  const centralSilverOffsets: Array<{ dx: number; dy: number }> =
    rng.next() < 0.5
      ? [
          { dx: -rng.int(16, 24), dy: rng.int(14, 22) },
          { dx: rng.int(16, 24), dy: -rng.int(14, 22) },
        ]
      : [
          { dx: -rng.int(16, 24), dy: -rng.int(14, 22) },
          { dx: rng.int(16, 24), dy: rng.int(14, 22) },
        ];

  centralSilverOffsets.forEach((off, idx) => {
    const sx = Math.max(10, Math.min(width - 12, Math.round(midX + off.dx)));
    const sy = Math.max(10, Math.min(height - 12, Math.round(midY + off.dy)));

    const validDistFromSpawns = spawnPads.every((pad) => {
      const c = getPadCenter(pad, padSize);
      return (
        Math.hypot(sx + 0.5 - c.x, sy + 0.5 - c.y) >=
        rules.silverMineRules.minDistanceFromSpawnTiles + 2
      );
    });
    const validDistFromOtherSilver = silverDeposits.every(
      (dep) =>
        Math.hypot(dep.x - sx, dep.y - sy) >=
        rules.silverMineRules.minDistanceBetweenSilverDepositsTiles
    );

    if (validDistFromSpawns && validDistFromOtherSilver) {
      silverDeposits.push({
        id: `silver_contested_${idx}`,
        kind: "CONTESTED_CENTRAL",
        quadrantIndex: null,
        x: sx,
        y: sy,
      });
    }
  });

  // Stamp 2x2 Silver Ore boulders and a 2-tile Stone apron around each so Constructor Bots can always dock
  for (const sDep of silverDeposits) {
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        const tx = sDep.x + dx;
        const ty = sDep.y + dy;
        if (tx < 1 || ty < 1 || tx >= width - 1 || ty >= height - 1) continue;
        const idx = ty * width + tx;
        if (terrainGrid[idx] === TERRAIN_CODES.CONCRETE_SLAB) continue;

        if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) {
          terrainGrid[idx] = TERRAIN_CODES.SILVER_ORE;
          oreGrid[idx] = 0;
        } else if (dx >= -1 && dx <= 2 && dy >= -1 && dy <= 2) {
          terrainGrid[idx] = TERRAIN_CODES.STONE;
          oreGrid[idx] = 0;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. PROCEDURAL TACTICAL CLIFF RIDGES (TERRAIN_KIND.CLIFF)
  // Preserves wide maneuver corridors, avoids spawns (>= 28t), avoids central basin,
  // and respects minClearanceFromCliffsTiles around Silver Ore and Ore veins.
  // --------------------------------------------------------------------------
  const cliffClearanceFromSilver = rules.silverMineRules.minClearanceFromCliffsTiles + 2;
  const ridgeCenters: MapCoord[] = [];
  const candidateRidgeAnchors: MapCoord[] = [
    { x: Math.round(width * 0.36), y: Math.round(height * 0.28) },
    { x: Math.round(width * 0.64), y: Math.round(height * 0.28) },
    { x: Math.round(width * 0.36), y: Math.round(height * 0.72) },
    { x: Math.round(width * 0.64), y: Math.round(height * 0.72) },
    { x: Math.round(width * 0.28), y: Math.round(height * 0.48) },
    { x: Math.round(width * 0.72), y: Math.round(height * 0.52) },
    { x: Math.round(width * 0.48), y: Math.round(height * 0.34) },
    { x: Math.round(width * 0.52), y: Math.round(height * 0.66) },
  ];

  for (const baseAnchor of candidateRidgeAnchors) {
    if (ridgeCenters.length >= rules.terrainAndCoverRules.cliffRidgeCount) break;
    const rx = baseAnchor.x + rng.int(-5, 5);
    const ry = baseAnchor.y + rng.int(-5, 5);
    const horizontal = rng.next() < 0.5;
    const halfLen = rng.int(3, 5);

    const canPlaceRidge = (): boolean => {
      for (let step = -halfLen; step <= halfLen; step++) {
        const tx = horizontal ? rx + step : rx;
        const ty = horizontal ? ry : ry + step;
        if (tx < 6 || ty < 6 || tx >= width - 6 || ty >= height - 6) return false;
        if (
          Math.hypot(tx - midX, ty - midY) <
          rules.terrainAndCoverRules.minCentralBasinClearanceTiles
        ) {
          return false;
        }
        for (const pad of spawnPads) {
          const c = getPadCenter(pad, padSize);
          if (
            Math.hypot(tx - c.x, ty - c.y) <
            rules.terrainAndCoverRules.minCliffDistanceFromSpawnTiles
          ) {
            return false;
          }
        }
        for (const sDep of silverDeposits) {
          if (
            Math.hypot(tx - (sDep.x + 0.5), ty - (sDep.y + 0.5)) <
            cliffClearanceFromSilver
          ) {
            return false;
          }
        }
        for (const patch of orePatches) {
          if (Math.hypot(tx - patch.cx, ty - patch.cy) < Math.max(patch.rx, patch.ry) + 4) {
            return false;
          }
        }
        for (const prevCenter of ridgeCenters) {
          if (
            Math.hypot(tx - prevCenter.x, ty - prevCenter.y) <
            rules.terrainAndCoverRules.minTacticalPassWidthTiles + 4
          ) {
            return false;
          }
        }
      }
      return true;
    };

    if (!canPlaceRidge()) continue;
    ridgeCenters.push({ x: rx, y: ry });

    for (let step = -halfLen; step <= halfLen; step++) {
      const tx = horizontal ? rx + step : rx;
      const ty = horizontal ? ry : ry + step;
      const idx = ty * width + tx;
      if (
        terrainGrid[idx] !== TERRAIN_CODES.ORE &&
        terrainGrid[idx] !== TERRAIN_CODES.SILVER_ORE &&
        terrainGrid[idx] !== TERRAIN_CODES.CONCRETE_SLAB
      ) {
        terrainGrid[idx] = TERRAIN_CODES.CLIFF;
        // Stone collar around cliff ridge
        for (let ndy = -1; ndy <= 1; ndy++) {
          for (let ndx = -1; ndx <= 1; ndx++) {
            const nIdx = (ty + ndy) * width + (tx + ndx);
            if (terrainGrid[nIdx] === TERRAIN_CODES.GRASS) {
              terrainGrid[nIdx] = TERRAIN_CODES.STONE;
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. PROCEDURAL DESTRUCTIBLE TREES (TREE_PINE, TREE_OAK, TREE_PALM)
  // Strictly respects minTreeDistanceFromSpawnTiles and avoids Ore / Silver Ore / Cliffs.
  // --------------------------------------------------------------------------
  const trees: ProceduralTreePlacement[] = [];
  const occupiedTreeCoords = new Set<string>();
  const speciesCycle: ReadonlyArray<"TREE_PINE" | "TREE_OAK" | "TREE_PALM"> = [
    "TREE_PINE",
    "TREE_OAK",
    "TREE_PALM",
  ];

  let attempts = 0;
  let grovesCreated = 0;
  while (grovesCreated < rules.terrainAndCoverRules.treeGroveCount && attempts < 160) {
    attempts++;
    const gx = rng.int(8, width - 9);
    const gy = rng.int(8, height - 9);

    const tooCloseToSpawn = spawnPads.some((pad) => {
      const c = getPadCenter(pad, padSize);
      return (
        Math.hypot(gx - c.x, gy - c.y) <
        rules.terrainAndCoverRules.minTreeDistanceFromSpawnTiles + 2
      );
    });
    if (tooCloseToSpawn) continue;

    const tooCloseToSilver = silverDeposits.some(
      (sDep) => Math.hypot(gx - (sDep.x + 0.5), gy - (sDep.y + 0.5)) < 5
    );
    if (tooCloseToSilver) continue;

    const treeCountInGrove = rng.int(2, 3);
    const groveSpecies = speciesCycle[grovesCreated % speciesCycle.length]!;
    let placedInGrove = 0;

    for (let t = 0; t < treeCountInGrove * 3 && placedInGrove < treeCountInGrove; t++) {
      const tx = gx + rng.int(-2, 2);
      const ty = gy + rng.int(-2, 2);
      if (tx < 2 || ty < 2 || tx >= width - 2 || ty >= height - 2) continue;

      const key = `${tx},${ty}`;
      if (occupiedTreeCoords.has(key)) continue;

      const minSpawnDist = Math.min(
        ...spawnPads.map((pad) => {
          const c = getPadCenter(pad, padSize);
          return Math.hypot(tx - c.x, ty - c.y);
        })
      );
      if (minSpawnDist < rules.terrainAndCoverRules.minTreeDistanceFromSpawnTiles) continue;

      const idx = ty * width + tx;
      const tk = terrainGrid[idx];
      if (tk !== TERRAIN_CODES.GRASS && tk !== TERRAIN_CODES.DIRT) continue;
      if ((oreGrid[idx] ?? 0) > 0) continue;

      const scale = Number(rng.range(0.82, 1.34).toFixed(2));
      const kind =
        placedInGrove === 0
          ? groveSpecies
          : tk === TERRAIN_CODES.DIRT
            ? "TREE_PALM"
            : rng.next() < 0.5
              ? "TREE_PINE"
              : "TREE_OAK";

      occupiedTreeCoords.add(key);
      trees.push({ x: tx, y: ty, kind, scale });
      placedInGrove++;
    }

    if (placedInGrove > 0) {
      grovesCreated++;
    }
  }

  return {
    seed,
    width,
    height,
    terrainGrid,
    oreGrid,
    spawnPads,
    orePatches,
    silverDeposits,
    trees,
  };
}

/**
 * Audits a generated procedural map against all constraints in `MAP_GENERATION_RULES`.
 */
export function validateGeneratedMapAgainstRules(
  map: ProceduralMapData,
  rules: MapGenerationRules = MAP_GENERATION_RULES
): MapRuleValidationReport {
  const violations: string[] = [];
  const padSize = rules.spawnRules.spawnConcretePadSizeTiles;
  const spawnCenters = map.spawnPads.map((pad) => getPadCenter(pad, padSize));
  const areaMultiplierVsLegacy = Number(
    ((map.width * map.height) / LEGACY_MAP_TOTAL_TILES).toFixed(2)
  );

  if (map.width * map.height < LEGACY_MAP_TOTAL_TILES * 4) {
    violations.push(
      `Surface de carte (${map.width}×${map.height} = ${map.width * map.height}) inférieure à 4× la taille historique (${LEGACY_MAP_TOTAL_TILES * 4}).`
    );
  }

  // 1. Validate enemy base distances & border margins
  let minObservedEnemyBaseDistance = Infinity;
  for (let i = 0; i < spawnCenters.length; i++) {
    const pad = map.spawnPads[i]!;
    if (
      pad.x < rules.spawnRules.minBorderMarginTiles ||
      pad.y < rules.spawnRules.minBorderMarginTiles ||
      pad.x + padSize > map.width - rules.spawnRules.minBorderMarginTiles ||
      pad.y + padSize > map.height - rules.spawnRules.minBorderMarginTiles
    ) {
      violations.push(`Spawn #${i} (${pad.x}, ${pad.y}) viole la marge de bordure minimale.`);
    }

    for (let j = i + 1; j < spawnCenters.length; j++) {
      const d = Math.hypot(
        spawnCenters[i]!.x - spawnCenters[j]!.x,
        spawnCenters[i]!.y - spawnCenters[j]!.y
      );
      if (d < minObservedEnemyBaseDistance) {
        minObservedEnemyBaseDistance = d;
      }
      if (d < rules.spawnRules.minEnemyBaseDistanceTiles) {
        violations.push(
          `Bases #${i} et #${j} trop proches : ${d.toFixed(1)} blocs (< ${rules.spawnRules.minEnemyBaseDistanceTiles}).`
        );
      }
    }
  }

  // 2. Validate Ore distances from spawns
  let minObservedOreDistanceFromSpawn = Infinity;
  let oreTileCount = 0;
  const minOreDistPerSpawn = new Array<number>(spawnCenters.length).fill(Infinity);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = y * map.width + x;
      if ((map.oreGrid[idx] ?? 0) > 0 || map.terrainGrid[idx] === TERRAIN_CODES.ORE) {
        oreTileCount++;
        for (let s = 0; s < spawnCenters.length; s++) {
          const d = Math.hypot(x - spawnCenters[s]!.x, y - spawnCenters[s]!.y);
          if (d < minObservedOreDistanceFromSpawn) {
            minObservedOreDistanceFromSpawn = d;
          }
          if (d < minOreDistPerSpawn[s]!) {
            minOreDistPerSpawn[s] = d;
          }
        }
      }
    }
  }

  if (minObservedOreDistanceFromSpawn < rules.oreRules.minDistanceFromSpawnTiles) {
    violations.push(
      `Minerai trop proche d'un spawn : ${minObservedOreDistanceFromSpawn.toFixed(1)} blocs (< ${rules.oreRules.minDistanceFromSpawnTiles}).`
    );
  }

  const maxObservedNaturalOreDistanceFromSpawn = Math.max(...minOreDistPerSpawn);
  if (maxObservedNaturalOreDistanceFromSpawn > rules.oreRules.maxNaturalOreDistanceFromSpawnTiles) {
    violations.push(
      `Premier filon de minerai trop éloigné d'un spawn : ${maxObservedNaturalOreDistanceFromSpawn.toFixed(1)} blocs (> ${rules.oreRules.maxNaturalOreDistanceFromSpawnTiles}).`
    );
  }

  // 3. Validate Silver Ore (2x2) distances from spawns & between deposits
  let minObservedSilverDistanceFromSpawn = Infinity;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.terrainGrid[y * map.width + x] === TERRAIN_CODES.SILVER_ORE) {
        for (const sc of spawnCenters) {
          const d = Math.hypot(x - sc.x, y - sc.y);
          if (d < minObservedSilverDistanceFromSpawn) {
            minObservedSilverDistanceFromSpawn = d;
          }
        }
      }
    }
  }

  if (minObservedSilverDistanceFromSpawn < rules.silverMineRules.minDistanceFromSpawnTiles) {
    violations.push(
      `Mine d'argent (SILVER_ORE) trop proche d'un spawn : ${minObservedSilverDistanceFromSpawn.toFixed(1)} blocs (< ${rules.silverMineRules.minDistanceFromSpawnTiles}).`
    );
  }

  let minObservedBetweenSilverDistance = Infinity;
  for (let i = 0; i < map.silverDeposits.length; i++) {
    for (let j = i + 1; j < map.silverDeposits.length; j++) {
      const d = Math.hypot(
        map.silverDeposits[i]!.x - map.silverDeposits[j]!.x,
        map.silverDeposits[i]!.y - map.silverDeposits[j]!.y
      );
      if (d < minObservedBetweenSilverDistance) {
        minObservedBetweenSilverDistance = d;
      }
      if (d < rules.silverMineRules.minDistanceBetweenSilverDepositsTiles) {
        violations.push(
          `Gisements d'argent #${i} et #${j} trop proches : ${d.toFixed(1)} blocs (< ${rules.silverMineRules.minDistanceBetweenSilverDepositsTiles}).`
        );
      }
    }
  }

  // 4. Validate Trees distance from spawns
  for (const tree of map.trees) {
    for (const sc of spawnCenters) {
      const d = Math.hypot(tree.x - sc.x, tree.y - sc.y);
      if (d < rules.terrainAndCoverRules.minTreeDistanceFromSpawnTiles) {
        violations.push(
          `Arbre (${tree.x}, ${tree.y}) trop proche d'un spawn : ${d.toFixed(1)} blocs (< ${rules.terrainAndCoverRules.minTreeDistanceFromSpawnTiles}).`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    seed: map.seed,
    width: map.width,
    height: map.height,
    areaMultiplierVsLegacy,
    minObservedEnemyBaseDistance,
    minObservedOreDistanceFromSpawn,
    maxObservedNaturalOreDistanceFromSpawn,
    minObservedSilverDistanceFromSpawn,
    minObservedBetweenSilverDistance,
    oreTileCount,
    silverDepositCount: map.silverDeposits.length,
    treeCount: map.trees.length,
    violations,
  };
}
