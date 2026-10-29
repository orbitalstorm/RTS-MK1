"use client";

import { create } from "zustand";
import {
  BUILDINGS,
  interpolateEntityPose,
  isRepeatableBuildingKind,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  type BuildingKind,
  type FactionId,
  type ProductionCategory,
  type UnitKind,
} from "../shared/constants";
import type { ClientMessage } from "../shared/schemas/commands";
import type {
  AcousticEvent,
  EntityState,
  FullSnapshot,
  PlayerEconomyDelta,
  ProjectileVisual,
  TickDelta,
  VisualEffectEvent,
} from "../shared/schemas/deltas";
import { ServerMessageSchema, type ServerMutexOverview } from "../shared/schemas/lobby";

export interface RtsGameStoreState {
  // Identity
  playerId: string;
  commanderName: string;
  faction: FactionId;

  // WebSocket & Mutex Overview
  wsConnected: boolean;
  lastError: string | null;
  overview: ServerMutexOverview;
  currentLobbyId: string | null;

  // Simulation state (synchronized via FullSnapshot + 20Hz TickDeltas)
  tickId: number;
  mapSeed: number;
  lastTickReceivedAt: number;
  tickDurationMs: number;
  terrainGrid: number[];
  oreGrid: number[];
  prevEntities: Map<string, EntityState>;
  currEntities: Map<string, EntityState>;
  playersEconomy: Map<string, PlayerEconomyDelta>;
  exploredByPlayer: Map<string, Set<number>>;
  visibleByPlayer: Map<string, Set<number>>;
  recentProjectiles: ProjectileVisual[];
  pendingAcousticEvents: AcousticEvent[];
  pendingVisualEffects: VisualEffectEvent[];
  winnerPlayerId: string | null;

  // Memoized HUD Reactive Selectors (updated only when HUD-visible values change)
  hudRevision: number;
  ownedBuildingsKey: string;
  lastHudEconomySig: string;

  // Tactical UI Selection & Modes
  selectedEntityIds: Set<string>;
  placementBuilding: { category: "BUILDING" | "DEFENSE"; kind: BuildingKind } | null;
  sellMode: boolean;
  repairMode: boolean;
  forceAttackMode: boolean;
  audioMuted: boolean;
  evaBannerText: string;

  // Actions
  setCommanderIdentity: (playerId: string, commanderName: string, faction: FactionId) => void;
  connectWebSocket: () => void;
  sendMessage: (msg: ClientMessage) => void;
  setSelectedEntities: (ids: Set<string>) => void;
  setPlacementBuilding: (b: { category: "BUILDING" | "DEFENSE"; kind: BuildingKind } | null) => void;
  setSellMode: (enabled: boolean) => void;
  setRepairMode: (enabled: boolean) => void;
  setForceAttackMode: (enabled: boolean) => void;
  setAudioMuted: (muted: boolean) => void;
  consumeAcousticEvents: () => AcousticEvent[];
  consumeVisualEffects: () => VisualEffectEvent[];
  triggerProduction: (category: ProductionCategory, itemKind: BuildingKind | UnitKind) => void;
  ingestServerSnapshot: (snap: FullSnapshot) => void;
  ingestServerDelta: (delta: TickDelta) => void;
}

let activeSocket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshotRequestAt = 0;

function computeOwnedBuildingsKey(
  entities: ReadonlyMap<string, EntityState>,
  playerId: string
): string {
  const kinds = new Set<string>();
  for (const ent of entities.values()) {
    if (
      ent.ownerId === playerId &&
      ent.entityType === "BUILDING" &&
      (ent.buildProgress ?? 1) >= 1
    ) {
      kinds.add(ent.kind);
    }
  }
  return Array.from(kinds).sort().join(",");
}

function computeHudEconomySignature(econ: PlayerEconomyDelta | undefined): string {
  if (!econ) return "none";
  let qSig = "";
  for (const q of econ.queues) {
    const pctInt = Math.round(q.progressRatio * 100);
    qSig += `${q.category}:${q.activeItem ?? "-"}:${pctInt}:${q.readyToPlace ? 1 : 0}|`;
  }
  return `${econ.faction}:${econ.credits}:${econ.silverOre ?? 0}:${econ.maxStorage}:${econ.powerProduced}:${econ.powerConsumed}:${econ.lowPower ? 1 : 0}:${econ.radarActive ? 1 : 0}:${econ.defeated ? 1 : 0}:${qSig}`;
}

