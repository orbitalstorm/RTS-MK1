import { NextResponse } from "next/server";
import { z } from "zod";
import { UpsertProfileRequestSchema } from "../../../shared/schemas/profile";
import {
  getCommanderProfile,
  listRecentMatches,
  listTopCommanders,
  upsertCommanderProfile,
} from "../../../server/db";

const QuerySchema = z.object({
  playerId: z.string().min(1).max(64).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    playerId: url.searchParams.get("playerId") ?? undefined,
  });

  const profile =
    parsed.success && parsed.data.playerId
      ? getCommanderProfile(parsed.data.playerId)
      : null;

  return NextResponse.json({
    profile,
    leaderboard: listTopCommanders(10),
    recentMatches: listRecentMatches(8),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = UpsertProfileRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const profile = upsertCommanderProfile(parsed.data);
  return NextResponse.json({
    profile,
    leaderboard: listTopCommanders(10),
  });
}
