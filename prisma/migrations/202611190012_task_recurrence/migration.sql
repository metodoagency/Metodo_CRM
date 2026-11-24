-- Preserve the approved Prisma migration history; no new Supabase CLI track.
ALTER TABLE "Task" ADD COLUMN "generationKey" TEXT,
 ADD COLUMN "recurrenceGenerated" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Task_generationKey_key" ON "Task"("generationKey");
CREATE INDEX "Task_ownerId_deletedAt_status_dueDate_id_idx"
 ON "Task"("ownerId", "deletedAt", "status", "dueDate", "id");
-- Existing Task RLS and server-only grants from migration006 remain unchanged.
-- No self-FK: occurrences are independent records and lifecycle stays acyclic.
