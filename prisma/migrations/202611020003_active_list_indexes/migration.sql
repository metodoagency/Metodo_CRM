-- PostgreSQL does not eliminate IS NULL columns from ORDER BY path keys.
-- Partial indexes keep active lists ordered without a full-table sort.
CREATE INDEX "Player_active_name_idx" ON "Player" ("ownerId", "name", "id") WHERE "deletedAt" IS NULL;
CREATE INDEX "Player_active_status_name_idx" ON "Player" ("ownerId", "status", "name", "id") WHERE "deletedAt" IS NULL;
CREATE INDEX "Club_active_name_idx" ON "Club" ("ownerId", "name", "id") WHERE "deletedAt" IS NULL;
CREATE INDEX "Person_active_name_idx" ON "Person" ("ownerId", "name", "id") WHERE "deletedAt" IS NULL;
