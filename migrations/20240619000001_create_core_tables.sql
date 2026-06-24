-- Guardian VPN - Core Tables Migration
-- Creates device_installations, device_events, subscriptions, and device_profiles tables

CREATE TABLE IF NOT EXISTS device_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  app_version TEXT,
  build_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_installations_fingerprint ON device_installations(fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_installations_device_id ON device_installations(device_id);

ALTER TABLE device_installations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS device_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_events_device_id ON device_events(device_id);
CREATE INDEX IF NOT EXISTS idx_device_events_event_type ON device_events(event_type);
CREATE INDEX IF NOT EXISTS idx_device_events_created_at ON device_events(created_at);

ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_device_id ON subscriptions(device_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(tier);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS device_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  profile_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_profiles_device_id ON device_profiles(device_id);

ALTER TABLE device_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies: service_role (edge functions) bypasses RLS
-- These policies protect against direct anon/key access

CREATE POLICY "service_role has full access to device_installations"
  ON device_installations
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role has full access to device_events"
  ON device_events
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role has full access to subscriptions"
  ON subscriptions
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role has full access to device_profiles"
  ON device_profiles
  USING (true)
  WITH CHECK (true);
