import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { DomainsParser } from "./parsers/domains.parser.ts";

interface BlocklistSource {
  id: string;
  name: string;
  provider: string;
  url: string;
  category: string;
  enabled: boolean;
}

const app = new Hono();

// Middleware de CORS global
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Rota GET: Retorna um status simples da API
// ─────────────────────────────────────────────────────────────────────────────
app.get("/import-blocklists", (c) => {
  return c.json({
    status: "online",
    message: "A API de importação está ativa. Utilize POST para disparar a importação."
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rota POST: Executa a importação massiva a partir do PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────
app.post("/import-blocklists", async (c) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Buscar fontes ativas
    const { data: sources, error: sourceError } = await supabase
      .from("blocklist_sources")
      .select("*")
      .eq("enabled", true);

    if (sourceError || !sources) {
      throw new Error(`Erro ao buscar fontes: ${sourceError?.message}`);
    }

    // 2. Processar fontes em paralelo
    const results = await Promise.allSettled(
      sources.map(async (source: BlocklistSource) => {
        console.log(`[import] Baixando: ${source.name}`);
        
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`Falha HTTP ${response.status} para ${source.name}`);
        }

        const content = await response.text();
        const domains = DomainsParser.parse(content);
        
        console.log(`[import] ${source.name}: ${domains.length} domínios extraídos`);

        const batchSize = 1000;
        let insertedCount = 0;

        for (let i = 0; i < domains.length; i += batchSize) {
          const batch = domains.slice(i, i + batchSize);

          const { data: upsertedDomains, error: upsertError } = await supabase
            .from("blocked_domains")
            .upsert(
              batch.map(domain => ({ domain })), 
              { onConflict: "domain" }
            )
            .select("id");

          if (upsertError) {
            console.error(`Erro ao inserir domínios (${source.name}, batch ${i}):`, upsertError);
            continue;
          }

          if (upsertedDomains && upsertedDomains.length > 0) {
            const relationBatch = upsertedDomains.map(d => ({
              domain_id: d.id,
              source_id: source.id
            }));

            const { error: relError } = await supabase
              .from("domain_categories")
              .upsert(relationBatch, { onConflict: "domain_id,source_id", ignoreDuplicates: true });

            if (relError) {
              console.error(`Erro ao vincular categorias (${source.name}, batch ${i}):`, relError);
            } else {
              insertedCount += batch.length;
            }
          }
        }

        // Atualizar metadados
        await supabase
          .from("blocklist_sources")
          .update({
            last_import_at: new Date().toISOString(),
            domains_count: domains.length
          })
          .eq("id", source.id);

        return {
          source: source.name,
          totalProcessed: domains.length,
          inserted: insertedCount
        };
      })
    );

    const summary = results.map(r => 
      r.status === "fulfilled" ? r.value : { error: r.reason instanceof Error ? r.reason.message : r.reason }
    );

    return c.json({ success: true, summary });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[import] Erro fatal:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Ponto de entrada padrão do Deno Deploy (Web Standard)
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(app.fetch);
