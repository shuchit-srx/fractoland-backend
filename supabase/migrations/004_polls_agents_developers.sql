-- Migration 004: polls, poll_votes, agent_earnings, developer_bids
-- Depends on: 001_core_tables.sql, 002_referral_ventures_tokens.sql, 003_payments_investments_resale.sql

-- Enums for polls and related
CREATE TYPE poll_status_enum AS ENUM ('active', 'closed');
CREATE TYPE poll_result_enum AS ENUM ('approved', 'rejected');
CREATE TYPE poll_vote_enum AS ENUM ('yes', 'no');
CREATE TYPE agent_earning_type_enum AS ENUM ('commission', 'bonus', 'withdrawal');
CREATE TYPE agent_earning_status_enum AS ENUM ('pending', 'credited', 'completed', 'failed');
CREATE TYPE developer_bid_status_enum AS ENUM ('pending', 'approved', 'rejected', 'outbid');

-- polls (voting)
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  type VARCHAR(50),
  question TEXT NOT NULL,
  description TEXT,
  rule VARCHAR(100),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status poll_status_enum,
  result poll_result_enum,
  yes_count INT DEFAULT 0,
  no_count INT DEFAULT 0,
  total_eligible_tokens BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polls_venture_id ON polls(venture_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_polls_ends_at ON polls(ends_at);

-- poll_votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote poll_vote_enum,
  token_weight INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);

-- agent_earnings
CREATE TABLE IF NOT EXISTS agent_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type agent_earning_type_enum,
  amount DECIMAL(18,2) NOT NULL,
  investment_id UUID REFERENCES investments(id) ON DELETE SET NULL,
  referral_link_id UUID REFERENCES referral_links(id) ON DELETE SET NULL,
  status agent_earning_status_enum,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_earnings_agent_id ON agent_earnings(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_earnings_investment_id ON agent_earnings(investment_id);
CREATE INDEX IF NOT EXISTS idx_agent_earnings_created_at ON agent_earnings(created_at DESC);

-- developer_bids
CREATE TABLE IF NOT EXISTS developer_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  bid_amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status developer_bid_status_enum,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_developer_bids_developer_id ON developer_bids(developer_id);
CREATE INDEX IF NOT EXISTS idx_developer_bids_venture_id ON developer_bids(venture_id);
CREATE INDEX IF NOT EXISTS idx_developer_bids_status ON developer_bids(status);

-- updated_at triggers
DROP TRIGGER IF EXISTS polls_updated_at ON polls;
CREATE TRIGGER polls_updated_at BEFORE UPDATE ON polls FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS agent_earnings_updated_at ON agent_earnings;
CREATE TRIGGER agent_earnings_updated_at BEFORE UPDATE ON agent_earnings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS developer_bids_updated_at ON developer_bids;
CREATE TRIGGER developer_bids_updated_at BEFORE UPDATE ON developer_bids FOR EACH ROW EXECUTE FUNCTION update_updated_at();
