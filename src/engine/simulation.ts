import {
  AI_ATTACK_GRACE_PERIOD_TICKS,
  BASE_BUILD_RADIUS_TILES,
  BASE_STORAGE_CAPACITY,
  BUILDING_REPAIR_COST_PER_TICK,
  BUILDING_REPAIR_HP_PER_TICK,
  BUILDINGS,
  canPlaceBuildingOnTerrainTile,
  degradeTerrainLayer,
  FACTIONS,
  getTerrainLayerThickness,
  getTimedConstructionTicks,
  HARVESTER_LOAD_PER_TICK,
  HARVESTER_MAX_LOAD,
  HARVESTER_UNLOAD_PER_TICK,
  isFoundationTerrainKind,
  isRepeatableBuildingKind,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  requiresStoneOrConcreteFoundation,
  SILVER_MINE_CYCLE_TICKS,
  SILVER_MINE_YIELD_PER_CYCLE,
  SPAWN_CONCRETE_PAD_SIZE,
  STARTING_CREDITS,
  TERRAIN_KIND,
  TREES,
  UNIT_SPAWN_PROTECTION_TICKS,
  UNITS,
  type BuildingKind,
  type FactionId,
  type ProductionCategory,
  type TreeKind,
  type UnitKind,
} from "../shared/constants";
import {
  FullSnapshotSchema,
  TickDeltaSchema,
  type AcousticEvent,
  type EntityState,
  type FullSnapshot,
  type OreTileDelta,
  type PlayerEconomyDelta,
  type ProjectileVisual,
  type TerrainTileDelta,
  type TickDelta,
  type VisualEffectEvent,
  type VisualEffectKind,
} from "../shared/schemas/deltas";
import type { EcsEntity, PlayerSimState, ProductionSlotState } from "./ecs/types";
import { FogOfWarManager } from "./fog/fog-of-war";
import {
  AStarPathfinder,
  SpatialReservationGrid,
  vectorToAngleIndex16,
} from "./pathfinding/astar";

export interface MatchParticipantInit {
  playerId: string;
  commanderName: string;
  faction: FactionId;
  isAi: boolean;
}

const CATEGORIES: readonly ProductionCategory[] = [
  "BUILDING",
  "DEFENSE",
  "INFANTRY",
  "VEHICLE",
];

function createEmptyQueues(): Record<ProductionCategory, ProductionSlotState> {
  return {
    BUILDING: {
      category: "BUILDING",
      activeItem: null,
      ticksElapsed: 0,
      ticksRequired: 0,
      readyToPlace: false,
    },
    DEFENSE: {
      category: "DEFENSE",
      activeItem: null,
      ticksElapsed: 0,
      ticksRequired: 0,
      readyToPlace: false,
    },
    INFANTRY: {
      category: "INFANTRY",
      activeItem: null,
      ticksElapsed: 0,
      ticksRequired: 0,
      readyToPlace: false,
    },
    VEHICLE: {
      category: "VEHICLE",
      activeItem: null,
      ticksElapsed: 0,
      ticksRequired: 0,
      readyToPlace: false,
    },
  };
}

export class RtsSimulation {
  public readonly lobbyId: string;
  public readonly width: number = MAP_WIDTH_TILES;
  public readonly height: number = MAP_HEIGHT_TILES;
  public readonly terrainGrid: number[];
  public readonly terrainDamageGrid: number[];
  public readonly oreGrid: number[];

  private tickCounter = 0;
  private nextEntitySeq = 1;
  private readonly entities: Map<string, EcsEntity> = new Map();
  private readonly players: Map<string, PlayerSimState> = new Map();
  private readonly reservationGrid: SpatialReservationGrid;
  private readonly pathfinder: AStarPathfinder;
  private readonly fogManager: FogOfWarManager;

  private createdThisTick: string[] = [];
  private destroyedThisTick: string[] = [];
  private oreUpdatesThisTick: Map<number, OreTileDelta> = new Map();
  private terrainUpdatesThisTick: Map<number, TerrainTileDelta> = new Map();
  private projectilesThisTick: ProjectileVisual[] = [];
  private visualEffectsThisTick: VisualEffectEvent[] = [];
  private acousticEventsThisTick: AcousticEvent[] = [];
  private winnerPlayerId: string | null = null;

  constructor(lobbyId: string, participants: readonly MatchParticipantInit[]) {
    this.lobbyId = lobbyId;
    const { terrainGrid, oreGrid } = this.generateDeterministicTerrain();
    this.terrainGrid = terrainGrid;
    this.terrainDamageGrid = new Array<number>(this.width * this.height).fill(0);
    this.oreGrid = oreGrid;
    this.reservationGrid = new SpatialReservationGrid(this.width, this.height, this.terrainGrid);
    this.pathfinder = new AStarPathfinder(this.width, this.height);
    this.fogManager = new FogOfWarManager(
      this.width,
      this.height,
      participants.map((p) => p.playerId)
    );

    const spawnCorners = [
      { x: 5, y: 5 },
      { x: this.width - 13, y: this.height - 13 },
      { x: this.width - 13, y: 5 },
      { x: 5, y: this.height - 13 },
    ];

    participants.forEach((p, idx) => {
      this.players.set(p.playerId, {
        playerId: p.playerId,
        commanderName: p.commanderName,
        faction: p.faction,
        isAi: p.isAi,
        credits: STARTING_CREDITS,
        silverOre: 0,
        maxStorage: BASE_STORAGE_CAPACITY,
        powerProduced: 0,
        powerConsumed: 0,
        lowPower: false,
        radarActive: false,
        harvestedTotal: 0,
        defeated: false,
        lowPowerAlertSent: false,
        silosAlertSent: false,
        underAttackCooldown: 0,
        aiDecisionCooldown: 20,
        queues: createEmptyQueues(),
      });

      const corner = spawnCorners[idx % spawnCorners.length]!;
      this.spawnInitialBase(p.playerId, p.faction, corner.x, corner.y);
    });

    this.spawnDeterministicTrees();
    this.rebuildSpatialReservations();
    this.recomputeAllPlayerEconomies();
    this.fogManager.recomputeTickVisibility(
      Array.from(this.players.keys()),
      this.entities.values()
    );
    // Clear initial creation queue so snapshot represents baseline
    this.createdThisTick.length = 0;
  }

  public get tickId(): number {
    return this.tickCounter;
  }

  public get winner(): string | null {
    return this.winnerPlayerId;
  }

  public getEntity(id: string): EcsEntity | undefined {
    return this.entities.get(id);
  }

  public getAllEntities(): EcsEntity[] {
    return Array.from(this.entities.values());
  }

  public getPlayerState(playerId: string): PlayerSimState | undefined {
    return this.players.get(playerId);
  }

