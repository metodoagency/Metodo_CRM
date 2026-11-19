ALTER TABLE "Meeting" ADD COLUMN "utcOffsetSeconds" INTEGER;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_utcOffsetSeconds_check"
 CHECK ("utcOffsetSeconds" IS NULL OR "utcOffsetSeconds" BETWEEN -86399 AND 86399);
CREATE INDEX "Meeting_ownerId_deletedAt_date_time_id_idx"
 ON "Meeting"("ownerId", "deletedAt", "date", "time", "id");
-- Old wall times are preserved. Ambiguous legacy times require an owner choice.
-- Existing Meeting RLS and server-only grants remain unchanged; no new FK.
