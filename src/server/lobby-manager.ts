import { RtsSimulation } from "../engine/simulation";
import {
  generateRandomMapSeed,
  normalizeMapSeed,
  WATCHDOG_DISCONNECT_TIMEOUT_MS,
  type FactionId,
} from "../shared/constants";
import {
  ServerMutexOverviewSchema,
  type LobbyChatEntry,
  type LobbyPlayer,
  type LobbyStatus,
  type LobbySummary,
  type ServerMutexOverview,
} from "../shared/schemas/lobby";
import type { FullSnapshot, TickDelta } from "../shared/schemas/deltas";
import { recordMatchOutcome, recordMatchSeedLog } from "./db";

export interface ManagedLobby {
  lobbyId: string;
  name: string;
  hostPlayerId: string;
  mapSeed: number;
  status: LobbyStatus;
  players: LobbyPlayer[];
  maxPlayers: number;
  createdAt: number;
  startedAt: number | null;
  winnerPlayerId: string | null;
  chat: LobbyChatEntry[];
  simulation: RtsSimulation | null;
  lastHumanHeartbeatAt: number;
}

/**
 * Authoritative Lobby Manager & Single Active Match Mutex.
 * Guarantees at most ONE lobby is in STARTING or IN_PROGRESS at any time.
 * Additional lobbies requesting start are placed in an ordered FIFO queue (QUEUED).
 * Includes an independent Watchdog check releasing the mutex after 60s of total human inactivity.
 */
export class LobbyManager {
  private readonly lobbies: Map<string, ManagedLobby> = new Map();
  private activeLobbyId: string | null = null;
  private readonly queuedLobbyIds: string[] = [];
  private nextLobbySeq = 1;

  public getActiveLobbyId(): string | null {
    return this.activeLobbyId;
  }

  public getActiveLobby(): ManagedLobby | null {
    if (!this.activeLobbyId) return null;
    return this.lobbies.get(this.activeLobbyId) ?? null;
  }

  public getLobby(lobbyId: string): ManagedLobby | null {
    return this.lobbies.get(lobbyId) ?? null;
  }

  public createLobby(params: {
    playerId: string;
    commanderName: string;
    faction: FactionId;
    lobbyName: string;
    withAiBot: boolean;
    mapSeed?: number;
    nowMs?: number;
  }): ManagedLobby {
    const now = params.nowMs ?? Date.now();
    const lobbyId = `sector_${this.nextLobbySeq++}_${now.toString(36).slice(-4)}`;
    const mapSeed =
      params.mapSeed !== undefined
        ? normalizeMapSeed(params.mapSeed)
        : generateRandomMapSeed(now + this.nextLobbySeq * 7919);

    const players: LobbyPlayer[] = [
      {
        playerId: params.playerId,
        commanderName: params.commanderName,
        faction: params.faction,
        isAi: false,
        connected: true,
      },
    ];

    if (params.withAiBot) {
      const aiFaction: FactionId =
        params.faction === "GDI" ? "NOD" : params.faction === "NOD" ? "ORDOS" : "GDI";
      players.push({
        playerId: `ai_${lobbyId}`,
        commanderName: `IA Tactique (${aiFaction})`,
        faction: aiFaction,
        isAi: true,
        connected: true,
      });
    }

    const lobby: ManagedLobby = {
      lobbyId,
      name: params.lobbyName.trim() || `Opération ${lobbyId.toUpperCase()}`,
      hostPlayerId: params.playerId,
      mapSeed,
      status: "WAITING",
      players,
      maxPlayers: 4,
      createdAt: now,
      startedAt: null,
      winnerPlayerId: null,
      chat: [
        {
          id: `msg_${now}`,
          commanderName: "EVA CENTRAL",
          message: `Salon "${params.lobbyName}" initialisé (Seed carte #${mapSeed}). Verrou serveur prêt.`,
          timestamp: now,
        },
      ],
      simulation: null,
      lastHumanHeartbeatAt: now,
    };

    this.lobbies.set(lobbyId, lobby);
    return lobby;
  }

