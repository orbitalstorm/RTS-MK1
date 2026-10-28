import { z } from "zod";
import { FactionIdSchema } from "./commands";

export const CommanderProfileSchema = z.object({
  playerId: z.string().min(1).max(64),
  commanderName: z.string().min(2).max(32),
  preferredFaction: FactionIdSchema,
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  oreHarvested: z.number().int().min(0),
  matchesPlayed: z.number().int().min(0),
  updatedAt: z.string(),
});

export const UpsertProfileRequestSchema = z.object({
  playerId: z.string().min(1).max(64),
  commanderName: z.string().min(2).max(32),
  preferredFaction: FactionIdSchema,
});

export const MatchRecordSchema = z.object({
  matchId: z.string().min(1),
  lobbyName: z.string().min(1),
  winnerCommander: z.string().min(1),
  winnerFaction: FactionIdSchema,
  durationTicks: z.number().int().min(0),
  completedAt: z.string(),
});

export type CommanderProfile = z.infer<typeof CommanderProfileSchema>;
export type UpsertProfileRequest = z.infer<typeof UpsertProfileRequestSchema>;
export type MatchRecord = z.infer<typeof MatchRecordSchema>;
