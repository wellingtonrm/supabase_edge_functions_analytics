import { z } from "npm:@hono/zod-openapi";

// ─── Profile Sync ─────────────────────────────────────────────────────────────
export const ProfileSyncBodySchema = z.object({
  profile: z.record(z.any()).openapi({ example: { theme: "dark", notifications: true } }),
});

export const ProfileSyncResponseSchema = z.object({
  success: z.literal(true),
  profile: z.record(z.any()),
  updatedAt: z.string(),
});

// ─── Subscription Status ──────────────────────────────────────────────────────
export const SubscriptionStatusResponseSchema = z.object({
  success: z.literal(true),
  device_hash: z.string(),
  plan: z.string(),
  planExpiresAt: z.string().nullable(),
  installCount: z.number(),
  token: z.string().optional(),
  tokenExpiresAt: z.string().optional(),
});
