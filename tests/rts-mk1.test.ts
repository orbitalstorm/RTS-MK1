import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PolyphonyLimiter } from "../src/audio/mixer";
import { computeCameraSpatialParams } from "../src/audio/spatial";
import {
  AStarPathfinder,
  SpatialReservationGrid,
  vectorToAngleIndex16,
} from "../src/engine/pathfinding/astar";
import { RtsSimulation } from "../src/engine/simulation";
import { LobbyManager } from "../src/server/lobby-manager";
import { TacticalCamera } from "../src/renderer/camera";
import {
  BattlefieldVfxManager,
  computeCraterFadeAlpha,
  CRATER_LIFETIME_MS,
  HARVESTER_NUGGET_DROP_INTERVAL_MS,
  ORE_NUGGET_LIFETIME_MS,
} from "../src/renderer/vfx-manager";
import {
  AI_ATTACK_GRACE_PERIOD_TICKS,
  APP_VERSION,
  BUILDING_LIST,
  BUILDINGS,
  CAMERA_SHAKE_MAX_OFFSET_PX,
  canPlaceBuildingOnTerrainTile,
  computeCameraShakeOffset,
  computeDistanceAttenuatedShakeTrauma,
  computeEdgeScrollVelocity,
  computeTerrainNeighborMask,
  CONSTRUCTION_GRID_COLUMNS,
  CONSTRUCTION_SUBCATEGORIES,
  degradeTerrainLayer,
  EDGE_SCROLL_MARGIN_PX,
  EDGE_SCROLL_MAX_SPEED_PX,
  getBalancedGridSlotCount,
  getConstructionCatalogItems,
  getSubcategoriesForCategory,
  getTimedConstructionTicks,
  HARVESTER_MAX_LOAD,
  HARVESTER_UNLOAD_PER_TICK,
  interpolateAngleIndex16,
  interpolateEntityPose,
  isFoundationTerrainKind,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  requiresStoneOrConcreteFoundation,
  resolveTouchTapAction,
  SILVER_MINE_CYCLE_TICKS,
  SILVER_MINE_YIELD_PER_CYCLE,
  SPAWN_CONCRETE_PAD_SIZE,
  SPRITE_ATLAS_SCALE,
  TERRAIN_KIND,
  TOUCH_INTERACTION_MODES,
  TREES,
  UNIT_LIST,
  UNITS,
  UNIT_SPAWN_PROTECTION_TICKS,
  WATCHDOG_DISCONNECT_TIMEOUT_MS,
  ZOOM_LEVELS,
} from "../src/shared/constants";
import { ClientLobbyActionSchema } from "../src/shared/schemas/commands";
import type { VisualEffectEvent } from "../src/shared/schemas/deltas";
import { useRtsGameStore } from "../src/store/game-store";

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("RTS-MK1 v1.0.0 — Engineering & Architecture Verification", () => {
  it("enforces strict zero inline style={{...}} and single globals.css across src/", () => {
    const srcDir = path.resolve(__dirname, "../src");
    const files = collectSourceFiles(srcDir);
    const cssFiles = files.filter((f) => f.endsWith(".css"));
    expect(cssFiles.length).toBe(1);
    expect(cssFiles[0]?.endsWith("src/app/globals.css")).toBe(true);

    for (const file of files) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const content = fs.readFileSync(file, "utf-8");
      // Prohibition of inline style prop on JSX elements
      expect(content).not.toMatch(/\bstyle\s*=\s*\{/);
      // Prohibition of explicit 'any' type annotations
      expect(content).not.toMatch(/:\s*any\b/);
      expect(content).not.toMatch(/\bas\s+any\b/);
    }
  });

  it("runs deterministic 20 Hz simulation ticks, harvesting economy, power deficit, and Zod Delta validation", () => {
    const sim = new RtsSimulation("test_lobby", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: true },
    ]);

    const initialSnapshot = sim.getFullSnapshot();
    expect(initialSnapshot.mapWidth).toBe(MAP_WIDTH_TILES);
    expect(initialSnapshot.entities.length).toBeGreaterThanOrEqual(12);

    // Run 35 ticks and verify delta schema & sequential tickId
    let lastTick = 0;
    for (let i = 0; i < 35; i++) {
      const delta = sim.stepTick();
      expect(delta.prevTickId).toBe(lastTick);
      expect(delta.tickId).toBe(lastTick + 1);
      lastTick = delta.tickId;
    }

    // Verify production queue & power balance
    const started = sim.issueStartProduction("p1", "BUILDING", "BARRACKS");
    expect(started).toBe(true);
    for (let i = 0; i < 65; i++) {
      sim.stepTick();
    }
    const p1State = sim.getPlayerState("p1")!;
    expect(p1State.queues.BUILDING.readyToPlace).toBe(true);

    // Deploy building between ticks and verify it appears in the very next TickDelta.created
    const placed = sim.issuePlaceBuilding("p1", "BUILDING", "BARRACKS", 11, 5);
    expect(placed).toBe(true);
    const postPlaceDelta = sim.stepTick();
    expect(
      postPlaceDelta.created.some(
        (e) =>
          e.ownerId === "p1" &&
          e.entityType === "BUILDING" &&
          e.kind === "BARRACKS" &&
          e.x === 11 &&
          e.y === 5
      )
    ).toBe(true);
  });

  it("supports discrete tactical zoom levels 1, 1.25, 1.5, 1.75, 2 and gentle quadratic edge-scroll", () => {
    expect(ZOOM_LEVELS).toEqual([1, 1.25, 1.5, 1.75, 2]);
    const cam = new TacticalCamera();
    expect(cam.zoom).toBe(1);
    expect(cam.cycleZoom()).toBe(1.25);
    expect(cam.cycleZoom()).toBe(1.5);
    expect(cam.cycleZoom()).toBe(1.75);
    expect(cam.cycleZoom()).toBe(2);
    expect(cam.cycleZoom()).toBe(1);
    expect(cam.setZoom(1.75)).toBe(1.75);

    // Center of viewport -> zero velocity
    expect(computeEdgeScrollVelocity(500, 400, 1000, 800)).toEqual({ vx: 0, vy: 0 });

    // Halfway into left margin (18px of 36px) -> gentle quadratic velocity (0.25 * maxSpeed)
    const halfLeft = computeEdgeScrollVelocity(EDGE_SCROLL_MARGIN_PX / 2, 400, 1000, 800);
    expect(halfLeft.vx).toBeCloseTo(-0.25 * EDGE_SCROLL_MAX_SPEED_PX, 5);
    expect(halfLeft.vy).toBe(0);

    // Extreme bottom-right edge -> capped at gentle max speed (3.2 px/frame)
    const corner = computeEdgeScrollVelocity(1000, 800, 1000, 800);
    expect(corner.vx).toBeCloseTo(EDGE_SCROLL_MAX_SPEED_PX, 5);
    expect(corner.vy).toBeCloseTo(EDGE_SCROLL_MAX_SPEED_PX, 5);
  });

  it("prevents unit overlap via SpatialReservationGrid and finds 8-way A* paths", () => {
    const terrain = new Array<number>(48 * 48).fill(0);
    const grid = new SpatialReservationGrid(48, 48, terrain);
    const astar = new AStarPathfinder(48, 48);

    expect(grid.reserveUnitTile(10, 10, "unit_a")).toBe(true);
    expect(grid.reserveUnitTile(10, 10, "unit_b")).toBe(false);

    const path = astar.findPath(8, 10, 12, 10, grid, "unit_b", true);
    expect(path.length).toBeGreaterThan(0);
    // Path must route around (10,10) reserved by unit_a
    expect(path.some((pt) => pt.x === 10 && pt.y === 10)).toBe(false);
    expect(vectorToAngleIndex16(0, -1)).toBe(0);
    expect(vectorToAngleIndex16(1, 0)).toBe(4);
    expect(vectorToAngleIndex16(0, 1)).toBe(8);
    expect(vectorToAngleIndex16(-1, 0)).toBe(12);
  });

  it("enforces the Single Active Match Mutex, FIFO queue ordering, and 60s Watchdog lock release", () => {
    const manager = new LobbyManager();
    const t0 = 1_700_000_000_000;

    const lobby1 = manager.createLobby({
      playerId: "host_1",
      commanderName: "Host One",
      faction: "GDI",
      lobbyName: "Alpha Match",
      withAiBot: true,
      nowMs: t0,
    });
    const lobby2 = manager.createLobby({
      playerId: "host_2",
      commanderName: "Host Two",
      faction: "NOD",
      lobbyName: "Bravo Match",
      withAiBot: true,
      nowMs: t0 + 10,
    });
    const lobby3 = manager.createLobby({
      playerId: "host_3",
      commanderName: "Host Three",
      faction: "ORDOS",
      lobbyName: "Charlie Match",
      withAiBot: true,
      nowMs: t0 + 20,
    });

    // Lobby 1 starts -> acquires mutex immediately
    const start1 = manager.requestStartMatch(lobby1.lobbyId, "host_1", t0 + 100);
    expect(start1.startedImmediately).toBe(true);
    expect(manager.getActiveLobbyId()).toBe(lobby1.lobbyId);

    // Lobby 2 & 3 request start while Lobby 1 is IN_PROGRESS -> placed in FIFO QUEUED order
    const start2 = manager.requestStartMatch(lobby2.lobbyId, "host_2", t0 + 200);
    const start3 = manager.requestStartMatch(lobby3.lobbyId, "host_3", t0 + 300);
    expect(start2.startedImmediately).toBe(false);
    expect(start2.queuePosition).toBe(1);
    expect(start3.startedImmediately).toBe(false);
    expect(start3.queuePosition).toBe(2);

    // Disconnect Host 1 and run Watchdog after 60s timeout -> releases Lobby 1 & promotes Lobby 2
    manager.markPlayerDisconnected("host_1", t0 + 1000);
    const watchdogRes = manager.runWatchdogCheck(
      t0 + 1000 + WATCHDOG_DISCONNECT_TIMEOUT_MS + 500
    );
    expect(watchdogRes.releasedLobbyId).toBe(lobby1.lobbyId);
    expect(watchdogRes.promotedLobbyId).toBe(lobby2.lobbyId);
    expect(manager.getActiveLobbyId()).toBe(lobby2.lobbyId);
    expect(manager.getLobby(lobby2.lobbyId)?.status).toBe("IN_PROGRESS");

    const overview = manager.getOverview(t0 + 70_000);
    const l3Summary = overview.lobbies.find((l) => l.lobbyId === lobby3.lobbyId);
    expect(l3Summary?.status).toBe("QUEUED");
    expect(l3Summary?.queuePosition).toBe(1);
  });

  it("enforces WebAudio 4-instance / 80ms polyphony limiting and camera spatialization", () => {
    const limiter = new PolyphonyLimiter();
    expect(limiter.tryAcquire("CANNON_FIRE", 1000)).toBe(true);
    expect(limiter.tryAcquire("CANNON_FIRE", 1015)).toBe(true);
    expect(limiter.tryAcquire("CANNON_FIRE", 1030)).toBe(true);
    expect(limiter.tryAcquire("CANNON_FIRE", 1045)).toBe(true);
    // 5th instance within 80ms window must be rejected
    expect(limiter.tryAcquire("CANNON_FIRE", 1060)).toBe(false);
    // After 80ms window passes, allowed again
    expect(limiter.tryAcquire("CANNON_FIRE", 1090)).toBe(true);

    const spatialLeft = computeCameraSpatialParams(5, 10, 15, 10);
    expect(spatialLeft.pan).toBeLessThan(0);
    expect(spatialLeft.gainMultiplier).toBeGreaterThan(0);

    const parsedCmd = ClientLobbyActionSchema.safeParse({
      type: "COMMAND_MOVE",
      lobbyId: "sector_1",
      playerId: "cmd_1",
      entityIds: ["unt_1"],
      targetTileX: 12,
      targetTileY: 18,
    });
    expect(parsedCmd.success).toBe(true);
  });

  it("v1.2.0 — maintains constant unit speed across waypoint boundaries without stop-and-go braking", () => {
    const sim = new RtsSimulation("test_smooth_move_v120", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: true },
    ]);

    const tank = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.entityType === "UNIT" && e.kind === "MEDIUM_TANK");
    expect(tank).toBeDefined();
    expect(tank!.navigation?.speedTilesPerTick).toBeCloseTo(0.14, 5);

    const startX = tank!.transform.x;
    const startY = tank!.transform.y;
    // Order straight-line eastward movement across 5 tiles (from (10,9) to (15,9))
    sim.issueMoveCommand("p1", [tank!.id], startX + 5, startY);

    let prevX = startX;
    let prevY = startY;
    for (let tick = 1; tick <= 12; tick++) {
      sim.stepTick();
      const updatedTank = sim.getEntity(tank!.id)!;
      const stepDist = Math.hypot(
        updatedTank.transform.x - prevX,
        updatedTank.transform.y - prevY
      );
      // Every single tick (including tick 8 crossing tile boundary 10.98 -> 11.12) must advance ~0.14 tiles
      expect(stepDist).toBeCloseTo(0.14, 3);
      expect(stepDist).toBeGreaterThan(0.13);
      prevX = updatedTank.transform.x;
      prevY = updatedTank.transform.y;
    }
  });

  it("v1.2.0 — supports Game Juice camera shake, shortest-arc 16-angle interpolation, and 2x Hi-DPI sprite scale", () => {
    expect(APP_VERSION).toBe("1.9.0");
    expect(SPRITE_ATLAS_SCALE).toBe(2);

    // Zero trauma produces zero offset
    expect(computeCameraShakeOffset(0, 1.0)).toEqual({ offsetX: 0, offsetY: 0 });

    // Non-zero trauma produces bounded harmonic offset within CAMERA_SHAKE_MAX_OFFSET_PX
    const shake = computeCameraShakeOffset(0.8, 0.25);
    expect(Math.hypot(shake.offsetX, shake.offsetY)).toBeGreaterThan(0);
    expect(Math.abs(shake.offsetX)).toBeLessThanOrEqual(CAMERA_SHAKE_MAX_OFFSET_PX);
    expect(Math.abs(shake.offsetY)).toBeLessThanOrEqual(CAMERA_SHAKE_MAX_OFFSET_PX);

    // Distance-attenuated trauma and TacticalCamera decay
    const nearTrauma = computeDistanceAttenuatedShakeTrauma(0.95, 10, 10, 12, 10);
    const farTrauma = computeDistanceAttenuatedShakeTrauma(0.95, 10, 10, 45, 45);
    expect(nearTrauma).toBeGreaterThan(0.5);
    expect(farTrauma).toBe(0);

    const cam = new TacticalCamera();
    cam.centerOnTile(10, 10);
    expect(cam.shakeTrauma).toBe(0);
    cam.addExplosionShake(0.95, 10, 10);
    const peakTrauma = cam.shakeTrauma;
    expect(peakTrauma).toBeGreaterThan(0.8);
    cam.stepShake(0.2, 0.25);
    expect(cam.shakeTrauma).toBeLessThan(peakTrauma);
    expect(cam.shakeTrauma).toBeGreaterThan(0);

    // Shortest-arc 16-angle interpolation across North (15 -> 1 midpoint is 0, never 8)
    expect(interpolateAngleIndex16(15, 1, 0.5)).toBe(0);
    expect(interpolateAngleIndex16(1, 15, 0.5)).toBe(0);

    // VisualEffectEvent emission on building sell/demolition
    const sim = new RtsSimulation("test_vfx_v120", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: true },
    ]);
    const powerPlant = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.entityType === "BUILDING" && e.kind === "POWER_PLANT");
    expect(powerPlant).toBeDefined();
    expect(sim.issueSellBuilding("p1", powerPlant!.id)).toBe(true);
    const delta = sim.stepTick();
    const explosionVfx: VisualEffectEvent | undefined = delta.visualEffects.find(
      (vfx) => vfx.effectKind === "UNIT_EXPLOSION"
    );
    expect(explosionVfx).toBeDefined();
    expect(explosionVfx!.shakeIntensity).toBeGreaterThan(0);
  });

  it("v1.3.0 — resolves mobile landscape touch tap actions across AUTO, SELECT, COMMAND, placement, and sell modes", () => {
    expect(TOUCH_INTERACTION_MODES).toEqual(["AUTO", "PAN", "SELECT", "COMMAND"]);

    // AUTO mode: tap friendly unit -> SELECT_ENTITY
    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: false,
        sellMode: false,
        tappedOwnUnitId: "unt_1",
        tappedOwnBuildingId: null,
        tappedEnemyEntityId: null,
        selectedUnitCount: 0,
      })
    ).toBe("SELECT_ENTITY");

    // AUTO mode: tap ground with selected units -> MOVE_UNITS
    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: false,
        sellMode: false,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: null,
        tappedEnemyEntityId: null,
        selectedUnitCount: 3,
      })
    ).toBe("MOVE_UNITS");

    // AUTO mode: tap enemy with selected units -> ATTACK_ENEMY
    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: false,
        sellMode: false,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: null,
        tappedEnemyEntityId: "unt_enemy_9",
        selectedUnitCount: 2,
      })
    ).toBe("ATTACK_ENEMY");

    // Placement ready: tap anywhere -> PLACE_BUILDING
    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: true,
        sellMode: false,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: null,
        tappedEnemyEntityId: null,
        selectedUnitCount: 0,
      })
    ).toBe("PLACE_BUILDING");

    // Sell mode: tap friendly building -> SELL_BUILDING
    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: false,
        sellMode: true,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: "bld_2",
        tappedEnemyEntityId: null,
        selectedUnitCount: 0,
      })
    ).toBe("SELL_BUILDING");

    // SELECT mode: tap empty ground -> CLEAR_SELECTION
    expect(
      resolveTouchTapAction({
        mode: "SELECT",
        hasPlacementBuilding: false,
        sellMode: false,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: null,
        tappedEnemyEntityId: null,
        selectedUnitCount: 2,
      })
    ).toBe("CLEAR_SELECTION");
  });

  it("v1.3.1 — ensures C0-continuous sub-tick pose interpolation, Refinery perimeter dock unloading, and <2.5ms tick budget", () => {
    // 1. Sub-tick pose interpolation (smooth continuity on early/jittered delta arrival)
    const prevPose = { x: 10.0, y: 12.0, angleIndex: 15, turretAngleIndex: 14 };
    const currPose = { x: 10.2, y: 12.4, angleIndex: 1, turretAngleIndex: 2 };
    const midPose = interpolateEntityPose(prevPose, currPose, 0.5);
    expect(midPose.x).toBeCloseTo(10.1, 5);
    expect(midPose.y).toBeCloseTo(12.2, 5);
    expect(midPose.angleIndex).toBe(0);
    expect(midPose.turretAngleIndex).toBe(0);

    // Teleport (>3.5 tiles) snaps immediately without smearing across the map
    const telePose = interpolateEntityPose(
      prevPose,
      { x: 25.0, y: 30.0, angleIndex: 8, turretAngleIndex: 8 },
      0.5
    );
    expect(telePose.x).toBe(25.0);
    expect(telePose.y).toBe(30.0);

    // 2. Verify Harvester harvest -> dock -> unload cycle from far perimeter dock tiles & sub-2.5ms tick time
    const sim = new RtsSimulation("test_perf_v131", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: true },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: true },
    ]);

    const t0 = performance.now();
    const totalTicks = 220;
    for (let i = 0; i < totalTicks; i++) {
      sim.stepTick();
    }
    const elapsedMs = performance.now() - t0;
    const avgTickMs = elapsedMs / totalTicks;
    // Average 20 Hz tick (50ms budget) must stay below 2.5ms even with two active AI commanders
    expect(avgTickMs).toBeLessThan(2.5);

    // Verify no Harvester is stuck in RETURNING_TO_REFINERY with an empty path and zero cargo progress
    const harvesters = sim
      .getAllEntities()
      .filter((e) => e.entityType === "UNIT" && e.kind === "HARVESTER");
    expect(harvesters.length).toBeGreaterThanOrEqual(2);
    for (const h of harvesters) {
      expect(h.harvester).toBeDefined();
    }
  });

  it("v1.4.0 — supports multi-layer organic terrain degradation, rounded zone neighbor masks, 2-minute AI grace period, 1s unit spawn protection, and Concrete Slab paving", () => {
    // 1. Stratigraphic degradation chain: Grass (4) -> Dirt (0) -> Stone (1)
    expect(degradeTerrainLayer(TERRAIN_KIND.GRASS)).toBe(TERRAIN_KIND.DIRT);
    expect(degradeTerrainLayer(TERRAIN_KIND.DIRT)).toBe(TERRAIN_KIND.STONE);
    expect(degradeTerrainLayer(TERRAIN_KIND.CONCRETE_SLAB)).toBe(TERRAIN_KIND.STONE);
    expect(degradeTerrainLayer(TERRAIN_KIND.STONE)).toBe(TERRAIN_KIND.STONE);

    // 2. Unified zone interior vs organic rounded corner mask
    const testGrid = new Array<number>(16).fill(TERRAIN_KIND.DIRT);
    // Create a 2x2 Grass zone at bottom-right (x=2..3, y=2..3) of a 4x4 grid
    testGrid[2 * 4 + 2] = TERRAIN_KIND.GRASS;
    testGrid[2 * 4 + 3] = TERRAIN_KIND.GRASS;
    testGrid[3 * 4 + 2] = TERRAIN_KIND.GRASS;
    testGrid[3 * 4 + 3] = TERRAIN_KIND.GRASS;

    const cornerMask = computeTerrainNeighborMask(testGrid, 2, 2, 4, 4);
    expect(cornerMask.centerKind).toBe(TERRAIN_KIND.GRASS);
    expect(cornerMask.underlyingKind).toBe(TERRAIN_KIND.DIRT);
    expect(cornerMask.roundTL).toBe(true);
    expect(cornerMask.roundBR).toBe(false);
    expect(cornerMask.sameE).toBe(true);
    expect(cornerMask.sameS).toBe(true);
    expect(cornerMask.isInterior).toBe(false);

    const interiorMask = computeTerrainNeighborMask(testGrid, 0, 0, 4, 4);
    expect(interiorMask.isInterior).toBe(true);
    expect(interiorMask.roundTL).toBe(false);

    // 3. Simulation projectile ground degradation (Grass -> Dirt -> Stone) + impact stains
    const sim = new RtsSimulation("test_v140", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: true },
    ]);

    const grassTileX = 2;
    const grassTileY = 25;
    const grassIdx = grassTileY * sim.width + grassTileX;
    sim.terrainGrid[grassIdx] = TERRAIN_KIND.GRASS;

    // First shell hit degrades Grass (4) -> Dirt (0)
    expect(sim.degradeTerrainAtImpact(grassTileX, grassTileY, "SHELL", false)).toBe(true);
    expect(sim.terrainGrid[grassIdx]).toBe(TERRAIN_KIND.DIRT);

    // Two subsequent shell hits on Dirt (0) degrade Dirt (0) -> Stone (1)
    expect(sim.degradeTerrainAtImpact(grassTileX, grassTileY, "SHELL", false)).toBe(false);
    expect(sim.degradeTerrainAtImpact(grassTileX, grassTileY, "SHELL", false)).toBe(true);
    expect(sim.terrainGrid[grassIdx]).toBe(TERRAIN_KIND.STONE);

    const deltaAfterImpact = sim.stepTick();
    expect(
      deltaAfterImpact.terrainUpdates.some(
        (u) => u.tileX === grassTileX && u.tileY === grassTileY && u.terrainKind === TERRAIN_KIND.STONE
      )
    ).toBe(true);

    // Impact stain creation on SHELL_IMPACT & LASER_BURN
    const vfx = new BattlefieldVfxManager();
    const cam = new TacticalCamera();
    vfx.ingestTickEvents(
      [
        {
          id: "stain_1",
          effectKind: "SHELL_IMPACT",
          worldX: 12,
          worldY: 12,
          radiusTiles: 0.8,
          shakeIntensity: 0.1,
          faction: "GDI",
        },
      ],
      [],
      cam,
      1000
    );
    expect(vfx.getActiveCounts().craters).toBe(1);

    // 4. Unit Spawn Protection Cooldown (1.0s = 20 ticks target-acquisition immunity)
    expect(UNIT_SPAWN_PROTECTION_TICKS).toBe(20);
    const freshUnit = sim.createUnitEntity("p1", "GDI", "RIFLE_INFANTRY", 12, 8);
    expect(freshUnit.spawnProtectionTicks).toBe(UNIT_SPAWN_PROTECTION_TICKS);

    const enemyTank = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p2" && e.entityType === "UNIT" && e.kind === "MEDIUM_TANK")!;
    expect(enemyTank).toBeDefined();

    // Cannot target newly created unit while spawnProtectionTicks > 0
    sim.issueAttackCommand("p2", [enemyTank.id], freshUnit.id);
    expect(enemyTank.combat?.targetEntityId).toBeNull();

    // Advance 20 ticks (1.0s) so spawn protection expires
    for (let t = 0; t < UNIT_SPAWN_PROTECTION_TICKS; t++) {
      sim.stepTick();
    }
    expect(sim.getEntity(freshUnit.id)?.spawnProtectionTicks).toBe(0);

    // Now targetable
    sim.issueAttackCommand("p2", [enemyTank.id], freshUnit.id);
    expect(enemyTank.combat?.targetEntityId).toBe(freshUnit.id);

    // 5. Concrete Slab (Dalle de Béton) production and terrain paving (assembled by Constructor Bot)
    expect(BUILDINGS.CONCRETE_SLAB).toBeDefined();
    expect(BUILDINGS.CONCRETE_SLAB.category).toBe("BUILDING");
    expect(sim.issueStartProduction("p1", "BUILDING", "CONCRETE_SLAB")).toBe(true);
    for (let t = 0; t < BUILDINGS.CONCRETE_SLAB.buildTimeTicks; t++) {
      sim.stepTick();
    }
    expect(sim.getPlayerState("p1")?.queues.BUILDING.readyToPlace).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 13, 5)).toBe(true);
    for (let t = 0; t < 50; t++) {
      sim.stepTick();
    }
    expect(sim.terrainGrid[5 * sim.width + 13]).toBe(TERRAIN_KIND.CONCRETE_SLAB);

    // 6. 2-Minute AI Attack Grace Period (2400 ticks = 120s)
    expect(AI_ATTACK_GRACE_PERIOD_TICKS).toBe(2400);
    const graceSim = new RtsSimulation("test_grace_2m", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: true },
    ]);
    for (let t = 0; t < 500; t++) {
      graceSim.stepTick();
    }
    const attackingAiUnits = graceSim
      .getAllEntities()
      .filter((e) => e.ownerId === "p2" && e.entityType === "UNIT" && e.stateLabel === "ATTACKING");
    expect(attackingAiUnits.length).toBe(0);
  });

  it("v1.4.1 — enforces diverse tactical combat ranges and pre-range defense turret activation (IDLE -> ALERT -> ATTACKING)", () => {
    // 1. Verify full tactical range diversity (strictly distinct firing ranges across all 10 combat entities)
    const orderedRanges = [
      UNITS.ENGINEER.attackRange, // 1.4
      UNITS.RIFLE_INFANTRY.attackRange, // 3.2
      UNITS.RECON_BUGGY.attackRange, // 4.2
      UNITS.MEDIUM_TANK.attackRange, // 5.4
      UNITS.ROCKET_SOLDIER.attackRange, // 6.4
      UNITS.MAMMOTH_TANK.attackRange, // 7.0
      BUILDINGS.GUARD_TOWER.attackRange, // 7.5
      BUILDINGS.SAM_SITE.attackRange, // 9.5
      UNITS.ARTILLERY.attackRange, // 9.8
      BUILDINGS.OBELISK.attackRange, // 11.0
    ];
    for (let i = 1; i < orderedRanges.length; i++) {
      expect(orderedRanges[i]!).toBeGreaterThan(orderedRanges[i - 1]!);
    }

    // 2. Verify all defense turrets have extended firing range AND early pre-activation detectionRange > attackRange
    for (const kind of ["GUARD_TOWER", "SAM_SITE", "OBELISK"] as const) {
      const spec = BUILDINGS[kind];
      expect(spec.detectionRange).toBeGreaterThan(spec.attackRange);
      expect(spec.sightRadius).toBeGreaterThanOrEqual(Math.floor(spec.detectionRange));
    }

    // 3. Verify defense turret pre-activation ("ALERT") before an approaching enemy enters firing range
    const sim = new RtsSimulation("test_turret_preactivation_v141", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    // Place a GDI Guard Tower at (20, 20): attackRange = 7.5, detectionRange = 10.0
    const tower = sim.createBuildingEntity("p1", "GDI", "GUARD_TOWER", 20, 20);
    expect(tower.stateLabel).toBe("IDLE");
    expect(tower.transform.turretAngleIndex).toBe(0);

    // Spawn an enemy tank at (29, 20) -> distance = 9.0 tiles (inside detectionRange 10.0, outside attackRange 7.5)
    const enemyTank = sim.createUnitEntity("p2", "NOD", "MEDIUM_TANK", 29, 20);
    enemyTank.spawnProtectionTicks = 0;

    const alertDelta = sim.stepTick();
    const updatedTowerAlert = sim.getEntity(tower.id)!;
    // Turret MUST activate ("ALERT"), lock target, and swivel East (angleIndex 4) BEFORE enemy is in firing range
    expect(updatedTowerAlert.stateLabel).toBe("ALERT");
    expect(updatedTowerAlert.combat?.targetEntityId).toBe(enemyTank.id);
    expect(updatedTowerAlert.transform.turretAngleIndex).toBe(4);
    // Must not fire a projectile yet while dist (9.0) > attackRange (7.5)
    expect(alertDelta.projectiles.some((prj) => prj.fromX === 20 && prj.fromY === 20)).toBe(false);

    // Move enemy tank to (27, 20) -> distance = 7.0 tiles (now inside attackRange 7.5)
    enemyTank.transform.x = 27;
    enemyTank.transform.y = 20;

    const fireDelta = sim.stepTick();
    const updatedTowerFire = sim.getEntity(tower.id)!;
    expect(updatedTowerFire.stateLabel).toBe("ATTACKING");
    expect(fireDelta.projectiles.some((prj) => prj.fromX === 20 && prj.fromY === 20)).toBe(true);

    // Move enemy tank far away to (35, 20) -> distance = 15.0 tiles (outside detectionRange 10.0)
    enemyTank.transform.x = 35;
    enemyTank.transform.y = 20;

    sim.stepTick();
    const updatedTowerIdle = sim.getEntity(tower.id)!;
    expect(updatedTowerIdle.stateLabel).toBe("IDLE");
    expect(updatedTowerIdle.combat?.targetEntityId).toBeNull();
  });

  it("v1.5.0 — enforces move-order priority over nearby enemies, ground force-fire, building repair, Sandbags/Concrete Walls, and continuous Concrete Slab placement", () => {
    const sim = new RtsSimulation("test_v150_features", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    // 1. Move-order priority: a unit ordered to move while an enemy is in attackRange must NOT stop to attack
    const p1Tank = sim.createUnitEntity("p1", "GDI", "MEDIUM_TANK", 20, 20);
    p1Tank.spawnProtectionTicks = 0;
    const p2EnemyBuilding = sim.createBuildingEntity("p2", "NOD", "POWER_PLANT", 22, 22);
    expect(p2EnemyBuilding).toBeDefined();

    // Order p1Tank to move away to (14, 20) even though p2EnemyBuilding is within attackRange (5.4t)
    sim.issueMoveCommand("p1", [p1Tank.id], 14, 20);
    expect(p1Tank.stateLabel).toBe("MOVING");
    expect(p1Tank.navigation?.path.length).toBeGreaterThan(0);

    for (let t = 0; t < 15; t++) {
      sim.stepTick();
    }
    const movedTank = sim.getEntity(p1Tank.id)!;
    // Tank must have moved significantly West toward x=14 and must NOT have cleared its move path to attack p2EnemyBuilding
    expect(movedTank.transform.x).toBeLessThan(18.5);
    expect(movedTank.combat?.targetEntityId).toBeNull();
    expect(sim.getEntity(p2EnemyBuilding.id)!.health.hp).toBe(p2EnemyBuilding.health.maxHp);

    // 2. Ground force-fire (COMMAND_ATTACK_GROUND): unit fires at a specific ground tile even without an enemy
    const targetGroundX = 16;
    const targetGroundY = 18;
    sim.terrainGrid[targetGroundY * sim.width + targetGroundX] = TERRAIN_KIND.GRASS;
    sim.issueAttackGroundCommand("p1", [p1Tank.id], targetGroundX, targetGroundY);
    expect(sim.getEntity(p1Tank.id)!.combat?.groundTarget).toEqual({
      x: targetGroundX,
      y: targetGroundY,
    });

    const groundFireDelta = sim.stepTick();
    expect(
      groundFireDelta.projectiles.some(
        (prj) => prj.toX === targetGroundX && prj.toY === targetGroundY
      )
    ).toBe(true);
    // Grass tile blasted by ground fire degrades to Dirt
    expect(sim.terrainGrid[targetGroundY * sim.width + targetGroundX]).toBe(TERRAIN_KIND.DIRT);

    // 3. Building repair (COMMAND_REPAIR_BUILDING & stepBuildingRepairs)
    const p1Yard = sim
      .getAllEntities()
      .find(
        (e) => e.ownerId === "p1" && e.entityType === "BUILDING" && e.kind === "CONSTRUCTION_YARD"
      )!;
    p1Yard.health.hp = p1Yard.health.maxHp - 120;
    const hpBeforeRepair = p1Yard.health.hp;
    expect(sim.issueRepairBuilding("p1", p1Yard.id)).toBe(true);
    expect(sim.getEntity(p1Yard.id)!.building?.isRepairing).toBe(true);
    expect(sim.getEntity(p1Yard.id)!.health.hp).toBeGreaterThan(hpBeforeRepair);

    for (let t = 0; t < 15; t++) {
      sim.stepTick();
    }
    expect(sim.getEntity(p1Yard.id)!.health.hp).toBe(p1Yard.health.maxHp);
    expect(sim.getEntity(p1Yard.id)!.building?.isRepairing).toBe(false);

    // 4. Sandbag Wall (SANDBAG_WALL) & Concrete Wall (CONCRETE_WALL) + Continuous Concrete Slab placement
    expect(BUILDINGS.SANDBAG_WALL.category).toBe("DEFENSE");
    expect(BUILDINGS.CONCRETE_WALL.category).toBe("DEFENSE");

    // Continuous placement of CONCRETE_SLAB without having to re-queue each tile in the menu
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 8, 13)).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 9, 13)).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 10, 13)).toBe(true);
    for (let t = 0; t < 110; t++) {
      sim.stepTick();
    }
    expect(sim.terrainGrid[13 * sim.width + 8]).toBe(TERRAIN_KIND.CONCRETE_SLAB);
    expect(sim.terrainGrid[13 * sim.width + 9]).toBe(TERRAIN_KIND.CONCRETE_SLAB);
    expect(sim.terrainGrid[13 * sim.width + 10]).toBe(TERRAIN_KIND.CONCRETE_SLAB);

    // Continuous placement of SANDBAG_WALL & CONCRETE_WALL
    expect(sim.issuePlaceBuilding("p1", "DEFENSE", "SANDBAG_WALL", 11, 6)).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "DEFENSE", "CONCRETE_WALL", 12, 6)).toBe(true);
    expect(
      sim
        .getAllEntities()
        .some((e) => e.ownerId === "p1" && e.kind === "SANDBAG_WALL" && e.transform.x === 11)
    ).toBe(true);
    expect(
      sim
        .getAllEntities()
        .some((e) => e.ownerId === "p1" && e.kind === "CONCRETE_WALL" && e.transform.x === 12)
    ).toBe(true);

    // Touch tap resolution for REPAIR_BUILDING and ATTACK_GROUND
    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: false,
        sellMode: false,
        repairMode: true,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: p1Yard.id,
        tappedEnemyEntityId: null,
        selectedUnitCount: 0,
      })
    ).toBe("REPAIR_BUILDING");

    expect(
      resolveTouchTapAction({
        mode: "AUTO",
        hasPlacementBuilding: false,
        sellMode: false,
        forceAttackMode: true,
        tappedOwnUnitId: null,
        tappedOwnBuildingId: null,
        tappedEnemyEntityId: null,
        selectedUnitCount: 2,
      })
    ).toBe("ATTACK_GROUND");
  });

  it("v1.5.1 — supports uninterrupted multi-click continuous placement of Walls, Sandbags, and Concrete Slabs + progressive crater fade-out without reverting terrain nature", () => {
    const sim = new RtsSimulation("test_v151_continuous_and_craters", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    // 1. Uninterrupted consecutive placement of CONCRETE_WALL, SANDBAG_WALL, and CONCRETE_SLAB across multiple ticks
    const initialCredits = sim.getPlayerState("p1")!.credits;

    // Place 4 CONCRETE_WALL segments in a row across ticks
    for (let dx = 0; dx < 4; dx++) {
      expect(sim.issuePlaceBuilding("p1", "DEFENSE", "CONCRETE_WALL", 8 + dx, 11)).toBe(true);
      sim.stepTick();
    }
    // Place 4 SANDBAG_WALL segments in a row across ticks
    for (let dx = 0; dx < 4; dx++) {
      expect(sim.issuePlaceBuilding("p1", "DEFENSE", "SANDBAG_WALL", 8 + dx, 12)).toBe(true);
      sim.stepTick();
    }
    // Place 4 CONCRETE_SLAB tiles in a row across ticks
    for (let dx = 0; dx < 4; dx++) {
      expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 8 + dx, 13)).toBe(true);
      sim.stepTick();
    }

    const expectedSpent =
      4 * BUILDINGS.CONCRETE_WALL.cost +
      4 * BUILDINGS.SANDBAG_WALL.cost +
      4 * BUILDINGS.CONCRETE_SLAB.cost;
    expect(sim.getPlayerState("p1")!.credits).toBe(initialCredits - expectedSpent);

    // Allow Constructor Bot to finish assembling the walls, sandbags, and concrete slabs
    for (let t = 0; t < 420; t++) {
      sim.stepTick();
    }

    for (let dx = 0; dx < 4; dx++) {
      expect(sim.terrainGrid[13 * sim.width + (8 + dx)]).toBe(TERRAIN_KIND.CONCRETE_SLAB);
    }

    // 2. Progressive fade-out and disappearance of black ground impact stains (craters)
    expect(CRATER_LIFETIME_MS).toBe(12_000);
    const alphaStart = computeCraterFadeAlpha(0, CRATER_LIFETIME_MS);
    const alphaMid = computeCraterFadeAlpha(CRATER_LIFETIME_MS * 0.5, CRATER_LIFETIME_MS);
    const alphaLate = computeCraterFadeAlpha(CRATER_LIFETIME_MS * 0.85, CRATER_LIFETIME_MS);
    const alphaExpired = computeCraterFadeAlpha(CRATER_LIFETIME_MS, CRATER_LIFETIME_MS);

    expect(alphaStart).toBeGreaterThan(0.65);
    expect(alphaMid).toBeLessThan(alphaStart);
    expect(alphaLate).toBeLessThan(alphaMid);
    expect(alphaLate).toBeGreaterThan(0);
    expect(alphaExpired).toBe(0);

    // 3. Degraded terrain stratum (Grass -> Dirt -> Stone) never reverts back to Grass over time
    const impactTileIdx = 20 * sim.width + 20;
    sim.terrainGrid[impactTileIdx] = TERRAIN_KIND.GRASS;
    expect(sim.degradeTerrainAtImpact(20, 20, "SHELL", false)).toBe(true);
    expect(sim.terrainGrid[impactTileIdx]).toBe(TERRAIN_KIND.DIRT);

    for (let t = 0; t < 300; t++) {
      sim.stepTick();
    }
    // Dirt remains Dirt permanently (never reverts to Grass)
    expect(sim.terrainGrid[impactTileIdx]).toBe(TERRAIN_KIND.DIRT);
  });

  it("v1.6.0 — enforces Constructor Bot timed assembly for Concrete Slabs/Walls/Sandbags, Stone/Concrete building foundations, and Harvester glowing ore nugget trail", () => {
    const sim = new RtsSimulation("test_v160_constructor_and_foundations", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    // 1. Verify Constructor Bot (Robot Constructeur) exists in initial base & can be built at Construction Yard
    expect(UNITS.CONSTRUCTOR_BOT).toBeDefined();
    expect(UNITS.CONSTRUCTOR_BOT.prerequisites).toEqual(["CONSTRUCTION_YARD"]);
    const initialBots = sim
      .getAllEntities()
      .filter((e) => e.ownerId === "p1" && e.entityType === "UNIT" && e.kind === "CONSTRUCTOR_BOT");
    expect(initialBots.length).toBe(1);

    // Produce a 2nd Constructor Bot directly from the Construction Yard ("BUILDING" queue)
    expect(sim.issueStartProduction("p1", "BUILDING", "CONSTRUCTOR_BOT")).toBe(true);
    for (let t = 0; t < UNITS.CONSTRUCTOR_BOT.buildTimeTicks + 2; t++) {
      sim.stepTick();
    }
    const botsAfterProd = sim
      .getAllEntities()
      .filter((e) => e.ownerId === "p1" && e.entityType === "UNIT" && e.kind === "CONSTRUCTOR_BOT");
    expect(botsAfterProd.length).toBe(2);

    // 2. Timed construction of CONCRETE_SLAB, SANDBAG_WALL, and CONCRETE_WALL by Constructor Bot
    expect(getTimedConstructionTicks("CONCRETE_SLAB")).toBeGreaterThan(0);
    expect(getTimedConstructionTicks("SANDBAG_WALL")).toBeGreaterThan(0);
    expect(getTimedConstructionTicks("CONCRETE_WALL")).toBeGreaterThan(0);

    // Place a Concrete Wall at (10, 8) and a Concrete Slab at (10, 9): they are NOT built instantaneously
    const slabIdx = 9 * sim.width + 10;
    sim.terrainGrid[slabIdx] = TERRAIN_KIND.DIRT;
    expect(sim.issuePlaceBuilding("p1", "DEFENSE", "CONCRETE_WALL", 10, 8)).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 10, 9)).toBe(true);

    const wallSite = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.kind === "CONCRETE_WALL" && e.transform.x === 10 && e.transform.y === 8)!;
    const slabSite = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.kind === "CONCRETE_SLAB" && e.transform.x === 10 && e.transform.y === 9)!;
    expect(wallSite).toBeDefined();
    expect(slabSite).toBeDefined();
    expect(wallSite.building!.buildProgress).toBeLessThan(1);
    expect(slabSite.building!.buildProgress).toBeLessThan(1);
    expect(sim.terrainGrid[slabIdx]).toBe(TERRAIN_KIND.DIRT);

    // Step ticks so Constructor Bots travel to the sites and complete assembly
    for (let t = 0; t < 45; t++) {
      sim.stepTick();
    }
    expect(sim.getEntity(wallSite.id)?.building?.buildProgress).toBe(1);
    expect(sim.getEntity(wallSite.id)?.health.hp).toBe(wallSite.health.maxHp);
    expect(sim.terrainGrid[slabIdx]).toBe(TERRAIN_KIND.CONCRETE_SLAB);

    // 3. Buildings can ONLY be constructed on Concrete (TERRAIN_KIND.CONCRETE_SLAB) foundations (no longer Stone in v1.8.0)
    expect(requiresStoneOrConcreteFoundation("POWER_PLANT")).toBe(true);
    expect(requiresStoneOrConcreteFoundation("BARRACKS")).toBe(true);
    expect(requiresStoneOrConcreteFoundation("GUARD_TOWER")).toBe(true);
    expect(requiresStoneOrConcreteFoundation("CONCRETE_SLAB")).toBe(false);
    expect(requiresStoneOrConcreteFoundation("CONCRETE_WALL")).toBe(false);
    expect(requiresStoneOrConcreteFoundation("SANDBAG_WALL")).toBe(false);
    expect(isFoundationTerrainKind(TERRAIN_KIND.STONE)).toBe(false);
    expect(isFoundationTerrainKind(TERRAIN_KIND.CONCRETE_SLAB)).toBe(true);
    expect(isFoundationTerrainKind(TERRAIN_KIND.GRASS)).toBe(false);
    expect(isFoundationTerrainKind(TERRAIN_KIND.DIRT)).toBe(false);

    // Queue a Power Plant
    expect(sim.issueStartProduction("p1", "BUILDING", "POWER_PLANT")).toBe(true);
    for (let t = 0; t < BUILDINGS.POWER_PLANT.buildTimeTicks + 2; t++) {
      sim.stepTick();
    }
    expect(sim.getPlayerState("p1")?.queues.BUILDING.readyToPlace).toBe(true);

    // Set footprint (11..12, 10..11) to GRASS / DIRT -> placement MUST be rejected
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        sim.terrainGrid[(10 + dy) * sim.width + (11 + dx)] = dy === 0 ? TERRAIN_KIND.GRASS : TERRAIN_KIND.DIRT;
      }
    }
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "POWER_PLANT", 11, 10)).toBe(false);

    // Pave (11..12, 10..11) with Concrete Slabs and let Constructor Bots complete them
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 11 + dx, 10 + dy)).toBe(true);
      }
    }
    for (let t = 0; t < 80; t++) {
      sim.stepTick();
    }
    // Place the ready Power Plant on the newly paved Concrete Slab foundation -> MUST succeed
    expect(sim.getPlayerState("p1")?.queues.BUILDING.readyToPlace).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "POWER_PLANT", 11, 10)).toBe(true);

    // 4. Without a living Constructor Bot, Concrete Slabs and Walls cannot be placed
    const p2Tank = sim.createUnitEntity("p2", "NOD", "MAMMOTH_TANK", 8, 7);
    p2Tank.spawnProtectionTicks = 0;
    for (const bot of sim
      .getAllEntities()
      .filter((e) => e.ownerId === "p1" && e.kind === "CONSTRUCTOR_BOT")) {
      bot.spawnProtectionTicks = 0;
      bot.transform.x = 8;
      bot.transform.y = 8;
      bot.health.hp = 1;
      if (p2Tank.combat) {
        p2Tank.combat.cooldownRemaining = 0;
      }
      sim.issueAttackCommand("p2", [p2Tank.id], bot.id);
      sim.stepTick();
    }
    expect(sim.hasLivingConstructorBot("p1")).toBe(false);
    expect(
      sim.getAllEntities().filter((e) => e.ownerId === "p1" && e.kind === "CONSTRUCTOR_BOT").length
    ).toBe(0);
    expect(sim.issuePlaceBuilding("p1", "DEFENSE", "CONCRETE_WALL", 10, 12)).toBe(false);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "CONCRETE_SLAB", 10, 13)).toBe(false);

    // 5. Harvester glowing ore nugget trail spawns and disappears over time
    const vfx = new BattlefieldVfxManager();
    vfx.maybeSpawnHarvesterOreTrail("harv_1", 12, 12, 4, 350, true, 1000);
    // Moving at least 0.34 tiles spawns a glowing nugget behind the harvester
    vfx.maybeSpawnHarvesterOreTrail("harv_1", 12.6, 12, 4, 350, true, 1300);
    expect(vfx.getActiveCounts().oreNuggets).toBe(1);
    expect(ORE_NUGGET_LIFETIME_MS).toBeGreaterThan(2000);
  });

  it("v1.7.0 — enlarges the map to 72x72, places ore fields further from base spawns, enforces timed Refinery ore unloading, and reduces Harvester nugget drop rate", () => {
    const sim = new RtsSimulation("test_v170_map_and_unloading", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    // 1. Enlarged map dimensions (72x72 = 5,184 tiles)
    expect(MAP_WIDTH_TILES).toBe(72);
    expect(MAP_HEIGHT_TILES).toBe(72);
    expect(sim.width).toBe(72);
    expect(sim.height).toBe(72);
    expect(sim.terrainGrid.length).toBe(72 * 72);

    // 2. Ore patches are positioned further away from the base spawn (5, 5) to require early field expeditions
    let minOreDistFromSpawn = Infinity;
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        if ((sim.oreGrid[y * sim.width + x] ?? 0) > 0) {
          const dist = Math.hypot(x - 6, y - 6);
          if (dist < minOreDistFromSpawn) {
            minOreDistFromSpawn = dist;
          }
        }
      }
    }
    expect(minOreDistFromSpawn).toBeGreaterThanOrEqual(11);

    // 3. Timed ore unloading at the Refinery (UNLOADING state over multiple ticks instead of instant 1-tick dump)
    expect(HARVESTER_UNLOAD_PER_TICK).toBe(25);
    const harv = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.entityType === "UNIT" && e.kind === "HARVESTER")!;
    const refinery = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.entityType === "BUILDING" && e.kind === "REFINERY")!;
    expect(harv).toBeDefined();
    expect(refinery).toBeDefined();

    // Load Harvester with 500 ore and place it at the Refinery unloading dock (5, 10)
    harv.harvester!.cargoOre = HARVESTER_MAX_LOAD;
    harv.harvester!.state = "RETURNING_TO_REFINERY";
    harv.stateLabel = "RETURNING";
    harv.transform.x = refinery.transform.x;
    harv.transform.y = refinery.transform.y + refinery.building!.footprintH;

    const creditsBefore = sim.getPlayerState("p1")!.credits;

    // First tick at dock transitions Harvester into UNLOADING (REVERSING_IN phase) without dumping cargo instantaneously
    sim.stepTick();
    expect(harv.harvester!.state).toBe("UNLOADING");
    expect(harv.stateLabel).toBe("UNLOADING");
    expect(harv.harvester!.cargoOre).toBe(HARVESTER_MAX_LOAD);

    // 4 ticks of REVERSING_IN + 5 ticks of DUMPING unload 5 * 25 = 125 ore progressively
    for (let t = 0; t < 4 + 5; t++) {
      sim.stepTick();
    }
    expect(harv.harvester!.state).toBe("UNLOADING");
    expect(harv.harvester!.cargoOre).toBe(HARVESTER_MAX_LOAD - 5 * HARVESTER_UNLOAD_PER_TICK);
    expect(sim.getPlayerState("p1")!.credits).toBe(creditsBefore + 5 * HARVESTER_UNLOAD_PER_TICK);

    // Remaining 15 ticks of DUMPING + 4 ticks of PULLING_OUT complete the 500-ore unload and return Harvester to IDLE
    for (let t = 0; t < 15 + 4; t++) {
      sim.stepTick();
    }
    expect(harv.harvester!.cargoOre).toBe(0);
    expect(harv.harvester!.state).toBe("IDLE");
    expect(sim.getPlayerState("p1")!.credits).toBe(creditsBefore + HARVESTER_MAX_LOAD);

    // 4. Slightly reduced Harvester nugget drop rate (680ms interval)
    expect(HARVESTER_NUGGET_DROP_INTERVAL_MS).toBe(680);
    const vfx = new BattlefieldVfxManager();
    vfx.maybeSpawnHarvesterOreTrail("harv_rate", 10, 10, 4, 400, true, 1000);
    vfx.maybeSpawnHarvesterOreTrail("harv_rate", 10.5, 10, 4, 400, true, 1500);
    expect(vfx.getActiveCounts().oreNuggets).toBe(1);
    vfx.maybeSpawnHarvesterOreTrail("harv_rate", 11.0, 10, 4, 400, true, 1700);
    expect(vfx.getActiveCounts().oreNuggets).toBe(2);
  });

  it("v1.8.0 — enforces Concrete-only foundation with 8x8 spawn pad, Constructor Bot building assembly with simultaneous multi-bot construction and right-click cancel, organic ore islands, 2x2 Silver Ore & Silver Mine, Harvester reverse-in Refinery animation, and destructible Trees", () => {
    const sim = new RtsSimulation("test_v180_features", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    // 1. 8x8 Concrete Slab spawn pad at (5..12, 5..12) and Concrete-only foundation rule (Stone is rejected)
    expect(SPAWN_CONCRETE_PAD_SIZE).toBe(8);
    for (let dy = 0; dy < SPAWN_CONCRETE_PAD_SIZE; dy++) {
      for (let dx = 0; dx < SPAWN_CONCRETE_PAD_SIZE; dx++) {
        expect(sim.terrainGrid[(5 + dy) * sim.width + (5 + dx)]).toBe(TERRAIN_KIND.CONCRETE_SLAB);
      }
    }
    expect(canPlaceBuildingOnTerrainTile("POWER_PLANT", TERRAIN_KIND.CONCRETE_SLAB)).toBe(true);
    expect(canPlaceBuildingOnTerrainTile("POWER_PLANT", TERRAIN_KIND.STONE)).toBe(false);

    // Verify placing a building on STONE (outside the 8x8 concrete pad) is rejected
    sim.terrainGrid[5 * sim.width + 13] = TERRAIN_KIND.STONE;
    sim.terrainGrid[5 * sim.width + 14] = TERRAIN_KIND.STONE;
    sim.terrainGrid[6 * sim.width + 13] = TERRAIN_KIND.STONE;
    sim.terrainGrid[6 * sim.width + 14] = TERRAIN_KIND.STONE;
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "POWER_PLANT", 13, 5)).toBe(false);

    // 2. Immediate blueprint placement on the 8x8 Concrete pad, simultaneous multi-bot construction, and cancel construction
    // Spawn a 2nd Constructor Bot so 2 bots can build 2 blueprints simultaneously
    const bot2 = sim.createUnitEntity("p1", "GDI", "CONSTRUCTOR_BOT", 9, 9);
    bot2.spawnProtectionTicks = 0;

    const creditsBeforeBlueprints = sim.getPlayerState("p1")!.credits;
    // Place three blueprints immediately on the 8x8 Concrete Slab pad without pre-waiting in the HUD queue:
    // Blueprint A: BARRACKS at (8, 11)
    // Blueprint B: POWER_PLANT at (11, 7)
    // Blueprint C: POWER_PLANT at (11, 10) (to test right-click cancellation)
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "BARRACKS", 8, 11)).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "POWER_PLANT", 11, 7)).toBe(true);
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "POWER_PLANT", 11, 10)).toBe(true);

    const barracksBp = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.kind === "BARRACKS" && e.transform.x === 8 && e.transform.y === 11)!;
    const powerBp = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.kind === "POWER_PLANT" && e.transform.x === 11 && e.transform.y === 7)!;
    const towerBp = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.kind === "POWER_PLANT" && e.transform.x === 11 && e.transform.y === 10)!;

    expect(barracksBp).toBeDefined();
    expect(powerBp).toBeDefined();
    expect(towerBp).toBeDefined();
    expect(barracksBp.building!.buildProgress).toBeLessThan(1);
    expect(powerBp.building!.buildProgress).toBeLessThan(1);
    expect(towerBp.building!.buildProgress).toBeLessThan(1);

    // Cancel Blueprint C via issueCancelConstruction (triggered by right-clicking a selected blueprint)
    const creditsBeforeCancel = sim.getPlayerState("p1")!.credits;
    expect(sim.issueCancelConstruction("p1", towerBp.id)).toBe(true);
    expect(sim.getEntity(towerBp.id)).toBeUndefined();
    expect(sim.getPlayerState("p1")!.credits).toBe(creditsBeforeCancel + BUILDINGS.POWER_PLANT.cost);
    expect(sim.getPlayerState("p1")!.credits).toBe(
      creditsBeforeBlueprints - BUILDINGS.BARRACKS.cost - BUILDINGS.POWER_PLANT.cost
    );

    // Step 15 ticks and verify BOTH blueprints (BARRACKS and POWER_PLANT) are being constructed simultaneously by the 2 Constructor Bots
    for (let t = 0; t < 15; t++) {
      sim.stepTick();
    }
    expect(sim.getEntity(barracksBp.id)!.building!.buildProgress).toBeGreaterThan(0.1);
    expect(sim.getEntity(powerBp.id)!.building!.buildProgress).toBeGreaterThan(0.1);

    // Step until both buildings are 100% completed
    for (let t = 0; t < 95; t++) {
      sim.stepTick();
    }
    expect(sim.getEntity(barracksBp.id)!.building!.buildProgress).toBe(1);
    expect(sim.getEntity(powerBp.id)!.building!.buildProgress).toBe(1);

    // 3. Rare 2x2 Silver Ore boulder (TERRAIN_KIND.SILVER_ORE) & 2x2 Silver Mine (SILVER_MINE)
    expect(BUILDINGS.SILVER_MINE).toBeDefined();
    expect(BUILDINGS.SILVER_MINE.footprintW).toBe(2);
    expect(BUILDINGS.SILVER_MINE.footprintH).toBe(2);
    expect(sim.terrainGrid[7 * sim.width + 15]).toBe(TERRAIN_KIND.SILVER_ORE);
    expect(sim.terrainGrid[7 * sim.width + 16]).toBe(TERRAIN_KIND.SILVER_ORE);
    expect(sim.terrainGrid[8 * sim.width + 15]).toBe(TERRAIN_KIND.SILVER_ORE);
    expect(sim.terrainGrid[8 * sim.width + 16]).toBe(TERRAIN_KIND.SILVER_ORE);

    // Partial overlap with the 2x2 Silver Ore rock (e.g. (14, 7)) MUST be rejected
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "SILVER_MINE", 14, 7)).toBe(false);
    // Placing SILVER_MINE on Concrete MUST be rejected
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "SILVER_MINE", 8, 8)).toBe(false);
    // Exact 2x2 integral coverage on (15, 7) MUST succeed
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "SILVER_MINE", 15, 7)).toBe(true);

    const silverMine = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.kind === "SILVER_MINE" && e.transform.x === 15 && e.transform.y === 7)!;
    expect(silverMine).toBeDefined();
    expect(silverMine.building!.buildProgress).toBeLessThan(1);

    // Step until Constructor Bot completes the Silver Mine and it passively extracts Silver Ore
    for (let t = 0; t < 130; t++) {
      sim.stepTick();
    }
    expect(sim.getEntity(silverMine.id)!.building!.buildProgress).toBe(1);
    expect(SILVER_MINE_YIELD_PER_CYCLE).toBeGreaterThan(0);
    expect(SILVER_MINE_CYCLE_TICKS).toBe(20);
    expect(sim.getPlayerState("p1")!.silverOre).toBeGreaterThanOrEqual(SILVER_MINE_YIELD_PER_CYCLE);

    // 4. Harvester 3-phase unloading animation at Refinery (REVERSING_IN -> DUMPING -> PULLING_OUT)
    const harv = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.entityType === "UNIT" && e.kind === "HARVESTER")!;
    const refinery = sim
      .getAllEntities()
      .find((e) => e.ownerId === "p1" && e.entityType === "BUILDING" && e.kind === "REFINERY")!;
    harv.harvester!.cargoOre = 100;
    harv.harvester!.state = "RETURNING_TO_REFINERY";
    harv.transform.x = refinery.transform.x + 1;
    harv.transform.y = refinery.transform.y + refinery.building!.footprintH;
    const dockY = harv.transform.y;

    sim.stepTick();
    expect(harv.harvester!.state).toBe("UNLOADING");
    expect(harv.harvester!.unloadPhase).toBe("REVERSING_IN");

    // Step 3 ticks in REVERSING_IN -> Harvester reverses partially North inside the Refinery bay
    for (let t = 0; t < 3; t++) {
      sim.stepTick();
    }
    expect(harv.transform.y).toBeLessThan(dockY - 0.3);

    // Next tick completes REVERSING_IN (45% inside bay) and transitions into DUMPING
    sim.stepTick();
    expect(harv.transform.y).toBeCloseTo(dockY - 0.45, 2);
    expect(harv.harvester!.unloadPhase).toBe("DUMPING");

    // 4 ticks of DUMPING empty the 100 ore and transition to PULLING_OUT
    for (let t = 0; t < 4; t++) {
      sim.stepTick();
    }
    expect(harv.harvester!.cargoOre).toBe(0);
    expect(harv.harvester!.unloadPhase).toBe("PULLING_OUT");

    // 4 ticks of PULLING_OUT return Harvester to dockY and IDLE
    for (let t = 0; t < 4; t++) {
      sim.stepTick();
    }
    expect(harv.harvester!.state).toBe("IDLE");
    expect(harv.transform.y).toBeCloseTo(dockY, 2);

    // 5. Destructible Trees of different species and sizes on the map
    expect(Object.keys(TREES)).toEqual(["TREE_PINE", "TREE_OAK", "TREE_PALM"]);
    const trees = sim.getAllEntities().filter((e) => e.entityType === "TREE");
    expect(trees.length).toBeGreaterThanOrEqual(20);
    const speciesSet = new Set(trees.map((t) => t.kind));
    expect(speciesSet.has("TREE_PINE")).toBe(true);
    expect(speciesSet.has("TREE_OAK")).toBe(true);
    expect(speciesSet.has("TREE_PALM")).toBe(true);
    const scales = new Set(trees.map((t) => t.treeScale));
    expect(scales.size).toBeGreaterThanOrEqual(3);

    // Spawn a tree near a Mammoth Tank and attack it over multiple shots until destroyed
    const testTree = sim.createTreeEntity("TREE_OAK", 14, 14, 1.0);
    const tank = sim.createUnitEntity("p1", "GDI", "MAMMOTH_TANK", 14, 12);
    tank.spawnProtectionTicks = 0;
    const initialTreeHp = testTree.health.hp;
    sim.issueAttackCommand("p1", [tank.id], testTree.id);

    sim.stepTick();
    // First volley damages the tree but does not destroy it in a single shot
    expect(sim.getEntity(testTree.id)).toBeDefined();
    expect(sim.getEntity(testTree.id)!.health.hp).toBeLessThan(initialTreeHp);

    // Continue firing across multiple volleys until the tree is destroyed
    for (let t = 0; t < 100; t++) {
      sim.stepTick();
      if (!sim.getEntity(testTree.id)) break;
    }
    expect(sim.getEntity(testTree.id)).toBeUndefined();
  });

  it("v1.8.1 — preserves active blueprint placement mode (placementBuilding) across 20 Hz SIM_DELTA ticks when clicking 'Poser le Patron' for any building", () => {
    const sim = new RtsSimulation("test_v181_placement_persistence", [
      { playerId: "p1", commanderName: "Alpha", faction: "GDI", isAi: false },
      { playerId: "p2", commanderName: "Beta", faction: "NOD", isAi: false },
    ]);

    const store = useRtsGameStore.getState();
    store.setCommanderIdentity("p1", "Alpha", "GDI");
    store.ingestServerSnapshot(sim.getFullSnapshot());

    for (const item of [
      { category: "BUILDING" as const, kind: "POWER_PLANT" as const },
      { category: "BUILDING" as const, kind: "BARRACKS" as const },
      { category: "BUILDING" as const, kind: "REFINERY" as const },
      { category: "BUILDING" as const, kind: "SILO" as const },
      { category: "BUILDING" as const, kind: "SILVER_MINE" as const },
      { category: "DEFENSE" as const, kind: "GUARD_TOWER" as const },
    ]) {
      useRtsGameStore.getState().setPlacementBuilding(item);
      expect(useRtsGameStore.getState().placementBuilding).toEqual(item);

      // Step 10 consecutive 20 Hz simulation deltas while no queue item is active:
      // placementBuilding MUST remain active under the cursor and never reset to null!
      for (let t = 0; t < 10; t++) {
        const delta = sim.stepTick();
        useRtsGameStore.getState().ingestServerDelta(delta);
        expect(useRtsGameStore.getState().placementBuilding).toEqual(item);
      }
    }

    // Place the selected blueprint onto the 8x8 Concrete Slab pad at (11, 5)
    useRtsGameStore.getState().setPlacementBuilding({ category: "BUILDING", kind: "POWER_PLANT" });
    expect(sim.issuePlaceBuilding("p1", "BUILDING", "POWER_PLANT", 11, 5)).toBe(true);
    useRtsGameStore.getState().setPlacementBuilding(null);
    expect(useRtsGameStore.getState().placementBuilding).toBeNull();
  });

  it("v1.9.0 — provides hierarchical category/subcategory construction grid, balanced 3-column slot padding, wrench/dollar pictograms, hover menu, and fast-launch clan selection", () => {
    // 1. Balanced 3-column grid calculations
    expect(CONSTRUCTION_GRID_COLUMNS).toBe(3);
    expect(getBalancedGridSlotCount(1, 2, 3)).toBe(6);
    expect(getBalancedGridSlotCount(4, 2, 3)).toBe(6);
    expect(getBalancedGridSlotCount(6, 2, 3)).toBe(6);
    expect(getBalancedGridSlotCount(7, 2, 3)).toBe(9);
    expect(getBalancedGridSlotCount(11, 2, 3)).toBe(12);

    // 2. Every building and unit has a valid shortName and hierarchical subcategory
    const validSubIds = new Set(CONSTRUCTION_SUBCATEGORIES.map((s) => s.id));
    for (const b of BUILDING_LIST) {
      expect(b.shortName.length).toBeGreaterThan(0);
      expect(validSubIds.has(b.subcategory)).toBe(true);
    }
    for (const u of UNIT_LIST) {
      expect(u.shortName.length).toBeGreaterThan(0);
      expect(validSubIds.has(u.subcategory)).toBe(true);
    }

    // 3. Hierarchical filtering across all 4 categories and their subcategories
    for (const category of ["BUILDING", "DEFENSE", "INFANTRY", "VEHICLE"] as const) {
      const subs = getSubcategoriesForCategory(category);
      expect(subs.length).toBeGreaterThanOrEqual(2);
      const allInCat = getConstructionCatalogItems(category, "ALL");
      expect(allInCat.length).toBeGreaterThan(0);

      let sumSubItems = 0;
      for (const sub of subs) {
        const subItems = getConstructionCatalogItems(category, sub.id);
        expect(subItems.length).toBeGreaterThan(0);
        for (const item of subItems) {
          expect(item.subcategory).toBe(sub.id);
        }
        sumSubItems += subItems.length;
      }
      expect(sumSubItems).toBe(allInCat.length);
    }

    // 4. LOBBY_CREATE schema supports autoStart for direct clan-selection -> match launch
    const parsedQuickLaunch = ClientLobbyActionSchema.safeParse({
      type: "LOBBY_CREATE",
      playerId: "cmd_fast",
      commanderName: "Solomon",
      faction: "GDI",
      lobbyName: "Escarmouche Tactique (GDI)",
      withAiBot: true,
      autoStart: true,
    });
    expect(parsedQuickLaunch.success).toBe(true);
    if (parsedQuickLaunch.success && parsedQuickLaunch.data.type === "LOBBY_CREATE") {
      expect(parsedQuickLaunch.data.autoStart).toBe(true);
    }

    // 5. Verify HUD and Portal source structure for grid, hover menu, pictograms, and fast clan screen
    const hudSource = fs.readFileSync(
      path.resolve(__dirname, "../src/components/hud/classic-sidebar-hud.tsx"),
      "utf-8"
    );
    expect(hudSource).toContain('data-testid="construction-grid"');
    expect(hudSource).toContain("grid-cols-3");
    expect(hudSource).toContain('data-testid="construction-hover-menu"');
    expect(hudSource).toContain('aria-label="Réparer"');
    expect(hudSource).toContain('aria-label="Vendre"');

    const portalSource = fs.readFileSync(
      path.resolve(__dirname, "../src/components/lobby/portal-command-center.tsx"),
      "utf-8"
    );
    expect(portalSource).toContain('data-testid="clan-selection-grid"');
    expect(portalSource).toContain('data-testid="quick-launch-button"');
    expect(portalSource).not.toContain("Classement des Commandants");
    expect(portalSource).not.toContain("Journal des Opérations Récentes");
    expect(portalSource).not.toContain("Navigateur de Salons");
  });
});
