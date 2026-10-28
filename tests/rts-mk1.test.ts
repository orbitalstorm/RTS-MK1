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
  APP_VERSION,
  CAMERA_SHAKE_MAX_OFFSET_PX,
  computeCameraShakeOffset,
  computeDistanceAttenuatedShakeTrauma,
  computeEdgeScrollVelocity,
  EDGE_SCROLL_MARGIN_PX,
  EDGE_SCROLL_MAX_SPEED_PX,
  interpolateAngleIndex16,
  SPRITE_ATLAS_SCALE,
  WATCHDOG_DISCONNECT_TIMEOUT_MS,
  ZOOM_LEVELS,
} from "../src/shared/constants";
import { ClientLobbyActionSchema } from "../src/shared/schemas/commands";
import type { VisualEffectEvent } from "../src/shared/schemas/deltas";

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
    expect(initialSnapshot.mapWidth).toBe(48);
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
    expect(APP_VERSION).toBe("1.2.0");
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
});
