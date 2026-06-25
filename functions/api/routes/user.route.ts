import { OpenAPIHono, createRoute } from "npm:@hono/zod-openapi";
import {
  ProfileSyncBodySchema, ProfileSyncResponseSchema,
  SubscriptionStatusResponseSchema,
} from "../schemas/user.schema.ts";
import { ErrorSchema } from "../schemas/device.schema.ts";
import { createSupabaseClient, verifyToken, createTokenV2, DeviceRecord } from "../../_shared/utils.ts";

export const userApp = new OpenAPIHono();

// Helper para extrair e verificar o JWT do header
async function authenticate(authHeader: string | null): Promise<Record<string, unknown> | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) return null;
  return verifyToken(authHeader.slice(7), jwtSecret);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /user/profile-sync
// ─────────────────────────────────────────────────────────────────────────────
userApp.openapi(
  createRoute({
    method: "post",
    path: "/profile-sync",
    tags: ["User"],
    summary: "Sincroniza o perfil do dispositivo",
    description: "Faz o upsert dos dados de perfil do usuário/dispositivo. Requer Bearer Token.",
    security: [{ BearerAuth: [] }],
    request: { body: { content: { "application/json": { schema: ProfileSyncBodySchema } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: ProfileSyncResponseSchema } }, description: "Perfil sincronizado." },
      401: { content: { "application/json": { schema: ErrorSchema } }, description: "Não autorizado." },
    },
  }),
  async (c) => {
    const claims = await authenticate(c.req.header("authorization") ?? null);
    if (!claims) return c.json({ success: false as const, error: "Invalid or expired token", code: "UNAUTHORIZED" }, 401);

    const deviceHash = claims.device_hash as string;
    if (!deviceHash) return c.json({ success: false as const, error: "Invalid token claims", code: "UNAUTHORIZED" }, 401);

    const { profile } = c.req.valid("json");
    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    await supabase.from("device_profiles").upsert({ device_id: deviceHash, profile_data: profile, updated_at: now }, { onConflict: "device_id" });

    const { data: synced } = await supabase.from("device_profiles").select("profile_data, updated_at").eq("device_id", deviceHash).single();

    console.log(`[user/profile-sync] Synced for ${deviceHash}`);
    return c.json({ success: true as const, profile: synced?.profile_data ?? {}, updatedAt: synced?.updated_at ?? now }, 200);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /user/subscription
// ─────────────────────────────────────────────────────────────────────────────
userApp.openapi(
  createRoute({
    method: "post",
    path: "/subscription",
    tags: ["User"],
    summary: "Retorna o status da assinatura",
    description: "Verifica o plano ativo do dispositivo e, se necessário, renova o token JWT. Requer Bearer Token.",
    security: [{ BearerAuth: [] }],
    responses: {
      200: { content: { "application/json": { schema: SubscriptionStatusResponseSchema } }, description: "Status da assinatura." },
      401: { content: { "application/json": { schema: ErrorSchema } }, description: "Não autorizado." },
      404: { content: { "application/json": { schema: ErrorSchema } }, description: "Dispositivo não encontrado." },
    },
  }),
  async (c) => {
    const jwtSecret = Deno.env.get("JWT_SECRET");
    const authHeader = c.req.header("authorization") ?? null;
    const claims = await authenticate(authHeader);
    if (!claims || !jwtSecret) return c.json({ success: false as const, error: "Invalid or expired token", code: "UNAUTHORIZED" }, 401);

    const deviceHash = claims.device_hash as string;
    if (!deviceHash) return c.json({ success: false as const, error: "Invalid token claims", code: "UNAUTHORIZED" }, 401);

    const supabase = createSupabaseClient();
    const { data: device, error } = await supabase.from("devices").select("*").eq("device_hash", deviceHash).maybeSingle();
    if (error) return c.json({ success: false as const, error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
    if (!device) return c.json({ success: false as const, error: "Device not found", code: "DEVICE_NOT_FOUND" }, 404);

    const planExpiresAt = device.plan_expires_at;
    const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date();

    const response: Record<string, unknown> = {
      success: true,
      device_hash: device.device_hash,
      plan: isExpired ? "free" : device.plan,
      planExpiresAt,
      installCount: device.install_count,
    };

    const needsTokenRefresh =
      claims.plan !== device.plan ||
      claims.planExpiresAt !== device.plan_expires_at ||
      (claims.exp as number) < Math.floor(Date.now() / 1000) + 86400;

    if (needsTokenRefresh) {
      const { token, expiresAt } = await createTokenV2(device as DeviceRecord, jwtSecret);
      response.token = token;
      response.tokenExpiresAt = expiresAt;
    }

    console.log(`[user/subscription] Checked for ${deviceHash}, plan: ${device.plan}`);
    return c.json(response as typeof SubscriptionStatusResponseSchema._type, 200);
  }
);
