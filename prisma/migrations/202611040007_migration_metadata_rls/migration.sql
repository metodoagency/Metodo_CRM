-- Migration metadata is private to the schema owner, never the app or Data API.
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC;
DO $metodo$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."_prisma_migrations" FROM authenticated;
  END IF;
END $metodo$;
