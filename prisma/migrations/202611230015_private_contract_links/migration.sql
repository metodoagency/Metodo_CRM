-- Add encrypted compatibility slots before clearing legacy plaintext.
-- Conversion runs in owner-scoped application code, never with keys in SQL.
ALTER TABLE "Contract" ADD COLUMN "privateDocumentLink" TEXT, ADD COLUMN "privateSourceEvidence" TEXT;
ALTER TABLE "TimelineEvent" ADD COLUMN "privateSourceEvidence" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "privateSourceEvidence" TEXT;
