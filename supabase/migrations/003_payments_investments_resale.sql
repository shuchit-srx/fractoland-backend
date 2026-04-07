-- Migration 003: payments, investments, resale_requests
-- Depends on: 001_core_tables.sql, 002_referral_ventures_tokens.sql

-- Enums for payments and investments
CREATE TYPE payment_type_enum AS ENUM (
  'add_funds', 'investment', 'withdrawal', 'royalty', 'refund'
);
CREATE TYPE payment_status_enum AS ENUM (
  'pending', 'completed', 'failed', 'refunded'
);
CREATE TYPE investment_status_enum AS ENUM (
  'pending', 'completed', 'failed', 'refunded'
);
CREATE TYPE resale_status_enum AS ENUM (
  'pending', 'listed', 'matched', 'completed', 'cancelled'
);

-- payments (must exist before investments)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type payment_type_enum,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status payment_status_enum,
  gateway VARCHAR(50),
  gateway_order_id VARCHAR(255),
  gateway_payment_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- investments
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  token_count INT NOT NULL,
  amount_paid DECIMAL(18,2) NOT NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  tx_hash VARCHAR(66),
  token_ids_on_chain JSONB,
  referral_link_id UUID REFERENCES referral_links(id) ON DELETE SET NULL,
  status investment_status_enum,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_venture_id ON investments(venture_id);
CREATE INDEX IF NOT EXISTS idx_investments_payment_id ON investments(payment_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);

-- resale_requests
CREATE TABLE IF NOT EXISTS resale_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  token_count INT NOT NULL,
  requested_amount DECIMAL(18,2),
  status resale_status_enum,
  queue_position INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resale_requests_user_id ON resale_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_resale_requests_venture_id ON resale_requests(venture_id);
CREATE INDEX IF NOT EXISTS idx_resale_requests_status ON resale_requests(status);

-- updated_at triggers
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS investments_updated_at ON investments;
CREATE TRIGGER investments_updated_at BEFORE UPDATE ON investments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS resale_requests_updated_at ON resale_requests;
CREATE TRIGGER resale_requests_updated_at BEFORE UPDATE ON resale_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