function isFastTickDeltaPayload(raw: unknown): raw is TickDelta {
  if (typeof raw !== "object" || raw === null) return false;
  const candidate = raw as Partial<TickDelta>;
  return (
    candidate.type === "SIM_DELTA" &&
    typeof candidate.lobbyId === "string" &&
    typeof candidate.tickId === "number" &&
    typeof candidate.prevTickId === "number" &&
    Array.isArray(candidate.created) &&
    Array.isArray(candidate.updated) &&
    Array.isArray(candidate.destroyedIds) &&
    Array.isArray(candidate.players) &&
    Array.isArray(candidate.fogByPlayer)
  );
}

function resolveWsUrl(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1:4301/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${proto}//${window.location.hostname}:4301/ws`;
  }
  return `${proto}//${window.location.host}/ws`;
}

export const useRtsGameStore = create<RtsGameStoreState>((set, get) => ({
  playerId: "cmd_alpha",
  commanderName: "Commandant Alpha",
  faction: "GDI",

  wsConnected: false,
  lastError: null,
  overview: {
    activeLobbyId: null,
    activeLobbyName: null,
    activeStatus: "FREE",
    queuedLobbyIds: [],
    lobbies: [],
    serverTime: Date.now(),
  },
  currentLobbyId: null,

  tickId: 0,
  mapSeed: 0,
  lastTickReceivedAt: 0,
  tickDurationMs: 50,
  terrainGrid: new Array<number>(MAP_WIDTH_TILES * MAP_HEIGHT_TILES).fill(0),
  oreGrid: new Array<number>(MAP_WIDTH_TILES * MAP_HEIGHT_TILES).fill(0),
  prevEntities: new Map(),
  currEntities: new Map(),
  playersEconomy: new Map(),
  exploredByPlayer: new Map(),
  visibleByPlayer: new Map(),
  recentProjectiles: [],
  pendingAcousticEvents: [],
  pendingVisualEffects: [],
  winnerPlayerId: null,

  hudRevision: 0,
  ownedBuildingsKey: "",
  lastHudEconomySig: "none",

  selectedEntityIds: new Set(),
  placementBuilding: null,
  sellMode: false,
  repairMode: false,
  forceAttackMode: false,
  audioMuted: false,
  evaBannerText: "LIAISON TACTIQUE EVA PRÊTE",

  setCommanderIdentity: (playerId, commanderName, faction) => {
    set({ playerId, commanderName, faction });
  },

  connectWebSocket: () => {
    if (typeof window === "undefined") return;
    if (
      activeSocket &&
      (activeSocket.readyState === WebSocket.OPEN || activeSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = new WebSocket(resolveWsUrl());
    activeSocket = ws;

    ws.onopen = () => {
      set({ wsConnected: true, lastError: null });
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        const st = get();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "CLIENT_PING",
              playerId: st.playerId,
              timestamp: Date.now(),
            } satisfies ClientMessage)
          );
        }
      }, 5000);
    };

    ws.onmessage = (ev) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(ev.data));
      } catch {
        return;
      }

      // Fast path for 20 Hz SIM_DELTA messages to avoid thousands of per-tick Zod array item allocations
      if (isFastTickDeltaPayload(raw)) {
        applyDelta(set, get, raw);
        return;
      }

      const parsed = ServerMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;

      if (msg.type === "LOBBY_OVERVIEW") {
        set({ overview: msg.overview });
        return;
      }

      if (msg.type === "LOBBY_JOINED") {
        set({ currentLobbyId: msg.lobbyId, overview: msg.overview });
        return;
      }

      if (msg.type === "ERROR") {
        set({ lastError: msg.message, evaBannerText: `ALERTE : ${msg.message}` });
        return;
      }

      if (msg.type === "SIM_SNAPSHOT") {
        applySnapshot(set, get, msg);
        return;
      }

      if (msg.type === "SIM_DELTA") {
        applyDelta(set, get, msg);
      }
    };

    ws.onclose = () => {
      set({ wsConnected: false });
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      activeSocket = null;
    };
  },

  sendMessage: (msg) => {
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      activeSocket.send(JSON.stringify(msg));
    }
  },

  setSelectedEntities: (ids) => set({ selectedEntityIds: ids }),
  setPlacementBuilding: (b) =>
    set({
      placementBuilding: b,
      sellMode: false,
      repairMode: false,
      forceAttackMode: false,
      evaBannerText: b
        ? b.kind === "SILVER_MINE"
          ? "EVA : PATRON SÉLECTIONNÉ (MINE D'ARGENT) — PLACEZ L'EMPREINTE SUR UN ROCHER ARGENTÉ 2×2"
          : isRepeatableBuildingKind(b.kind)
            ? `EVA : POSE CONTINUE (${BUILDINGS[b.kind].name.toUpperCase()}) — CLIQUEZ SUR LA CARTE POUR POSER`
            : `EVA : PATRON SÉLECTIONNÉ (${BUILDINGS[b.kind].name.toUpperCase()}) — PLACEZ L'EMPREINTE SUR UNE DALLE EN BÉTON`
        : "LIAISON TACTIQUE EVA PRÊTE",
    }),
  setSellMode: (enabled) =>
    set({
      sellMode: enabled,
      placementBuilding: null,
      repairMode: false,
      forceAttackMode: false,
    }),
  setRepairMode: (enabled) =>
    set({
      repairMode: enabled,
      placementBuilding: null,
      sellMode: false,
      forceAttackMode: false,
    }),
  setForceAttackMode: (enabled) =>
    set({
      forceAttackMode: enabled,
      placementBuilding: null,
      sellMode: false,
      repairMode: false,
    }),
  setAudioMuted: (muted) => set({ audioMuted: muted }),

  consumeAcousticEvents: () => {
    const queue = get().pendingAcousticEvents;
    if (queue.length === 0) return [];
    return queue.splice(0, queue.length);
  },

  consumeVisualEffects: () => {
    const queue = get().pendingVisualEffects;
    if (queue.length === 0) return [];
    return queue.splice(0, queue.length);
  },

  triggerProduction: (category, itemKind) => {
    const st = get();
    if (!st.currentLobbyId) return;
    st.sendMessage({
      type: "COMMAND_START_PRODUCTION",
      lobbyId: st.currentLobbyId,
      playerId: st.playerId,
      category,
      itemKind,
    });
  },
  ingestServerSnapshot: (snap) => applySnapshot(set, get, snap),
  ingestServerDelta: (delta) => applyDelta(set, get, delta),
}));