  public joinLobby(params: {
    lobbyId: string;
    playerId: string;
    commanderName: string;
    faction: FactionId;
    nowMs?: number;
  }): ManagedLobby | null {
    const lobby = this.lobbies.get(params.lobbyId);
    if (!lobby) return null;
    const now = params.nowMs ?? Date.now();
    lobby.lastHumanHeartbeatAt = now;

    const existing = lobby.players.find((p) => p.playerId === params.playerId);
    if (existing) {
      existing.connected = true;
      existing.commanderName = params.commanderName;
      return lobby;
    }

    if (lobby.status !== "WAITING" && lobby.status !== "QUEUED") {
      return lobby;
    }

    // If a second human joins a lobby that had an AI placeholder and is full, replace AI or add slot
    if (lobby.players.length >= lobby.maxPlayers) {
      const aiIdx = lobby.players.findIndex((p) => p.isAi);
      if (aiIdx !== -1) {
        lobby.players.splice(aiIdx, 1);
      } else {
        return lobby;
      }
    }

    lobby.players.push({
      playerId: params.playerId,
      commanderName: params.commanderName,
      faction: params.faction,
      isAi: false,
      connected: true,
    });

    lobby.chat.push({
      id: `msg_${now}_${params.playerId}`,
      commanderName: "EVA CENTRAL",
      message: `Le commandant ${params.commanderName} (${params.faction}) a rejoint le salon.`,
      timestamp: now,
    });

    return lobby;
  }

