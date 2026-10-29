import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CommanderProfileSchema,
  MatchRecordSchema,
  type CommanderProfile,
  type MatchRecord,
  type UpsertProfileRequest,
} from "../../shared/schemas/profile";
import type { FactionId } from "../../shared/constants";

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dbPath = process.env.RTS_DB_PATH || path.join(process.cwd(), "data", "rts-mk1.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS commander_profiles (
      player_id TEXT PRIMARY KEY,
      commander_name TEXT NOT NULL,
      preferred_faction TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      ore_harvested INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_history (
      match_id TEXT PRIMARY KEY,
      lobby_name TEXT NOT NULL,
      winner_commander TEXT NOT NULL,
      winner_faction TEXT NOT NULL,
      duration_ticks INTEGER NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_seed_logs (
      lobby_id TEXT NOT NULL,
      lobby_name TEXT NOT NULL,
      map_seed INTEGER NOT NULL,
      map_width INTEGER NOT NULL,
      map_height INTEGER NOT NULL,
      started_at TEXT NOT NULL
    );
  `);

  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM commander_profiles")
    .get() as { cnt: number } | undefined;

  if (!countRow || countRow.cnt === 0) {
    const now = new Date().toISOString();
    const seedStmt = db.prepare(`
      INSERT OR IGNORE INTO commander_profiles
      (player_id, commander_name, preferred_faction, wins, losses, ore_harvested, matches_played, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    seedStmt.run("cmd_solomon", "Gen. Solomon", "GDI", 14, 3, 68400, 17, now);
    seedStmt.run("cmd_kane", "Legate Kane", "NOD", 12, 5, 59200, 17, now);
    seedStmt.run("cmd_executrix", "Mentat Executrix", "ORDOS", 11, 4, 74500, 15, now);
  }

  dbInstance = db;
  return db;
}

export function upsertCommanderProfile(req: UpsertProfileRequest): CommanderProfile {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO commander_profiles (
      player_id, commander_name, preferred_faction, wins, losses, ore_harvested, matches_played, updated_at
    ) VALUES (?, ?, ?, 0, 0, 0, 0, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      commander_name = excluded.commander_name,
      preferred_faction = excluded.preferred_faction,
      updated_at = excluded.updated_at
  `).run(req.playerId, req.commanderName, req.preferredFaction, now);

  return getCommanderProfile(req.playerId)!;
}

export function getCommanderProfile(playerId: string): CommanderProfile | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT player_id, commander_name, preferred_faction, wins, losses, ore_harvested, matches_played, updated_at
       FROM commander_profiles WHERE player_id = ?`
    )
    .get(playerId) as
    | {
        player_id: string;
        commander_name: string;
        preferred_faction: FactionId;
        wins: number;
        losses: number;
        ore_harvested: number;
        matches_played: number;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return CommanderProfileSchema.parse({
    playerId: row.player_id,
    commanderName: row.commander_name,
    preferredFaction: row.preferred_faction,
    wins: row.wins,
    losses: row.losses,
    oreHarvested: row.ore_harvested,
    matchesPlayed: row.matches_played,
    updatedAt: row.updated_at,
  });
}

export function listTopCommanders(limit = 10): CommanderProfile[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT player_id, commander_name, preferred_faction, wins, losses, ore_harvested, matches_played, updated_at
       FROM commander_profiles
       ORDER BY wins DESC, ore_harvested DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    player_id: string;
    commander_name: string;
    preferred_faction: FactionId;
    wins: number;
    losses: number;
    ore_harvested: number;
    matches_played: number;
    updated_at: string;
  }>;

  return rows.map((row) =>
    CommanderProfileSchema.parse({
      playerId: row.player_id,
      commanderName: row.commander_name,
      preferredFaction: row.preferred_faction,
      wins: row.wins,
      losses: row.losses,
      oreHarvested: row.ore_harvested,
      matchesPlayed: row.matches_played,
      updatedAt: row.updated_at,
    })
  );
}

export function recordMatchOutcome(params: {
  matchId: string;
  lobbyName: string;
  winnerPlayerId: string;
  winnerCommander: string;
  winnerFaction: FactionId;
  durationTicks: number;
  participants: Array<{
    playerId: string;
    commanderName: string;
    faction: FactionId;
    isAi: boolean;
    harvestedTotal: number;
  }>;
}): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO match_history
    (match_id, lobby_name, winner_commander, winner_faction, duration_ticks, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.matchId,
    params.lobbyName,
    params.winnerCommander,
    params.winnerFaction,
    params.durationTicks,
    now
  );

  for (const p of params.participants) {
    if (p.isAi) continue;
    upsertCommanderProfile({
      playerId: p.playerId,
      commanderName: p.commanderName,
      preferredFaction: p.faction,
    });
    const isWin = p.playerId === params.winnerPlayerId ? 1 : 0;
    const isLoss = isWin === 1 ? 0 : 1;
    db.prepare(`
      UPDATE commander_profiles
      SET wins = wins + ?,
          losses = losses + ?,
          ore_harvested = ore_harvested + ?,
          matches_played = matches_played + 1,
          updated_at = ?
      WHERE player_id = ?
    `).run(isWin, isLoss, p.harvestedTotal, now, p.playerId);
  }
}

export function listRecentMatches(limit = 8): MatchRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT match_id, lobby_name, winner_commander, winner_faction, duration_ticks, completed_at
       FROM match_history
       ORDER BY completed_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    match_id: string;
    lobby_name: string;
    winner_commander: string;
    winner_faction: FactionId;
    duration_ticks: number;
    completed_at: string;
  }>;

  return rows.map((r) =>
    MatchRecordSchema.parse({
      matchId: r.match_id,
      lobbyName: r.lobby_name,
      winnerCommander: r.winner_commander,
      winnerFaction: r.winner_faction,
      durationTicks: r.duration_ticks,
      completedAt: r.completed_at,
    })
  );
}

export interface MatchSeedLogRecord {
  lobbyId: string;
  lobbyName: string;
  mapSeed: number;
  mapWidth: number;
  mapHeight: number;
  startedAt: string;
}

export function recordMatchSeedLog(params: {
  lobbyId: string;
  lobbyName: string;
  mapSeed: number;
  mapWidth: number;
  mapHeight: number;
}): void {
  const db = getDb();
  const startedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO match_seed_logs
    (lobby_id, lobby_name, map_seed, map_width, map_height, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.lobbyId,
    params.lobbyName,
    params.mapSeed,
    params.mapWidth,
    params.mapHeight,
    startedAt
  );
}

export function listRecentMatchSeedLogs(limit = 20): MatchSeedLogRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT lobby_id, lobby_name, map_seed, map_width, map_height, started_at
       FROM match_seed_logs
       ORDER BY rowid DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    lobby_id: string;
    lobby_name: string;
    map_seed: number;
    map_width: number;
    map_height: number;
    started_at: string;
  }>;

  return rows.map((r) => ({
    lobbyId: r.lobby_id,
    lobbyName: r.lobby_name,
    mapSeed: r.map_seed,
    mapWidth: r.map_width,
    mapHeight: r.map_height,
    startedAt: r.started_at,
  }));
}
