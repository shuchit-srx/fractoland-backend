-- Migration 002: referral_links, ventures, venture_tokens, venture_documents, venture_images
-- Depends on: 001_core_tables.sql (users)

-- Enums for ventures
CREATE TYPE venture_status_enum AS ENUM (
  'draft', 'under_verification', 'live', 'voting', 'sold', 'closed'
);

-- referral_links (must exist before users.referred_by_link_id FK)
CREATE TABLE IF NOT EXISTS referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100),
  code VARCHAR(50) NOT NULL,
  full_url VARCHAR(500),
  clicks INT DEFAULT 0,
  signups INT DEFAULT 0,
  conversions INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code)
);

CREATE INDEX IF NOT EXISTS idx_referral_links_agent_id ON referral_links(agent_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_code ON referral_links(code);

-- Add FK from users to referral_links if column exists and constraint not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_referred_by_link_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_referred_by_link_id_fkey
      FOREIGN KEY (referred_by_link_id) REFERENCES referral_links(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ventures (land parcels / listings)
CREATE TABLE IF NOT EXISTS ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref VARCHAR(50) UNIQUE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  land_type VARCHAR(50),
  status venture_status_enum NOT NULL DEFAULT 'draft',
  description TEXT,
  litigation_description TEXT,
  survey_number VARCHAR(100),
  village VARCHAR(100),
  hobli VARCHAR(100),
  mandal VARCHAR(100),
  district VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  full_address TEXT,
  area_acres DECIMAL(12,4),
  price_per_sqft DECIMAL(18,2),
  total_value DECIMAL(18,2),
  expected_roi_percent DECIMAL(5,2),
  lock_in_months INT,
  features JSONB,
  exit_conditions JSONB,
  map_geojson JSONB,
  map_center_lat DECIMAL(10,6),
  map_center_lng DECIMAL(10,6),
  contract_address VARCHAR(42),
  contract_venture_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventures_owner_id ON ventures(owner_id);
CREATE INDEX IF NOT EXISTS idx_ventures_status ON ventures(status);
CREATE INDEX IF NOT EXISTS idx_ventures_ref ON ventures(ref);

-- venture_tokens
CREATE TABLE IF NOT EXISTS venture_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  token_price DECIMAL(18,2) NOT NULL,
  total_tokens INT NOT NULL,
  available_tokens INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venture_tokens_venture_id ON venture_tokens(venture_id);

-- venture_documents
CREATE TABLE IF NOT EXISTS venture_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  name VARCHAR(255),
  file_key VARCHAR(500),
  file_url TEXT,
  file_size_bytes BIGINT,
  file_type VARCHAR(50),
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venture_documents_venture_id ON venture_documents(venture_id);

-- venture_images
CREATE TABLE IF NOT EXISTS venture_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  file_key VARCHAR(500),
  file_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venture_images_venture_id ON venture_images(venture_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS referral_links_updated_at ON referral_links;
CREATE TRIGGER referral_links_updated_at BEFORE UPDATE ON referral_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS ventures_updated_at ON ventures;
CREATE TRIGGER ventures_updated_at BEFORE UPDATE ON ventures FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS venture_tokens_updated_at ON venture_tokens;
CREATE TRIGGER venture_tokens_updated_at BEFORE UPDATE ON venture_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS venture_documents_updated_at ON venture_documents;
CREATE TRIGGER venture_documents_updated_at BEFORE UPDATE ON venture_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