function applySnapshot(
  set: (partial: Partial<RtsGameStoreState>) => void,
  get: () => RtsGameStoreState,
  snap: FullSnapshot
): void {
  const st = get();
  const entitiesMap = new Map<string, EntityState>();
  for (const e of snap.entities) {
    entitiesMap.set(e.id, e);
  }
  const playersMap = new Map<string, PlayerEconomyDelta>();
  for (const p of snap.players) {
    playersMap.set(p.playerId, p);
  }
  const exploredMap = new Map<string, Set<number>>();
  for (const [pid, arr] of Object.entries(snap.exploredByPlayer)) {
    exploredMap.set(pid, new Set(arr));
  }
  const visibleMap = new Map<string, Set<number>>();
  for (const [pid, arr] of Object.entries(snap.visibleByPlayer)) {
    visibleMap.set(pid, new Set(arr));
  }

  const ownedBuildingsKey = computeOwnedBuildingsKey(entitiesMap, st.playerId);
  const lastHudEconomySig = computeHudEconomySignature(playersMap.get(st.playerId));

  set({
    currentLobbyId: snap.lobbyId,
    tickId: snap.tickId,
    mapSeed: snap.mapSeed,
    lastTickReceivedAt: performance.now(),
    tickDurationMs: 50,
    terrainGrid: [...snap.terrainGrid],
    oreGrid: [...snap.oreGrid],
    prevEntities: new Map(entitiesMap),
    currEntities: entitiesMap,
    playersEconomy: playersMap,
    exploredByPlayer: exploredMap,
    visibleByPlayer: visibleMap,
    pendingAcousticEvents: [],
    pendingVisualEffects: [],
    winnerPlayerId: snap.winnerPlayerId,
    hudRevision: st.hudRevision + 1,
    ownedBuildingsKey,
    lastHudEconomySig,
    evaBannerText: `SYNCHRONISATION SNAPSHOT COMPLÈTE — SEED CARTE #${snap.mapSeed} (${snap.mapWidth}×${snap.mapHeight})`,
  });
}

