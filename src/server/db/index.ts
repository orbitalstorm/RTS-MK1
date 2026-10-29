import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CustomMapDocumentSchema,
  CustomMapSummarySchema,
  createStarterCustomMapFromSeed,
  summarizeCustomMapDocument,
  type CustomMapDocument,
  type CustomMapSummary,
} from "../../shared/schemas/custom-map";
import {
  CommanderProfileSchema,
  MatchRecordSchema,
  type CommanderProfile,
  type MatchRecord,
  type UpsertProfileRequest,
} from "../../shared/schemas/profile";
import {
  VECTOR_ASSET_ELEMENTS,
  VectorVariantsMutationRequestSchema,
  VectorVariantsStateSchema,
  createInitialVectorVariantsState,
  setActiveVectorVariantConfig,
  summarizeVectorVariantsState,
  synthesizeNewLeonardoVariantProposal,
  type VectorVariantProposal,
  type VectorVariantsMutationRequest,
  type VectorVariantsState,
} from "../../shared/schemas/vector-variants";
import type { FactionId } from "../../shared/constants";

let dbInstance: DatabaseSync | null = null;
let activeDbPath: string | null = null;

function resolveDbPath(): string {
  return process.env.RTS_DB_PATH || path.join(process.cwd(), "data", "rts-mk1.sqlite");
}

function getCustomMapsDir(): string {
  const dbPath = resolveDbPath();
  const dir = path.join(path.dirname(dbPath), "custom-maps");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getVectorVariantsFilePath(): string {
  const dbPath = resolveDbPath();
  const dir = path.join(path.dirname(dbPath), "vector-variants");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "state.json");
}

