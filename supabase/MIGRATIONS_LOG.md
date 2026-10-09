# Migrations Log

Format: `file · project · date · who`

> Never edit an applied migration. Any later change is a new numbered file.

| File | Project | Date | Who | Notes |
|---|---|---|---|---|
| `0001_foundation.sql` | fairybread-dev | 2025 | You | Phase 1 — schemas, extensions check |
| `0002_tables.sql` | fairybread-dev | 2025 | You | Phase 1 — all core business tables |
| `0003_settings.sql` | fairybread-dev | 2025 | You | Phase 1 — app_settings table + defaults |
| `0004_helpers.sql` | fairybread-dev | 2025 | You | Phase 1 — utility functions |
| `0005_auth_triggers.sql` | fairybread-dev | 2025 | You | Phase 1 — on_auth_user_created trigger |
| `0006_rpc_business.sql` | fairybread-dev | 2025 | You | Phase 1 — business RPC functions |
| `0007_rpc_comms.sql` | fairybread-dev | 2025 | You | Phase 1 — comms RPC functions |
| `0008_rls.sql` | fairybread-dev | 2025 | You | Phase 1 — all RLS policies |
| `0009_grants.sql` | fairybread-dev | 2025 | You | Phase 1 — role grants |
| `0010_views_storage_realtime.sql` | fairybread-dev | 2025 | You | Phase 1 — views, storage buckets, realtime |
| `0011_cron.sql` | fairybread-dev | 2025 | You | Phase 1 — pg_cron jobs (9 jobs) |
| `0012a_shop_enums.sql` | fairybread-dev | 2025 | You | Phase 2 — shop enums (run unwrapped, no transaction) |
| `0012b_shop.sql` | fairybread-dev | 2025 | You | Phase 2 — shop tables, RLS, RPC, cron (partial-run cleanup required before final apply) |
| `0013_auth_otp_hygiene.sql` | fairybread-dev | 2025 | You | Phase 2 — OTP hygiene cron job (10th cron job) |
| `seed.sql` | fairybread-dev | 2025 | You | Phase 2 — demo world seed (7 users, 6 products, 3 orders) |
| `dev_reset.sql` | fairybread-dev | 2025 | You | Phase 2 — wipe script created; rehearsal run confirmed |
| *(Phase 3 — no SQL run)* | — | — | — | Frontend infrastructure only; no migrations |
| *(Phase 4 — no SQL run)* | — | — | — | Auth wiring; no migrations |
