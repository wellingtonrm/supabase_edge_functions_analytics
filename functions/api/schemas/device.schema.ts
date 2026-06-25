import { z } from "npm:@hono/zod-openapi";

// ─── Shared Error Schema ───────────────────────────────────────────────────────
export const ErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

// ─── Device Register ──────────────────────────────────────────────────────────
export const DeviceRegisterBodySchema = z.object({
  deviceId: z.string().min(10).max(255).openapi({ example: "abc123def456" }),
  installationId: z.string().min(10).max(255).openapi({ example: "install-xyz-789" }),
  platform: z.enum(["android"]).openapi({ example: "android" }),
  appVersion: z.string().min(1).openapi({ example: "1.0.0" }),
  buildNumber: z.string().min(1).openapi({ example: "42" }),
  packageName: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  timestamp: z.number().openapi({ example: 1700000000 }),
});

export const DeviceRegisterResponseSchema = z.object({
  success: z.literal(true),
  device: z.object({
    deviceId: z.string(),
    fingerprint: z.string(),
    isNew: z.boolean(),
  }),
});

// ─── Device Bootstrap ─────────────────────────────────────────────────────────
export const DeviceBootstrapBodySchema = z.object({
  androidId: z.string().min(8).openapi({ example: "a1b2c3d4e5f6" }),
  platform: z.enum(["android"]).openapi({ example: "android" }),
  appVersion: z.string().optional().openapi({ example: "1.0.0" }),
  buildNumber: z.string().optional().openapi({ example: "42" }),
});

export const DeviceBootstrapResponseSchema = z.object({
  success: z.literal(true),
  device: z.object({
    device_hash: z.string(),
    plan: z.string(),
    planExpiresAt: z.string().nullable(),
    isNew: z.boolean(),
    installCount: z.number(),
  }),
  token: z.string(),
  expiresAt: z.string(),
});

// ─── Device Event ─────────────────────────────────────────────────────────────
export const DeviceEventBodySchema = z.object({
  event_name: z.string().min(1).openapi({ example: "VPN_CONNECTED" }),
  device_hash: z.string().min(10).openapi({ example: "sha256-hash-hex..." }),
  payload: z.record(z.any()).optional(),
});

export const DeviceEventResponseSchema = z.object({
  success: z.literal(true),
});

// ─── Device Token ─────────────────────────────────────────────────────────────
export const DeviceTokenBodySchema = z.object({
  device_hash: z.string().min(10).openapi({ example: "sha256-hash-hex..." }),
});

export const DeviceTokenResponseSchema = z.object({
  success: z.literal(true),
  token: z.string(),
  expiresAt: z.string(),
  device: z.object({
    device_hash: z.string(),
    plan: z.string(),
    planExpiresAt: z.string().nullable(),
  }),
});
