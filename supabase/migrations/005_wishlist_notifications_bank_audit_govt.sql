-- Migration 005: wishlist, notifications, bank_accounts, audit_logs, govt_api_tokens
-- Also: refresh_tokens.revoked_at, developer_profiles (doc §8.3 Option B)
-- Depends on: 001_core_tables.sql, 002_referral_ventures_tokens.sql, 003_payments_investments_resale.sql

-- Enums for wishlist and notifications
CREATE TYPE wishlist_status_enum AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE notification_type_enum AS ENUM ('success', 'action', 'info', 'alert');

-- refresh_tokens: add revoked_at for logout invalidation (§8.6)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'refresh_tokens' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE refresh_tokens ADD COLUMN revoked_at TIMESTAMPTZ;
  END IF;
END $$;

-- developer_profiles (Option B from §8.3; use if not using developer_extras from 001)
CREATE TABLE IF NOT EXISTS developer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  gstin VARCHAR(50),
  license_number VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_user_id ON developer_profiles(user_id);
DROP TRIGGER IF EXISTS developer_profiles_updated_at ON developer_profiles;
CREATE TRIGGER developer_profiles_updated_at BEFORE UPDATE ON developer_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- wishlist (EOI / interested lands)
CREATE TABLE IF NOT EXISTS wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  selected_piece_ids JSONB,
  total_amount DECIMAL(18,2),
  status wishlist_status_enum,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_venture_id ON wishlist(venture_id);

-- notifications (§8.1)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  type notification_type_enum,
  read BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- bank_accounts (§8.2, for withdrawals)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_holder_name VARCHAR(255),
  bank_name VARCHAR(255),
  account_number_encrypted TEXT,
  ifsc VARCHAR(20),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);
DROP TRIGGER IF EXISTS bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- govt_api_tokens
CREATE TABLE IF NOT EXISTS govt_api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100),
  token_hash VARCHAR(255),
  permissions JSONB,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_govt_api_tokens_token_hash ON govt_api_tokens(token_hash);
DROP TRIGGER IF EXISTS govt_api_tokens_updated_at ON govt_api_tokens;
CREATE TRIGGER govt_api_tokens_updated_at BEFORE UPDATE ON govt_api_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id UUID,
  payload JSONB,
  ip VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- wishlist updated_at trigger
DROP TRIGGER IF EXISTS wishlist_updated_at ON wishlist;
CREATE TRIGGER wishlist_updated_at BEFORE UPDATE ON wishlist FOR EACH ROW EXECUTE FUNCTION update_updated_at();
