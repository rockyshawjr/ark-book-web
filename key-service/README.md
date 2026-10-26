# Ark-Book key service (limited Crew / View-only keys)
Supabase Edge Function `ark-keys` on project 12 Gauge Pro Wrestling (bgfvlysirfdzzftmptni).
- Full-access devices keep using the GitHub sync token directly. Nothing changes for them.
- Crew and View-only keys go through this function, which holds its own GitHub token and strips every booking fee before data leaves it, and drops any fee a key tries to write.
- Rebuild after changing core.js or websync.js: `cd svc && node build.mjs`. Tests: `node --test service.test.mjs` (mock GitHub, no network).
- Secret needed: `ARK_GH_TOKEN` (fine-grained, Contents read and write on rockyshawjr/g12-updates only). Optional: ARK_ADMIN_LOGINS (default rockyshawjr), ARK_ALLOWED_ORIGIN.
- Deploy with JWT verification off. Table: supabase/migrations/20261026_ark_keys.sql.
