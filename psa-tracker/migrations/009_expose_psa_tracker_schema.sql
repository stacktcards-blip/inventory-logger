-- Expose psa_tracker schema to Supabase API.
-- Required for supabase-js .schema('psa_tracker') to work.

GRANT USAGE ON SCHEMA psa_tracker TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA psa_tracker TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA psa_tracker TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA psa_tracker TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA psa_tracker GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA psa_tracker GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
