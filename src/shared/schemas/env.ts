import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PROJECT_NAME: z.string().min(1).default("RTS-MK1"),
  PUBLIC_DNS_DOMAIN: z.string().min(1).default("rts-mk1.orbital8.cloud"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("https://rts-mk1.orbital8.cloud"),
  NEXT_PUBLIC_WS_URL: z.string().min(1).default("wss://rts-mk1.orbital8.cloud/ws"),
  WEB_PORT: z.coerce.number().int().positive().default(4300),
  WS_PORT: z.coerce.number().int().positive().default(4301),
  INTERNAL_WS_API_URL: z.string().min(1).default("http://127.0.0.1:4301"),
  RTS_DB_PATH: z.string().min(1).default("./data/rts-mk1.sqlite"),
  CORS_ALLOWED_ORIGIN: z.string().min(1).default("https://rts-mk1.orbital8.cloud"),
});

export type ValidatedEnv = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, string | undefined> = process.env): ValidatedEnv {
  return EnvSchema.parse({
    NODE_ENV: raw.NODE_ENV,
    PROJECT_NAME: raw.PROJECT_NAME,
    PUBLIC_DNS_DOMAIN: raw.PUBLIC_DNS_DOMAIN,
    NEXT_PUBLIC_APP_URL: raw.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_WS_URL: raw.NEXT_PUBLIC_WS_URL,
    WEB_PORT: raw.WEB_PORT,
    WS_PORT: raw.WS_PORT,
    INTERNAL_WS_API_URL: raw.INTERNAL_WS_API_URL,
    RTS_DB_PATH: raw.RTS_DB_PATH,
    CORS_ALLOWED_ORIGIN: raw.CORS_ALLOWED_ORIGIN,
  });
}
