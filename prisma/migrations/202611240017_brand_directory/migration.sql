-- CreateTable
CREATE TABLE "Brand" (
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
    "sector" TEXT NOT NULL DEFAULT '',
    "website" TEXT,
    "relationStatus" "RelationStatus" NOT NULL DEFAULT 'NEW',

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandContact" (
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
    "brandId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "roleTitle" TEXT NOT NULL DEFAULT '',
    "startDate" DATE,
    "endDate" DATE,

    CONSTRAINT "BrandContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_ownerId_deletedAt_name_id_idx" ON "Brand"("ownerId", "deletedAt", "name", "id");

-- CreateIndex
CREATE INDEX "BrandContact_ownerId_deletedAt_brandId_id_idx" ON "BrandContact"("ownerId", "deletedAt", "brandId", "id");

-- CreateIndex
CREATE INDEX "BrandContact_personId_idx" ON "BrandContact"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandContact_ownerId_brandId_personId_key" ON "BrandContact"("ownerId", "brandId", "personId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandContact" ADD CONSTRAINT "BrandContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandContact" ADD CONSTRAINT "BrandContact_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandContact" ADD CONSTRAINT "BrandContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
