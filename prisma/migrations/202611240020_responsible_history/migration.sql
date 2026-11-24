-- Keep prior assignments independently restorable; only one may be active.
-- Player/brand-contact uniqueness continues to include Trash.
DROP INDEX "OpportunityContact_responsible_unique";
CREATE UNIQUE INDEX "OpportunityContact_responsible_unique"
ON "OpportunityContact" ("ownerId", "opportunityId")
WHERE "role" = 'RESPONSIBLE' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "OpportunityContact_responsible_person_unique"
ON "OpportunityContact" ("ownerId", "opportunityId", "personId")
WHERE "role" = 'RESPONSIBLE';
