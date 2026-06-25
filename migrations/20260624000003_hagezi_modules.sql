-- ─────────────────────────────────────────────────────────────────────────────
-- Drop das tabelas antigas (limpeza da versão anterior)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS filter_domains CASCADE;
DROP TABLE IF EXISTS filter_sources CASCADE;
DROP TABLE IF EXISTS blocked_domains CASCADE;
DROP TABLE IF EXISTS blocklist_sources CASCADE;
DROP TABLE IF EXISTS protection_modules CASCADE;
DROP TABLE IF EXISTS domain_categories CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela: protection_modules (Os pacotes oferecidos no VPN)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE protection_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT
);

INSERT INTO protection_modules (slug, name, description) VALUES
('ads', 'Bloqueador de Anúncios', 'Remove propagandas intrusivas'),
('tracker', 'Bloqueador de Rastreadores', 'Impede rastreamento de navegação e analytics'),
('malware', 'Proteção contra Malware', 'Bloqueia sites maliciosos e phishing'),
('adult', 'Filtro de Conteúdo Adulto', 'Bloqueia material sensível e NSFW'),
('social', 'Filtro de Redes Sociais', 'Bloqueia domínios de mídias sociais'),
('gambling', 'Filtro de Jogos de Azar', 'Bloqueia cassinos online e apostas'),
('bypass', 'Filtro DoH/VPN/Proxy', 'Bloqueia serviços de evasão de DNS');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabela: blocklist_sources (Fontes de dados de cada módulo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE blocklist_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    category TEXT NOT NULL,
    url TEXT NOT NULL,
    module_slug TEXT REFERENCES protection_modules(slug) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT TRUE,
    last_import_at TIMESTAMPTZ,
    domains_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir Fontes Hagezi (Módulos Base)
INSERT INTO blocklist_sources (name, provider, category, url, module_slug) VALUES
('Hagezi Pro', 'HaGeZi', 'ads', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/pro.txt', 'ads'),
('Hagezi TIF', 'HaGeZi', 'malware', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/tif.txt', 'malware'),
('Hagezi DoH/VPN', 'HaGeZi', 'bypass', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/doh-vpn-proxy-bypass.txt', 'bypass'),
('Apple Native Tracker', 'HaGeZi', 'tracker', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/native.apple.txt', 'tracker'),
('Amazon Native Tracker', 'HaGeZi', 'tracker', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/native.amazon.txt', 'tracker'),
('Microsoft Native Tracker', 'HaGeZi', 'tracker', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/native.microsoft.txt', 'tracker'),
('Hagezi NSFW', 'HaGeZi', 'adult', 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/light.nsfw.txt', 'adult');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela: blocked_domains (Dicionário único de domínios)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE blocked_domains (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabela: domain_categories (Relacionamento N:N)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE domain_categories (
    domain_id BIGINT REFERENCES blocked_domains(id) ON DELETE CASCADE,
    source_id UUID REFERENCES blocklist_sources(id) ON DELETE CASCADE,
    PRIMARY KEY(domain_id, source_id)
);

CREATE INDEX idx_domain_categories_source ON domain_categories(source_id);
