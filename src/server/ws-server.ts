import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { SIM_TICK_MS, WATCHDOG_INTERVAL_MS } from "../shared/constants";
import { ClientLobbyActionSchema, type ClientMessage } from "../shared/schemas/commands";
import { validateEnv } from "../shared/schemas/env";
import type { ServerMessage } from "../shared/schemas/lobby";
import { upsertCommanderProfile } from "./db";
import { LobbyManager } from "./lobby-manager";

interface SocketSession {
  ws: WebSocket;
  playerId: string | null;
  lobbyId: string | null;
}

export function createRtsRealtimeServer(customPort?: number) {
  const env = validateEnv();
  const port = customPort ?? env.WS_PORT;
  const lobbyManager = new LobbyManager();
  const sessions = new Set<SocketSession>();

  const httpServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" || req.url === "/ws/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "rts-mk1-ws-server",
          version: "1.0.0",
          activeLobbyId: lobbyManager.getActiveLobbyId(),
          overview: lobbyManager.getOverview(),
        })
      );
      return;
    }

    if (req.url === "/overview") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(lobbyManager.getOverview()));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  function sendToSocket(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcastOverview(): void {
    const payload: ServerMessage = {
      type: "LOBBY_OVERVIEW",
      overview: lobbyManager.getOverview(),
    };
    const serialized = JSON.stringify(payload);
    for (const s of sessions) {
      if (s.ws.readyState === WebSocket.OPEN) {
        s.ws.send(serialized);
      }
    }
  }

  function broadcastToLobby(lobbyId: string, msg: ServerMessage): void {
    const serialized = JSON.stringify(msg);
    for (const s of sessions) {
      if (s.lobbyId === lobbyId && s.ws.readyState === WebSocket.OPEN) {
        s.ws.send(serialized);
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    const session: SocketSession = {
      ws,
      playerId: null,
      lobbyId: null,
    };
    sessions.add(session);

    // Immediately send current mutex & lobbies state
    sendToSocket(ws, {
      type: "LOBBY_OVERVIEW",
      overview: lobbyManager.getOverview(),
    });

    ws.on("message", (raw: Buffer) => {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw.toString("utf-8"));
      } catch {
        sendToSocket(ws, {
          type: "ERROR",
          code: "INVALID_JSON",
          message: "Le message WebSocket n'est pas un JSON valide.",
        });
        return;
      }

      const validation = ClientLobbyActionSchema.safeParse(parsedJson);
      if (!validation.success) {
        sendToSocket(ws, {
          type: "ERROR",
          code: "ZOD_VALIDATION_ERROR",
          message: validation.error.issues.map((i) => i.message).join("; "),
        });
        return;
      }

      handleClientMessage(session, validation.data);
    });

    ws.on("close", () => {
      sessions.delete(session);
      if (session.playerId) {
        lobbyManager.markPlayerDisconnected(session.playerId);
        broadcastOverview();
      }
    });
  });

  function handleClientMessage(session: SocketSession, msg: ClientMessage): void {
    switch (msg.type) {
      case "CLIENT_PING": {
        session.playerId = msg.playerId;
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        sendToSocket(session.ws, {
          type: "SERVER_PONG",
          timestamp: msg.timestamp,
          serverTime: Date.now(),
        });
        return;
      }

      case "LOBBY_CREATE": {
        session.playerId = msg.playerId;
        upsertCommanderProfile({
          playerId: msg.playerId,
          commanderName: msg.commanderName,
          preferredFaction: msg.faction,
        });
        const lobby = lobbyManager.createLobby({
          playerId: msg.playerId,
          commanderName: msg.commanderName,
          faction: msg.faction,
          lobbyName: msg.lobbyName,
          withAiBot: msg.withAiBot,
        });
        session.lobbyId = lobby.lobbyId;
        sendToSocket(session.ws, {
          type: "LOBBY_JOINED",
          lobbyId: lobby.lobbyId,
          overview: lobbyManager.getOverview(),
        });
        broadcastOverview();
        return;
      }

      case "LOBBY_JOIN": {
        session.playerId = msg.playerId;
        upsertCommanderProfile({
          playerId: msg.playerId,
          commanderName: msg.commanderName,
          preferredFaction: msg.faction,
        });
        const lobby = lobbyManager.joinLobby({
          lobbyId: msg.lobbyId,
          playerId: msg.playerId,
          commanderName: msg.commanderName,
          faction: msg.faction,
        });
        if (!lobby) {
          sendToSocket(session.ws, {
            type: "ERROR",
            code: "LOBBY_NOT_FOUND",
            message: "Ce salon n'existe plus.",
          });
          return;
        }
        session.lobbyId = lobby.lobbyId;
        sendToSocket(session.ws, {
          type: "LOBBY_JOINED",
          lobbyId: lobby.lobbyId,
          overview: lobbyManager.getOverview(),
        });
        const snapshot = lobbyManager.getActiveSnapshot(lobby.lobbyId);
        if (snapshot) {
          sendToSocket(session.ws, snapshot);
        }
        broadcastOverview();
        return;
      }

      case "LOBBY_SET_FACTION": {
        lobbyManager.setPlayerFaction(msg.lobbyId, msg.playerId, msg.faction);
        broadcastOverview();
        return;
      }

      case "LOBBY_CHAT": {
        lobbyManager.addChatMessage(msg.lobbyId, msg.commanderName, msg.message);
        broadcastOverview();
        return;
      }

      case "LOBBY_START_MATCH": {
        session.playerId = msg.playerId;
        session.lobbyId = msg.lobbyId;
        const prevActive = lobbyManager.getActiveLobbyId();
        const result = lobbyManager.requestStartMatch(msg.lobbyId, msg.playerId);
        if (result.error) {
          sendToSocket(session.ws, {
            type: "ERROR",
            code: "START_REJECTED",
            message: result.error,
          });
          return;
        }
        broadcastOverview();
        const nowActive = lobbyManager.getActiveLobbyId();
        if (nowActive && nowActive !== prevActive) {
          const snap = lobbyManager.getActiveSnapshot(nowActive);
          if (snap) {
            broadcastToLobby(nowActive, snap);
          }
        } else if (result.startedImmediately) {
          const snap = lobbyManager.getActiveSnapshot(msg.lobbyId);
          if (snap) {
            sendToSocket(session.ws, snap);
          }
        }
        return;
      }

      case "LOBBY_LEAVE": {
        const prevActive = lobbyManager.getActiveLobbyId();
        lobbyManager.leaveLobby(msg.lobbyId, msg.playerId);
        if (session.lobbyId === msg.lobbyId) {
          session.lobbyId = null;
        }
        broadcastOverview();
        const nowActive = lobbyManager.getActiveLobbyId();
        if (nowActive && nowActive !== prevActive) {
          const snap = lobbyManager.getActiveSnapshot(nowActive);
          if (snap) {
            broadcastToLobby(nowActive, snap);
          }
        }
        return;
      }

      case "REQUEST_SNAPSHOT": {
        session.playerId = msg.playerId;
        session.lobbyId = msg.lobbyId;
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        const snap = lobbyManager.getActiveSnapshot(msg.lobbyId);
        if (snap) {
          sendToSocket(session.ws, snap);
        }
        return;
      }

      case "COMMAND_MOVE": {
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        const lobby = lobbyManager.getLobby(msg.lobbyId);
        lobby?.simulation?.issueMoveCommand(
          msg.playerId,
          msg.entityIds,
          msg.targetTileX,
          msg.targetTileY
        );
        return;
      }

      case "COMMAND_ATTACK": {
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        const lobby = lobbyManager.getLobby(msg.lobbyId);
        lobby?.simulation?.issueAttackCommand(
          msg.playerId,
          msg.entityIds,
          msg.targetEntityId
        );
        return;
      }

      case "COMMAND_START_PRODUCTION": {
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        const lobby = lobbyManager.getLobby(msg.lobbyId);
        lobby?.simulation?.issueStartProduction(
          msg.playerId,
          msg.category,
          msg.itemKind
        );
        return;
      }

      case "COMMAND_PLACE_BUILDING": {
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        const lobby = lobbyManager.getLobby(msg.lobbyId);
        lobby?.simulation?.issuePlaceBuilding(
          msg.playerId,
          msg.category,
          msg.buildingKind,
          msg.tileX,
          msg.tileY
        );
        return;
      }

      case "COMMAND_SELL_BUILDING": {
        lobbyManager.recordPlayerHeartbeat(msg.playerId);
        const lobby = lobbyManager.getLobby(msg.lobbyId);
        lobby?.simulation?.issueSellBuilding(msg.playerId, msg.buildingEntityId);
        return;
      }
    }
  }

  // Authoritative 20 Hz simulation loop (50 ms/tick)
  const simInterval = setInterval(() => {
    const prevActive = lobbyManager.getActiveLobbyId();
    const stepResult = lobbyManager.stepActiveMatchTick();
    if (!stepResult) return;

    broadcastToLobby(stepResult.lobbyId, stepResult.delta);

    if (stepResult.finished) {
      broadcastOverview();
      const promotedId = lobbyManager.getActiveLobbyId();
      if (promotedId && promotedId !== prevActive) {
        const snap = lobbyManager.getActiveSnapshot(promotedId);
        if (snap) {
          broadcastToLobby(promotedId, snap);
        }
      }
    }
  }, SIM_TICK_MS);

  // Independent 10s Watchdog loop preventing Single Active Match Mutex deadlocks
  const watchdogInterval = setInterval(() => {
    const res = lobbyManager.runWatchdogCheck();
    if (res.releasedLobbyId || res.promotedLobbyId) {
      broadcastOverview();
      if (res.promotedLobbyId) {
        const snap = lobbyManager.getActiveSnapshot(res.promotedLobbyId);
        if (snap) {
          broadcastToLobby(res.promotedLobbyId, snap);
        }
      }
    }
  }, WATCHDOG_INTERVAL_MS);

  return {
    httpServer,
    wss,
    lobbyManager,
    start(): Promise<void> {
      return new Promise((resolve) => {
        httpServer.listen(port, "0.0.0.0", () => {
          resolve();
        });
      });
    },
    stop(): Promise<void> {
      clearInterval(simInterval);
      clearInterval(watchdogInterval);
      return new Promise((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}

// Execute directly when run as standalone ws-server entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createRtsRealtimeServer();
  server.start().then(() => {
    const env = validateEnv();
    console.log(
      `[RTS-MK1 v1.0.0] Authoritative WS & Single-Active-Match Server listening on 0.0.0.0:${env.WS_PORT}`
    );
  });
}
