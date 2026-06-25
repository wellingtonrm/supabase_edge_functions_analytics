-- 1. Create filter_sources table
CREATE TABLE filter_sources (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    region TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insert default sources
INSERT INTO filter_sources (name, url, category, region) VALUES
('EasyList', 'https://easylist.to/easylist/easylist.txt', 'ads', 'GLOBAL'),
('EasyPrivacy', 'https://easylist.to/easylist/easyprivacy.txt', 'tracker', 'GLOBAL'),
('AdGuard Base', 'https://filters.adtidy.org/extension/ublock/filters/2.txt', 'ads', 'GLOBAL');

-- 3. Create filter_domains table
CREATE TABLE filter_domains (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT NOT NULL,
    category TEXT NOT NULL,
    region TEXT NOT NULL,
    source TEXT NOT NULL,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(domain)
);

-- 4. Create indexes for high-speed queries
CREATE INDEX idx_filter_domains_domain ON filter_domains(domain);
CREATE INDEX idx_filter_domains_category ON filter_domains(category);