  public setPlayerFaction(lobbyId: string, playerId: string, faction: FactionId): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || (lobby.status !== "WAITING" && lobby.status !== "QUEUED")) return false;
    const player = lobby.players.find((p) => p.playerId === playerId && !p.isAi);
    if (!player) return false;
    player.faction = faction;
    return true;
  }

  public addChatMessage(
    lobbyId: string,
    commanderName: string,
    message: string,
    nowMs = Date.now()
  ): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    lobby.lastHumanHeartbeatAt = nowMs;
    lobby.chat.push({
      id: `chat_${nowMs}_${lobby.chat.length}`,
      commanderName,
      message,
      timestamp: nowMs,
    });
    if (lobby.chat.length > 50) {
      lobby.chat.shift();
    }
  }

  /**
   * Attempts to launch a match for `lobbyId`.
   * - If the Single Active Match Mutex is FREE, acquires it immediately and transitions to IN_PROGRESS.
   * - If another lobby currently holds the mutex, places `lobbyId` into the ordered QUEUED FIFO list.
   */
  public requestStartMatch(
    lobbyId: string,
    requestingPlayerId: string,
    nowMs = Date.now()
  ): { startedImmediately: boolean; queuePosition: number | null; error?: string } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return { startedImmediately: false, queuePosition: null, error: "Salon introuvable." };
    }
    if (lobby.status === "IN_PROGRESS" || lobby.status === "STARTING") {
      return { startedImmediately: true, queuePosition: null };
    }
    if (lobby.status === "FINISHED") {
      return { startedImmediately: false, queuePosition: null, error: "Cette partie est déjà terminée." };
    }

    // Ensure at least 2 participants (if 1 human alone, auto-attach tactical AI opponent)
    if (lobby.players.length < 2) {
      const human = lobby.players[0];
      const aiFaction: FactionId =
        human?.faction === "GDI" ? "NOD" : human?.faction === "NOD" ? "ORDOS" : "GDI";
      lobby.players.push({
        playerId: `ai_${lobby.lobbyId}`,
        commanderName: `IA Tactique (${aiFaction})`,
        faction: aiFaction,
        isAi: true,
        connected: true,
      });
    }

    lobby.lastHumanHeartbeatAt = nowMs;

    // Atomic check of the Single Active Match Mutex
    if (this.activeLobbyId === null || this.activeLobbyId === lobbyId) {
      this.activateLobbyMatch(lobby, nowMs);
      return { startedImmediately: true, queuePosition: null };
    }

    // Mutex is held by another match -> enqueue in FIFO order
    if (!this.queuedLobbyIds.includes(lobbyId)) {
      this.queuedLobbyIds.push(lobbyId);
    }
    lobby.status = "QUEUED";
    const queuePosition = this.queuedLobbyIds.indexOf(lobbyId) + 1;
    lobby.chat.push({
      id: `queue_${nowMs}`,
      commanderName: "MUTEX SERVEUR",
      message: `Serveur occupé par le salon actif (${this.activeLobbyId}). Salon placé en file d'attente (Position #${queuePosition}).`,
      timestamp: nowMs,
    });
    return { startedImmediately: false, queuePosition };
  }

  private activateLobbyMatch(lobby: ManagedLobby, nowMs: number): void {
    const qIdx = this.queuedLobbyIds.indexOf(lobby.lobbyId);
    if (qIdx !== -1) {
      this.queuedLobbyIds.splice(qIdx, 1);
    }

    this.activeLobbyId = lobby.lobbyId;
    lobby.status = "STARTING";
    lobby.startedAt = nowMs;
    lobby.lastHumanHeartbeatAt = nowMs;
    lobby.simulation = new RtsSimulation(
      lobby.lobbyId,
      lobby.players.map((p) => ({
        playerId: p.playerId,
        commanderName: p.commanderName,
        faction: p.faction,
        isAi: p.isAi,
      })),
      { seed: lobby.mapSeed }
    );
    console.info(
      `[RTS-MK1][MAP_SEED] Partie démarrée | lobbyId=${lobby.lobbyId} | lobbyName="${lobby.name}" | seed=${lobby.mapSeed} | taille=${lobby.simulation.width}x${lobby.simulation.height}`
    );
    recordMatchSeedLog({
      lobbyId: lobby.lobbyId,
      lobbyName: lobby.name,
      mapSeed: lobby.mapSeed,
      mapWidth: lobby.simulation.width,
      mapHeight: lobby.simulation.height,
    });
    lobby.status = "IN_PROGRESS";
    lobby.chat.push({
      id: `start_${nowMs}`,
      commanderName: "EVA CENTRAL",
      message: `Verrou de salon unique acquis. Simulation déterministe 20 Hz démarrée (Seed carte #${lobby.mapSeed}, ${lobby.simulation.width}×${lobby.simulation.height}).`,
      timestamp: nowMs,
    });
  }

  public stepActiveMatchTick(nowMs = Date.now()): {
    lobbyId: string;
    delta: TickDelta;
    finished: boolean;
  } | null {
    if (!this.activeLobbyId) return null;
    const lobby = this.lobbies.get(this.activeLobbyId);
    if (!lobby || !lobby.simulation || lobby.status !== "IN_PROGRESS") {
      return null;
    }

    const delta = lobby.simulation.stepTick();
    if (delta.winnerPlayerId) {
      lobby.winnerPlayerId = delta.winnerPlayerId;
      this.finishAndReleaseMutex(lobby.lobbyId, "VICTORY", nowMs);
      return { lobbyId: lobby.lobbyId, delta, finished: true };
    }

    return { lobbyId: lobby.lobbyId, delta, finished: false };
  }

  public getActiveSnapshot(lobbyId: string): FullSnapshot | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.simulation) return null;
    return lobby.simulation.getFullSnapshot();
  }

  public recordPlayerHeartbeat(playerId: string, nowMs = Date.now()): void {
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.find((p) => p.playerId === playerId && !p.isAi);
      if (player) {
        player.connected = true;
        lobby.lastHumanHeartbeatAt = nowMs;
      }
    }
  }

  public markPlayerDisconnected(playerId: string, nowMs = Date.now()): void {
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.find((p) => p.playerId === playerId && !p.isAi);
      if (player) {
        player.connected = false;
        const anyHumanConnected = lobby.players.some((p) => !p.isAi && p.connected);
        if (!anyHumanConnected) {
          // Start the 60s inactivity window from this disconnect timestamp
          lobby.lastHumanHeartbeatAt = nowMs;
        }
      }
    }
  }

  public leaveLobby(lobbyId: string, playerId: string, nowMs = Date.now()): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    if (lobby.status === "WAITING" || lobby.status === "QUEUED") {
      lobby.players = lobby.players.filter((p) => p.playerId !== playerId);
      const remainingHumans = lobby.players.filter((p) => !p.isAi);
      if (remainingHumans.length === 0) {
        const qIdx = this.queuedLobbyIds.indexOf(lobbyId);
        if (qIdx !== -1) this.queuedLobbyIds.splice(qIdx, 1);
        this.lobbies.delete(lobbyId);
      }
      return;
    }

    if (lobby.status === "IN_PROGRESS" || lobby.status === "STARTING") {
      const player = lobby.players.find((p) => p.playerId === playerId && !p.isAi);
      if (player) {
        player.connected = false;
      }
      const remainingConnectedHumans = lobby.players.filter((p) => !p.isAi && p.connected);
      if (remainingConnectedHumans.length === 0) {
        this.finishAndReleaseMutex(lobbyId, "ABANDONED", nowMs);
      }
    }
  }

  /**
   * Independent Watchdog executed every 10 seconds.
   * Forces clean destruction of the active match and releases the Single Active Match Mutex
   * if all human players are disconnected or silent for >= 60 seconds.
   */
  public runWatchdogCheck(nowMs = Date.now()): {
    releasedLobbyId: string | null;
    promotedLobbyId: string | null;
  } {
    if (!this.activeLobbyId) {
      const promoted = this.promoteNextQueuedLobby(nowMs);
      return { releasedLobbyId: null, promotedLobbyId: promoted };
    }

    const active = this.lobbies.get(this.activeLobbyId);
    if (!active) {
      this.activeLobbyId = null;
      const promoted = this.promoteNextQueuedLobby(nowMs);
      return { releasedLobbyId: null, promotedLobbyId: promoted };
    }

    const anyHumanConnected = active.players.some((p) => !p.isAi && p.connected);
    const silenceMs = nowMs - active.lastHumanHeartbeatAt;

    if (
      (!anyHumanConnected && silenceMs >= WATCHDOG_DISCONNECT_TIMEOUT_MS) ||
      silenceMs >= WATCHDOG_DISCONNECT_TIMEOUT_MS * 2
    ) {
      const releasedId = active.lobbyId;
      const promotedId = this.finishAndReleaseMutex(releasedId, "WATCHDOG_TIMEOUT", nowMs);
      return { releasedLobbyId: releasedId, promotedLobbyId: promotedId };
    }

    return { releasedLobbyId: null, promotedLobbyId: null };
  }

  public finishAndReleaseMutex(
    lobbyId: string,
    reason: "VICTORY" | "ABANDONED" | "WATCHDOG_TIMEOUT",
    nowMs = Date.now()
  ): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) {
      if (lobby.simulation && lobby.winnerPlayerId) {
        const winnerP = lobby.players.find((p) => p.playerId === lobby.winnerPlayerId);
        if (winnerP) {
          recordMatchOutcome({
            matchId: `${lobby.lobbyId}_${nowMs}`,
            lobbyName: lobby.name,
            winnerPlayerId: winnerP.playerId,
            winnerCommander: winnerP.commanderName,
            winnerFaction: winnerP.faction,
            durationTicks: lobby.simulation.tickId,
            participants: lobby.players.map((p) => ({
              playerId: p.playerId,
              commanderName: p.commanderName,
              faction: p.faction,
              isAi: p.isAi,
              harvestedTotal:
                lobby.simulation?.getPlayerState(p.playerId)?.harvestedTotal ?? 0,
            })),
          });
        }
      }
      lobby.status = "FINISHED";
      lobby.simulation = null; // Free simulation RAM immediately
      lobby.chat.push({
        id: `fin_${nowMs}`,
        commanderName: "MUTEX SERVEUR",
        message: `Partie terminée (${reason}). Verrou de salon unique libéré.`,
        timestamp: nowMs,
      });
    }

    if (this.activeLobbyId === lobbyId) {
      this.activeLobbyId = null;
    }

    return this.promoteNextQueuedLobby(nowMs);
  }

  private promoteNextQueuedLobby(nowMs: number): string | null {
    if (this.activeLobbyId !== null) return null;
    while (this.queuedLobbyIds.length > 0) {
      const nextId = this.queuedLobbyIds.shift()!;
      const nextLobby = this.lobbies.get(nextId);
      if (nextLobby && nextLobby.status === "QUEUED") {
        this.activateLobbyMatch(nextLobby, nowMs);
        return nextLobby.lobbyId;
      }
    }
    return null;
  }

  public getOverview(nowMs = Date.now()): ServerMutexOverview {
    const active = this.activeLobbyId ? this.lobbies.get(this.activeLobbyId) : null;
    const activeStatus =
      !active
        ? "FREE"
        : active.status === "STARTING"
        ? "STARTING"
        : "IN_PROGRESS";

    const summaries: LobbySummary[] = Array.from(this.lobbies.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((l) => {
        const qIdx = this.queuedLobbyIds.indexOf(l.lobbyId);
        return {
          lobbyId: l.lobbyId,
          name: l.name,
          hostPlayerId: l.hostPlayerId,
          mapSeed: l.mapSeed,
          status: l.status,
          queuePosition: l.status === "QUEUED" && qIdx !== -1 ? qIdx + 1 : null,
          players: l.players,
          maxPlayers: l.maxPlayers,
          createdAt: l.createdAt,
          startedAt: l.startedAt,
          winnerPlayerId: l.winnerPlayerId,
          chat: l.chat,
        };
      });

    return ServerMutexOverviewSchema.parse({
      activeLobbyId: this.activeLobbyId,
      activeLobbyName: active ? active.name : null,
      activeStatus,
      queuedLobbyIds: [...this.queuedLobbyIds],
      lobbies: summaries,
      serverTime: nowMs,
    });
  }
}
