import { z } from "zod";
import { FactionIdSchema } from "./commands";
import { FullSnapshotSchema, TickDeltaSchema } from "./deltas";

export const LobbyStatusSchema = z.enum([
  "WAITING",
  "QUEUED",
  "STARTING",
  "IN_PROGRESS",
  "FINISHED",
]);

export const LobbyPlayerSchema = z.object({
  playerId: z.string().min(1),
  commanderName: z.string().min(1).max(32),
  faction: FactionIdSchema,
  isAi: z.boolean(),
  connected: z.boolean(),
});

export const LobbyChatEntrySchema = z.object({
  id: z.string().min(1),
  commanderName: z.string().min(1),
  message: z.string().min(1),
  timestamp: z.number().int(),
});

export const LobbySummarySchema = z.object({
  lobbyId: z.string().min(1),
  name: z.string().min(1),
  hostPlayerId: z.string().min(1),
  mapSeed: z.number().int().positive().optional(),
  customMapId: z.string().nullable().optional(),
  customMapName: z.string().nullable().optional(),
  mapWidth: z.number().int().positive().optional(),
  mapHeight: z.number().int().positive().optional(),
  status: LobbyStatusSchema,
  queuePosition: z.number().int().nullable(), // 1-based rank when status === "QUEUED"
  players: z.array(LobbyPlayerSchema),
  maxPlayers: z.number().int().min(2).max(4),
  createdAt: z.number().int(),
  startedAt: z.number().int().nullable(),
  winnerPlayerId: z.string().nullable(),
  chat: z.array(LobbyChatEntrySchema),
});

export const ServerMutexOverviewSchema = z.object({
  activeLobbyId: z.string().nullable(),
  activeLobbyName: z.string().nullable(),
  activeStatus: z.enum(["FREE", "STARTING", "IN_PROGRESS"]),
  queuedLobbyIds: z.array(z.string()),
  lobbies: z.array(LobbySummarySchema),
  serverTime: z.number().int(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LOBBY_OVERVIEW"),
    overview: ServerMutexOverviewSchema,
  }),
  z.object({
    type: z.literal("LOBBY_JOINED"),
    lobbyId: z.string().min(1),
    overview: ServerMutexOverviewSchema,
  }),
  z.object({
    type: z.literal("SERVER_PONG"),
    timestamp: z.number().int(),
    serverTime: z.number().int(),
  }),
  z.object({
    type: z.literal("ERROR"),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  TickDeltaSchema,
  FullSnapshotSchema,
]);

export type LobbyStatus = z.infer<typeof LobbyStatusSchema>;
export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;
export type LobbyChatEntry = z.infer<typeof LobbyChatEntrySchema>;
export type LobbySummary = z.infer<typeof LobbySummarySchema>;
export type ServerMutexOverview = z.infer<typeof ServerMutexOverviewSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
