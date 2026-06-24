-- Guardian VPN - Drop legacy tables (project vazio, sem dados)
-- device_installations  → substituída por devices
-- device_events         → substituída por device_events_v2
-- subscriptions         → merged em devices (plan + plan_expires_at)
-- device_profiles       → não utilizada pelo app

DROP TABLE IF EXISTS device_profiles CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS device_events CASCADE;
DROP TABLE IF EXISTS device_installations CASCADE;
