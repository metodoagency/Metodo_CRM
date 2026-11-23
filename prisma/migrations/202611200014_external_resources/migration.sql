-- CreateTable
CREATE TABLE "ExternalResource" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,

    CONSTRAINT "ExternalResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalResourceLink" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "clubId" UUID,
    "playerId" UUID,
    "personId" UUID,
    "requestId" UUID,
    "suggestionId" UUID,
    "contractId" UUID,

    CONSTRAINT "ExternalResourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalResource_ownerId_deletedAt_idx" ON "ExternalResource"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ExternalResource_ownerId_idx" ON "ExternalResource"("ownerId");

-- CreateIndex
CREATE INDEX "ExternalResource_ownerId_deletedAt_createdAt_id_idx" ON "ExternalResource"("ownerId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_ownerId_deletedAt_idx" ON "ExternalResourceLink"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_ownerId_idx" ON "ExternalResourceLink"("ownerId");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_clubId_idx" ON "ExternalResourceLink"("clubId");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_playerId_idx" ON "ExternalResourceLink"("playerId");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_personId_idx" ON "ExternalResourceLink"("personId");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_requestId_idx" ON "ExternalResourceLink"("requestId");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_suggestionId_idx" ON "ExternalResourceLink"("suggestionId");

-- CreateIndex
CREATE INDEX "ExternalResourceLink_contractId_idx" ON "ExternalResourceLink"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResourceLink_resourceId_clubId_key" ON "ExternalResourceLink"("resourceId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResourceLink_resourceId_playerId_key" ON "ExternalResourceLink"("resourceId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResourceLink_resourceId_personId_key" ON "ExternalResourceLink"("resourceId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResourceLink_resourceId_requestId_key" ON "ExternalResourceLink"("resourceId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResourceLink_resourceId_suggestionId_key" ON "ExternalResourceLink"("resourceId", "suggestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResourceLink_resourceId_contractId_key" ON "ExternalResourceLink"("resourceId", "contractId");

-- AddForeignKey
ALTER TABLE "ExternalResource" ADD CONSTRAINT "ExternalResource_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ExternalResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A library resource is independent. Only its typed links depend on parents.
ALTER TABLE "ExternalResourceLink" ADD CONSTRAINT "ExternalResourceLink_exactly_one_parent"
 CHECK (num_nonnulls("clubId", "playerId", "personId", "requestId", "suggestionId", "contractId") = 1);
ALTER TABLE "ExternalResource" ADD CONSTRAINT "ExternalResource_kind_check"
 CHECK ("kind" IN ('DOCUMENT','REPRESENTATION_CONTRACT','EMPLOYMENT_CONTRACT','SPONSOR_AGREEMENT','DOSSIER','CLIP','FULL_MATCH','PHOTO','DESIGN','FOLDER','OTHER'));

-- Match the existing server-only owner policy; never expose via the Data API.
DO $metodo$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['ExternalResource', 'ExternalResourceLink'] LOOP
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
