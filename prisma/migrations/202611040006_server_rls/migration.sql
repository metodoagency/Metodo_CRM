-- All CRM tables deny Data API access. The backend uses its own restricted role.
DO $metodo$
DECLARE table_name text; predicate text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Owner', 'Session', 'OAuthAttempt', 'Continent', 'Country', 'Region', 'League', 'Club', 'AgeTeam', 'Person', 'Agent', 'Player', 'Contract', 'PerformanceRecord', 'Request', 'Suggestion', 'SalesListing', 'Presentation', 'Meeting', 'Task', 'Match', 'ScoutReport', 'Event', 'Speaker', 'Source', 'UpdateProposal', 'Tool', 'OutsourceContact', 'FinanceEntry', 'WorkLog', 'Relation', 'TimelineEvent', 'Notification', 'Attachment', 'SavedView', 'UserSettings', 'AuditLog', 'TrashEntry', 'Note', 'Mandate', 'Guardian', 'MedicalRecord', 'MedicalAccessLog', 'ImageRightsAgreement', 'DataImport', 'PlayerStat', 'ScoutAssignment', 'ExpenseClaim', 'WatchlistEntry', 'Deal', 'CommissionTerm', 'PaymentSchedule', 'TransferProcess', 'ClubStakeholder', 'ClubFinancialProfile', 'TransferWindow', 'LicenseRecord', 'Case', 'Template', 'TemplateVersion', 'ShareLink', 'MediaContact', 'PressItem'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metodo_app') THEN
      predicate := CASE table_name WHEN 'Owner' THEN 'id = ''owner''' WHEN 'OAuthAttempt' THEN 'true' ELSE '"ownerId" = ''owner''' END;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'metodo_owner_server') THEN
        EXECUTE format('CREATE POLICY metodo_owner_server ON public.%I FOR ALL TO metodo_app USING (%s) WITH CHECK (%s)', table_name, predicate, predicate);
      END IF;
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO metodo_app', table_name);
    END IF;
  END LOOP;
END $metodo$;
