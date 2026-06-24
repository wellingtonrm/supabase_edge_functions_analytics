-- Guardian VPN - Device Auth v2 Migration
-- Creates devices table (replaces device_installations + subscriptions)
-- Creates device_events_v2 table (replaces device_events)

-- Tabela central de dispositivos
CREATE TABLE IF NOT EXISTS devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash     TEXT NOT NULL UNIQUE,
  install_count   INTEGER NOT NULL DEFAULT 1,
  plan            TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_device_hash ON devices(device_hash);
CREATE INDEX IF NOT EXISTS idx_devices_plan ON devices(plan);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Tabela de eventos com TTL
CREATE TABLE IF NOT EXISTS device_events_v2 (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name  TEXT NOT NULL,
  payload     JSONB DEFAULT '{}',
  device_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days'
);

CREATE INDEX IF NOT EXISTS idx_events_v2_device_hash ON device_events_v2(device_hash);
CREATE INDEX IF NOT EXISTS idx_events_v2_created_at ON device_events_v2(created_at);
CREATE INDEX IF NOT EXISTS idx_events_v2_expires_at ON device_events_v2(expires_at);

ALTER TABLE device_events_v2 ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "service_role has full access to devices"
  ON devices USING (true) WITH CHECK (true);

CREATE POLICY "service_role has full access to device_events_v2"
  ON device_events_v2 USING (true) WITH CHECK (true);

-- Backfill: migrar dados existentes para devices
INSERT INTO devices (device_hash, install_count, plan, plan_expires_at,
                     first_seen_at, last_seen_at, created_at, updated_at)
SELECT
  COALESCE(di.fingerprint, di.device_id),
  1,
  COALESCE(s.tier, 'free'),
  s.expires_at,
  di.created_at,
  di.last_seen_at,
  di.created_at,
  NOW()
FROM device_installations di
LEFT JOIN subscriptions s ON s.device_id = di.device_id
ON CONFLICT (device_hash) DO NOTHING;

-- Backfill: migrar eventos existentes
INSERT INTO device_events_v2 (event_name, payload, device_hash, created_at, expires_at)
SELECT
  event_type,
  payload,
  device_id,
  created_at,
  created_at + INTERVAL '90 days'
FROM device_events
WHERE device_id IS NOT NULL
ON CONFLICT DO NOTHING;
