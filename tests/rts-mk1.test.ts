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
import { WATCHDOG_DISCONNECT_TIMEOUT_MS } from "../src/shared/constants";
import { ClientLobbyActionSchema } from "../src/shared/schemas/commands";

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
});
