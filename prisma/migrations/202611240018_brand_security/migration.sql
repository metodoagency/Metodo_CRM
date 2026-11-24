ALTER TABLE "BrandContact" ADD CONSTRAINT "BrandContact_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");
DO $metodo$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['Brand', 'BrandContact'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name); END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name); END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metodo_app') THEN
   EXECUTE format('CREATE POLICY metodo_owner_server ON public.%I FOR ALL TO metodo_app USING ("ownerId" = ''owner'') WITH CHECK ("ownerId" = ''owner'')', table_name);
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO metodo_app', table_name);
  END IF;
 END LOOP;
END $metodo$;
