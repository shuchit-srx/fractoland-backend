-- Core tables for Auth and Users (run in Supabase SQL editor or via Supabase CLI)

-- Enum types
CREATE TYPE user_role AS ENUM ('customer', 'agent', 'owner', 'developer', 'admin');
CREATE TYPE kyc_status_enum AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE otp_purpose_enum AS ENUM ('login', 'register');

-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  role user_role NOT NULL DEFAULT 'customer',
  country_code VARCHAR(5) DEFAULT '+91',
  kyc_status kyc_status_enum DEFAULT 'pending',
  kyc_type VARCHAR(50),
  kyc_id_encrypted TEXT,
  wallet_address VARCHAR(42),
  referred_by_agent_id UUID REFERENCES users(id),
  referred_by_link_id UUID,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(phone)
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- wallets (fiat balance, one per user)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(18,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- otp_logs
CREATE TABLE IF NOT EXISTS otp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  country_code VARCHAR(5) DEFAULT '+91',
  otp_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'login',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_logs_phone_created ON otp_logs(phone, created_at DESC);

-- refresh_tokens (optional, for token rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- developer_extras (company, GSTIN, license for developer role)
CREATE TABLE IF NOT EXISTS developer_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  gstin VARCHAR(50),
  license_number VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_developer_extras_user ON developer_extras(user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS wallets_updated_at ON wallets;
CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS developer_extras_updated_at ON developer_extras;
CREATE TRIGGER developer_extras_updated_at BEFORE UPDATE ON developer_extras FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Optional: enable RLS and policies (uncomment if using Supabase Auth or RLS)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE otp_logs ENABLE ROW LEVEL SECURITY;
