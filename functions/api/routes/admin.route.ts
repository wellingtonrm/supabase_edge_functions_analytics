import { OpenAPIHono, createRoute } from "npm:@hono/zod-openapi";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BlocklistImportResponseSchema } from "../schemas/admin.schema.ts";
import { DomainsParser } from "../../import-blocklists/parsers/domains.parser.ts";

export const adminApp = new OpenAPIHono();

interface BlocklistSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/blocklists/import
// ─────────────────────────────────────────────────────────────────────────────
adminApp.openapi(
  createRoute({
    method: "post",
    path: "/blocklists/import",
    tags: ["Admin"],
    summary: "Importa todas as blocklists ativas",
    description: "Busca as fontes ativas em `blocklist_sources`, baixa os domínios de cada uma, e persiste em `blocked_domains` e `domain_categories` via upsert N:N.",
    responses: {
      200: {
        content: { "application/json": { schema: BlocklistImportResponseSchema } },
        description: "Importação concluída.",
      },
      500: {
        content: { "application/json": { schema: BlocklistImportResponseSchema } },
        description: "Erro interno.",
      },
    },
  }),
  async (c) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
      const { data: sources, error: sourceError } = await supabase
        .from("blocklist_sources")
        .select("*")
        .eq("enabled", true);

      if (sourceError || !sources) throw new Error(`Erro ao buscar fontes: ${sourceError?.message}`);

      const results = await Promise.allSettled(
        sources.map(async (source: BlocklistSource) => {
          console.log(`[admin/blocklists/import] Baixando: ${source.name}`);
          const response = await fetch(source.url);
          if (!response.ok) throw new Error(`Falha HTTP ${response.status} para ${source.name}`);

          const content = await response.text();
          const domains = DomainsParser.parse(content);
          console.log(`[admin/blocklists/import] ${source.name}: ${domains.length} domínios`);

          const batchSize = 1000;
          let insertedCount = 0;

          for (let i = 0; i < domains.length; i += batchSize) {
            const batch = domains.slice(i, i + batchSize);

            const { data: upsertedDomains, error: upsertError } = await supabase
              .from("blocked_domains")
              .upsert(batch.map(domain => ({ domain })), { onConflict: "domain" })
              .select("id");

            if (upsertError) { console.error(`[import] Erro batch ${i}:`, upsertError); continue; }

            if (upsertedDomains?.length) {
              await supabase.from("domain_categories").upsert(
                upsertedDomains.map(d => ({ domain_id: d.id, source_id: source.id })),
                { onConflict: "domain_id,source_id", ignoreDuplicates: true }
              );
              insertedCount += batch.length;
            }
          }

          await supabase.from("blocklist_sources").update({ last_import_at: new Date().toISOString(), domains_count: domains.length }).eq("id", source.id);
          return { source: source.name, totalProcessed: domains.length, inserted: insertedCount };
        })
      );

      const summary = results.map(r => r.status === "fulfilled" ? r.value : { error: r.reason instanceof Error ? r.reason.message : r.reason });
      return c.json({ success: true as const, summary }, 200);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      console.error("[admin/blocklists/import] Erro fatal:", msg);
      return c.json({ success: false as const, error: msg }, 500);
    }
  }
);
