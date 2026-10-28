import {
  AI_ATTACK_GRACE_PERIOD_TICKS,
  BASE_BUILD_RADIUS_TILES,
  BASE_STORAGE_CAPACITY,
  BUILDINGS,
  degradeTerrainLayer,
  FACTIONS,
  getTerrainLayerThickness,
  HARVESTER_LOAD_PER_TICK,
  HARVESTER_MAX_LOAD,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  STARTING_CREDITS,
  TERRAIN_KIND,
  UNIT_SPAWN_PROTECTION_TICKS,
  UNITS,
  type BuildingKind,
  type FactionId,
  type ProductionCategory,
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
      { x: this.width - 10, y: this.height - 10 },
      { x: this.width - 10, y: 5 },
      { x: 5, y: this.height - 10 },
    ];

    participants.forEach((p, idx) => {
      this.players.set(p.playerId, {
        playerId: p.playerId,
        commanderName: p.commanderName,
        faction: p.faction,
        isAi: p.isAi,
        credits: STARTING_CREDITS,
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

    // Organic Earth/Soil (TERRE = 0) & Stone/Bedrock (PIERRE = 1) zones + central tactical ridges
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;

        // Organic earth transition corridor along the diagonal tactical valley & central basin
        const distCenter = Math.hypot(x - 23.5, y - 23.5);
        const wave = Math.sin(x * 0.28) * 1.8 + Math.cos(y * 0.28) * 1.8;
        if (distCenter + wave <= 11.5 || Math.abs(x - y) <= 3.2) {
          terrainGrid[idx] = TERRAIN_KIND.DIRT;
        }

        // Organic rounded stone plateaus around base command areas
        const distNW = Math.hypot(x - 7.5, y - 7.5);
        const distSE = Math.hypot(x - (this.width - 8.5), y - (this.height - 8.5));
        if (distNW <= 6.2 || distSE <= 6.2) {
          terrainGrid[idx] = TERRAIN_KIND.STONE;
        } else if (distNW <= 8.5 || distSE <= 8.5) {
          terrainGrid[idx] = TERRAIN_KIND.DIRT;
        }

        // Central canyon ridges (leaving wide tactical passes)
        if (
          (x === 22 || x === 25) &&
          ((y >= 16 && y <= 20) || (y >= 27 && y <= 31))
        ) {
          terrainGrid[idx] = TERRAIN_KIND.CLIFF; // impassable ridge
        }
      }
    }

    // Rich ore patches near each spawn and high-yield central Tiberium/Spice basin
    // Surrounded by an organic exposed earth (DIRT = 0) halo
    const oreCenters = [
      { cx: 14, cy: 7, radius: 3, amount: 650 },
      { cx: 7, cy: 14, radius: 3, amount: 650 },
      { cx: this.width - 15, cy: this.height - 8, radius: 3, amount: 650 },
      { cx: this.width - 8, cy: this.height - 15, radius: 3, amount: 650 },
      { cx: 24, cy: 24, radius: 4, amount: 900 },
      { cx: 14, cy: 34, radius: 3, amount: 750 },
      { cx: 34, cy: 14, radius: 3, amount: 750 },
    ];

    for (const patch of oreCenters) {
      const haloRadius = patch.radius + 1;
      for (let dy = -haloRadius; dy <= haloRadius; dy++) {
        for (let dx = -haloRadius; dx <= haloRadius; dx++) {
          const d2 = dx * dx + dy * dy;
          const tx = patch.cx + dx;
          const ty = patch.cy + dy;
          if (tx >= 1 && ty >= 1 && tx < this.width - 1 && ty < this.height - 1) {
            const idx = ty * this.width + tx;
            if (terrainGrid[idx] === TERRAIN_KIND.CLIFF) continue;
            if (d2 <= patch.radius * patch.radius) {
              terrainGrid[idx] = TERRAIN_KIND.ORE;
              oreGrid[idx] = patch.amount;
            } else if (
              d2 <= haloRadius * haloRadius &&
              terrainGrid[idx] === TERRAIN_KIND.GRASS
            ) {
              terrainGrid[idx] = TERRAIN_KIND.DIRT;
            }
          }
        }
      }
    }

    return { terrainGrid, oreGrid };
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
    this.createUnitEntity(playerId, faction, "RIFLE_INFANTRY", baseX + 4, baseY + 3);
    this.createUnitEntity(playerId, faction, "RECON_BUGGY", baseX + 5, baseY + 3);
    this.createUnitEntity(playerId, faction, "MEDIUM_TANK", baseX + 5, baseY + 4);
  }

  public createBuildingEntity(
    ownerId: string,
    faction: FactionId,
    kind: BuildingKind,
    tileX: number,
    tileY: number
  ): EcsEntity {
    const spec = BUILDINGS[kind];
    const fSpec = FACTIONS[faction];
    const maxHp = Math.round(spec.maxHp * fSpec.armorBonus);
    const id = `bld_${this.nextEntitySeq++}`;

    const entity: EcsEntity = {
      id,
      ownerId,
      faction,
      entityType: "BUILDING",
      kind,
      sightRadius: spec.sightRadius,
      spawnProtectionTicks: 0,
      stateLabel: "IDLE",
      transform: {
        x: tileX,
        y: tileY,
        angleIndex: 0,
        turretAngleIndex: 0,
      },
      health: {
        hp: maxHp,
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
            }
          : null,
      harvester: null,
      building: {
        footprintW: spec.footprintW,
        footprintH: spec.footprintH,
        powerDelta: spec.powerDelta,
        storageCapacity: spec.storageCapacity,
      },
      dirty: false,
    };

    this.entities.set(id, entity);
    this.createdThisTick.push(id);
    this.reservationGrid.markBuildingFootprint(tileX, tileY, spec.footprintW, spec.footprintH);
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
      ent.stateLabel = "ATTACKING";
      ent.dirty = true;
    }
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

    const isBuilding = category === "BUILDING" || category === "DEFENSE";
    const spec = isBuilding
      ? BUILDINGS[itemKind as BuildingKind]
      : UNITS[itemKind as UnitKind];
    if (!spec || spec.category !== category) return false;

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
    const slot = player.queues[category];
    if (!slot.readyToPlace || slot.activeItem !== buildingKind) return false;

    this.rebuildSpatialReservations();

    const spec = BUILDINGS[buildingKind];
    if (!this.isWithinBaseBuildRadius(playerId, tileX, tileY, spec.footprintW, spec.footprintH)) {
      return false;
    }

    // Concrete Slab (DALLE_BETON) paves the terrain tile directly without blocking unit navigation or future building construction
    if (buildingKind === "CONCRETE_SLAB") {
      if (!this.reservationGrid.inBounds(tileX, tileY)) return false;
      const idx = tileY * this.width + tileX;
      if (
        this.terrainGrid[idx] === TERRAIN_KIND.CLIFF ||
        this.terrainGrid[idx] === TERRAIN_KIND.CONCRETE_SLAB
      ) {
        return false;
      }
      for (const ent of this.entities.values()) {
        if (
          ent.entityType === "UNIT" &&
          ent.ownerId !== playerId &&
          Math.round(ent.transform.x) === tileX &&
          Math.round(ent.transform.y) === tileY
        ) {
          return false;
        }
      }

      this.terrainGrid[idx] = TERRAIN_KIND.CONCRETE_SLAB;
      this.terrainDamageGrid[idx] = 0;
      if ((this.oreGrid[idx] ?? 0) > 0) {
        this.oreGrid[idx] = 0;
        this.oreUpdatesThisTick.set(idx, {
          tileX,
          tileY,
          oreAmount: 0,
        });
      }
      this.terrainUpdatesThisTick.set(idx, {
        tileX,
        tileY,
        terrainKind: TERRAIN_KIND.CONCRETE_SLAB,
      });

      slot.activeItem = null;
      slot.ticksElapsed = 0;
      slot.ticksRequired = 0;
      slot.readyToPlace = false;
      this.pushAcoustic("EVA_BUILDING_DEPLOYED", tileX, tileY, playerId);
      return true;
    }

    // Check terrain & static buildings first; relocate any friendly mobile units standing on the footprint
    for (let dy = 0; dy < spec.footprintH; dy++) {
      for (let dx = 0; dx < spec.footprintW; dx++) {
        const cx = tileX + dx;
        const cy = tileY + dy;
        if (!this.reservationGrid.inBounds(cx, cy)) return false;
        const idx = cy * this.width + cx;
        if (this.terrainGrid[idx] === 2) return false;
        // Check if any building or enemy unit occupies (cx, cy)
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

    const created = this.createBuildingEntity(playerId, player.faction, buildingKind, tileX, tileY);

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
    slot.activeItem = null;
    slot.ticksElapsed = 0;
    slot.ticksRequired = 0;
    slot.readyToPlace = false;

    // Free harvester delivered with a new Refinery if space is available nearby
    if (buildingKind === "REFINERY") {
      const dock = this.reservationGrid.findNearestFreeDockTile(
        tileX,
        tileY,
        spec.footprintW,
        spec.footprintH,
        tileX + 1,
        tileY + 2
      );
      if (dock) {
        const freeHarv = this.createUnitEntity(playerId, player.faction, "HARVESTER", dock.x, dock.y);
        if (freeHarv.harvester) {
          freeHarv.harvester.homeRefineryId = created.id;
        }
      }
    }

    this.recomputeAllPlayerEconomies();
    this.pushAcoustic("EVA_BUILDING_DEPLOYED", tileX, tileY, playerId);
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
      if (ent.entityType === "BUILDING" && ent.building) {
        this.reservationGrid.markBuildingFootprint(
          ent.transform.x,
          ent.transform.y,
          ent.building.footprintW,
          ent.building.footprintH
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

  private recomputeAllPlayerEconomies(): void {
    for (const p of this.players.values()) {
      let powerProduced = 0;
      let powerConsumed = 0;
      let storage = BASE_STORAGE_CAPACITY;
      let hasRadar = false;

      for (const ent of this.entities.values()) {
        if (ent.ownerId !== p.playerId || ent.entityType !== "BUILDING" || !ent.building) {
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
          if (category === "BUILDING" || category === "DEFENSE") {
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
    const producerKind: BuildingKind =
      UNITS[unitKind].category === "INFANTRY" ? "BARRACKS" : "WAR_FACTORY";
    for (const ent of this.entities.values()) {
      if (ent.ownerId === playerId && ent.entityType === "BUILDING" && ent.kind === producerKind && ent.building) {
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
    return null;
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
          const spaceLeft = Math.max(0, player.maxStorage - player.credits);
          const deposited = Math.min(spaceLeft, harv.cargoOre);
          player.credits += deposited;
          player.harvestedTotal += harv.cargoOre;
          if (deposited < harv.cargoOre && !player.silosAlertSent) {
            player.silosAlertSent = true;
            this.pushAcoustic("EVA_SILOS_NEEDED", ref.transform.x, ref.transform.y, player.playerId);
          } else if (player.credits < player.maxStorage * 0.9) {
            player.silosAlertSent = false;
          }
          harv.cargoOre = 0;
          harv.state = "IDLE";
          ent.stateLabel = "IDLE";
          nav.path = [];
          nav.pathIndex = 0;
          nav.waitTicks = 0;
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
        if (!ent.combat || !ent.combat.targetEntityId) {
          ent.transform.turretAngleIndex = newAngle;
        }
      }

      this.reservationGrid.reserveUnitTile(
        Math.round(ent.transform.x),
        Math.round(ent.transform.y),
        ent.id
      );
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
            ent.stateLabel = "IDLE";
            ent.dirty = true;
          }
          continue;
        }
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
      if (ent.ownerId === playerId && ent.entityType === "BUILDING") {
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
      if (ent.ownerId === playerId && ent.entityType === "BUILDING" && ent.building) {
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
              this.reservationGrid.isFootprintBuildable(tx, ty, spec.footprintW, spec.footprintH) &&
              this.isWithinBaseBuildRadius(playerId, tx, ty, spec.footprintW, spec.footprintH)
            ) {
              return { x: tx, y: ty };
            }
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
      if (ent.ownerId === ownerId && ent.entityType === "BUILDING" && ent.kind === "REFINERY") {
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
    if (curKind === TERRAIN_KIND.CLIFF || curKind === TERRAIN_KIND.STONE) {
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
      if (ent.ownerId === attacker.ownerId) continue;
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
      if (ent.ownerId !== ownerId && ent.kind === "CONSTRUCTION_YARD") {
        return ent;
      }
    }
    for (const ent of this.entities.values()) {
      if (ent.ownerId !== ownerId) {
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
      stateLabel: ent.stateLabel,
    };
  }

  private serializePlayerEconomy(p: PlayerSimState): PlayerEconomyDelta {
    return {
      playerId: p.playerId,
      faction: p.faction,
      credits: p.credits,
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
