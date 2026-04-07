# FractoLand PostgreSQL Migrations

Migrations follow the schema in **fractoland-ui/docs/FractoLand_Backend_DB_and_Blockchain_Guide.md**.

## Run order

1. **000_core_tables.sql** – Enums (`user_role`, `kyc_status_enum`, `otp_purpose_enum`), `users`, `wallets`, `otp_logs`, `refresh_tokens`, `developer_extras`, `update_updated_at()` trigger.
2. **001_ventures_tables.sql** – `ventures`, `venture_tokens`, `venture_documents`, `venture_images` (ventures module; requires `users`).
3. **002_referral_ventures_tokens.sql** – `referral_links`, `venture_status_enum`; FK `users.referred_by_link_id` → `referral_links(id)`; optional re-definition of ventures/tokens/documents/images with `IF NOT EXISTS` and triggers.
4. **003_payments_investments_resale.sql** – `payments`, `investments`, `resale_requests`.
5. **004_polls_agents_developers.sql** – `polls`, `poll_votes`, `agent_earnings`, `developer_bids`.
6. **005_wishlist_notifications_bank_audit_govt.sql** – `refresh_tokens.revoked_at`, `developer_profiles`, `wishlist`, `notifications`, `bank_accounts`, `govt_api_tokens`, `audit_logs`.

## How to run

- **Supabase:** Run each file in order in the SQL Editor, or use `supabase db push` if using Supabase CLI.
- **Plain PostgreSQL:** `psql -f 000_core_tables.sql`, then 001 → 002 → 003 → 004 → 005 in order.

## Notes

- **developer_extras** (000) vs **developer_profiles** (005): doc §8.3 offers both; 000 uses `developer_extras`, 005 adds `developer_profiles`. Use one per project.
- **001 vs 002 ventures:** 001 creates the ventures stack first; 002 adds referral links and the user→referral_link FK. If you run 002 after 001, its `CREATE TABLE ... IF NOT EXISTS` for ventures/tokens/documents/images will no-op.
- Soft deletes: doc uses `deleted_at` only at the API layer; these migrations do not add `deleted_at`. Add it later if needed.
- All FKs use `ON DELETE CASCADE` or `ON DELETE SET NULL` as in the guide.
