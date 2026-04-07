-- Ventures module tables for Fracto Land (run in Supabase SQL editor if not using migrations).
-- Requires: users table already exists.

-- Ventures (land parcels / listings)
CREATE TABLE IF NOT EXISTS ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref VARCHAR(50) UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  land_type VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'under_verification', 'live', 'voting', 'sold', 'closed')),
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
  features JSONB DEFAULT '[]',
  exit_conditions JSONB DEFAULT '[]',
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
CREATE INDEX IF NOT EXISTS idx_ventures_state ON ventures(state);

-- Venture tokens (one row per venture for token economics)
CREATE TABLE IF NOT EXISTS venture_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  token_price DECIMAL(18,2) NOT NULL,
  total_tokens INT NOT NULL,
  available_tokens INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venture_id)
);

CREATE INDEX IF NOT EXISTS idx_venture_tokens_venture_id ON venture_tokens(venture_id);

-- Venture documents (S3 keys and metadata)
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

-- Venture images (gallery)
CREATE TABLE IF NOT EXISTS venture_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  file_key VARCHAR(500),
  file_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venture_images_venture_id ON venture_images(venture_id);

-- Optional: enable RLS and add policies per your security rules
-- ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;
-- etc.

-- Storage: Create a bucket named "ventures" (or SUPABASE_STORAGE_BUCKET) in Supabase Dashboard → Storage
-- for venture documents and images. Use private bucket + signed URLs, or public if you prefer.
