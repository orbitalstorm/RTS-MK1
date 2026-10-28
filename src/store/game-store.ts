"use client";

import { create } from "zustand";
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES, type BuildingKind, type FactionId, type ProductionCategory, type UnitKind } from "../shared/constants";
import type { ClientMessage } from "../shared/schemas/commands";
import type {
  AcousticEvent,
  EntityState,
  FullSnapshot,
  PlayerEconomyDelta,
  ProjectileVisual,
  TickDelta,
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
  lastTickReceivedAt: number;
  terrainGrid: number[];
  oreGrid: number[];
  prevEntities: Map<string, EntityState>;
  currEntities: Map<string, EntityState>;
  playersEconomy: Map<string, PlayerEconomyDelta>;
  exploredByPlayer: Map<string, Set<number>>;
  visibleByPlayer: Map<string, Set<number>>;
  recentProjectiles: ProjectileVisual[];
  pendingAcousticEvents: AcousticEvent[];
  winnerPlayerId: string | null;

  // Tactical UI Selection & Modes
  selectedEntityIds: Set<string>;
  placementBuilding: { category: "BUILDING" | "DEFENSE"; kind: BuildingKind } | null;
  sellMode: boolean;
  audioMuted: boolean;
  evaBannerText: string;

  // Actions
  setCommanderIdentity: (playerId: string, commanderName: string, faction: FactionId) => void;
  connectWebSocket: () => void;
  sendMessage: (msg: ClientMessage) => void;
  setSelectedEntities: (ids: Set<string>) => void;
  setPlacementBuilding: (b: { category: "BUILDING" | "DEFENSE"; kind: BuildingKind } | null) => void;
  setSellMode: (enabled: boolean) => void;
  setAudioMuted: (muted: boolean) => void;
  consumeAcousticEvents: () => AcousticEvent[];
  triggerProduction: (category: ProductionCategory, itemKind: BuildingKind | UnitKind) => void;
}

let activeSocket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

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
  lastTickReceivedAt: 0,
  terrainGrid: new Array<number>(MAP_WIDTH_TILES * MAP_HEIGHT_TILES).fill(0),
  oreGrid: new Array<number>(MAP_WIDTH_TILES * MAP_HEIGHT_TILES).fill(0),
  prevEntities: new Map(),
  currEntities: new Map(),
  playersEconomy: new Map(),
  exploredByPlayer: new Map(),
  visibleByPlayer: new Map(),
  recentProjectiles: [],
  pendingAcousticEvents: [],
  winnerPlayerId: null,

  selectedEntityIds: new Set(),
  placementBuilding: null,
  sellMode: false,
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
        applySnapshot(set, msg);
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
  setPlacementBuilding: (b) => set({ placementBuilding: b, sellMode: false }),
  setSellMode: (enabled) => set({ sellMode: enabled, placementBuilding: null }),
  setAudioMuted: (muted) => set({ audioMuted: muted }),

  consumeAcousticEvents: () => {
    const events = get().pendingAcousticEvents;
    if (events.length > 0) {
      set({ pendingAcousticEvents: [] });
    }
    return events;
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
}));

function applySnapshot(
  set: (partial: Partial<RtsGameStoreState>) => void,
  snap: FullSnapshot
): void {
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

  set({
    currentLobbyId: snap.lobbyId,
    tickId: snap.tickId,
    lastTickReceivedAt: performance.now(),
    terrainGrid: snap.terrainGrid,
    oreGrid: snap.oreGrid,
    prevEntities: new Map(entitiesMap),
    currEntities: entitiesMap,
    playersEconomy: playersMap,
    exploredByPlayer: exploredMap,
    visibleByPlayer: visibleMap,
    winnerPlayerId: snap.winnerPlayerId,
    evaBannerText: "SYNCHRONISATION SNAPSHOT COMPLÈTE",
  });
}

function applyDelta(
  set: (partial: Partial<RtsGameStoreState>) => void,
  get: () => RtsGameStoreState,
  delta: TickDelta
): void {
  const st = get();

  // State Drift detection: if tickId jumped, automatically request a Full Snapshot from server
  if (st.tickId > 0 && delta.prevTickId !== st.tickId) {
    st.sendMessage({
      type: "REQUEST_SNAPSHOT",
      lobbyId: delta.lobbyId,
      playerId: st.playerId,
      lastTickId: st.tickId,
    });
    return;
  }

  const prevEntities = new Map(st.currEntities);
  const currEntities = new Map(st.currEntities);

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

  let oreGrid = st.oreGrid;
  let terrainGrid = st.terrainGrid;
  if (delta.oreUpdates.length > 0) {
    oreGrid = [...st.oreGrid];
    terrainGrid = [...st.terrainGrid];
    for (const u of delta.oreUpdates) {
      const idx = u.tileY * MAP_WIDTH_TILES + u.tileX;
      oreGrid[idx] = u.oreAmount;
      if (u.oreAmount === 0 && terrainGrid[idx] === 3) {
        terrainGrid[idx] = 0;
      }
    }
  }

  const playersEconomy = new Map<string, PlayerEconomyDelta>();
  for (const p of delta.players) {
    playersEconomy.set(p.playerId, p);
  }

  const exploredByPlayer = new Map(st.exploredByPlayer);
  const visibleByPlayer = new Map<string, Set<number>>();
  for (const f of delta.fogByPlayer) {
    const existingExplored = new Set(exploredByPlayer.get(f.playerId) ?? []);
    for (const idx of f.newlyExploredIndices) {
      existingExplored.add(idx);
    }
    exploredByPlayer.set(f.playerId, existingExplored);
    visibleByPlayer.set(f.playerId, new Set(f.visibleIndices));
  }

  let evaBannerText = st.evaBannerText;
  for (const ev of delta.acousticEvents) {
    if (ev.targetPlayerId && ev.targetPlayerId !== st.playerId) continue;
    if (ev.soundKind === "EVA_CONSTRUCTION_COMPLETE") {
      evaBannerText = "EVA : CONSTRUCTION TERMINÉE — PRÊT À DÉPLOYER";
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

  set({
    tickId: delta.tickId,
    lastTickReceivedAt: performance.now(),
    prevEntities,
    currEntities,
    oreGrid,
    terrainGrid,
    playersEconomy,
    exploredByPlayer,
    visibleByPlayer,
    recentProjectiles: delta.projectiles,
    pendingAcousticEvents: [...st.pendingAcousticEvents, ...delta.acousticEvents],
    winnerPlayerId: delta.winnerPlayerId,
    evaBannerText,
  });
}
