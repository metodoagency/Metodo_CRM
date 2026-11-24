ALTER TABLE "UserSettings" ADD COLUMN "presentationFollowUpTasksEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "presentationTaskRuleVersion" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "presentationTaskRuleSince" TIMESTAMP(3);

CREATE TABLE "TaskGenerationReceipt" (
 "id" UUID NOT NULL PRIMARY KEY,
 "ownerId" TEXT NOT NULL DEFAULT 'owner',
 "isExample" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1,
 "name" TEXT NOT NULL,
 "ruleKey" TEXT NOT NULL,
 "entityType" TEXT NOT NULL,
 "entityId" UUID NOT NULL,
 "targetDate" DATE NOT NULL,
 "taskId" UUID NOT NULL,
 "sourceVersion" INTEGER NOT NULL,
 "ruleVersion" INTEGER NOT NULL,
 CONSTRAINT "TaskGenerationReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "TaskGenerationReceipt_source_check" CHECK ("entityType" = 'Presentation' AND "ruleKey" = 'presentation-follow-up-v1')
);
-- No Task FK: owner purge must not erase the consumed occurrence.
CREATE UNIQUE INDEX "TaskGenerationReceipt_occurrence_key" ON "TaskGenerationReceipt"("ownerId", "ruleKey", "entityType", "entityId", "targetDate");
CREATE INDEX "TaskGenerationReceipt_ownerId_taskId_idx" ON "TaskGenerationReceipt"("ownerId", "taskId");
CREATE INDEX "TaskGenerationReceipt_entityId_idx" ON "TaskGenerationReceipt"("entityId");
ALTER TABLE "TaskGenerationReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TaskGenerationReceipt" FROM PUBLIC;
DO $metodo$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "TaskGenerationReceipt" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "TaskGenerationReceipt" FROM authenticated; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metodo_app') THEN
  CREATE POLICY metodo_owner_server ON "TaskGenerationReceipt" FOR ALL TO metodo_app USING ("ownerId" = 'owner') WITH CHECK ("ownerId" = 'owner');
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "TaskGenerationReceipt" TO metodo_app;
 END IF;
END $metodo$;
