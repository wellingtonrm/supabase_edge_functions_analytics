-- ─────────────────────────────────────────────────────────────────────────────
-- Configuração do pg_cron para invocar a Edge Function import-blocklists
-- Projeto: AnaliticApps (jmbtxecibdxlmalkjtei)
-- ─────────────────────────────────────────────────────────────────────────────

-- Habilitar as extensões necessárias (se ainda não estiverem ativas)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- CRON 1: Teste — executa a cada 5 minutos
-- Use este para validar o funcionamento. Desative após o teste!
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'test-import-blocklists',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jmbtxecibdxlmalkjtei.supabase.co/functions/v1/import-blocklists',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CRON 2: Produção — executa todo dia às 00:00 UTC
-- Ative este após validar o CRON de teste.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'daily-import-blocklists',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jmbtxecibdxlmalkjtei.supabase.co/functions/v1/import-blocklists',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Para verificar os jobs agendados:
--   SELECT * FROM cron.job;
--
-- Para desativar o cron de teste após validar:
--   SELECT cron.unschedule('test-import-blocklists');
--
-- Para ver o histórico de execuções:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ─────────────────────────────────────────────────────────────────────────────
