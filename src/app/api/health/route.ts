import { NextResponse } from "next/server";
import { APP_VERSION } from "../../../shared/constants";
import { validateEnv } from "../../../shared/schemas/env";

export async function GET() {
  const env = validateEnv();
  return NextResponse.json({
    status: "ok",
    project: env.PROJECT_NAME,
    domain: env.PUBLIC_DNS_DOMAIN,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
}
