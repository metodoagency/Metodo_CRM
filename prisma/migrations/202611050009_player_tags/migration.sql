-- Preserve existing players. Saved views reuse the existing owner-scoped model.
ALTER TABLE "Player" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Player_tags_idx" ON "Player" USING GIN ("tags");
