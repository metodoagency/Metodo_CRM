ALTER TABLE "UserSettings"
  ADD COLUMN "privacyNoticeVersion" TEXT,
  ADD COLUMN "privacyAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "privacyAcknowledgedLanguage" TEXT,
  ADD COLUMN "breachContact" TEXT;