function saveCustomMapToStatement(db: DatabaseSync, doc: CustomMapDocument): CustomMapSummary {
  const validated = CustomMapDocumentSchema.parse({
    ...doc,
    updatedAt: doc.updatedAt || new Date().toISOString(),
  });
  const summary = summarizeCustomMapDocument(validated);

  db.prepare(`
    INSERT INTO custom_maps (
      map_id, name, author, description, version, seed, size_preset,
      width, height, spawn_count, ore_total_credits, silver_deposit_count,
      tree_count, entity_count, rules_valid, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(map_id) DO UPDATE SET
      name = excluded.name,
      author = excluded.author,
      description = excluded.description,
      version = excluded.version,
      seed = excluded.seed,
      size_preset = excluded.size_preset,
      width = excluded.width,
      height = excluded.height,
      spawn_count = excluded.spawn_count,
      ore_total_credits = excluded.ore_total_credits,
      silver_deposit_count = excluded.silver_deposit_count,
      tree_count = excluded.tree_count,
      entity_count = excluded.entity_count,
      rules_valid = excluded.rules_valid,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(
    summary.id,
    summary.name,
    summary.author,
    summary.description,
    summary.version,
    summary.seed,
    summary.sizePreset,
    summary.width,
    summary.height,
    summary.spawnCount,
    summary.oreTotalCredits,
    summary.silverDepositCount,
    summary.treeCount,
    summary.entityCount,
    summary.rulesValid ? 1 : 0,
    JSON.stringify(validated),
    summary.updatedAt
  );

  try {
    const safeFile = `${summary.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.rtsmap.json`;
    fs.writeFileSync(
      path.join(getCustomMapsDir(), safeFile),
      JSON.stringify(validated, null, 2),
      "utf8"
    );
  } catch {
    // Ignore file write errors in read-only test environments
  }

  return summary;
}

function syncCustomMapsFromDisk(db: DatabaseSync): void {
  try {
    const dir = getCustomMapsDir();
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".rtsmap.json"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), "utf8");
        const parsed = CustomMapDocumentSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) continue;
        const existing = db
          .prepare("SELECT updated_at FROM custom_maps WHERE map_id = ?")
          .get(parsed.data.id) as { updated_at: string } | undefined;
        if (!existing || existing.updated_at < parsed.data.updatedAt) {
          saveCustomMapToStatement(db, parsed.data);
        }
      } catch {
        // Skip malformed file
      }
    }
  } catch {
    // Ignore directory read errors
  }
}

function getDb(): DatabaseSync {
  const dbPath = resolveDbPath();
  if (dbInstance && activeDbPath === dbPath) return dbInstance;
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

    CREATE TABLE IF NOT EXISTS custom_maps (
      map_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      author TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT NOT NULL,
      seed INTEGER NOT NULL,
      size_preset TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      spawn_count INTEGER NOT NULL,
      ore_total_credits INTEGER NOT NULL,
      silver_deposit_count INTEGER NOT NULL,
      tree_count INTEGER NOT NULL,
      entity_count INTEGER NOT NULL,
      rules_valid INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vector_variants_state (
      config_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

  syncCustomMapsFromDisk(db);

  const mapCountRow = db
    .prepare("SELECT COUNT(*) as cnt FROM custom_maps")
    .get() as { cnt: number } | undefined;

  if (!mapCountRow || mapCountRow.cnt === 0) {
    const starterMaps: CustomMapDocument[] = [
      createStarterCustomMapFromSeed({
        id: "official_tactical_160",
        name: "Bassin d'Héliopolis (160×160 — 4 Spawns)",
        author: "Lead System Architect",
        seed: 408291735,
        sizePreset: "TACTICAL_5X",
      }),
      createStarterCustomMapFromSeed({
        id: "official_skirmish_144",
        name: "Vallée du Tiberium (144×144 — Escarmouche)",
        author: "Lead System Architect",
        seed: 719384625,
        sizePreset: "SKIRMISH_4X",
      }),
      createStarterCustomMapFromSeed({
        id: "official_strategic_192",
        name: "Crêtes d'Arrakis Nord (192×192 — Stratégique)",
        author: "Lead System Architect",
        seed: 912847361,
        sizePreset: "STRATEGIC_7X",
      }),
    ];

    for (const m of starterMaps) {
      saveCustomMapToStatement(db, m);
    }
  }

  dbInstance = db;
  activeDbPath = dbPath;
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

export function upsertCustomMap(doc: CustomMapDocument): {
  map: CustomMapDocument;
  summary: CustomMapSummary;
} {
  const db = getDb();
  const validated = CustomMapDocumentSchema.parse({
    ...doc,
    updatedAt: new Date().toISOString(),
  });
  const summary = saveCustomMapToStatement(db, validated);
  return { map: validated, summary };
}

export function listCustomMaps(limit = 60): CustomMapSummary[] {
  const db = getDb();
  syncCustomMapsFromDisk(db);
  const rows = db
    .prepare(
      `SELECT map_id, name, author, description, version, seed, size_preset,
              width, height, spawn_count, ore_total_credits, silver_deposit_count,
              tree_count, entity_count, rules_valid, updated_at
       FROM custom_maps
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    map_id: string;
    name: string;
    author: string;
    description: string;
    version: string;
    seed: number;
    size_preset: string;
    width: number;
    height: number;
    spawn_count: number;
    ore_total_credits: number;
    silver_deposit_count: number;
    tree_count: number;
    entity_count: number;
    rules_valid: number;
    updated_at: string;
  }>;

  return rows.map((r) =>
    CustomMapSummarySchema.parse({
      id: r.map_id,
      name: r.name,
      author: r.author,
      description: r.description,
      version: r.version,
      seed: r.seed,
      sizePreset: r.size_preset,
      width: r.width,
      height: r.height,
      spawnCount: r.spawn_count,
      oreTotalCredits: r.ore_total_credits,
      silverDepositCount: r.silver_deposit_count,
      treeCount: r.tree_count,
      entityCount: r.entity_count,
      rulesValid: r.rules_valid === 1,
      updatedAt: r.updated_at,
    })
  );
}

export function getCustomMapById(mapId: string): CustomMapDocument | null {
  const db = getDb();
  syncCustomMapsFromDisk(db);
  const row = db
    .prepare("SELECT payload_json FROM custom_maps WHERE map_id = ?")
    .get(mapId) as { payload_json: string } | undefined;

  if (!row) return null;
  const parsed = JSON.parse(row.payload_json) as unknown;
  return CustomMapDocumentSchema.parse(parsed);
}

export function deleteCustomMapById(mapId: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM custom_maps WHERE map_id = ?").run(mapId);
  try {
    const safeFile = `${mapId.replace(/[^a-zA-Z0-9_-]/g, "_")}.rtsmap.json`;
    const filePath = path.join(getCustomMapsDir(), safeFile);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore file cleanup errors
  }
  return res.changes > 0;
}

function normalizeVectorVariantsStateCompleteness(state: VectorVariantsState): VectorVariantsState {
  const initial = createInitialVectorVariantsState();
  const mergedCatalog: Record<string, VectorVariantProposal[]> = { ...state.catalog };
  const mergedActive: Record<string, string> = {
    ...initial.activeVariants,
    ...state.activeVariants,
  };

  for (const descriptor of VECTOR_ASSET_ELEMENTS) {
    const key = descriptor.assetKey;
    const baseList = initial.catalog[key] ?? [];
    const baseById = new Map(baseList.map((bp) => [bp.variantId, bp]));
    const currentList = mergedCatalog[key] ?? [];
    const existingIds = new Set(currentList.map((p) => p.variantId));
    const combined = currentList.map((p) => baseById.get(p.variantId) ?? p);
    for (const bp of baseList) {
      if (!existingIds.has(bp.variantId)) {
        combined.push(bp);
      }
    }
    combined.sort((a, b) => a.versionNumber - b.versionNumber);
    mergedCatalog[key] = combined;
    if (
      !mergedActive[key] ||
      !combined.some((p) => p.variantId === mergedActive[key])
    ) {
      mergedActive[key] = combined[0]?.variantId ?? "v1_classic_mk1";
    }
  }

  return VectorVariantsStateSchema.parse({
    ...state,
    activeVariants: mergedActive,
    catalog: mergedCatalog,
  });
}

function readVectorVariantsStateFromDisk(): VectorVariantsState | null {
  try {
    const filePath = getVectorVariantsFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = VectorVariantsStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return normalizeVectorVariantsStateCompleteness(parsed.data);
  } catch {
    return null;
  }
}

export function saveVectorVariantsState(state: VectorVariantsState): VectorVariantsState {
  const db = getDb();
  const validated = normalizeVectorVariantsStateCompleteness(state);

  db.prepare(`
    INSERT INTO vector_variants_state (config_id, revision, payload_json, updated_at)
    VALUES ('global', ?, ?, ?)
    ON CONFLICT(config_id) DO UPDATE SET
      revision = excluded.revision,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(validated.revision, JSON.stringify(validated), validated.updatedAt);

  try {
    fs.writeFileSync(
      getVectorVariantsFilePath(),
      JSON.stringify(validated, null, 2),
      "utf8"
    );
  } catch {
    // Ignore disk write failure in read-only test environments
  }

  setActiveVectorVariantConfig(validated);
  return validated;
}

export function getVectorVariantsState(): VectorVariantsState {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM vector_variants_state WHERE config_id = 'global'")
    .get() as { payload_json: string } | undefined;

  let dbState: VectorVariantsState | null = null;
  if (row) {
    try {
      const parsed = VectorVariantsStateSchema.safeParse(JSON.parse(row.payload_json));
      if (parsed.success) {
        dbState = normalizeVectorVariantsStateCompleteness(parsed.data);
      }
    } catch {
      dbState = null;
    }
  }

  const diskState = readVectorVariantsStateFromDisk();

  if (dbState && diskState) {
    if (
      diskState.revision > dbState.revision ||
      (diskState.revision === dbState.revision && diskState.updatedAt > dbState.updatedAt)
    ) {
      return saveVectorVariantsState(diskState);
    }
    if (dbState.revision > diskState.revision) {
      return saveVectorVariantsState(dbState);
    }
    setActiveVectorVariantConfig(dbState);
    return dbState;
  }

  if (diskState) {
    return saveVectorVariantsState(diskState);
  }

  if (dbState) {
    return saveVectorVariantsState(dbState);
  }

  const initial = createInitialVectorVariantsState();
  return saveVectorVariantsState(initial);
}

export function mutateVectorVariantsState(rawRequest: VectorVariantsMutationRequest): {
  state: VectorVariantsState;
  newlyCreated: VectorVariantProposal[];
  summary: ReturnType<typeof summarizeVectorVariantsState>;
} {
  const req = VectorVariantsMutationRequestSchema.parse(rawRequest);
  const current = getVectorVariantsState();
  const now = new Date().toISOString();
  const newlyCreated: VectorVariantProposal[] = [];

  if (req.action === "SAVE_SELECTIONS") {
    const nextActive: Record<string, string> = { ...current.activeVariants };
    for (const [assetKey, variantId] of Object.entries(req.activeVariants)) {
      const list = current.catalog[assetKey] ?? [];
      if (list.some((p) => p.variantId === variantId)) {
        nextActive[assetKey] = variantId;
      }
    }
    const nextState = saveVectorVariantsState({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      activeVariants: nextActive,
    });
    return {
      state: nextState,
      newlyCreated,
      summary: summarizeVectorVariantsState(nextState),
    };
  }

  if (req.action === "SELECT_SINGLE_VARIANT") {
    const list = current.catalog[req.assetKey] ?? [];
    const exists = list.some((p) => p.variantId === req.variantId);
    if (!exists) {
      throw new Error(`Variante '${req.variantId}' introuvable pour '${req.assetKey}'.`);
    }
    const nextState = saveVectorVariantsState({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      activeVariants: {
        ...current.activeVariants,
        [req.assetKey]: req.variantId,
      },
    });
    return {
      state: nextState,
      newlyCreated,
      summary: summarizeVectorVariantsState(nextState),
    };
  }

  if (req.action === "RESET_TO_DEFAULT") {
    const nextActive: Record<string, string> = { ...current.activeVariants };
    const targets = VECTOR_ASSET_ELEMENTS.filter((el) => {
      if (req.targetScope === "ASSET") return el.assetKey === req.assetKey;
      if (req.targetScope === "CATEGORY") return el.category === req.category;
      return true;
    });
    for (const el of targets) {
      const firstId = current.catalog[el.assetKey]?.[0]?.variantId ?? "v1_classic_mk1";
      nextActive[el.assetKey] = firstId;
    }
    const nextState = saveVectorVariantsState({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      activeVariants: nextActive,
    });
    return {
      state: nextState,
      newlyCreated,
      summary: summarizeVectorVariantsState(nextState),
    };
  }

  // PROPOSE_NEW_VARIANTS
  const targets = VECTOR_ASSET_ELEMENTS.filter((el) => {
    if (req.targetScope === "ASSET") {
      return el.assetKey === (req.assetKey ?? "BUILDING:CONSTRUCTION_YARD");
    }
    if (req.targetScope === "CATEGORY") {
      return el.category === (req.category ?? "BUILDING");
    }
    return true;
  });

  const nextCatalog: Record<string, VectorVariantProposal[]> = { ...current.catalog };
  const nextActive: Record<string, string> = { ...current.activeVariants };

  for (const descriptor of targets) {
    const existingForAsset = [...(nextCatalog[descriptor.assetKey] ?? [])];
    const maxVersion = existingForAsset.reduce(
      (max, p) => (p.versionNumber > max ? p.versionNumber : max),
      4
    );

    const createdForDescriptor: VectorVariantProposal[] = [];
    for (let i = 0; i < req.count; i += 1) {
      const nextVersionNumber = maxVersion + 1 + i;
      const proposal = synthesizeNewLeonardoVariantProposal({
        descriptor,
        nextVersionNumber,
        styleArchetype: req.styleArchetype,
        directivePrompt: req.directivePrompt,
      });
      existingForAsset.push(proposal);
      createdForDescriptor.push(proposal);
      newlyCreated.push(proposal);
    }

    nextCatalog[descriptor.assetKey] = existingForAsset;

    if (req.autoSelectNewest && createdForDescriptor.length > 0) {
      nextActive[descriptor.assetKey] =
        createdForDescriptor[createdForDescriptor.length - 1]!.variantId;
    }
  }

  const nextState = saveVectorVariantsState({
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    activeVariants: nextActive,
    catalog: nextCatalog,
  });

  return {
    state: nextState,
    newlyCreated,
    summary: summarizeVectorVariantsState(nextState),
  };
}
