import { OpenAPIHono, createRoute } from "npm:@hono/zod-openapi";
import {
  DeviceRegisterBodySchema, DeviceRegisterResponseSchema,
  DeviceBootstrapBodySchema, DeviceBootstrapResponseSchema,
  DeviceEventBodySchema, DeviceEventResponseSchema,
  DeviceTokenBodySchema, DeviceTokenResponseSchema,
  ErrorSchema,
} from "../schemas/device.schema.ts";
import {
  createSupabaseClient, generateFingerprint, generateDeviceHash,
  validateDevicePayload, validateBootstrapPayload,
  createTokenV2, checkRateLimit, checkRateLimitV2, DeviceRecord,
} from "../../_shared/utils.ts";

export const deviceApp = new OpenAPIHono();

// ─────────────────────────────────────────────────────────────────────────────
// POST /device/register (legado)
// ─────────────────────────────────────────────────────────────────────────────
deviceApp.openapi(
  createRoute({
    method: "post",
    path: "/register",
    tags: ["Device"],
    summary: "Registra um dispositivo (legado)",
    description: "Registra ou atualiza um dispositivo usando o payload completo (v1).",
    request: { body: { content: { "application/json": { schema: DeviceRegisterBodySchema } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: DeviceRegisterResponseSchema } }, description: "Dispositivo registrado." },
      400: { content: { "application/json": { schema: ErrorSchema } }, description: "Payload inválido." },
      429: { content: { "application/json": { schema: ErrorSchema } }, description: "Rate limit excedido." },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const validation = validateDevicePayload(body);
    if (!validation.valid) {
      return c.json({ success: false as const, error: validation.error!, code: "INVALID_PAYLOAD" }, 400);
    }

    const supabase = createSupabaseClient();
    const payload = validation.payload!;
    const fingerprint = await generateFingerprint(payload);

    const rateLimited = await checkRateLimit(supabase, fingerprint);
    if (rateLimited) {
      return c.json({ success: false as const, error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }

    const { data: existing } = await supabase.from("devices").select("id, install_count").eq("device_hash", fingerprint).maybeSingle();

    let isNew = false;
    if (existing) {
      await supabase.from("devices").update({ install_count: existing.install_count + 1, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      isNew = true;
      const now = new Date().toISOString();
      await supabase.from("devices").insert({ device_hash: fingerprint, install_count: 1, plan: "free", first_seen_at: now, last_seen_at: now, created_at: now, updated_at: now });
    }

    await supabase.from("device_events_v2").insert({ event_name: "DEVICE_REGISTERED", payload: { fingerprint, isNew }, device_hash: fingerprint });

    return c.json({ success: true as const, device: { deviceId: payload.deviceId, fingerprint, isNew } }, 200);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /device/bootstrap
// ─────────────────────────────────────────────────────────────────────────────
deviceApp.openapi(
  createRoute({
    method: "post",
    path: "/bootstrap",
    tags: ["Device"],
    summary: "Bootstrap do dispositivo Android",
    description: "Registra/atualiza o dispositivo via androidId e retorna um JWT para autenticação.",
    request: { body: { content: { "application/json": { schema: DeviceBootstrapBodySchema } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: DeviceBootstrapResponseSchema } }, description: "Bootstrap concluído." },
      400: { content: { "application/json": { schema: ErrorSchema } }, description: "Payload inválido." },
      429: { content: { "application/json": { schema: ErrorSchema } }, description: "Rate limit excedido." },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const validation = validateBootstrapPayload(body);
    if (!validation.valid) {
      return c.json({ success: false as const, error: validation.error!, code: "INVALID_PAYLOAD" }, 400);
    }

    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) return c.json({ success: false as const, error: "JWT_SECRET not configured", code: "INTERNAL_ERROR" }, 500);

    const supabase = createSupabaseClient();
    const payload = validation.payload!;
    const deviceHash = await generateDeviceHash(payload.androidId);

    const rateLimited = await checkRateLimitV2(supabase, deviceHash);
    if (rateLimited) {
      return c.json({ success: false as const, error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }

    const { data: existing } = await supabase.from("devices").select("*").eq("device_hash", deviceHash).maybeSingle();

    let isNew = false;
    let device: DeviceRecord;

    if (existing) {
      const now = new Date().toISOString();
      const { data: updated } = await supabase.from("devices").update({ install_count: existing.install_count + 1, last_seen_at: now, updated_at: now }).eq("id", existing.id).select("*").single();
      device = updated as DeviceRecord;
    } else {
      isNew = true;
      const now = new Date().toISOString();
      const { data: inserted } = await supabase.from("devices").insert({ device_hash: deviceHash, install_count: 1, plan: "free", first_seen_at: now, last_seen_at: now, created_at: now, updated_at: now }).select("*").single();
      device = inserted as DeviceRecord;
    }

    const { token, expiresAt } = await createTokenV2(device, jwtSecret);
    await supabase.from("device_events_v2").insert({ event_name: "DEVICE_BOOTSTRAP", payload: { deviceHash, isNew, installCount: device.install_count }, device_hash: deviceHash });

    return c.json({
      success: true as const,
      device: { device_hash: device.device_hash, plan: device.plan, planExpiresAt: device.plan_expires_at, isNew, installCount: device.install_count },
      token,
      expiresAt,
    }, 200);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /device/event
// ─────────────────────────────────────────────────────────────────────────────
deviceApp.openapi(
  createRoute({
    method: "post",
    path: "/event",
    tags: ["Device"],
    summary: "Registra um evento do dispositivo",
    description: "Persiste eventos do app (VPN_CONNECTED, VPN_DISCONNECTED, etc.) para análise.",
    request: { body: { content: { "application/json": { schema: DeviceEventBodySchema } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: DeviceEventResponseSchema } }, description: "Evento registrado." },
      400: { content: { "application/json": { schema: ErrorSchema } }, description: "Payload inválido." },
    },
  }),
  async (c) => {
    const { event_name, device_hash, payload } = c.req.valid("json");
    const supabase = createSupabaseClient();

    const { error } = await supabase.from("device_events_v2").insert({ event_name, payload: payload ?? {}, device_hash });
    if (error) {
      console.error("[device/event] Error:", error);
      return c.json({ success: false as const, error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
    }

    console.log(`[device/event] ${event_name} for ${device_hash}`);
    return c.json({ success: true as const }, 200);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /device/token
// ─────────────────────────────────────────────────────────────────────────────
deviceApp.openapi(
  createRoute({
    method: "post",
    path: "/token",
    tags: ["Device"],
    summary: "Renova o token JWT do dispositivo",
    description: "Busca o dispositivo pelo device_hash e emite um novo JWT com 30 dias de validade.",
    request: { body: { content: { "application/json": { schema: DeviceTokenBodySchema } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: DeviceTokenResponseSchema } }, description: "Token renovado." },
      404: { content: { "application/json": { schema: ErrorSchema } }, description: "Dispositivo não encontrado." },
      429: { content: { "application/json": { schema: ErrorSchema } }, description: "Rate limit excedido." },
    },
  }),
  async (c) => {
    const { device_hash } = c.req.valid("json");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) return c.json({ success: false as const, error: "JWT_SECRET not configured", code: "INTERNAL_ERROR" }, 500);

    const supabase = createSupabaseClient();

    const rateLimited = await checkRateLimitV2(supabase, device_hash);
    if (rateLimited) {
      return c.json({ success: false as const, error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }

    const { data: device, error } = await supabase.from("devices").select("*").eq("device_hash", device_hash).maybeSingle();
    if (error) return c.json({ success: false as const, error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
    if (!device) return c.json({ success: false as const, error: "Device not found. Please register first.", code: "DEVICE_NOT_FOUND" }, 404);

    const { token, expiresAt } = await createTokenV2(device as DeviceRecord, jwtSecret);
    await supabase.from("device_events_v2").insert({ event_name: "DEVICE_TOKEN_REFRESHED", payload: { device_hash }, device_hash });

    return c.json({
      success: true as const,
      token,
      expiresAt,
      device: { device_hash: device.device_hash, plan: device.plan, planExpiresAt: device.plan_expires_at },
    }, 200);
  }
);
