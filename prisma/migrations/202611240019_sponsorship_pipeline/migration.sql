-- CreateTable
CREATE TABLE "Campaign" (
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
    "startDate" DATE,
    "endDate" DATE,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipOpportunity" (
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
    "brandId" UUID NOT NULL,
    "campaignId" UUID,
    "stage" TEXT NOT NULL DEFAULT 'RESEARCH',
    "responsibilityMode" TEXT NOT NULL DEFAULT 'OWNER',
    "privateNextAction" TEXT,
    "nextActionDate" DATE,
    "lastContactDate" DATE,

    CONSTRAINT "SponsorshipOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityPlayer" (
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
    "opportunityId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'RESEARCH',
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "privateNextAction" TEXT,
    "nextActionDate" DATE,

    CONSTRAINT "OpportunityPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityContact" (
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
    "opportunityId" UUID NOT NULL,
    "participantId" UUID,
    "brandContactId" UUID,
    "personId" UUID,
    "role" TEXT NOT NULL,

    CONSTRAINT "OpportunityContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipStageEvent" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
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
    "opportunityId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "oldStage" TEXT,
    "newStage" TEXT,
    "oldOutcome" TEXT,
    "newOutcome" TEXT,
    "privateReason" TEXT,
    "batchId" UUID NOT NULL,

    CONSTRAINT "SponsorshipStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_ownerId_deletedAt_name_id_idx" ON "Campaign"("ownerId", "deletedAt", "name", "id");

-- CreateIndex
CREATE INDEX "SponsorshipOpportunity_ownerId_deletedAt_stage_id_idx" ON "SponsorshipOpportunity"("ownerId", "deletedAt", "stage", "id");

-- CreateIndex
CREATE INDEX "SponsorshipOpportunity_brandId_idx" ON "SponsorshipOpportunity"("brandId");

-- CreateIndex
CREATE INDEX "SponsorshipOpportunity_campaignId_idx" ON "SponsorshipOpportunity"("campaignId");

-- CreateIndex
CREATE INDEX "OpportunityPlayer_ownerId_deletedAt_opportunityId_id_idx" ON "OpportunityPlayer"("ownerId", "deletedAt", "opportunityId", "id");

-- CreateIndex
CREATE INDEX "OpportunityPlayer_playerId_idx" ON "OpportunityPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityPlayer_ownerId_opportunityId_playerId_key" ON "OpportunityPlayer"("ownerId", "opportunityId", "playerId");

-- CreateIndex
CREATE INDEX "OpportunityContact_ownerId_deletedAt_opportunityId_id_idx" ON "OpportunityContact"("ownerId", "deletedAt", "opportunityId", "id");

-- CreateIndex
CREATE INDEX "OpportunityContact_participantId_idx" ON "OpportunityContact"("participantId");

-- CreateIndex
CREATE INDEX "OpportunityContact_brandContactId_idx" ON "OpportunityContact"("brandContactId");

-- CreateIndex
CREATE INDEX "OpportunityContact_personId_idx" ON "OpportunityContact"("personId");

-- CreateIndex
CREATE INDEX "SponsorshipStageEvent_ownerId_opportunityId_createdAt_id_idx" ON "SponsorshipStageEvent"("ownerId", "opportunityId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SponsorshipStageEvent_entityId_idx" ON "SponsorshipStageEvent"("entityId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipOpportunity" ADD CONSTRAINT "SponsorshipOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipOpportunity" ADD CONSTRAINT "SponsorshipOpportunity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipOpportunity" ADD CONSTRAINT "SponsorshipOpportunity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPlayer" ADD CONSTRAINT "OpportunityPlayer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPlayer" ADD CONSTRAINT "OpportunityPlayer_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SponsorshipOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPlayer" ADD CONSTRAINT "OpportunityPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SponsorshipOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "OpportunityPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_brandContactId_fkey" FOREIGN KEY ("brandContactId") REFERENCES "BrandContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "SponsorshipStageEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "SponsorshipStageEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SponsorshipOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints and server-only ownership boundary, before first application.
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");
ALTER TABLE "SponsorshipOpportunity" ADD CONSTRAINT "Opportunity_stage_check" CHECK ("stage" IN ('RESEARCH','CONTACT','PROPOSAL','NEGOTIATION','AGREEMENT','ACTIVE','COMPLETED','LOST','CANCELLED')), ADD CONSTRAINT "Opportunity_responsibility_check" CHECK ("responsibilityMode" IN ('OWNER','PERSON'));
ALTER TABLE "OpportunityPlayer" ADD CONSTRAINT "OpportunityPlayer_stage_check" CHECK ("stage" IN ('RESEARCH','CONTACT','PROPOSAL','NEGOTIATION','AGREEMENT','ACTIVE','COMPLETED','LOST','CANCELLED')), ADD CONSTRAINT "OpportunityPlayer_outcome_check" CHECK ("outcome" IN ('PENDING','WON','LOST','WITHDRAWN'));
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_target_check" CHECK (("role"='BRAND' AND "brandContactId" IS NOT NULL AND "personId" IS NULL) OR ("role"='RESPONSIBLE' AND "personId" IS NOT NULL AND "brandContactId" IS NULL AND "participantId" IS NULL));
CREATE UNIQUE INDEX "OpportunityContact_brand_unique" ON "OpportunityContact" ("ownerId", "opportunityId", COALESCE("participantId", '00000000-0000-0000-0000-000000000000'::uuid), "brandContactId") WHERE "role"='BRAND';
CREATE UNIQUE INDEX "OpportunityContact_responsible_unique" ON "OpportunityContact" ("ownerId", "opportunityId") WHERE "role"='RESPONSIBLE';
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "StageEvent_type_check" CHECK ("entityType" IN ('SponsorshipOpportunity','OpportunityPlayer','OpportunityContact') AND ("entityType" <> 'SponsorshipOpportunity' OR "entityId"="opportunityId")), ADD CONSTRAINT "StageEvent_kind_check" CHECK ("kind" IN ('CREATE','UPDATE','TRANSITION','LINK','UNLINK'));
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "StageEvent_oldStage_check" CHECK ("oldStage" IS NULL OR "oldStage" IN ('RESEARCH','CONTACT','PROPOSAL','NEGOTIATION','AGREEMENT','ACTIVE','COMPLETED','LOST','CANCELLED'));
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "StageEvent_newStage_check" CHECK ("newStage" IS NULL OR "newStage" IN ('RESEARCH','CONTACT','PROPOSAL','NEGOTIATION','AGREEMENT','ACTIVE','COMPLETED','LOST','CANCELLED'));
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "StageEvent_oldOutcome_check" CHECK ("oldOutcome" IS NULL OR "oldOutcome" IN ('PENDING','WON','LOST','WITHDRAWN'));
ALTER TABLE "SponsorshipStageEvent" ADD CONSTRAINT "StageEvent_newOutcome_check" CHECK ("newOutcome" IS NULL OR "newOutcome" IN ('PENDING','WON','LOST','WITHDRAWN'));
DO $metodo$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['Campaign','SponsorshipOpportunity','OpportunityPlayer','OpportunityContact','SponsorshipStageEvent'] LOOP
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
