-- CreateIndex
CREATE INDEX "Club_ownerId_deletedAt_name_id_idx" ON "Club"("ownerId", "deletedAt", "name", "id");

-- CreateIndex
CREATE INDEX "Person_ownerId_deletedAt_name_id_idx" ON "Person"("ownerId", "deletedAt", "name", "id");

-- CreateIndex
CREATE INDEX "Player_ownerId_deletedAt_status_name_id_idx" ON "Player"("ownerId", "deletedAt", "status", "name", "id");

-- CreateIndex
CREATE INDEX "Player_ownerId_deletedAt_name_id_idx" ON "Player"("ownerId", "deletedAt", "name", "id");
