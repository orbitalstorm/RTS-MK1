import { NextResponse } from "next/server";
import { validateEnv } from "../../../shared/schemas/env";

export async function GET() {
  const env = validateEnv();
  return NextResponse.json({
    status: "ok",
    project: env.PROJECT_NAME,
    domain: env.PUBLIC_DNS_DOMAIN,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}
