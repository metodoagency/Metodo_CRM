-- Append to the owner-approved Prisma history. Existing rows remain unchanged.
ALTER TABLE "Contract" ADD COLUMN "agentId" UUID,
 ADD COLUMN "sourceDate" DATE, ADD COLUMN "methodNote" TEXT;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_agentId_fkey"
 FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Contract_agentId_idx" ON "Contract"("agentId");
CREATE INDEX "Contract_ownerId_deletedAt_endDate_id_idx"
 ON "Contract"("ownerId", "deletedAt", "endDate", "id");
-- Contract already has RLS and server-only grants/policies from migration006.
-- Adding nullable columns neither grants Data API access nor changes that policy.