  private generateDeterministicTerrain(): { terrainGrid: number[]; oreGrid: number[] } {
    const total = this.width * this.height;
    // Start with lush natural grassland (HERBE = 4) across the battlefield
    const terrainGrid = new Array<number>(total).fill(TERRAIN_KIND.GRASS);
    const oreGrid = new Array<number>(total).fill(0);

    const midX = this.width * 0.5 - 0.5;
    const midY = this.height * 0.5 - 0.5;
    const ridgeLeft = Math.floor(this.width * 0.5) - 2;
    const ridgeRight = Math.floor(this.width * 0.5) + 1;
    const ridgeTopStart = Math.floor(this.height * 0.34);
    const ridgeTopEnd = Math.floor(this.height * 0.42);
    const ridgeBotStart = Math.floor(this.height * 0.58);
    const ridgeBotEnd = Math.floor(this.height * 0.66);

    const spawnPads = [
      { x: 5, y: 5 },
      { x: this.width - 13, y: this.height - 13 },
      { x: this.width - 13, y: 5 },
      { x: 5, y: this.height - 13 },
    ];

    // Organic Earth/Soil (TERRE = 0), Stone/Bedrock (PIERRE = 1) halos, and 8x8 Concrete Slab spawn pads
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;

        // Organic earth transition corridor along the diagonal tactical valley & central basin
        const distCenter = Math.hypot(x - midX, y - midY);
        const wave = Math.sin(x * 0.24) * 2.2 + Math.cos(y * 0.24) * 2.2;
        if (distCenter + wave <= 15.5 || Math.abs(x - y) <= 3.8) {
          terrainGrid[idx] = TERRAIN_KIND.DIRT;
        }

        // Surrounding stone/dirt transition around the 4 corner bases
        let minCornerDist = Infinity;
        let onSpawnPad = false;
        for (const pad of spawnPads) {
          if (
            x >= pad.x &&
            x < pad.x + SPAWN_CONCRETE_PAD_SIZE &&
            y >= pad.y &&
            y < pad.y + SPAWN_CONCRETE_PAD_SIZE
          ) {
            onSpawnPad = true;
          }
          const padCenterX = pad.x + (SPAWN_CONCRETE_PAD_SIZE - 1) * 0.5;
          const padCenterY = pad.y + (SPAWN_CONCRETE_PAD_SIZE - 1) * 0.5;
          const d = Math.hypot(x - padCenterX, y - padCenterY);
          if (d < minCornerDist) minCornerDist = d;
        }

        if (onSpawnPad) {
          terrainGrid[idx] = TERRAIN_KIND.CONCRETE_SLAB;
        } else if (minCornerDist <= 7.8) {
          terrainGrid[idx] = TERRAIN_KIND.STONE;
        } else if (minCornerDist <= 10.6) {
          terrainGrid[idx] = TERRAIN_KIND.DIRT;
        }

        // Central canyon ridges (leaving wide tactical passes)
        if (
          (x === ridgeLeft || x === ridgeRight) &&
          ((y >= ridgeTopStart && y <= ridgeTopEnd) || (y >= ridgeBotStart && y <= ridgeBotEnd))
        ) {
          terrainGrid[idx] = TERRAIN_KIND.CLIFF; // impassable ridge
        }
      }
    }

    // Irregular, organic ore deposits of varied sizes (small pockets, medium veins, large basins)
    const centerTileX = Math.floor(this.width * 0.5);
    const centerTileY = Math.floor(this.height * 0.5);
    const oreDeposits = [
      // Medium asymmetrical expansion veins
      { cx: 22, cy: 10, rx: 3.5, ry: 2.1, angle: 0.42, lobeDx: 2, lobeDy: 1, lobeR: 2.1, amount: 720 },
      { cx: 10, cy: 22, rx: 2.1, ry: 3.4, angle: -0.36, lobeDx: 1, lobeDy: 2, lobeR: 1.9, amount: 680 },
      { cx: this.width - 23, cy: this.height - 11, rx: 3.5, ry: 2.1, angle: 0.42, lobeDx: -2, lobeDy: -1, lobeR: 2.1, amount: 720 },
      { cx: this.width - 11, cy: this.height - 23, rx: 2.1, ry: 3.4, angle: -0.36, lobeDx: -1, lobeDy: -2, lobeR: 1.9, amount: 680 },
      // Small scattered ore pockets
      { cx: 28, cy: 15, rx: 1.7, ry: 1.2, angle: 0.85, lobeDx: 1, lobeDy: 0, lobeR: 1.2, amount: 520 },
      { cx: this.width - 29, cy: this.height - 16, rx: 1.7, ry: 1.2, angle: 0.85, lobeDx: -1, lobeDy: 0, lobeR: 1.2, amount: 520 },
      { cx: 15, cy: 29, rx: 1.4, ry: 1.9, angle: -0.6, lobeDx: 0, lobeDy: 1, lobeR: 1.1, amount: 500 },
      { cx: this.width - 16, cy: this.height - 30, rx: 1.4, ry: 1.9, angle: -0.6, lobeDx: 0, lobeDy: -1, lobeR: 1.1, amount: 500 },
      // Large multi-lobed contested central & flank basins
      { cx: centerTileX, cy: centerTileY, rx: 4.7, ry: 3.1, angle: 0.62, lobeDx: -2, lobeDy: 2, lobeR: 2.9, amount: 980 },
      { cx: 22, cy: this.height - 22, rx: 3.9, ry: 2.3, angle: -0.52, lobeDx: 2, lobeDy: -1, lobeR: 2.4, amount: 820 },
      { cx: this.width - 22, cy: 22, rx: 3.9, ry: 2.3, angle: -0.52, lobeDx: -2, lobeDy: 1, lobeR: 2.4, amount: 820 },
      { cx: centerTileX, cy: 18, rx: 2.9, ry: 1.9, angle: 0.25, lobeDx: 2, lobeDy: 1, lobeR: 1.8, amount: 750 },
      { cx: centerTileX, cy: this.height - 18, rx: 2.9, ry: 1.9, angle: 0.25, lobeDx: -2, lobeDy: -1, lobeR: 1.8, amount: 750 },
    ];

    for (const patch of oreDeposits) {
      const bound = Math.ceil(Math.max(patch.rx, patch.ry, patch.lobeR + 2)) + 2;
      const cosA = Math.cos(patch.angle);
      const sinA = Math.sin(patch.angle);
      for (let dy = -bound; dy <= bound; dy++) {
        for (let dx = -bound; dx <= bound; dx++) {
          const tx = patch.cx + dx;
          const ty = patch.cy + dy;
          if (tx < 1 || ty < 1 || tx >= this.width - 1 || ty >= this.height - 1) continue;
          const idx = ty * this.width + tx;
          if (
            terrainGrid[idx] === TERRAIN_KIND.CLIFF ||
            terrainGrid[idx] === TERRAIN_KIND.CONCRETE_SLAB
          ) {
            continue;
          }

          let minBaseDist = Infinity;
          for (const pad of spawnPads) {
            const padCenterX = pad.x + (SPAWN_CONCRETE_PAD_SIZE - 1) * 0.5;
            const padCenterY = pad.y + (SPAWN_CONCRETE_PAD_SIZE - 1) * 0.5;
            const d = Math.hypot(tx - padCenterX, ty - padCenterY);
            if (d < minBaseDist) minBaseDist = d;
          }
          if (minBaseDist <= 10.2) continue;

          const rotX = dx * cosA - dy * sinA;
          const rotY = dx * sinA + dy * cosA;
          const eDist = Math.hypot(rotX / patch.rx, rotY / patch.ry);
          const lobeDist =
            Math.hypot(dx - patch.lobeDx, dy - patch.lobeDy) / Math.max(0.8, patch.lobeR);
          const jitter =
            (Math.sin(tx * 1.73 + ty * 2.31) + Math.cos(tx * 2.87 - ty * 1.41)) * 0.12;
          const shapeMetric = Math.min(eDist, lobeDist) + jitter;

          if (shapeMetric <= 1.0) {
            terrainGrid[idx] = TERRAIN_KIND.ORE;
            const richness = Math.max(0.55, 1.15 - shapeMetric * 0.5);
            oreGrid[idx] = Math.round((patch.amount * richness) / 25) * 25;
          } else if (shapeMetric <= 1.42 && terrainGrid[idx] === TERRAIN_KIND.GRASS) {
            terrainGrid[idx] = TERRAIN_KIND.DIRT;
          }
        }
      }
    }

    // Rare 2x2 Silver Ore boulders (TERRAIN_KIND.SILVER_ORE = 6) on which a 2x2 SILVER_MINE can be built
    const silverDeposits2x2 = [
      { x: 15, y: 7 },
      { x: this.width - 17, y: this.height - 9 },
      { x: this.width - 17, y: 7 },
      { x: 15, y: this.height - 9 },
    ];
    for (const sDep of silverDeposits2x2) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const tx = sDep.x + dx;
          const ty = sDep.y + dy;
          if (tx < 1 || ty < 1 || tx >= this.width - 1 || ty >= this.height - 1) continue;
          const idx = ty * this.width + tx;
          if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) {
            terrainGrid[idx] = TERRAIN_KIND.SILVER_ORE;
            oreGrid[idx] = 0;
          } else if (terrainGrid[idx] === TERRAIN_KIND.GRASS) {
            terrainGrid[idx] = TERRAIN_KIND.STONE;
          }
        }
      }
    }

    return { terrainGrid, oreGrid };
  }

  private spawnDeterministicTrees(): void {
    const treePlacements: Array<{ x: number; y: number; kind: TreeKind; scale: number }> = [
      { x: 17, y: 3, kind: "TREE_PINE", scale: 1.25 },
      { x: 18, y: 4, kind: "TREE_OAK", scale: 0.92 },
      { x: 3, y: 17, kind: "TREE_PINE", scale: 1.1 },
      { x: 4, y: 19, kind: "TREE_OAK", scale: 1.32 },
      { x: 31, y: 8, kind: "TREE_OAK", scale: 1.28 },
      { x: 33, y: 9, kind: "TREE_PINE", scale: 0.82 },
      { x: 8, y: 32, kind: "TREE_PALM", scale: 1.18 },
      { x: 9, y: 34, kind: "TREE_PALM", scale: 0.85 },
      { x: 26, y: 26, kind: "TREE_PALM", scale: 1.22 },
      { x: 45, y: 45, kind: "TREE_PALM", scale: 1.15 },
      { x: 16, y: 44, kind: "TREE_OAK", scale: 1.3 },
      { x: 17, y: 46, kind: "TREE_PINE", scale: 0.9 },
      { x: 44, y: 16, kind: "TREE_OAK", scale: 1.24 },
      { x: 46, y: 17, kind: "TREE_PINE", scale: 0.86 },
      { x: this.width - 18, y: this.height - 4, kind: "TREE_PINE", scale: 1.25 },
      { x: this.width - 19, y: this.height - 5, kind: "TREE_OAK", scale: 0.95 },
      { x: this.width - 4, y: this.height - 18, kind: "TREE_PINE", scale: 1.12 },
      { x: this.width - 5, y: this.height - 20, kind: "TREE_OAK", scale: 1.3 },
      { x: this.width - 32, y: this.height - 9, kind: "TREE_OAK", scale: 1.2 },
      { x: this.width - 9, y: this.height - 33, kind: "TREE_PALM", scale: 1.15 },
      { x: 12, y: this.height - 18, kind: "TREE_PINE", scale: 1.05 },
      { x: this.width - 13, y: 18, kind: "TREE_PINE", scale: 1.08 },
    ];

    for (const t of treePlacements) {
      if (t.x < 1 || t.y < 1 || t.x >= this.width - 1 || t.y >= this.height - 1) continue;
      const idx = t.y * this.width + t.x;
      const tk = this.terrainGrid[idx] ?? TERRAIN_KIND.DIRT;
      if (
        tk !== TERRAIN_KIND.GRASS &&
        tk !== TERRAIN_KIND.DIRT
      ) {
        continue;
      }
      if (!this.reservationGrid.isTilePassable(t.x, t.y, undefined, false)) continue;
      this.createTreeEntity(t.kind, t.x, t.y, t.scale);
    }
  }

  public createTreeEntity(
    kind: TreeKind,
    tileX: number,
    tileY: number,
    treeScale = 1
  ): EcsEntity {
    const spec = TREES[kind];
    const clampedScale = Number(Math.max(0.7, Math.min(1.4, treeScale)).toFixed(2));
    const maxHp = Math.max(60, Math.round(spec.baseHp * clampedScale));
    const id = `tree_${this.nextEntitySeq++}`;

    const entity: EcsEntity = {
      id,
      ownerId: "neutral",
      faction: "GDI",
      entityType: "TREE",
      kind,
      sightRadius: 0,
      spawnProtectionTicks: 0,
      treeScale: clampedScale,
      stateLabel: "IDLE",
      transform: {
        x: tileX,
        y: tileY,
        angleIndex: (tileX * 5 + tileY * 7) % 16,
        turretAngleIndex: 0,
      },
      health: {
        hp: maxHp,
        maxHp,
      },
      navigation: null,
      combat: null,
      harvester: null,
      building: null,
      dirty: false,
    };

    this.entities.set(id, entity);
    this.createdThisTick.push(id);
    this.reservationGrid.markBuildingFootprint(tileX, tileY, 1, 1);
    return entity;
  }

  private spawnInitialBase(
    playerId: string,
    faction: FactionId,
    baseX: number,
    baseY: number
  ): void {
    this.createBuildingEntity(playerId, faction, "CONSTRUCTION_YARD", baseX, baseY);
    this.createBuildingEntity(playerId, faction, "POWER_PLANT", baseX + 4, baseY);
    const refinery = this.createBuildingEntity(playerId, faction, "REFINERY", baseX, baseY + 4);
    const harvester = this.createUnitEntity(playerId, faction, "HARVESTER", baseX + 3, baseY + 5);
    if (harvester.harvester) {
      harvester.harvester.homeRefineryId = refinery.id;
    }
    this.createUnitEntity(playerId, faction, "CONSTRUCTOR_BOT", baseX + 3, baseY + 2);
    this.createUnitEntity(playerId, faction, "RIFLE_INFANTRY", baseX + 4, baseY + 3);
    this.createUnitEntity(playerId, faction, "RECON_BUGGY", baseX + 5, baseY + 3);
    this.createUnitEntity(playerId, faction, "MEDIUM_TANK", baseX + 5, baseY + 4);
  }

  public createBuildingEntity(
    ownerId: string,
    faction: FactionId,
    kind: BuildingKind,
    tileX: number,
    tileY: number,
    constructionOpts?: { buildProgress: number; buildTicksRequired: number }
  ): EcsEntity {
    const spec = BUILDINGS[kind];
    const fSpec = FACTIONS[faction];
    const maxHp = Math.round(spec.maxHp * fSpec.armorBonus);
    const buildProgress = constructionOpts ? constructionOpts.buildProgress : 1;
    const buildTicksRequired = constructionOpts ? constructionOpts.buildTicksRequired : 0;
    const initialHp =
      buildProgress < 1 ? Math.max(1, Math.round(maxHp * buildProgress)) : maxHp;
    const id = `bld_${this.nextEntitySeq++}`;

    const entity: EcsEntity = {
      id,
      ownerId,
      faction,
      entityType: "BUILDING",
      kind,
      sightRadius: spec.sightRadius,
      spawnProtectionTicks: 0,
      treeScale: 1,
      stateLabel: buildProgress < 1 ? "BUILDING" : "IDLE",
      transform: {
        x: tileX,
        y: tileY,
        angleIndex: 0,
        turretAngleIndex: 0,
      },
      health: {
        hp: initialHp,
        maxHp,
      },
      navigation: null,
      combat:
        spec.attackDamage > 0
          ? {
              detectionRange: spec.detectionRange,
              attackRange: spec.attackRange,
              attackDamage: spec.attackDamage,
              attackCooldownTicks: spec.attackCooldownTicks,
              cooldownRemaining: 0,
              targetEntityId: null,
              groundTarget: null,
            }
          : null,
      harvester: null,
      building: {
        footprintW: spec.footprintW,
        footprintH: spec.footprintH,
        powerDelta: spec.powerDelta,
        storageCapacity: spec.storageCapacity,
        isRepairing: false,
        buildProgress,
        buildTicksRequired,
      },
      dirty: false,
    };

    this.entities.set(id, entity);
    this.createdThisTick.push(id);
    if (kind !== "CONCRETE_SLAB") {
      this.reservationGrid.markBuildingFootprint(tileX, tileY, spec.footprintW, spec.footprintH);
    }
    return entity;
  }

  public createUnitEntity(
    ownerId: string,
    faction: FactionId,
    kind: UnitKind,
    tileX: number,
    tileY: number
  ): EcsEntity {
    const spec = UNITS[kind];
    const fSpec = FACTIONS[faction];
    const maxHp = Math.round(spec.maxHp * fSpec.armorBonus);
    const id = `unt_${this.nextEntitySeq++}`;

    const entity: EcsEntity = {
      id,
      ownerId,
      faction,
      entityType: "UNIT",
      kind,
      sightRadius: spec.sightRadius,
      spawnProtectionTicks: UNIT_SPAWN_PROTECTION_TICKS,
      treeScale: 1,
      stateLabel: "IDLE",
      transform: {
        x: tileX,
        y: tileY,
        angleIndex: 8,
        turretAngleIndex: 8,
      },
      health: {
        hp: maxHp,
        maxHp,
      },
      navigation: {
        path: [],
        pathIndex: 0,
        speedTilesPerTick: spec.speedTilesPerTick * fSpec.speedBonus,
        targetX: null,
        targetY: null,
        waitTicks: 0,
      },
      combat:
        spec.attackDamage > 0
          ? {
              detectionRange: spec.detectionRange,
              attackRange: spec.attackRange,
              attackDamage: spec.attackDamage,
              attackCooldownTicks: spec.attackCooldownTicks,
              cooldownRemaining: 0,
              targetEntityId: null,
              groundTarget: null,
            }
          : null,
      harvester:
        kind === "HARVESTER"
          ? {
              cargoOre: 0,
              maxCapacity: HARVESTER_MAX_LOAD,
              state: "IDLE",
              targetOreTile: null,
              homeRefineryId: null,
            }
          : null,
      building: null,
      dirty: false,
    };

    this.entities.set(id, entity);
    this.createdThisTick.push(id);
    this.reservationGrid.reserveUnitTile(Math.round(tileX), Math.round(tileY), id);
    return entity;
  }

  public issueMoveCommand(
    playerId: string,
    entityIds: readonly string[],
    targetTileX: number,
    targetTileY: number
  ): void {
    const offsets = this.computeFormationOffsets(entityIds.length);
    entityIds.forEach((id, idx) => {
      const ent = this.entities.get(id);
      if (!ent || ent.ownerId !== playerId || ent.entityType !== "UNIT" || !ent.navigation) {
        return;
      }
      const off = offsets[idx]!;
      const gx = Math.max(0, Math.min(this.width - 1, targetTileX + off.dx));
      const gy = Math.max(0, Math.min(this.height - 1, targetTileY + off.dy));
      const path = this.pathfinder.findPath(
        ent.transform.x,
        ent.transform.y,
        gx,
        gy,
        this.reservationGrid,
        ent.id,
        true
      );
      ent.navigation.path = path;
      ent.navigation.pathIndex = 0;
      ent.navigation.targetX = gx;
      ent.navigation.targetY = gy;
      ent.navigation.waitTicks = 0;
      if (ent.combat) {
        ent.combat.targetEntityId = null;
        ent.combat.groundTarget = null;
      }
      if (ent.harvester) {
        const idxTile = gy * this.width + gx;
        if ((this.oreGrid[idxTile] ?? 0) > 0) {
          ent.harvester.state = "MOVING_TO_ORE";
          ent.harvester.targetOreTile = { x: gx, y: gy };
          ent.stateLabel = "HARVESTING";
        } else {
          ent.harvester.state = "IDLE";
          ent.stateLabel = "MOVING";
        }
      } else {
        ent.stateLabel = path.length > 0 ? "MOVING" : "IDLE";
      }
      ent.dirty = true;
    });
  }

  public issueAttackCommand(
    playerId: string,
    entityIds: readonly string[],
    targetEntityId: string
  ): void {
    const target = this.entities.get(targetEntityId);
    if (!target || target.ownerId === playerId) return;
    if (target.entityType === "UNIT" && target.spawnProtectionTicks > 0) return;

    for (const id of entityIds) {
      const ent = this.entities.get(id);
      if (!ent || ent.ownerId !== playerId || !ent.combat) continue;
      ent.combat.targetEntityId = targetEntityId;
      ent.combat.groundTarget = null;
      ent.stateLabel = "ATTACKING";
      ent.dirty = true;
    }
  }

  public issueAttackGroundCommand(
    playerId: string,
    entityIds: readonly string[],
    targetTileX: number,
    targetTileY: number
  ): void {
    const gx = Math.max(0, Math.min(this.width - 1, Math.round(targetTileX)));
    const gy = Math.max(0, Math.min(this.height - 1, Math.round(targetTileY)));

    for (const id of entityIds) {
      const ent = this.entities.get(id);
      if (!ent || ent.ownerId !== playerId || !ent.combat) continue;
      ent.combat.targetEntityId = null;
      ent.combat.groundTarget = { x: gx, y: gy };
      ent.stateLabel = "ATTACKING";
      ent.dirty = true;
    }
  }

  public hasLivingConstructorBot(playerId: string): boolean {
    for (const ent of this.entities.values()) {
      if (ent.ownerId === playerId && ent.entityType === "UNIT" && ent.kind === "CONSTRUCTOR_BOT") {
        return true;
      }
    }
    return false;
  }

  public issueStartProduction(
    playerId: string,
    category: ProductionCategory,
    itemKind: BuildingKind | UnitKind
  ): boolean {
    const player = this.players.get(playerId);
    if (!player || player.defeated) return false;
    const slot = player.queues[category];
    if (slot.activeItem !== null) return false;

    const isUnitItem = Object.prototype.hasOwnProperty.call(UNITS, itemKind);
    const spec = isUnitItem
      ? UNITS[itemKind as UnitKind]
      : BUILDINGS[itemKind as BuildingKind];
    if (!spec) return false;

    const validCategory =
      spec.category === category ||
      (itemKind === "CONSTRUCTOR_BOT" && (category === "BUILDING" || category === "VEHICLE"));
    if (!validCategory) return false;

    if (!this.hasPrerequisites(playerId, spec.prerequisites)) return false;
    if (player.credits < spec.cost) return false;

    player.credits -= spec.cost;
    slot.activeItem = itemKind;
    slot.ticksElapsed = 0;
    slot.ticksRequired = spec.buildTimeTicks;
    slot.readyToPlace = false;
    return true;
  }

  public issuePlaceBuilding(
    playerId: string,
    category: "BUILDING" | "DEFENSE",
    buildingKind: BuildingKind,
    tileX: number,
    tileY: number
  ): boolean {
    const player = this.players.get(playerId);
    if (!player || player.defeated) return false;
    const spec = BUILDINGS[buildingKind];
    if (!spec || spec.category !== category) return false;

    if (!this.hasLivingConstructorBot(playerId)) {
      return false;
    }

    const slot = player.queues[category];
    const paidViaQueue = slot.activeItem === buildingKind;
    const canPlaceImmediate =
      !paidViaQueue &&
      this.hasPrerequisites(playerId, spec.prerequisites) &&
      player.credits >= spec.cost;

    if (!paidViaQueue && !canPlaceImmediate) return false;

    this.rebuildSpatialReservations();

    if (!this.isWithinBaseBuildRadius(playerId, tileX, tileY, spec.footprintW, spec.footprintH)) {
      return false;
    }

    // Concrete Slab (DALLE_BETON) creates a timed construction site assembled on-site by a Constructor Bot
    if (buildingKind === "CONCRETE_SLAB") {
      if (!this.reservationGrid.inBounds(tileX, tileY)) return false;
      const idx = tileY * this.width + tileX;
      const cellTerrain = this.terrainGrid[idx] ?? TERRAIN_KIND.DIRT;
      if (
        !canPlaceBuildingOnTerrainTile("CONCRETE_SLAB", cellTerrain) ||
        cellTerrain === TERRAIN_KIND.CONCRETE_SLAB
      ) {
        return false;
      }
      for (const ent of this.entities.values()) {
        if (
          ent.entityType === "BUILDING" &&
          ent.building &&
          (ent.kind === "CONCRETE_SLAB" || ent.ownerId !== playerId)
        ) {
          if (
            tileX >= ent.transform.x &&
            tileX < ent.transform.x + ent.building.footprintW &&
            tileY >= ent.transform.y &&
            tileY < ent.transform.y + ent.building.footprintH
          ) {
            return false;
          }
        } else if (
          ent.entityType === "TREE" &&
          Math.round(ent.transform.x) === tileX &&
          Math.round(ent.transform.y) === tileY
        ) {
          return false;
        } else if (
          ent.entityType === "UNIT" &&
          ent.ownerId !== playerId &&
          Math.round(ent.transform.x) === tileX &&
          Math.round(ent.transform.y) === tileY
        ) {
          return false;
        }
      }

      if (canPlaceImmediate) {
        player.credits -= spec.cost;
      }

      this.createBuildingEntity(playerId, player.faction, "CONCRETE_SLAB", tileX, tileY, {
        buildProgress: 0.05,
        buildTicksRequired: getTimedConstructionTicks("CONCRETE_SLAB"),
      });

      if (paidViaQueue) {
        slot.activeItem = null;
        slot.ticksElapsed = 0;
        slot.ticksRequired = 0;
        slot.readyToPlace = false;
      }
      return true;
    }

    // Check terrain, foundation requirement (Concrete Slab for base buildings, 2x2 Silver Ore for Silver Mine) & static entities
    for (let dy = 0; dy < spec.footprintH; dy++) {
      for (let dx = 0; dx < spec.footprintW; dx++) {
        const cx = tileX + dx;
        const cy = tileY + dy;
        if (!this.reservationGrid.inBounds(cx, cy)) return false;
        const idx = cy * this.width + cx;
        const cellTerrain = this.terrainGrid[idx] ?? TERRAIN_KIND.DIRT;
        if (!canPlaceBuildingOnTerrainTile(buildingKind, cellTerrain)) {
          return false;
        }
        // Check if any building, tree, or enemy unit occupies (cx, cy)
        for (const ent of this.entities.values()) {
          if (ent.entityType === "BUILDING" && ent.building) {
            if (
              cx >= ent.transform.x &&
              cx < ent.transform.x + ent.building.footprintW &&
              cy >= ent.transform.y &&
              cy < ent.transform.y + ent.building.footprintH
            ) {
              return false;
            }
          } else if (
            ent.entityType === "TREE" &&
            Math.round(ent.transform.x) === cx &&
            Math.round(ent.transform.y) === cy
          ) {
            return false;
          } else if (
            ent.entityType === "UNIT" &&
            ent.ownerId !== playerId &&
            Math.round(ent.transform.x) === cx &&
            Math.round(ent.transform.y) === cy
          ) {
            return false;
          }
        }
      }
    }

    if (canPlaceImmediate) {
      player.credits -= spec.cost;
    }

    // Relocate any friendly mobile units currently inside the new building footprint to perimeter dock tiles
    for (const ent of this.entities.values()) {
      if (ent.entityType === "UNIT" && ent.ownerId === playerId) {
        const ux = Math.round(ent.transform.x);
        const uy = Math.round(ent.transform.y);
        if (
          ux >= tileX &&
          ux < tileX + spec.footprintW &&
          uy >= tileY &&
          uy < tileY + spec.footprintH
        ) {
          this.reservationGrid.releaseUnitTile(ux, uy, ent.id);
        }
      }
    }

    const timedTicks = getTimedConstructionTicks(buildingKind);
    this.createBuildingEntity(
      playerId,
      player.faction,
      buildingKind,
      tileX,
      tileY,
      { buildProgress: 0.05, buildTicksRequired: Math.max(1, timedTicks) }
    );

    for (const ent of this.entities.values()) {
      if (ent.entityType === "UNIT" && ent.ownerId === playerId) {
        const ux = Math.round(ent.transform.x);
        const uy = Math.round(ent.transform.y);
        if (
          ux >= tileX &&
          ux < tileX + spec.footprintW &&
          uy >= tileY &&
          uy < tileY + spec.footprintH
        ) {
          const dock = this.reservationGrid.findNearestFreeDockTile(
            tileX,
            tileY,
            spec.footprintW,
            spec.footprintH,
            ux,
            uy,
            ent.id
          );
          if (dock) {
            ent.transform.x = dock.x;
            ent.transform.y = dock.y;
            this.reservationGrid.reserveUnitTile(dock.x, dock.y, ent.id);
            ent.dirty = true;
          }
        }
      }
    }
    if (paidViaQueue) {
      slot.activeItem = null;
      slot.ticksElapsed = 0;
      slot.ticksRequired = 0;
      slot.readyToPlace = false;
    }

    this.recomputeAllPlayerEconomies();
    this.pushAcoustic("EVA_BUILDING_DEPLOYED", tileX, tileY, playerId);
    return true;
  }

  public issueCancelConstruction(playerId: string, buildingEntityId: string): boolean {
    const ent = this.entities.get(buildingEntityId);
    const player = this.players.get(playerId);
    if (
      !ent ||
      !player ||
      ent.ownerId !== playerId ||
      ent.entityType !== "BUILDING" ||
      !ent.building ||
      ent.building.buildProgress >= 1
    ) {
      return false;
    }
    const spec = BUILDINGS[ent.kind as BuildingKind];
    player.credits += spec.cost;
    this.destroyEntity(ent.id);
    this.recomputeAllPlayerEconomies();
    this.pushAcoustic("CREDITS_TICK", ent.transform.x, ent.transform.y, playerId);
    return true;
  }

  public issueRepairBuilding(playerId: string, buildingEntityId: string): boolean {
    const ent = this.entities.get(buildingEntityId);
    const player = this.players.get(playerId);
    if (
      !ent ||
      !player ||
      ent.ownerId !== playerId ||
      ent.entityType !== "BUILDING" ||
      !ent.building
    ) {
      return false;
    }
    if (ent.health.hp >= ent.health.maxHp) {
      if (ent.building.isRepairing) {
        ent.building.isRepairing = false;
        ent.dirty = true;
      }
      return false;
    }

    ent.building.isRepairing = !ent.building.isRepairing;
    if (ent.building.isRepairing && player.credits >= BUILDING_REPAIR_COST_PER_TICK) {
      player.credits -= BUILDING_REPAIR_COST_PER_TICK;
      ent.health.hp = Math.min(
        ent.health.maxHp,
        ent.health.hp + BUILDING_REPAIR_HP_PER_TICK * 2
      );
      if (ent.health.hp >= ent.health.maxHp) {
        ent.building.isRepairing = false;
      }
      this.pushVisualEffect(
        "HARVEST_SPARKS",
        ent.transform.x + (ent.building.footprintW - 1) * 0.5,
        ent.transform.y + (ent.building.footprintH - 1) * 0.5,
        0.75,
        0,
        ent.faction
      );
      this.pushAcoustic("CREDITS_TICK", ent.transform.x, ent.transform.y, playerId);
    }
    ent.dirty = true;
    return true;
  }

  public issueSellBuilding(playerId: string, buildingEntityId: string): boolean {
    const ent = this.entities.get(buildingEntityId);
    const player = this.players.get(playerId);
    if (!ent || !player || ent.ownerId !== playerId || ent.entityType !== "BUILDING") {
      return false;
    }
    const spec = BUILDINGS[ent.kind as BuildingKind];
    const refund = Math.round(spec.cost * 0.5 * (ent.health.hp / ent.health.maxHp));
    player.credits = Math.min(player.maxStorage, player.credits + refund);
    this.pushVisualEffect(
      "UNIT_EXPLOSION",
      ent.transform.x + (spec.footprintW - 1) * 0.5,
      ent.transform.y + (spec.footprintH - 1) * 0.5,
      1.2,
      0.18,
      ent.faction
    );
    this.destroyEntity(ent.id);
    this.recomputeAllPlayerEconomies();
    this.pushAcoustic("CREDITS_TICK", ent.transform.x, ent.transform.y, playerId);
    return true;
  }

  public stepTick(): TickDelta {
    const prevTickId = this.tickCounter;
    this.tickCounter++;

    for (const ent of this.entities.values()) {
      if (ent.spawnProtectionTicks > 0) {
        ent.spawnProtectionTicks--;
        ent.dirty = true;
      }
    }

    this.rebuildSpatialReservations();
    this.recomputeAllPlayerEconomies();

    this.stepProductionQueues();
    this.stepBuildingRepairs();
    this.stepConstructorBots();
    this.stepSilverMines();
    this.stepHarvesters();
    this.stepUnitMovement();
    this.stepCombat();
    this.stepAiControllers();
    this.checkVictoryConditions();

    const fogByPlayer = this.fogManager.recomputeTickVisibility(
      Array.from(this.players.keys()),
      this.entities.values()
    );

    const createdSet = new Set(this.createdThisTick);
    const createdStates: EntityState[] = [];
    const updatedStates: EntityState[] = [];

    for (const id of this.createdThisTick) {
      const e = this.entities.get(id);
      if (e) createdStates.push(this.serializeEntity(e));
    }

    for (const e of this.entities.values()) {
      if (e.dirty && !createdSet.has(e.id)) {
        updatedStates.push(this.serializeEntity(e));
      }
    }

    const delta: TickDelta = {
      type: "SIM_DELTA",
      lobbyId: this.lobbyId,
      tickId: this.tickCounter,
      prevTickId,
      created: createdStates,
      updated: updatedStates,
      destroyedIds: [...this.destroyedThisTick],
      oreUpdates: Array.from(this.oreUpdatesThisTick.values()),
      terrainUpdates: Array.from(this.terrainUpdatesThisTick.values()),
      players: Array.from(this.players.values()).map((p) => this.serializePlayerEconomy(p)),
      projectiles: [...this.projectilesThisTick],
      visualEffects: [...this.visualEffectsThisTick],
      acousticEvents: [...this.acousticEventsThisTick],
      fogByPlayer,
      winnerPlayerId: this.winnerPlayerId,
    };

    this.createdThisTick = [];
    this.destroyedThisTick = [];
    this.oreUpdatesThisTick.clear();
    this.terrainUpdatesThisTick.clear();
    this.projectilesThisTick = [];
    this.visualEffectsThisTick = [];
    this.acousticEventsThisTick = [];

    for (const ent of this.entities.values()) {
      ent.dirty = false;
    }

    if (this.tickCounter === 1) {
      return TickDeltaSchema.parse(delta);
    }
    return delta;
  }

  public getFullSnapshot(): FullSnapshot {
    const fogRecords = this.fogManager.getSnapshotRecords();
    const snapshot: FullSnapshot = {
      type: "SIM_SNAPSHOT",
      lobbyId: this.lobbyId,
      tickId: this.tickCounter,
      mapWidth: this.width,
      mapHeight: this.height,
      terrainGrid: [...this.terrainGrid],
      oreGrid: [...this.oreGrid],
      entities: Array.from(this.entities.values()).map((e) => this.serializeEntity(e)),
      players: Array.from(this.players.values()).map((p) => this.serializePlayerEconomy(p)),
      exploredByPlayer: fogRecords.exploredByPlayer,
      visibleByPlayer: fogRecords.visibleByPlayer,
      winnerPlayerId: this.winnerPlayerId,
    };
    return FullSnapshotSchema.parse(snapshot);
  }

  private rebuildSpatialReservations(): void {
    this.reservationGrid.clearDynamic();
    for (const ent of this.entities.values()) {
      if (ent.entityType === "BUILDING" && ent.building && ent.kind !== "CONCRETE_SLAB") {
        this.reservationGrid.markBuildingFootprint(
          ent.transform.x,
          ent.transform.y,
          ent.building.footprintW,
          ent.building.footprintH
        );
      } else if (ent.entityType === "TREE") {
        this.reservationGrid.markBuildingFootprint(
          Math.round(ent.transform.x),
          Math.round(ent.transform.y),
          1,
          1
        );
      } else if (ent.entityType === "UNIT") {
        this.reservationGrid.reserveUnitTile(
          Math.round(ent.transform.x),
          Math.round(ent.transform.y),
          ent.id
        );
      }
    }
  }

  private stepSilverMines(): void {
    if (this.tickCounter % SILVER_MINE_CYCLE_TICKS !== 0) return;
    for (const ent of this.entities.values()) {
      if (
        ent.entityType === "BUILDING" &&
        ent.kind === "SILVER_MINE" &&
        ent.building &&
        ent.building.buildProgress >= 1
      ) {
        const owner = this.players.get(ent.ownerId);
        if (owner && !owner.defeated) {
          owner.silverOre += SILVER_MINE_YIELD_PER_CYCLE;
        }
      }
    }
  }

  private recomputeAllPlayerEconomies(): void {
    for (const p of this.players.values()) {
      let powerProduced = 0;
      let powerConsumed = 0;
      let storage = BASE_STORAGE_CAPACITY;
      let hasRadar = false;

      for (const ent of this.entities.values()) {
        if (
          ent.ownerId !== p.playerId ||
          ent.entityType !== "BUILDING" ||
          !ent.building ||
          ent.building.buildProgress < 1
        ) {
          continue;
        }
        if (ent.building.powerDelta >= 0) {
          powerProduced += ent.building.powerDelta;
        } else {
          powerConsumed += Math.abs(ent.building.powerDelta);
        }
        storage += ent.building.storageCapacity;
        if (ent.kind === "RADAR_DOME") {
          hasRadar = true;
        }
      }

      const wasLowPower = p.lowPower;
      p.powerProduced = powerProduced;
      p.powerConsumed = powerConsumed;
      p.maxStorage = storage;
      p.lowPower = powerConsumed > powerProduced;
      p.radarActive = hasRadar && !p.lowPower;

      if (p.lowPower && !wasLowPower && !p.lowPowerAlertSent) {
        p.lowPowerAlertSent = true;
        this.pushAcoustic("EVA_LOW_POWER", 0, 0, p.playerId);
      } else if (!p.lowPower) {
        p.lowPowerAlertSent = false;
      }
    }
  }

  private stepProductionQueues(): void {
    for (const p of this.players.values()) {
      if (p.defeated) continue;
      // Strict power penalty: production drops to 35% speed during power deficit
      const speedFactor = p.lowPower ? 0.35 : 1.0;

      for (const category of CATEGORIES) {
        const slot = p.queues[category];
        if (!slot.activeItem || slot.readyToPlace) continue;

        slot.ticksElapsed += speedFactor;
        if (slot.ticksElapsed >= slot.ticksRequired) {
          slot.ticksElapsed = slot.ticksRequired;
          const isUnitItem = Object.prototype.hasOwnProperty.call(UNITS, slot.activeItem);
          if (!isUnitItem && (category === "BUILDING" || category === "DEFENSE")) {
            slot.readyToPlace = true;
            this.pushAcoustic("EVA_CONSTRUCTION_COMPLETE", 0, 0, p.playerId);
          } else {
            const spawned = this.spawnProducedUnit(p.playerId, p.faction, slot.activeItem as UnitKind);
            if (spawned) {
              slot.activeItem = null;
              slot.ticksElapsed = 0;
              slot.ticksRequired = 0;
              slot.readyToPlace = false;
              this.pushAcoustic("EVA_UNIT_READY", spawned.transform.x, spawned.transform.y, p.playerId);
            }
          }
        }
      }
    }
  }

  private spawnProducedUnit(
    playerId: string,
    faction: FactionId,
    unitKind: UnitKind
  ): EcsEntity | null {
    const candidateProducers: BuildingKind[] =
      unitKind === "CONSTRUCTOR_BOT"
        ? ["CONSTRUCTION_YARD", "WAR_FACTORY"]
        : UNITS[unitKind].category === "INFANTRY"
          ? ["BARRACKS"]
          : ["WAR_FACTORY"];

    for (const producerKind of candidateProducers) {
      for (const ent of this.entities.values()) {
        if (
          ent.ownerId === playerId &&
          ent.entityType === "BUILDING" &&
          ent.kind === producerKind &&
          ent.building &&
          ent.building.buildProgress >= 1
        ) {
          const dock = this.reservationGrid.findNearestFreeDockTile(
            ent.transform.x,
            ent.transform.y,
            ent.building.footprintW,
            ent.building.footprintH,
            ent.transform.x + ent.building.footprintW,
            ent.transform.y + ent.building.footprintH
          );
          if (dock) {
            return this.createUnitEntity(playerId, faction, unitKind, dock.x, dock.y);
          }
        }
      }
    }
    return null;
  }

  private stepConstructorBots(): void {
    const claimedSiteIds = new Set<string>();

    for (const bot of this.entities.values()) {
      if (bot.entityType !== "UNIT" || bot.kind !== "CONSTRUCTOR_BOT" || !bot.navigation) {
        continue;
      }
      const nav = bot.navigation;

      // Find nearest incomplete construction site owned by the same commander.
      // Prefer sites not yet claimed by another Constructor Bot this tick so multiple bots build multiple sites simultaneously.
      let bestUnclaimedSite: EcsEntity | null = null;
      let bestUnclaimedDist = Infinity;
      let bestFallbackSite: EcsEntity | null = null;
      let bestFallbackDist = Infinity;

      for (const ent of this.entities.values()) {
        if (
          ent.ownerId === bot.ownerId &&
          ent.entityType === "BUILDING" &&
          ent.building &&
          ent.building.buildProgress < 1
        ) {
          const nearestFootX = Math.max(
            ent.transform.x,
            Math.min(bot.transform.x, ent.transform.x + ent.building.footprintW - 1)
          );
          const nearestFootY = Math.max(
            ent.transform.y,
            Math.min(bot.transform.y, ent.transform.y + ent.building.footprintH - 1)
          );
          const d = Math.hypot(
            nearestFootX - bot.transform.x,
            nearestFootY - bot.transform.y
          );
          if (d < bestFallbackDist) {
            bestFallbackDist = d;
            bestFallbackSite = ent;
          }
          if (!claimedSiteIds.has(ent.id) && d < bestUnclaimedDist) {
            bestUnclaimedDist = d;
            bestUnclaimedSite = ent;
          }
        }
      }

      const bestSite = bestUnclaimedSite ?? bestFallbackSite;
      const bestDist = bestUnclaimedSite ? bestUnclaimedDist : bestFallbackDist;

      if (!bestSite || !bestSite.building) {
        if (bot.stateLabel === "BUILDING") {
          bot.stateLabel = "IDLE";
          bot.dirty = true;
        }
        continue;
      }

      claimedSiteIds.add(bestSite.id);

      const siteCenterX = bestSite.transform.x + (bestSite.building.footprintW - 1) * 0.5;
      const siteCenterY = bestSite.transform.y + (bestSite.building.footprintH - 1) * 0.5;

      if (bestDist <= 1.55) {
        if (nav.path.length > 0) {
          nav.path = [];
          nav.pathIndex = 0;
        }
        const aimAngle = vectorToAngleIndex16(
          siteCenterX - bot.transform.x,
          siteCenterY - bot.transform.y
        );
        bot.transform.angleIndex = aimAngle;
        bot.transform.turretAngleIndex = aimAngle;
        bot.stateLabel = "BUILDING";
        bot.dirty = true;

        bestSite.stateLabel = "BUILDING";
        const stepDelta = 1 / Math.max(1, bestSite.building.buildTicksRequired);
        bestSite.building.buildProgress = Number(
          Math.min(1, bestSite.building.buildProgress + stepDelta).toFixed(4)
        );
        bestSite.health.hp = Math.max(
          1,
          Math.round(bestSite.health.maxHp * bestSite.building.buildProgress)
        );
        bestSite.dirty = true;

        if (this.tickCounter % 4 === 0) {
          this.pushVisualEffect(
            "HARVEST_SPARKS",
            siteCenterX,
            siteCenterY,
            0.48,
            0,
            bot.faction
          );
        }

        if (bestSite.building.buildProgress >= 1) {
          bestSite.building.buildProgress = 1;
          bestSite.health.hp = bestSite.health.maxHp;
          bestSite.stateLabel = "IDLE";
          this.pushAcoustic(
            "EVA_BUILDING_DEPLOYED",
            bestSite.transform.x,
            bestSite.transform.y,
            bot.ownerId
          );

          if (bestSite.kind === "CONCRETE_SLAB") {
            const tx = bestSite.transform.x;
            const ty = bestSite.transform.y;
            const idx = ty * this.width + tx;
            this.terrainGrid[idx] = TERRAIN_KIND.CONCRETE_SLAB;
            this.terrainDamageGrid[idx] = 0;
            if ((this.oreGrid[idx] ?? 0) > 0) {
              this.oreGrid[idx] = 0;
              this.oreUpdatesThisTick.set(idx, {
                tileX: tx,
                tileY: ty,
                oreAmount: 0,
              });
            }
            this.terrainUpdatesThisTick.set(idx, {
              tileX: tx,
              tileY: ty,
              terrainKind: TERRAIN_KIND.CONCRETE_SLAB,
            });
            this.destroyEntity(bestSite.id);
          } else {
            if (bestSite.kind === "REFINERY") {
              const dock = this.reservationGrid.findNearestFreeDockTile(
                bestSite.transform.x,
                bestSite.transform.y,
                bestSite.building.footprintW,
                bestSite.building.footprintH,
                bestSite.transform.x + 1,
                bestSite.transform.y + 2
              );
              if (dock) {
                const freeHarv = this.createUnitEntity(
                  bestSite.ownerId,
                  bestSite.faction,
                  "HARVESTER",
                  dock.x,
                  dock.y
                );
                if (freeHarv.harvester) {
                  freeHarv.harvester.homeRefineryId = bestSite.id;
                }
              }
            }
            this.recomputeAllPlayerEconomies();
          }
        }
      } else if (nav.pathIndex >= nav.path.length) {
        if (nav.waitTicks > 0) {
          nav.waitTicks--;
          continue;
        }
        const dock =
          bestSite.kind === "CONCRETE_SLAB" &&
          this.reservationGrid.isTilePassable(
            bestSite.transform.x,
            bestSite.transform.y,
            bot.id,
            false
          )
            ? { x: bestSite.transform.x, y: bestSite.transform.y }
            : this.reservationGrid.findNearestFreeDockTile(
                bestSite.transform.x,
                bestSite.transform.y,
                bestSite.building.footprintW,
                bestSite.building.footprintH,
                bot.transform.x,
                bot.transform.y,
                bot.id
              );
        if (dock) {
          nav.path = this.pathfinder.findPath(
            bot.transform.x,
            bot.transform.y,
            dock.x,
            dock.y,
            this.reservationGrid,
            bot.id,
            true
          );
          nav.pathIndex = 0;
          nav.waitTicks = nav.path.length === 0 ? 6 : 0;
          bot.stateLabel = nav.path.length > 0 ? "MOVING" : "IDLE";
          bot.dirty = true;
        } else {
          nav.waitTicks = 6;
        }
      }
    }
  }

  private stepHarvesters(): void {
    for (const ent of this.entities.values()) {
      if (ent.entityType !== "UNIT" || !ent.harvester || !ent.navigation) continue;
      const harv = ent.harvester;
      const nav = ent.navigation;
      const player = this.players.get(ent.ownerId);
      if (!player || player.defeated) continue;

      const curTileX = Math.round(ent.transform.x);
      const curTileY = Math.round(ent.transform.y);
      const curTileIdx = curTileY * this.width + curTileX;

      if (harv.state === "IDLE") {
        if (harv.cargoOre >= harv.maxCapacity) {
          harv.state = "RETURNING_TO_REFINERY";
          ent.stateLabel = "RETURNING";
          ent.dirty = true;
        } else if ((this.oreGrid[curTileIdx] ?? 0) > 0) {
          harv.targetOreTile = { x: curTileX, y: curTileY };
          harv.state = "HARVESTING";
          ent.stateLabel = "HARVESTING";
          nav.path = [];
          nav.pathIndex = 0;
          nav.waitTicks = 0;
          ent.dirty = true;
        } else if (nav.waitTicks > 0) {
          nav.waitTicks--;
        } else {
          const oreTile = this.findNearestOreTile(ent.transform.x, ent.transform.y, ent.id);
          if (oreTile) {
            harv.targetOreTile = oreTile;
            harv.state = "MOVING_TO_ORE";
            ent.stateLabel = "HARVESTING";
            nav.path = this.pathfinder.findPath(
              ent.transform.x,
              ent.transform.y,
              oreTile.x,
              oreTile.y,
              this.reservationGrid,
              ent.id,
              true
            );
            nav.pathIndex = 0;
            nav.waitTicks = nav.path.length === 0 ? 10 : 0;
            ent.dirty = true;
          } else {
            nav.waitTicks = 20;
          }
        }
      } else if (harv.state === "MOVING_TO_ORE") {
        const target = harv.targetOreTile;
        if (!target) {
          harv.state = "IDLE";
          continue;
        }
        const dist = Math.hypot(ent.transform.x - target.x, ent.transform.y - target.y);
        const targetIdx = target.y * this.width + target.x;
        const standingOnOre = (this.oreGrid[curTileIdx] ?? 0) > 0;
        const canHarvestAdjacentTarget =
          dist <= 1.55 &&
          (this.oreGrid[targetIdx] ?? 0) > 0 &&
          (dist <= 0.45 || nav.pathIndex >= nav.path.length);

        if ((standingOnOre && (dist <= 1.55 || nav.pathIndex >= nav.path.length)) || canHarvestAdjacentTarget) {
          if (standingOnOre) {
            harv.targetOreTile = { x: curTileX, y: curTileY };
          }
          nav.path = [];
          nav.pathIndex = 0;
          nav.waitTicks = 0;
          harv.state = "HARVESTING";
          ent.stateLabel = "HARVESTING";
          ent.dirty = true;
        } else if (nav.pathIndex >= nav.path.length) {
          if (nav.waitTicks > 0) {
            nav.waitTicks--;
            continue;
          }
          const nextOre = this.findNearestOreTile(ent.transform.x, ent.transform.y, ent.id);
          if (nextOre) {
            harv.targetOreTile = nextOre;
            nav.path = this.pathfinder.findPath(
              ent.transform.x,
              ent.transform.y,
              nextOre.x,
              nextOre.y,
              this.reservationGrid,
              ent.id,
              true
            );
            nav.pathIndex = 0;
            nav.waitTicks = nav.path.length === 0 ? 10 : 0;
          } else {
            harv.state = harv.cargoOre > 0 ? "RETURNING_TO_REFINERY" : "IDLE";
            nav.waitTicks = 10;
          }
        }
      } else if (harv.state === "HARVESTING") {
        let tx = curTileX;
        let ty = curTileY;
        let idx = curTileIdx;
        let available = this.oreGrid[idx] ?? 0;

        if (available <= 0 && harv.targetOreTile) {
          const distToTarget = Math.hypot(
            ent.transform.x - harv.targetOreTile.x,
            ent.transform.y - harv.targetOreTile.y
          );
          const tIdx = harv.targetOreTile.y * this.width + harv.targetOreTile.x;
          if (distToTarget <= 1.55 && (this.oreGrid[tIdx] ?? 0) > 0) {
            tx = harv.targetOreTile.x;
            ty = harv.targetOreTile.y;
            idx = tIdx;
            available = this.oreGrid[idx] ?? 0;
          }
        }

        if (available <= 0) {
          harv.state = harv.cargoOre >= harv.maxCapacity * 0.6 ? "RETURNING_TO_REFINERY" : "IDLE";
          ent.dirty = true;
          continue;
        }

        const fSpec = FACTIONS[ent.faction];
        const amount = Math.min(
          available,
          Math.round(HARVESTER_LOAD_PER_TICK * fSpec.harvestBonus),
          harv.maxCapacity - harv.cargoOre
        );
        this.oreGrid[idx] = available - amount;
        if (this.oreGrid[idx] === 0) {
          this.terrainGrid[idx] = TERRAIN_KIND.DIRT;
          this.terrainUpdatesThisTick.set(idx, {
            tileX: tx,
            tileY: ty,
            terrainKind: TERRAIN_KIND.DIRT,
          });
        }
        harv.cargoOre += amount;
        ent.dirty = true;
        this.oreUpdatesThisTick.set(idx, {
          tileX: tx,
          tileY: ty,
          oreAmount: this.oreGrid[idx]!,
        });
        if (this.tickCounter % 4 === 0) {
          this.pushVisualEffect("HARVEST_SPARKS", tx, ty, 0.55, 0, ent.faction);
        }

        if (harv.cargoOre >= harv.maxCapacity) {
          harv.state = "RETURNING_TO_REFINERY";
          ent.stateLabel = "RETURNING";
          nav.path = [];
          nav.pathIndex = 0;
          nav.waitTicks = 0;
        }
      } else if (harv.state === "RETURNING_TO_REFINERY") {
        const ref = this.findNearestRefinery(ent.ownerId, ent.transform.x, ent.transform.y);
        if (!ref || !ref.building) {
          harv.state = "IDLE";
          ent.stateLabel = "IDLE";
          continue;
        }

        // Check distance to Refinery footprint edges so all 14 perimeter dock tiles unload cleanly
        const nearestFootX = Math.max(
          ref.transform.x,
          Math.min(ent.transform.x, ref.transform.x + ref.building.footprintW - 1)
        );
        const nearestFootY = Math.max(
          ref.transform.y,
          Math.min(ent.transform.y, ref.transform.y + ref.building.footprintH - 1)
        );
        const distToFootprint = Math.hypot(
          ent.transform.x - nearestFootX,
          ent.transform.y - nearestFootY
        );

        if (distToFootprint <= 1.55) {
          const dockX = Math.round(ent.transform.x);
          const dockY = Math.round(ent.transform.y);
          harv.state = "UNLOADING";
          harv.unloadPhase = "REVERSING_IN";
          harv.unloadPhaseTicks = 4;
          harv.dockPos = { x: dockX, y: dockY };
          ent.stateLabel = "UNLOADING";
          nav.path = [];
          nav.pathIndex = 0;
          nav.waitTicks = 0;

          // Orient chassis outward away from the Refinery bay so the Harvester backs into the bay in reverse gear
          const refCenterX = ref.transform.x + (ref.building.footprintW - 1) * 0.5;
          const refCenterY = ref.transform.y + (ref.building.footprintH - 1) * 0.5;
          const reverseAngle = vectorToAngleIndex16(
            dockX - refCenterX,
            dockY - refCenterY
          );
          ent.transform.angleIndex = reverseAngle;
          ent.transform.turretAngleIndex = reverseAngle;
          ent.dirty = true;
          this.pushAcoustic("CREDITS_TICK", ref.transform.x, ref.transform.y, player.playerId);
        } else if (nav.pathIndex >= nav.path.length) {
          if (nav.waitTicks > 0) {
            nav.waitTicks--;
            continue;
          }
          const dock = this.reservationGrid.findNearestFreeDockTile(
            ref.transform.x,
            ref.transform.y,
            ref.building.footprintW,
            ref.building.footprintH,
            ent.transform.x,
            ent.transform.y,
            ent.id
          );
          if (!dock) {
            nav.waitTicks = 6;
            continue;
          }
          nav.path = this.pathfinder.findPath(
            ent.transform.x,
            ent.transform.y,
            dock.x,
            dock.y,
            this.reservationGrid,
            ent.id,
            true
          );
          nav.pathIndex = 0;
          nav.waitTicks = nav.path.length === 0 ? 8 : 0;
        }
      } else if (harv.state === "UNLOADING") {
        const ref = this.findNearestRefinery(ent.ownerId, ent.transform.x, ent.transform.y);
        if (!ref || !ref.building) {
          if (harv.dockPos) {
            ent.transform.x = harv.dockPos.x;
            ent.transform.y = harv.dockPos.y;
          }
          harv.unloadPhase = undefined;
          harv.unloadPhaseTicks = 0;
          harv.state = "IDLE";
          ent.stateLabel = "IDLE";
          ent.dirty = true;
          continue;
        }

        const dockX = harv.dockPos?.x ?? Math.round(ent.transform.x);
        const dockY = harv.dockPos?.y ?? Math.round(ent.transform.y);
        const bayTileX = Math.max(
          ref.transform.x,
          Math.min(dockX, ref.transform.x + ref.building.footprintW - 1)
        );
        const bayTileY = Math.max(
          ref.transform.y,
          Math.min(dockY, ref.transform.y + ref.building.footprintH - 1)
        );
        const insideBayX = Number((dockX + (bayTileX - dockX) * 0.45).toFixed(4));
        const insideBayY = Number((dockY + (bayTileY - dockY) * 0.45).toFixed(4));
        const phase = harv.unloadPhase ?? "DUMPING";

        if (phase === "REVERSING_IN") {
          const remaining = Math.max(0, (harv.unloadPhaseTicks ?? 1) - 1);
          harv.unloadPhaseTicks = remaining;
          const progress = (4 - remaining) / 4;
          ent.transform.x = Number((dockX + (insideBayX - dockX) * progress).toFixed(4));
          ent.transform.y = Number((dockY + (insideBayY - dockY) * progress).toFixed(4));
          ent.dirty = true;
          if (remaining <= 0) {
            harv.unloadPhase = "DUMPING";
          }
          continue;
        }

        if (phase === "DUMPING") {
          ent.transform.x = insideBayX;
          ent.transform.y = insideBayY;

          const unloadChunk = Math.min(harv.cargoOre, HARVESTER_UNLOAD_PER_TICK);
          if (unloadChunk > 0) {
            const spaceLeft = Math.max(0, player.maxStorage - player.credits);
            const deposited = Math.min(spaceLeft, unloadChunk);
            player.credits += deposited;
            player.harvestedTotal += unloadChunk;
            if (deposited < unloadChunk && !player.silosAlertSent) {
              player.silosAlertSent = true;
              this.pushAcoustic("EVA_SILOS_NEEDED", ref.transform.x, ref.transform.y, player.playerId);
            } else if (player.credits < player.maxStorage * 0.9) {
              player.silosAlertSent = false;
            }
            harv.cargoOre -= unloadChunk;
            ent.dirty = true;

            if (this.tickCounter % 4 === 0) {
              this.pushVisualEffect(
                "HARVEST_SPARKS",
                insideBayX,
                insideBayY,
                0.5,
                0,
                ent.faction
              );
            }
          }

          if (harv.cargoOre <= 0) {
            harv.cargoOre = 0;
            harv.unloadPhase = "PULLING_OUT";
            harv.unloadPhaseTicks = 4;
            ent.dirty = true;
          }
          continue;
        }

        if (phase === "PULLING_OUT") {
          const remaining = Math.max(0, (harv.unloadPhaseTicks ?? 1) - 1);
          harv.unloadPhaseTicks = remaining;
          const progress = (4 - remaining) / 4;
          ent.transform.x = Number((insideBayX + (dockX - insideBayX) * progress).toFixed(4));
          ent.transform.y = Number((insideBayY + (dockY - insideBayY) * progress).toFixed(4));
          ent.dirty = true;
          if (remaining <= 0) {
            ent.transform.x = dockX;
            ent.transform.y = dockY;
            harv.unloadPhase = undefined;
            harv.unloadPhaseTicks = 0;
            harv.dockPos = null;
            harv.state = "IDLE";
            ent.stateLabel = "IDLE";
            nav.path = [];
            nav.pathIndex = 0;
            nav.waitTicks = 0;
            this.pushAcoustic("CREDITS_TICK", ref.transform.x, ref.transform.y, player.playerId);
          }
        }
      }
    }
  }

  private stepUnitMovement(): void {
    let dynamicRepathsThisTick = 0;
    const maxDynamicRepathsPerTick = 4;

    for (const ent of this.entities.values()) {
      if (ent.entityType !== "UNIT" || !ent.navigation) continue;
      const nav = ent.navigation;
      if (nav.pathIndex >= nav.path.length) {
        if (ent.stateLabel === "MOVING") {
          ent.stateLabel = "IDLE";
          ent.dirty = true;
        }
        continue;
      }

      const startTileX = Math.round(ent.transform.x);
      const startTileY = Math.round(ent.transform.y);
      let remainingStep = nav.speedTilesPerTick;
      let movedThisTick = false;
      let lastDx = 0;
      let lastDy = 0;

      while (remainingStep > 0.0001 && nav.pathIndex < nav.path.length) {
        const waypoint = nav.path[nav.pathIndex]!;
        const curTileX = Math.round(ent.transform.x);
        const curTileY = Math.round(ent.transform.y);

        // Reserve the waypoint tile before entering it
        if (
          (waypoint.x !== curTileX || waypoint.y !== curTileY) &&
          !this.reservationGrid.isTilePassable(waypoint.x, waypoint.y, ent.id, false)
        ) {
          if (!movedThisTick) {
            nav.waitTicks++;
            if (nav.waitTicks >= 4 && dynamicRepathsThisTick < maxDynamicRepathsPerTick) {
              dynamicRepathsThisTick++;
              const finalGoal = nav.path[nav.path.length - 1]!;
              nav.path = this.pathfinder.findPath(
                ent.transform.x,
                ent.transform.y,
                finalGoal.x,
                finalGoal.y,
                this.reservationGrid,
                ent.id,
                true
              );
              nav.pathIndex = 0;
              nav.waitTicks = 0;
            }
          }
          break;
        }

        nav.waitTicks = 0;
        const dx = waypoint.x - ent.transform.x;
        const dy = waypoint.y - ent.transform.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.0001) {
          lastDx = dx;
          lastDy = dy;
        }

        if (dist <= remainingStep) {
          ent.transform.x = waypoint.x;
          ent.transform.y = waypoint.y;
          remainingStep -= dist;
          nav.pathIndex++;
          movedThisTick = true;
        } else {
          ent.transform.x = Number((ent.transform.x + (dx / dist) * remainingStep).toFixed(4));
          ent.transform.y = Number((ent.transform.y + (dy / dist) * remainingStep).toFixed(4));
          remainingStep = 0;
          movedThisTick = true;
        }
      }

      if (!movedThisTick) {
        continue;
      }

      this.reservationGrid.releaseUnitTile(startTileX, startTileY, ent.id);

      if (lastDx !== 0 || lastDy !== 0) {
        const newAngle = vectorToAngleIndex16(lastDx, lastDy);
        ent.transform.angleIndex = newAngle;
        if (!ent.combat || (!ent.combat.targetEntityId && !ent.combat.groundTarget)) {
          ent.transform.turretAngleIndex = newAngle;
        }
      }

      if (nav.pathIndex >= nav.path.length && ent.stateLabel === "MOVING") {
        ent.stateLabel = "IDLE";
      }

      this.reservationGrid.reserveUnitTile(
        Math.round(ent.transform.x),
        Math.round(ent.transform.y),
        ent.id
      );
      ent.dirty = true;
    }
  }

  private stepBuildingRepairs(): void {
    for (const ent of this.entities.values()) {
      if (ent.entityType !== "BUILDING" || !ent.building || !ent.building.isRepairing) {
        continue;
      }
      if (ent.health.hp >= ent.health.maxHp) {
        ent.building.isRepairing = false;
        ent.dirty = true;
        continue;
      }
      const player = this.players.get(ent.ownerId);
      if (!player || player.credits < BUILDING_REPAIR_COST_PER_TICK) {
        ent.building.isRepairing = false;
        ent.dirty = true;
        continue;
      }
      player.credits -= BUILDING_REPAIR_COST_PER_TICK;
      ent.health.hp = Math.min(
        ent.health.maxHp,
        ent.health.hp + BUILDING_REPAIR_HP_PER_TICK
      );
      if (ent.health.hp >= ent.health.maxHp) {
        ent.building.isRepairing = false;
      }
      ent.dirty = true;
    }
  }

  private stepCombat(): void {
    for (const p of this.players.values()) {
      if (p.underAttackCooldown > 0) p.underAttackCooldown--;
    }

    let chaseRepathsThisTick = 0;
    const maxChaseRepathsPerTick = 4;

    for (const ent of this.entities.values()) {
      if (!ent.combat) continue;
      if (ent.entityType === "BUILDING" && ent.building && ent.building.buildProgress < 1) {
        continue;
      }
      const combat = ent.combat;
      if (combat.cooldownRemaining > 0) {
        combat.cooldownRemaining--;
      }

      // Obelisk requires positive power balance
      if (ent.entityType === "BUILDING" && ent.kind === "OBELISK") {
        const owner = this.players.get(ent.ownerId);
        if (owner?.lowPower) {
          if (ent.stateLabel !== "IDLE" || combat.targetEntityId !== null) {
            combat.targetEntityId = null;
            combat.groundTarget = null;
            ent.stateLabel = "IDLE";
            ent.dirty = true;
          }
          continue;
        }
      }

      // 1. Prioritize active unit MOVE orders: never interrupt or auto-acquire targets while executing a move path
      if (
        ent.entityType === "UNIT" &&
        ent.stateLabel === "MOVING" &&
        ent.navigation &&
        ent.navigation.pathIndex < ent.navigation.path.length &&
        combat.targetEntityId === null &&
        combat.groundTarget === null
      ) {
        continue;
      }

      // 2. Ground-target force-fire order (COMMAND_ATTACK_GROUND)
      if (combat.groundTarget && combat.targetEntityId === null) {
        const gx = combat.groundTarget.x;
        const gy = combat.groundTarget.y;
        const gDist = Math.hypot(gx - ent.transform.x, gy - ent.transform.y);

        if (gDist > combat.attackRange) {
          if (ent.entityType === "BUILDING") {
            combat.groundTarget = null;
            ent.stateLabel = "IDLE";
            ent.dirty = true;
            continue;
          }
          const aimAngle = vectorToAngleIndex16(gx - ent.transform.x, gy - ent.transform.y);
          if (ent.transform.turretAngleIndex !== aimAngle) {
            ent.transform.turretAngleIndex = aimAngle;
            ent.dirty = true;
          }
          if (
            ent.navigation &&
            ent.navigation.pathIndex >= ent.navigation.path.length &&
            chaseRepathsThisTick < maxChaseRepathsPerTick
          ) {
            if (ent.navigation.waitTicks > 0) {
              ent.navigation.waitTicks--;
            } else {
              chaseRepathsThisTick++;
              ent.navigation.path = this.pathfinder.findPath(
                ent.transform.x,
                ent.transform.y,
                Math.round(gx),
                Math.round(gy),
                this.reservationGrid,
                ent.id,
                true
              );
              ent.navigation.pathIndex = 0;
              ent.navigation.waitTicks = 10;
            }
          }
          continue;
        }

        if (ent.entityType === "UNIT" && ent.navigation && ent.navigation.path.length > 0) {
          ent.navigation.path = [];
          ent.navigation.pathIndex = 0;
        }

        const aimAngle = vectorToAngleIndex16(gx - ent.transform.x, gy - ent.transform.y);
        if (ent.transform.turretAngleIndex !== aimAngle || ent.stateLabel !== "ATTACKING") {
          ent.transform.turretAngleIndex = aimAngle;
          ent.stateLabel = "ATTACKING";
          ent.dirty = true;
        }

        if (combat.cooldownRemaining <= 0) {
          combat.cooldownRemaining = combat.attackCooldownTicks;
          const weaponStyle =
            ent.kind === "OBELISK"
              ? "LASER"
              : ent.kind === "ROCKET_SOLDIER" || ent.kind === "ARTILLERY" || ent.kind === "SAM_SITE"
                ? "ROCKET"
                : ent.kind === "RIFLE_INFANTRY" || ent.kind === "GUARD_TOWER" || ent.kind === "RECON_BUGGY"
                  ? "BULLET"
                  : "SHELL";

          this.projectilesThisTick.push({
            id: `prj_${this.tickCounter}_${ent.id}`,
            fromX: ent.transform.x,
            fromY: ent.transform.y,
            toX: gx,
            toY: gy,
            weaponStyle,
            faction: ent.faction,
          });

          this.pushVisualEffect("MUZZLE_FLASH", ent.transform.x, ent.transform.y, 0.55, 0, ent.faction);
          if (weaponStyle === "LASER") {
            this.pushVisualEffect("LASER_BURN", gx, gy, 1.1, 0.32, ent.faction);
          } else if (weaponStyle === "ROCKET") {
            this.pushVisualEffect("ROCKET_EXPLOSION", gx, gy, 1.0, 0.24, ent.faction);
          } else if (weaponStyle === "SHELL") {
            this.pushVisualEffect(
              "SHELL_IMPACT",
              gx,
              gy,
              ent.kind === "MAMMOTH_TANK" ? 1.05 : 0.8,
              ent.kind === "MAMMOTH_TANK" ? 0.28 : 0.16,
              ent.faction
            );
          } else {
            this.pushVisualEffect("SHELL_IMPACT", gx, gy, 0.45, 0, ent.faction);
          }

          this.degradeTerrainAtImpact(gx, gy, weaponStyle, false);

          const soundKind =
            weaponStyle === "LASER"
              ? "LASER_BEAM"
              : weaponStyle === "ROCKET"
                ? "ROCKET_LAUNCH"
                : weaponStyle === "BULLET"
                  ? "RIFLE_BURST"
                  : "CANNON_FIRE";
          this.pushAcoustic(soundKind, ent.transform.x, ent.transform.y, null);

          // Damage any entity standing on the targeted tile
          for (const occupant of this.entities.values()) {
            if (occupant.id === ent.id) continue;
            if (occupant.entityType === "UNIT" && occupant.spawnProtectionTicks > 0) continue;
            const inTile =
              occupant.entityType === "BUILDING" && occupant.building
                ? gx >= occupant.transform.x &&
                  gx < occupant.transform.x + occupant.building.footprintW &&
                  gy >= occupant.transform.y &&
                  gy < occupant.transform.y + occupant.building.footprintH
                : Math.hypot(occupant.transform.x - gx, occupant.transform.y - gy) <= 0.85;
            if (inTile) {
              occupant.health.hp = Math.max(0, occupant.health.hp - combat.attackDamage);
              occupant.dirty = true;
              if (occupant.health.hp <= 0) {
                this.degradeTerrainAtImpact(gx, gy, weaponStyle, true);
                this.pushVisualEffect(
                  occupant.entityType === "BUILDING" ? "BUILDING_DEMOLITION" : "UNIT_EXPLOSION",
                  gx,
                  gy,
                  occupant.entityType === "BUILDING" ? 2.5 : 1.45,
                  occupant.entityType === "BUILDING" ? 0.95 : 0.55,
                  occupant.faction
                );
                this.pushAcoustic(
                  occupant.entityType === "BUILDING" ? "EXPLOSION_LARGE" : "EXPLOSION_SMALL",
                  gx,
                  gy,
                  null
                );
                if (occupant.entityType === "UNIT") {
                  this.pushAcoustic("EVA_UNIT_LOST", gx, gy, occupant.ownerId);
                }
                this.destroyEntity(occupant.id);
                this.recomputeAllPlayerEconomies();
              }
              break;
            }
          }
        }
        continue;
      }

      let target = combat.targetEntityId ? this.entities.get(combat.targetEntityId) : undefined;
      if (
        !target ||
        target.ownerId === ent.ownerId ||
        (target.entityType === "UNIT" && target.spawnProtectionTicks > 0)
      ) {
        combat.targetEntityId = null;
        const acquireRange =
          ent.entityType === "BUILDING" || ent.stateLabel !== "MOVING"
            ? combat.detectionRange
            : combat.attackRange;
        target = this.findNearestEnemyInRange(ent, acquireRange);
        if (target) {
          combat.targetEntityId = target.id;
        }
      }
      if (!target) {
        if (ent.stateLabel === "ATTACKING" || ent.stateLabel === "ALERT") {
          ent.stateLabel =
            ent.entityType === "UNIT" &&
            ent.navigation &&
            ent.navigation.pathIndex < ent.navigation.path.length
              ? "MOVING"
              : "IDLE";
          ent.dirty = true;
        }
        continue;
      }

      let tx =
        target.entityType === "BUILDING" && target.building
          ? target.transform.x + (target.building.footprintW - 1) * 0.5
          : target.transform.x;
      let ty =
        target.entityType === "BUILDING" && target.building
          ? target.transform.y + (target.building.footprintH - 1) * 0.5
          : target.transform.y;

      let dist = Math.hypot(tx - ent.transform.x, ty - ent.transform.y);

      // If assigned target is out of weapon range, check if an immediate threat is already in weapon range
      if (dist > combat.attackRange) {
        const immediateThreat = this.findNearestEnemyInRange(ent, combat.attackRange);
        if (immediateThreat) {
          target = immediateThreat;
          combat.targetEntityId = immediateThreat.id;
          tx =
            target.entityType === "BUILDING" && target.building
              ? target.transform.x + (target.building.footprintW - 1) * 0.5
              : target.transform.x;
          ty =
            target.entityType === "BUILDING" && target.building
              ? target.transform.y + (target.building.footprintH - 1) * 0.5
              : target.transform.y;
          dist = Math.hypot(tx - ent.transform.x, ty - ent.transform.y);
        }
      }

      if (dist > combat.attackRange) {
        if (ent.entityType === "BUILDING") {
          // Stationary defense turret: if current target left detectionRange, look for another inside detectionRange
          if (dist > combat.detectionRange) {
            const detectedThreat = this.findNearestEnemyInRange(ent, combat.detectionRange);
            if (!detectedThreat) {
              combat.targetEntityId = null;
              if (ent.stateLabel !== "IDLE") {
                ent.stateLabel = "IDLE";
                ent.dirty = true;
              }
              continue;
            }
            target = detectedThreat;
            combat.targetEntityId = detectedThreat.id;
            tx =
              target.entityType === "BUILDING" && target.building
                ? target.transform.x + (target.building.footprintW - 1) * 0.5
                : target.transform.x;
            ty =
              target.entityType === "BUILDING" && target.building
                ? target.transform.y + (target.building.footprintH - 1) * 0.5
                : target.transform.y;
          }

          // Pre-range turret activation: lock on, swivel turret toward threat, enter ALERT state & pre-charge weapon
          const aimAngle = vectorToAngleIndex16(tx - ent.transform.x, ty - ent.transform.y);
          combat.cooldownRemaining = 0;
          if (ent.transform.turretAngleIndex !== aimAngle || ent.stateLabel !== "ALERT") {
            ent.transform.turretAngleIndex = aimAngle;
            ent.stateLabel = "ALERT";
            ent.dirty = true;
          }
          continue;
        }

        // Mobile combat unit: track enemy with turret when inside detectionRange and advance to attackRange
        if (dist <= combat.detectionRange) {
          const aimAngle = vectorToAngleIndex16(tx - ent.transform.x, ty - ent.transform.y);
          if (ent.transform.turretAngleIndex !== aimAngle || ent.stateLabel === "IDLE") {
            ent.transform.turretAngleIndex = aimAngle;
            if (ent.stateLabel === "IDLE") {
              ent.stateLabel = "ALERT";
            }
            ent.dirty = true;
          }
        }

        if (ent.entityType === "UNIT" && ent.navigation && ent.navigation.pathIndex >= ent.navigation.path.length) {
          if (ent.navigation.waitTicks > 0) {
            ent.navigation.waitTicks--;
          } else if (chaseRepathsThisTick < maxChaseRepathsPerTick) {
            chaseRepathsThisTick++;
            ent.navigation.path = this.pathfinder.findPath(
              ent.transform.x,
              ent.transform.y,
              Math.round(tx),
              Math.round(ty),
              this.reservationGrid,
              ent.id,
              true
            );
            ent.navigation.pathIndex = 0;
            ent.navigation.waitTicks = 10;
          }
        }
        continue;
      }

      // Stop advancing once in weapon range
      if (ent.entityType === "UNIT" && ent.navigation && ent.navigation.path.length > 0) {
        ent.navigation.path = [];
        ent.navigation.pathIndex = 0;
      }

      const aimAngle = vectorToAngleIndex16(tx - ent.transform.x, ty - ent.transform.y);
      if (ent.transform.turretAngleIndex !== aimAngle || ent.stateLabel !== "ATTACKING") {
        ent.transform.turretAngleIndex = aimAngle;
        ent.stateLabel = "ATTACKING";
        ent.dirty = true;
      }

      if (combat.cooldownRemaining <= 0) {
        combat.cooldownRemaining = combat.attackCooldownTicks;
        target.health.hp = Math.max(0, target.health.hp - combat.attackDamage);
        target.dirty = true;

        const weaponStyle =
          ent.kind === "OBELISK"
            ? "LASER"
            : ent.kind === "ROCKET_SOLDIER" || ent.kind === "ARTILLERY" || ent.kind === "SAM_SITE"
            ? "ROCKET"
            : ent.kind === "RIFLE_INFANTRY" || ent.kind === "GUARD_TOWER" || ent.kind === "RECON_BUGGY"
            ? "BULLET"
            : "SHELL";

        this.projectilesThisTick.push({
          id: `prj_${this.tickCounter}_${ent.id}`,
          fromX: ent.transform.x,
          fromY: ent.transform.y,
          toX: tx,
          toY: ty,
          weaponStyle,
          faction: ent.faction,
        });

        this.pushVisualEffect("MUZZLE_FLASH", ent.transform.x, ent.transform.y, 0.55, 0, ent.faction);
        if (weaponStyle === "LASER") {
          this.pushVisualEffect("LASER_BURN", tx, ty, 1.1, 0.32, ent.faction);
        } else if (weaponStyle === "ROCKET") {
          this.pushVisualEffect("ROCKET_EXPLOSION", tx, ty, 1.0, 0.24, ent.faction);
        } else if (weaponStyle === "SHELL") {
          this.pushVisualEffect(
            "SHELL_IMPACT",
            tx,
            ty,
            ent.kind === "MAMMOTH_TANK" ? 1.05 : 0.8,
            ent.kind === "MAMMOTH_TANK" ? 0.28 : 0.16,
            ent.faction
          );
        } else {
          this.pushVisualEffect("SHELL_IMPACT", tx, ty, 0.45, 0, ent.faction);
        }

        // Degrade terrain strata at projectile impact point (Grass -> Dirt -> Stone)
        this.degradeTerrainAtImpact(tx, ty, weaponStyle, false);

        const soundKind =
          weaponStyle === "LASER"
            ? "LASER_BEAM"
            : weaponStyle === "ROCKET"
            ? "ROCKET_LAUNCH"
            : weaponStyle === "BULLET"
            ? "RIFLE_BURST"
            : "CANNON_FIRE";
        this.pushAcoustic(soundKind, ent.transform.x, ent.transform.y, null);

        const targetOwner = this.players.get(target.ownerId);
        if (targetOwner && target.entityType === "BUILDING" && targetOwner.underAttackCooldown === 0) {
          targetOwner.underAttackCooldown = 120;
          this.pushAcoustic("EVA_BASE_UNDER_ATTACK", tx, ty, target.ownerId);
        }

        if (target.health.hp <= 0) {
          this.degradeTerrainAtImpact(tx, ty, weaponStyle, true);
          this.pushVisualEffect(
            target.entityType === "BUILDING" ? "BUILDING_DEMOLITION" : "UNIT_EXPLOSION",
            tx,
            ty,
            target.entityType === "BUILDING" ? 2.5 : 1.45,
            target.entityType === "BUILDING" ? 0.95 : 0.55,
            target.faction
          );
          this.pushAcoustic(
            target.entityType === "BUILDING" ? "EXPLOSION_LARGE" : "EXPLOSION_SMALL",
            tx,
            ty,
            null
          );
          if (target.entityType === "UNIT") {
            this.pushAcoustic("EVA_UNIT_LOST", tx, ty, target.ownerId);
          }
          this.destroyEntity(target.id);
          combat.targetEntityId = null;
          this.recomputeAllPlayerEconomies();
        }
      }
    }
  }

  private stepAiControllers(): void {
    for (const p of this.players.values()) {
      if (!p.isAi || p.defeated) continue;
      if (p.aiDecisionCooldown > 0) {
        p.aiDecisionCooldown--;
        continue;
      }
      p.aiDecisionCooldown = 30;

      // Auto-place completed AI buildings
      for (const cat of ["BUILDING", "DEFENSE"] as const) {
        const slot = p.queues[cat];
        if (slot.readyToPlace && slot.activeItem) {
          const spot = this.findValidAiBuildSpot(p.playerId, slot.activeItem as BuildingKind);
          if (spot) {
            this.issuePlaceBuilding(p.playerId, cat, slot.activeItem as BuildingKind, spot.x, spot.y);
          }
        }
      }

      // Build order logic
      const ownedKinds = new Set<string>();
      const idleCombatUnits: string[] = [];
      for (const ent of this.entities.values()) {
        if (ent.ownerId === p.playerId) {
          ownedKinds.add(ent.kind);
          if (
            ent.entityType === "UNIT" &&
            ent.kind !== "HARVESTER" &&
            ent.kind !== "CONSTRUCTOR_BOT" &&
            ent.kind !== "MCV" &&
            ent.stateLabel === "IDLE" &&
            (!ent.combat || ent.combat.targetEntityId === null)
          ) {
            idleCombatUnits.push(ent.id);
          }
        }
      }

      const inGracePeriod = this.tickCounter < AI_ATTACK_GRACE_PERIOD_TICKS;

      if (p.lowPower) {
        this.issueStartProduction(p.playerId, "BUILDING", "POWER_PLANT");
      } else if (!ownedKinds.has("BARRACKS")) {
        this.issueStartProduction(p.playerId, "BUILDING", "BARRACKS");
      } else if (!ownedKinds.has("WAR_FACTORY")) {
        this.issueStartProduction(p.playerId, "BUILDING", "WAR_FACTORY");
      } else if (!ownedKinds.has("RADAR_DOME") && p.credits >= 1000) {
        this.issueStartProduction(p.playerId, "BUILDING", "RADAR_DOME");
      }

      // Build base perimeter defense turrets so attacking the AI base requires range management
      if (!p.lowPower) {
        if (!ownedKinds.has("GUARD_TOWER") && ownedKinds.has("BARRACKS") && p.credits >= 550) {
          this.issueStartProduction(p.playerId, "DEFENSE", "GUARD_TOWER");
        } else if (!ownedKinds.has("SAM_SITE") && ownedKinds.has("RADAR_DOME") && p.credits >= 850) {
          this.issueStartProduction(p.playerId, "DEFENSE", "SAM_SITE");
        }
      }

      // During the 2-minute opening grace period, cap AI defensive garrison so it does not amass an overwhelming deathball
      if (!inGracePeriod || idleCombatUnits.length < 4) {
        if (ownedKinds.has("BARRACKS") && p.credits >= 400) {
          const infChoice: UnitKind =
            this.tickCounter % 60 === 0 ? "RIFLE_INFANTRY" : "ROCKET_SOLDIER";
          this.issueStartProduction(p.playerId, "INFANTRY", infChoice);
        }
        if (ownedKinds.has("WAR_FACTORY") && p.credits >= 800) {
          const vehChoice: UnitKind =
            !inGracePeriod && ownedKinds.has("RADAR_DOME") && this.tickCounter % 90 === 0
              ? "ARTILLERY"
              : this.tickCounter % 120 === 0
                ? "RECON_BUGGY"
                : "MEDIUM_TANK";
          this.issueStartProduction(p.playerId, "VEHICLE", vehChoice);
        }
      }

      // Launch periodic attack wave ONLY after the 2-minute (2400-tick) opening grace period has elapsed
      if (!inGracePeriod && idleCombatUnits.length >= 5) {
        const enemyTarget = this.findAnyEnemyEntity(p.playerId);
        if (enemyTarget) {
          this.issueAttackCommand(p.playerId, idleCombatUnits, enemyTarget.id);
        }
      }
    }
  }

  private checkVictoryConditions(): void {
    if (this.winnerPlayerId) return;

    const alivePlayers: string[] = [];
    for (const p of this.players.values()) {
      let hasAssets = false;
      for (const ent of this.entities.values()) {
        if (ent.ownerId === p.playerId) {
          hasAssets = true;
          break;
        }
      }
      if (!hasAssets && !p.defeated) {
        p.defeated = true;
        this.pushAcoustic("EVA_DEFEAT", 0, 0, p.playerId);
      }
      if (!p.defeated) {
        alivePlayers.push(p.playerId);
      }
    }

    if (this.players.size >= 2 && alivePlayers.length === 1) {
      this.winnerPlayerId = alivePlayers[0]!;
      this.pushAcoustic("EVA_VICTORY", 0, 0, this.winnerPlayerId);
    }
  }

  private destroyEntity(id: string): void {
    const ent = this.entities.get(id);
    if (!ent) return;
    if (ent.entityType === "UNIT") {
      this.reservationGrid.releaseUnitTile(
        Math.round(ent.transform.x),
        Math.round(ent.transform.y),
        ent.id
      );
    }
    this.entities.delete(id);
    this.destroyedThisTick.push(id);
  }

  private hasPrerequisites(playerId: string, prereqs: readonly BuildingKind[]): boolean {
    if (prereqs.length === 0) return true;
    const owned = new Set<BuildingKind>();
    for (const ent of this.entities.values()) {
      if (
        ent.ownerId === playerId &&
        ent.entityType === "BUILDING" &&
        (!ent.building || ent.building.buildProgress >= 1)
      ) {
        owned.add(ent.kind as BuildingKind);
      }
    }
    return prereqs.every((req) => owned.has(req));
  }

  public isWithinBaseBuildRadius(
    playerId: string,
    tileX: number,
    tileY: number,
    w: number,
    h: number
  ): boolean {
    const cx = tileX + w * 0.5;
    const cy = tileY + h * 0.5;
    for (const ent of this.entities.values()) {
      if (
        ent.ownerId === playerId &&
        ent.entityType === "BUILDING" &&
        ent.building &&
        ent.building.buildProgress >= 1
      ) {
        const bx = ent.transform.x + ent.building.footprintW * 0.5;
        const by = ent.transform.y + ent.building.footprintH * 0.5;
        if (Math.hypot(cx - bx, cy - by) <= BASE_BUILD_RADIUS_TILES) {
          return true;
        }
      }
    }
    return false;
  }

  private findValidAiBuildSpot(
    playerId: string,
    kind: BuildingKind
  ): { x: number; y: number } | null {
    const spec = BUILDINGS[kind];
    for (const ent of this.entities.values()) {
      if (ent.ownerId === playerId && ent.kind === "CONSTRUCTION_YARD") {
        for (let dy = -7; dy <= 7; dy++) {
          for (let dx = -7; dx <= 7; dx++) {
            const tx = ent.transform.x + dx;
            const ty = ent.transform.y + dy;
            if (
              !this.reservationGrid.isFootprintBuildable(tx, ty, spec.footprintW, spec.footprintH) ||
              !this.isWithinBaseBuildRadius(playerId, tx, ty, spec.footprintW, spec.footprintH)
            ) {
              continue;
            }
            let validFoundation = true;
            for (let fy = 0; fy < spec.footprintH && validFoundation; fy++) {
              for (let fx = 0; fx < spec.footprintW; fx++) {
                const idx = (ty + fy) * this.width + (tx + fx);
                if (!canPlaceBuildingOnTerrainTile(kind, this.terrainGrid[idx] ?? 0)) {
                  validFoundation = false;
                  break;
                }
              }
            }
            if (!validFoundation) continue;
            return { x: tx, y: ty };
          }
        }
      }
    }
    return null;
  }

  private findNearestOreTile(
    fromX: number,
    fromY: number,
    entityId?: string
  ): { x: number; y: number } | null {
    let bestPassable: { x: number; y: number } | null = null;
    let bestPassableDist = Infinity;
    let bestFallback: { x: number; y: number } | null = null;
    let bestFallbackDist = Infinity;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if ((this.oreGrid[y * this.width + x] ?? 0) > 0) {
          const d = Math.hypot(x - fromX, y - fromY);
          if (d < bestFallbackDist) {
            bestFallbackDist = d;
            bestFallback = { x, y };
          }
          if (
            d < bestPassableDist &&
            this.reservationGrid.isTilePassable(x, y, entityId, false)
          ) {
            bestPassableDist = d;
            bestPassable = { x, y };
          }
        }
      }
    }
    return bestPassable ?? bestFallback;
  }

  private findNearestRefinery(
    ownerId: string,
    fromX: number,
    fromY: number
  ): EcsEntity | null {
    let best: EcsEntity | null = null;
    let bestDist = Infinity;
    for (const ent of this.entities.values()) {
      if (
        ent.ownerId === ownerId &&
        ent.entityType === "BUILDING" &&
        ent.kind === "REFINERY" &&
        ent.building &&
        ent.building.buildProgress >= 1
      ) {
        const d = Math.hypot(ent.transform.x - fromX, ent.transform.y - fromY);
        if (d < bestDist) {
          bestDist = d;
          best = ent;
        }
      }
    }
    return best;
  }

  public degradeTerrainAtImpact(
    worldX: number,
    worldY: number,
    weaponStyle: ProjectileVisual["weaponStyle"],
    isHeavyExplosion = false
  ): boolean {
    const tileX = Math.max(0, Math.min(this.width - 1, Math.round(worldX)));
    const tileY = Math.max(0, Math.min(this.height - 1, Math.round(worldY)));
    const idx = tileY * this.width + tileX;

    if ((this.oreGrid[idx] ?? 0) > 0) {
      return false;
    }

    const curKind = this.terrainGrid[idx] ?? TERRAIN_KIND.DIRT;
    if (
      curKind === TERRAIN_KIND.CLIFF ||
      curKind === TERRAIN_KIND.STONE ||
      curKind === TERRAIN_KIND.SILVER_ORE
    ) {
      return false;
    }

    const wearDelta = isHeavyExplosion
      ? 2
      : weaponStyle === "ROCKET" || weaponStyle === "LASER" || weaponStyle === "SHELL"
        ? 1
        : 0.5;

    const nextWear = (this.terrainDamageGrid[idx] ?? 0) + wearDelta;
    const thickness = getTerrainLayerThickness(curKind);

    if (nextWear >= thickness) {
      this.terrainDamageGrid[idx] = 0;
      const nextKind = degradeTerrainLayer(curKind);
      if (nextKind !== curKind) {
        this.terrainGrid[idx] = nextKind;
        this.terrainUpdatesThisTick.set(idx, {
          tileX,
          tileY,
          terrainKind: nextKind,
        });
        return true;
      }
    } else {
      this.terrainDamageGrid[idx] = nextWear;
    }
    return false;
  }

  private findNearestEnemyInRange(attacker: EcsEntity, range: number): EcsEntity | undefined {
    let best: EcsEntity | undefined;
    let bestDist = range;
    for (const ent of this.entities.values()) {
      if (ent.ownerId === attacker.ownerId || ent.ownerId === "neutral" || ent.entityType === "TREE") {
        continue;
      }
      if (ent.entityType === "UNIT" && ent.spawnProtectionTicks > 0) continue;
      const tx =
        ent.entityType === "BUILDING" && ent.building
          ? ent.transform.x + (ent.building.footprintW - 1) * 0.5
          : ent.transform.x;
      const ty =
        ent.entityType === "BUILDING" && ent.building
          ? ent.transform.y + (ent.building.footprintH - 1) * 0.5
          : ent.transform.y;
      const d = Math.hypot(tx - attacker.transform.x, ty - attacker.transform.y);
      if (d <= bestDist) {
        bestDist = d;
        best = ent;
      }
    }
    return best;
  }

  private findAnyEnemyEntity(ownerId: string): EcsEntity | undefined {
    for (const ent of this.entities.values()) {
      if (ent.ownerId !== ownerId && ent.ownerId !== "neutral" && ent.kind === "CONSTRUCTION_YARD") {
        return ent;
      }
    }
    for (const ent of this.entities.values()) {
      if (ent.ownerId !== ownerId && ent.ownerId !== "neutral" && ent.entityType !== "TREE") {
        if (ent.entityType === "UNIT" && ent.spawnProtectionTicks > 0) continue;
        return ent;
      }
    }
    return undefined;
  }

  private computeFormationOffsets(count: number): Array<{ dx: number; dy: number }> {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const result: Array<{ dx: number; dy: number }> = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      result.push({
        dx: col - Math.floor(cols / 2),
        dy: row - Math.floor(cols / 2),
      });
    }
    return result;
  }

  private pushAcoustic(
    soundKind: AcousticEvent["soundKind"],
    worldX: number,
    worldY: number,
    targetPlayerId: string | null
  ): void {
    this.acousticEventsThisTick.push({
      id: `sfx_${this.tickCounter}_${this.acousticEventsThisTick.length}`,
      soundKind,
      worldX,
      worldY,
      targetPlayerId,
    });
  }

  private pushVisualEffect(
    effectKind: VisualEffectKind,
    worldX: number,
    worldY: number,
    radiusTiles: number,
    shakeIntensity: number,
    faction: FactionId | null
  ): void {
    this.visualEffectsThisTick.push({
      id: `vfx_${this.tickCounter}_${this.visualEffectsThisTick.length}`,
      effectKind,
      worldX,
      worldY,
      radiusTiles,
      shakeIntensity,
      faction,
    });
  }

  private serializeEntity(ent: EcsEntity): EntityState {
    return {
      id: ent.id,
      ownerId: ent.ownerId,
      faction: ent.faction,
      entityType: ent.entityType,
      kind: ent.kind,
      x: ent.transform.x,
      y: ent.transform.y,
      hp: ent.health.hp,
      maxHp: ent.health.maxHp,
      angleIndex: ent.transform.angleIndex,
      turretAngleIndex: ent.transform.turretAngleIndex,
      cargoOre: ent.harvester ? ent.harvester.cargoOre : 0,
      spawnProtectionTicks: ent.spawnProtectionTicks,
      isRepairing: ent.building ? ent.building.isRepairing : false,
      buildProgress: ent.building ? ent.building.buildProgress : 1,
      treeScale: ent.treeScale ?? 1,
      stateLabel: ent.stateLabel,
    };
  }

  private serializePlayerEconomy(p: PlayerSimState): PlayerEconomyDelta {
    return {
      playerId: p.playerId,
      faction: p.faction,
      credits: p.credits,
      silverOre: p.silverOre,
      maxStorage: p.maxStorage,
      powerProduced: p.powerProduced,
      powerConsumed: p.powerConsumed,
      lowPower: p.lowPower,
      radarActive: p.radarActive,
      queues: CATEGORIES.map((cat) => {
        const slot = p.queues[cat];
        return {
          category: cat,
          activeItem: slot.activeItem,
          progressRatio:
            slot.ticksRequired > 0
              ? Number(Math.min(1, slot.ticksElapsed / slot.ticksRequired).toFixed(3))
              : 0,
          readyToPlace: slot.readyToPlace,
        };
      }),
      harvestedTotal: p.harvestedTotal,
      defeated: p.defeated,
    };
  }
}
