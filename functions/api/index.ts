import { OpenAPIHono } from "npm:@hono/zod-openapi";
import { swaggerUI } from "npm:@hono/swagger-ui";
import { cors } from "npm:hono/cors";

import { deviceApp } from "./routes/device.route.ts";
import { userApp } from "./routes/user.route.ts";
import { adminApp } from "./routes/admin.route.ts";

const app = new OpenAPIHono();

// ─── Middleware Global ────────────────────────────────────────────────────────
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

// ─── Rotas Agrupadas ──────────────────────────────────────────────────────────
app.route("/device", deviceApp);
app.route("/user", userApp);
app.route("/admin", adminApp);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ status: "ok", version: "1.0.0", message: "Guardian VPN API is running!" })
);

// ─── OpenAPI JSON Spec ────────────────────────────────────────────────────────
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Guardian VPN API",
    description: "API consolidada do Guardian VPN. Gerencie dispositivos, perfis e importação de blocklists.",
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT emitido pelo endpoint `/device/bootstrap` ou `/device/token`.",
      },
    },
  },
});

// ─── Swagger UI ───────────────────────────────────────────────────────────────
// Acesse: https://jmbtxecibdxlmalkjtei.supabase.co/functions/v1/api/ui
app.get("/ui", swaggerUI({ url: "/functions/v1/api/doc" }));

// ─── Ponto de entrada Deno Deploy ─────────────────────────────────────────────
Deno.serve(app.fetch);
