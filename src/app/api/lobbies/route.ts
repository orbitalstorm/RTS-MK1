import { NextResponse } from "next/server";
import { validateEnv } from "../../../shared/schemas/env";
import { ServerMutexOverviewSchema } from "../../../shared/schemas/lobby";

export async function GET() {
  const env = validateEnv();
  try {
    const res = await fetch(`${env.INTERNAL_WS_API_URL}/overview`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json: unknown = await res.json();
      const validated = ServerMutexOverviewSchema.parse(json);
      return NextResponse.json(validated);
    }
  } catch {
    // Fallback if queried before ws-server is reachable
  }

  return NextResponse.json(
    ServerMutexOverviewSchema.parse({
      activeLobbyId: null,
      activeLobbyName: null,
      activeStatus: "FREE",
      queuedLobbyIds: [],
      lobbies: [],
      serverTime: Date.now(),
    })
  );
}
