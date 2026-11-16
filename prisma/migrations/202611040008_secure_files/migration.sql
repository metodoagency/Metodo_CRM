ALTER TABLE "Attachment" ADD COLUMN "storageDriver" TEXT NOT NULL DEFAULT 'local', ADD COLUMN "contentHash" TEXT;
CREATE TABLE "ProcessingConsent" (
 "id" UUID NOT NULL, "ownerId" TEXT NOT NULL DEFAULT 'owner',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "deletedAt" TIMESTAMP(3), "createdBy" TEXT NOT NULL DEFAULT 'owner', "updatedBy" TEXT NOT NULL DEFAULT 'owner',
 "version" INTEGER NOT NULL DEFAULT 1, "isExample" BOOLEAN NOT NULL DEFAULT false,
 "fieldProvenance" JSONB NOT NULL DEFAULT '{}', "sourceUrl" TEXT, "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
 "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
 "name" TEXT NOT NULL DEFAULT 'processing', "attachmentId" UUID NOT NULL, "attachmentVersion" INTEGER NOT NULL,
 "adapterId" TEXT NOT NULL, "adapterRevision" TEXT NOT NULL, "adapterLocation" TEXT NOT NULL, "destination" TEXT NOT NULL,
 "processingPayload" TEXT NOT NULL, "processingResult" TEXT, "previewToken" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "approvedAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'PENDING',
 CONSTRAINT "ProcessingConsent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProcessingConsent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProcessingConsent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProcessingConsent_ownerId_deletedAt_idx" ON "ProcessingConsent"("ownerId", "deletedAt");
CREATE INDEX "ProcessingConsent_attachmentId_idx" ON "ProcessingConsent"("attachmentId");
CREATE TABLE "StorageDeletion" (
 "id" UUID NOT NULL, "ownerId" TEXT NOT NULL DEFAULT 'owner', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "driver" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "notBefore" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "StorageDeletion_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StorageDeletion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StorageDeletion_ownerId_driver_notBefore_idx" ON "StorageDeletion"("ownerId", "driver", "notBefore");
DO $metodo$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['ProcessingConsent', 'StorageDeletion'] LOOP
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