function applyDelta(
  set: (partial: Partial<RtsGameStoreState>) => void,
  get: () => RtsGameStoreState,
  delta: TickDelta
): void {
  const st = get();
  const now = performance.now();

  // State Drift detection: if tickId jumped, request a Full Snapshot with a 1s cooldown guard
  if (st.tickId > 0 && delta.prevTickId !== st.tickId) {
    if (now - lastSnapshotRequestAt >= 1000) {
      lastSnapshotRequestAt = now;
      st.sendMessage({
        type: "REQUEST_SNAPSHOT",
        lobbyId: delta.lobbyId,
        playerId: st.playerId,
        lastTickId: st.tickId,
      });
    }
    return;
  }

  // Capture exact C0-continuous interpolated visual pose at `now` into `prevEntities`
  // before applying `delta.updated` to `currEntities`, eliminating packet-jitter spatial jumps.
  const prevAlpha =
    st.lastTickReceivedAt > 0
      ? Math.max(0, Math.min(1, (now - st.lastTickReceivedAt) / Math.max(40, st.tickDurationMs)))
      : 1;

  const prevEntities = st.prevEntities;
  const currEntities = st.currEntities;

  for (const [id, currEnt] of currEntities.entries()) {
    const prevEnt = prevEntities.get(id);
    if (
      prevEnt &&
      prevAlpha < 0.999 &&
      (prevEnt.x !== currEnt.x ||
        prevEnt.y !== currEnt.y ||
        prevEnt.angleIndex !== currEnt.angleIndex ||
        prevEnt.turretAngleIndex !== currEnt.turretAngleIndex)
    ) {
      const pose = interpolateEntityPose(prevEnt, currEnt, prevAlpha);
      prevEntities.set(id, {
        ...currEnt,
        x: pose.x,
        y: pose.y,
        angleIndex: pose.angleIndex,
        turretAngleIndex: pose.turretAngleIndex,
      });
    } else {
      prevEntities.set(id, currEnt);
    }
  }

  for (const created of delta.created) {
    currEntities.set(created.id, created);
    prevEntities.set(created.id, created);
  }
  for (const updated of delta.updated) {
    currEntities.set(updated.id, updated);
  }
  for (const deadId of delta.destroyedIds) {
    currEntities.delete(deadId);
    prevEntities.delete(deadId);
  }

  if (delta.oreUpdates.length > 0) {
    for (const u of delta.oreUpdates) {
      const idx = u.tileY * MAP_WIDTH_TILES + u.tileX;
      st.oreGrid[idx] = u.oreAmount;
      if (u.oreAmount === 0 && st.terrainGrid[idx] === 3) {
        st.terrainGrid[idx] = 0;
      }
    }
  }

  if (delta.terrainUpdates && delta.terrainUpdates.length > 0) {
    for (const t of delta.terrainUpdates) {
      const idx = t.tileY * MAP_WIDTH_TILES + t.tileX;
      st.terrainGrid[idx] = t.terrainKind;
    }
  }

  const prevMyEcon = st.playersEconomy.get(st.playerId);
  for (const p of delta.players) {
    st.playersEconomy.set(p.playerId, p);
  }

  // Update local player's Fog of War Sets in-place (zero Set cloning allocations per tick)
  for (const f of delta.fogByPlayer) {
    if (f.playerId !== st.playerId) continue;
    let exploredSet = st.exploredByPlayer.get(f.playerId);
    if (!exploredSet) {
      exploredSet = new Set<number>();
      st.exploredByPlayer.set(f.playerId, exploredSet);
    }
    for (const idx of f.newlyExploredIndices) {
      exploredSet.add(idx);
    }

    let visibleSet = st.visibleByPlayer.get(f.playerId);
    if (!visibleSet) {
      visibleSet = new Set<number>();
      st.visibleByPlayer.set(f.playerId, visibleSet);
    } else {
      visibleSet.clear();
    }
    for (const idx of f.visibleIndices) {
      visibleSet.add(idx);
    }
  }

  let evaBannerText = st.evaBannerText;
  let placementBuilding = st.placementBuilding;
  const myEcon = st.playersEconomy.get(st.playerId);

  if (myEcon) {
    for (const cat of ["BUILDING", "DEFENSE"] as const) {
      const slot = myEcon.queues.find((q) => q.category === cat);
      const prevSlot = prevMyEcon?.queues.find((q) => q.category === cat);
      if (
        slot?.readyToPlace &&
        slot.activeItem &&
        !prevSlot?.readyToPlace &&
        !placementBuilding
      ) {
        placementBuilding = {
          category: cat,
          kind: slot.activeItem as BuildingKind,
        };
      }
      // Only auto-clear placementBuilding if it came from a completed queue slot that just transitioned from readyToPlace -> false.
      // Never wipe out direct blueprint placement tools selected by the player ("Poser le Patron").
      if (
        placementBuilding?.category === cat &&
        !isRepeatableBuildingKind(placementBuilding.kind) &&
        prevSlot?.readyToPlace &&
        prevSlot.activeItem === placementBuilding.kind &&
        !slot?.readyToPlace
      ) {
        placementBuilding = null;
      }
    }
  }

  for (const ev of delta.acousticEvents) {
    if (ev.targetPlayerId && ev.targetPlayerId !== st.playerId) continue;
    if (ev.soundKind === "EVA_CONSTRUCTION_COMPLETE") {
      evaBannerText = "EVA : CONSTRUCTION TERMINÉE — PRÊT À DÉPLOYER";
    } else if (ev.soundKind === "EVA_BUILDING_DEPLOYED") {
      evaBannerText = "EVA : STRUCTURE DÉPLOYÉE SUR LA GRILLE";
    } else if (ev.soundKind === "EVA_LOW_POWER") {
      evaBannerText = "EVA : ÉNERGIE FAIBLE — PRODUCTION RALENTIE & RADAR COUPÉ";
    } else if (ev.soundKind === "EVA_SILOS_NEEDED") {
      evaBannerText = "EVA : SILOS NÉCESSAIRES — CAPACITÉ MAXIMALE ATTEINTE";
    } else if (ev.soundKind === "EVA_BASE_UNDER_ATTACK") {
      evaBannerText = "EVA : ALERTE ! NOTRE BASE EST ATTAQUÉE !";
    } else if (ev.soundKind === "EVA_UNIT_READY") {
      evaBannerText = "EVA : UNITÉ PRÊTE AU COMBAT";
    } else if (ev.soundKind === "EVA_UNIT_LOST") {
      evaBannerText = "EVA : UNITÉ PERDUE";
    }
  }

  if (delta.acousticEvents.length > 0) {
    st.pendingAcousticEvents.push(...delta.acousticEvents);
    if (st.pendingAcousticEvents.length > 128) {
      st.pendingAcousticEvents.splice(0, st.pendingAcousticEvents.length - 128);
    }
  }
  if (delta.visualEffects.length > 0) {
    st.pendingVisualEffects.push(...delta.visualEffects);
    if (st.pendingVisualEffects.length > 128) {
      st.pendingVisualEffects.splice(0, st.pendingVisualEffects.length - 128);
    }
  }

  const measuredDt = st.lastTickReceivedAt > 0 ? now - st.lastTickReceivedAt : 50;
  const clampedDt = Math.max(40, Math.min(75, measuredDt));
  const tickDurationMs = st.tickDurationMs * 0.8 + clampedDt * 0.2;

  // Mutate high-frequency simulation fields in-place so the 60 FPS Canvas RAF loop reads them with zero React overhead
  st.tickId = delta.tickId;
  st.lastTickReceivedAt = now;
  st.tickDurationMs = tickDurationMs;
  st.recentProjectiles = delta.projectiles;

  const ownedBuildingsKey =
    delta.created.length > 0 || delta.destroyedIds.length > 0
      ? computeOwnedBuildingsKey(currEntities, st.playerId)
      : st.ownedBuildingsKey;
  const nextHudEconSig = computeHudEconomySignature(myEcon);

  const hudChanged =
    ownedBuildingsKey !== st.ownedBuildingsKey ||
    nextHudEconSig !== st.lastHudEconomySig ||
    evaBannerText !== st.evaBannerText ||
    placementBuilding !== st.placementBuilding ||
    delta.winnerPlayerId !== st.winnerPlayerId;

  if (hudChanged) {
    set({
      hudRevision: st.hudRevision + 1,
      ownedBuildingsKey,
      lastHudEconomySig: nextHudEconSig,
      winnerPlayerId: delta.winnerPlayerId,
      placementBuilding,
      evaBannerText,
    });
  }
}
