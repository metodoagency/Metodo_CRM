ALTER TABLE "Agent" ADD COLUMN "birthDate" TEXT, ADD COLUMN "hideBirthYear" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "hideBirthYear" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "birthdayThresholds" JSONB NOT NULL DEFAULT '[30,7,0]';

CREATE TABLE "BirthdayGreeting" (
 "id" UUID NOT NULL, "ownerId" TEXT NOT NULL DEFAULT 'owner', "isExample" BOOLEAN NOT NULL DEFAULT false,
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdBy" TEXT NOT NULL DEFAULT 'owner', "updatedBy" TEXT NOT NULL DEFAULT 'owner', "version" INTEGER NOT NULL DEFAULT 1,
 "fieldProvenance" JSONB NOT NULL DEFAULT '{}', "sourceUrl" TEXT, "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
 "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
 "entityType" TEXT NOT NULL, "entityId" UUID NOT NULL, "year" INTEGER NOT NULL, "greetingNote" TEXT, "sentAt" TIMESTAMP(3),
 CONSTRAINT "BirthdayGreeting_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BirthdayGreeting_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "BirthdayGreeting_subject_check" CHECK ("entityType" IN ('Person', 'Player', 'Agent') AND "year" BETWEEN 1900 AND 9999)
);
CREATE UNIQUE INDEX "BirthdayGreeting_ownerId_entityType_entityId_year_key" ON "BirthdayGreeting"("ownerId", "entityType", "entityId", "year");
CREATE INDEX "BirthdayGreeting_ownerId_deletedAt_idx" ON "BirthdayGreeting"("ownerId", "deletedAt");

CREATE TABLE "SignificantDate" (
 "id" UUID NOT NULL, "ownerId" TEXT NOT NULL DEFAULT 'owner', "isExample" BOOLEAN NOT NULL DEFAULT false,
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdBy" TEXT NOT NULL DEFAULT 'owner', "updatedBy" TEXT NOT NULL DEFAULT 'owner', "version" INTEGER NOT NULL DEFAULT 1,
 "fieldProvenance" JSONB NOT NULL DEFAULT '{}', "sourceUrl" TEXT, "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
 "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
 "name" TEXT NOT NULL, "date" DATE NOT NULL,
 CONSTRAINT "SignificantDate_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SignificantDate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SignificantDate_ownerId_deletedAt_date_id_idx" ON "SignificantDate"("ownerId", "deletedAt", "date", "id");

DO $metodo$
DECLARE table_name text;
DECLARE api_role text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['BirthdayGreeting', 'SignificantDate'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
   END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metodo_app') THEN
   EXECUTE format('CREATE POLICY metodo_owner_server ON public.%I FOR ALL TO metodo_app USING ("ownerId" = ''owner'') WITH CHECK ("ownerId" = ''owner'')', table_name);
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO metodo_app', table_name);
  END IF;
 END LOOP;
END $metodo$;
