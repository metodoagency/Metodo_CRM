-- CreateEnum
CREATE TYPE "AgeCategory" AS ENUM ('A', 'PGL', 'U19', 'U18', 'U17', 'U16', 'U15', 'OTHER');

-- CreateEnum
CREATE TYPE "RelationStatus" AS ENUM ('NEW', 'WARM', 'ACTIVE', 'COLD');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('HEAD_COACH', 'ASSISTANT', 'GOALKEEPER_COACH', 'YOUTH_COORDINATOR', 'OFFICIAL', 'SCOUT', 'MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WF', 'CF');

-- CreateEnum
CREATE TYPE "Foot" AS ENUM ('LEFT', 'RIGHT', 'BOTH');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'EUR', 'USD', 'GBP');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'MATCHED', 'SUGGESTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('PRIVATE', 'CLUB_ONLY', 'SHAREABLE');

-- CreateEnum
CREATE TYPE "PresentationChannel" AS ENUM ('IN_PERSON', 'EMAIL', 'MESSAGING', 'VIDEO');

-- CreateEnum
CREATE TYPE "PresentationResult" AS ENUM ('PENDING', 'INTERESTED', 'OFFERED', 'REJECTED', 'WAITING');

-- CreateEnum
CREATE TYPE "MatchSource" AS ENUM ('TFF');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CONSIDERING', 'ATTENDING', 'ATTENDED', 'NOT_ATTENDING');

-- CreateEnum
CREATE TYPE "SpeakerStatus" AS ENUM ('CANDIDATE', 'INVITED', 'DISCUSSED', 'ACCEPTED', 'DECLINED', 'CONFIRMED', 'ATTENDED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL', 'TFF', 'MEDIA', 'SOCIAL', 'MANUAL', 'AI_EXTRACTED', 'DATA_PROVIDER', 'KAP', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PARTIAL', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('OFFICIAL', 'MEDIA', 'SOCIAL_VERIFIED');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('MANUAL', 'RSS', 'PAGE_CHECK');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('EMPLOYEE', 'FREELANCE', 'PROJECT');

-- CreateEnum
CREATE TYPE "FinanceType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('memberOf', 'representedBy', 'intermediaryFor', 'sellingFor', 'mandatedBy', 'suggestedTo', 'presentedTo', 'invitedAs', 'attendee', 'contactOf', 'worksWith', 'partnerOf', 'usesTool', 'hiredBy', 'speakerAt', 'organizedBy', 'scoutedAt', 'linkedTo', 'stakeholderOf', 'dealWith', 'guardianOf', 'licensedAs');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('NEW', 'READ', 'SNOOZED');

-- CreateEnum
CREATE TYPE "MedicalType" AS ENUM ('CHECK', 'INJURY', 'REHAB', 'CLEARANCE');

-- CreateEnum
CREATE TYPE "MedicalResult" AS ENUM ('FIT', 'CONDITIONAL', 'UNFIT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicalAction" AS ENUM ('VIEW', 'REVEAL', 'EDIT', 'EXPORT');

-- CreateEnum
CREATE TYPE "WatchlistStatus" AS ENUM ('WATCH', 'FOLLOW_UP', 'SHORTLIST', 'DROPPED');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('TRANSFER', 'MANDATE', 'SPONSORSHIP', 'SPEAKING', 'SCOUTING_SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('FIXED', 'PERCENT_OF_FEE', 'PERCENT_OF_SALARY');

-- CreateEnum
CREATE TYPE "StakeholderRole" AS ENUM ('SPORTING_DIRECTOR', 'CEO', 'TECHNICAL_DIRECTOR', 'CHIEF_SCOUT', 'HEAD_COACH', 'MEDICAL', 'FINANCE', 'MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('FIFA_DRC', 'TFF', 'CAS', 'LABOUR_COURT', 'CRIMINAL_COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('CONTRACT', 'LETTER', 'OUTREACH', 'PRESS');

-- CreateEnum
CREATE TYPE "ShareScope" AS ENUM ('PLAYER_PROFILE', 'CV');

-- CreateEnum
CREATE TYPE "PressStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED_MANUALLY');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAttempt" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Continent" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,

    CONSTRAINT "Continent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "isTracked" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "continentId" UUID,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "countryId" UUID NOT NULL,
    "polygonKey" TEXT,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "countryId" UUID NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "ageCategory" "AgeCategory" NOT NULL DEFAULT 'A',
    "tffPageUrl" TEXT,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "shortName" TEXT,
    "countryId" UUID,
    "regionId" UUID,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "stadium" TEXT,
    "foundedYear" INTEGER,
    "websiteUrl" TEXT,
    "socialLinks" JSONB NOT NULL DEFAULT '{}',
    "relationStatus" "RelationStatus" NOT NULL DEFAULT 'NEW',
    "isTracked" BOOLEAN NOT NULL DEFAULT false,
    "tffCoachPageUrl" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgeTeam" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "clubId" UUID NOT NULL,
    "ageCategory" "AgeCategory" NOT NULL,
    "leagueId" UUID,

    CONSTRAINT "AgeTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL DEFAULT 'OTHER',
    "country" TEXT,
    "phone" TEXT,
    "phoneIndex" TEXT,
    "email" TEXT,
    "emailIndex" TEXT,
    "birthDate" TEXT,
    "birthDateIndex" TEXT,
    "hideBirthYear" BOOLEAN NOT NULL DEFAULT false,
    "transfermarktUrl" TEXT,
    "tffProfileUrl" TEXT,
    "relationStatus" "RelationStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "agency" TEXT,
    "countries" TEXT[],
    "markets" TEXT[],
    "relationStatus" "RelationStatus" NOT NULL DEFAULT 'NEW',
    "networkMemberships" TEXT[],

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "status" "PlayerStatus" NOT NULL DEFAULT 'TARGET',
    "photo" TEXT,
    "photoSourceUrl" TEXT,
    "photoRightsNote" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "availabilityUntil" DATE,
    "birthDate" TEXT,
    "birthDateIndex" TEXT,
    "nationalities" TEXT[],
    "euPassport" BOOLEAN,
    "heightCm" INTEGER,
    "weightKg" DECIMAL(6,2),
    "primaryPosition" "Position" NOT NULL,
    "secondaryPositions" "Position"[],
    "preferredFoot" "Foot",
    "currentClubId" UUID,
    "currentLeagueId" UUID,
    "contractEndDate" DATE,
    "marketValue" DECIMAL(18,2),
    "marketValueCurrency" "Currency",
    "marketValueDate" DATE,
    "marketValueSourceUrl" TEXT,
    "transfermarktUrl" TEXT,
    "levelScore" DECIMAL(3,1),
    "levelSubscores" JSONB NOT NULL DEFAULT '{}',
    "levelHistory" JSONB NOT NULL DEFAULT '[]',
    "agentId" UUID,
    "mandate" JSONB,
    "strengths" TEXT NOT NULL DEFAULT '',
    "weaknesses" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "phoneIndex" TEXT,
    "email" TEXT,
    "emailIndex" TEXT,
    "healthNotes" TEXT,
    "injuryNotes" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "clubId" UUID,
    "type" TEXT NOT NULL,
    "signedDate" DATE,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "salaryAmount" TEXT,
    "salaryCurrency" "Currency",
    "salaryPeriod" TEXT,
    "salaryBasis" TEXT,
    "bonuses" TEXT,
    "paymentDay" INTEGER,
    "releaseClause" JSONB,
    "buyout" JSONB,
    "extensionOption" JSONB,
    "noticeDeadline" DATE,
    "representation" JSONB,
    "documentLink" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceRecord" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "matchId" UUID,
    "date" DATE NOT NULL,
    "opponent" TEXT NOT NULL,
    "league" TEXT,
    "minutes" INTEGER NOT NULL,
    "position" "Position",
    "gpsMetrics" JSONB NOT NULL DEFAULT '{}',
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "clips" JSONB NOT NULL DEFAULT '[]',
    "photos" JSONB NOT NULL DEFAULT '[]',
    "tacticalDesignFile" TEXT,

    CONSTRAINT "PerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "clubId" UUID NOT NULL,
    "requesterId" UUID,
    "position" "Position" NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "preferredFoot" "Foot",
    "euRequired" BOOLEAN,
    "preferredCountries" TEXT[],
    "preferredLeagues" TEXT[],
    "salaryMax" DECIMAL(18,2),
    "salaryCurrency" "Currency",
    "feeMax" DECIMAL(18,2),
    "feeCurrency" "Currency",
    "profileText" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" DATE,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "matchScore" DECIMAL(5,2),
    "fitReasons" TEXT[],
    "missingCriteria" TEXT[],
    "whyGoodTransfer" TEXT NOT NULL,
    "coverNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "batchId" TEXT NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesListing" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "askingAmount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'PRIVATE',
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "interestedClubs" TEXT[],

    CONSTRAINT "SalesListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clubId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "requestId" UUID,
    "channel" "PresentationChannel" NOT NULL DEFAULT 'EMAIL',
    "result" "PresentationResult" NOT NULL DEFAULT 'PENDING',
    "followUpDate" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "locationOrUrl" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "agenda" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "recurrence" "Recurrence" NOT NULL DEFAULT 'NONE',
    "entityType" TEXT,
    "entityId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "leagueId" UUID NOT NULL,
    "season" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "stadium" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "score" TEXT,
    "status" TEXT NOT NULL,
    "source" "MatchSource" NOT NULL DEFAULT 'TFF',
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutReport" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "matchDate" DATE NOT NULL,
    "league" TEXT,
    "stadium" TEXT,
    "teams" TEXT NOT NULL,
    "minutesWatched" INTEGER NOT NULL,
    "playerId" UUID,
    "freeName" TEXT,
    "relationType" TEXT NOT NULL,
    "positionWatched" "Position",
    "performanceScore" DECIMAL(3,1) NOT NULL,
    "strengths" TEXT NOT NULL,
    "weaknesses" TEXT NOT NULL,
    "tierSuitability" TEXT,
    "opinion" TEXT NOT NULL,
    "scoutPersonId" UUID,

    CONSTRAINT "ScoutReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'CONSIDERING',
    "budget" DECIMAL(18,2),
    "actualCost" DECIMAL(18,2),
    "currency" "Currency" NOT NULL,
    "accommodation" TEXT,
    "transport" TEXT,
    "organizer" TEXT,
    "participantCount" INTEGER,
    "valueRating" INTEGER,
    "files" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Speaker" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "personId" UUID,
    "club" TEXT,
    "role" TEXT,
    "topic" TEXT,
    "session" TEXT,
    "sessionTime" TEXT,
    "moderator" TEXT,
    "fee" DECIMAL(18,2),
    "expenses" DECIMAL(18,2),
    "currency" "Currency" NOT NULL,
    "pipelineStatus" "SpeakerStatus" NOT NULL DEFAULT 'CANDIDATE',
    "accommodationStatus" TEXT,
    "flightStatus" TEXT,
    "relationNote" TEXT,

    CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "trustLevel" "TrustLevel" NOT NULL,
    "scanMethod" "ScanMethod" NOT NULL DEFAULT 'MANUAL',
    "linkedClubIds" TEXT[],

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateProposal" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "UpdateProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "renewalDate" DATE NOT NULL,
    "responsibleOwner" TEXT,
    "users" TEXT[],
    "demoRep" TEXT,
    "demoDate" DATE,
    "demoNotes" TEXT,
    "decision" TEXT NOT NULL,
    "usageNotes" TEXT,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutsourceContact" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "workType" "WorkType" NOT NULL,
    "projects" JSONB NOT NULL DEFAULT '[]',
    "deliverables" JSONB NOT NULL DEFAULT '[]',
    "dueDate" DATE,
    "paymentPlan" JSONB,
    "contact" JSONB,

    CONSTRAINT "OutsourceContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "FinanceType" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "exchangeRateDate" DATE NOT NULL,
    "rateSource" TEXT NOT NULL,
    "amountTry" DECIMAL(18,2) NOT NULL,
    "invoiceNo" TEXT,
    "paymentStatus" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "linkedEntities" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" "RelationType" NOT NULL,
    "role" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diffs" JSONB NOT NULL,
    "batchId" TEXT NOT NULL,
    "summaryTr" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'NEW',
    "snoozedUntil" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "captureDate" DATE,
    "autoDeleteDate" DATE,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "sort" JSONB NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "language" TEXT NOT NULL DEFAULT 'tr',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "dashboardLayout" JSONB NOT NULL DEFAULT '[]',
    "notificationThresholds" JSONB NOT NULL DEFAULT '[180,90,30]',
    "levelWeights" JSONB NOT NULL DEFAULT '{}',
    "leagueTiers" JSONB NOT NULL DEFAULT '[]',
    "matchingWeights" JSONB NOT NULL DEFAULT '{}',
    "tffUrls" JSONB NOT NULL DEFAULT '{}',
    "googleSheetsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiConsent" BOOLEAN NOT NULL DEFAULT false,
    "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diffs" JSONB NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrashEntry" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "clubId" UUID,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "documentRef" TEXT,
    "commissionTerms" TEXT,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT,
    "phoneIndex" TEXT,
    "email" TEXT,
    "emailIndex" TEXT,
    "parentalConsentDocumentRef" TEXT,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecord" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "MedicalType" NOT NULL,
    "resultCategory" "MedicalResult" NOT NULL,
    "summary" TEXT NOT NULL,
    "returnDate" DATE,
    "attachmentId" UUID,
    "restricted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MedicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalAccessLog" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "actor" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordId" UUID NOT NULL,
    "action" "MedicalAction" NOT NULL,

    CONSTRAINT "MedicalAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageRightsAgreement" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "territories" TEXT[],
    "mediaTypes" TEXT[],
    "productCategory" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ImageRightsAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "licenseNote" TEXT NOT NULL,
    "mappingProfileId" TEXT,
    "rowCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStat" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "season" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "statKey" TEXT NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "sourceImportId" UUID NOT NULL,

    CONSTRAINT "PlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutAssignment" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "scoutId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reportId" UUID,

    CONSTRAINT "ScoutAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "scoutId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "date" DATE NOT NULL,
    "receiptAttachmentId" UUID,
    "status" TEXT NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistEntry" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "status" "WatchlistStatus" NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "WatchlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "type" "DealType" NOT NULL,
    "stage" TEXT NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedAmount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "closeDate" DATE,
    "lostReason" TEXT,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTerm" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "dealId" UUID NOT NULL,
    "payer" TEXT NOT NULL,
    "basis" "CommissionBasis" NOT NULL,
    "rate" DECIMAL(7,4),
    "fixedAmount" DECIMAL(18,2),
    "currency" "Currency" NOT NULL,
    "vatRate" DECIMAL(7,4),
    "splitGroup" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "CommissionTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "commissionTermId" UUID NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "paidAt" DATE,
    "paidAmount" DECIMAL(18,2),
    "invoiceNo" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferProcess" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "dealId" UUID NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "TransferProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubStakeholder" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "clubId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "stakeholderRole" "StakeholderRole" NOT NULL,
    "influence" INTEGER NOT NULL,
    "relationshipOwner" TEXT NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "ClubStakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubFinancialProfile" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "clubId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,

    CONSTRAINT "ClubFinancialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferWindow" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "countryId" UUID NOT NULL,
    "leagueId" UUID,
    "opensOn" DATE NOT NULL,
    "closesOn" DATE NOT NULL,
    "sourceNote" TEXT NOT NULL,

    CONSTRAINT "TransferWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseRecord" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "agentId" UUID,
    "holder" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "issuedAt" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,
    "attachmentId" UUID,

    CONSTRAINT "LicenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "parties" JSONB NOT NULL,
    "filedAt" DATE NOT NULL,
    "nextDeadline" DATE,
    "deadlineSource" TEXT,
    "counselName" TEXT,
    "status" TEXT NOT NULL,
    "outcome" TEXT,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "locale" TEXT NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "templateId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "placeholders" JSONB NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "scope" "ShareScope" NOT NULL,
    "entityId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "passcodeHash" TEXT,
    "recipientName" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "fieldAllowlist" TEXT[],

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaContact" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "personId" UUID NOT NULL,
    "outlet" TEXT NOT NULL,
    "beat" TEXT NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "MediaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PressItem" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "updatedBy" TEXT NOT NULL DEFAULT 'owner',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "fieldProvenance" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "name" TEXT NOT NULL,
    "status" "PressStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "scheduledDate" DATE,
    "approvedBy" TEXT,

    CONSTRAINT "PressItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Continent_ownerId_deletedAt_idx" ON "Continent"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Continent_ownerId_idx" ON "Continent"("ownerId");

-- CreateIndex
CREATE INDEX "Country_ownerId_deletedAt_idx" ON "Country"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Country_ownerId_idx" ON "Country"("ownerId");

-- CreateIndex
CREATE INDEX "Country_continentId_idx" ON "Country"("continentId");

-- CreateIndex
CREATE INDEX "Region_ownerId_deletedAt_idx" ON "Region"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Region_ownerId_idx" ON "Region"("ownerId");

-- CreateIndex
CREATE INDEX "Region_countryId_idx" ON "Region"("countryId");

-- CreateIndex
CREATE INDEX "League_ownerId_deletedAt_idx" ON "League"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "League_ownerId_idx" ON "League"("ownerId");

-- CreateIndex
CREATE INDEX "League_countryId_idx" ON "League"("countryId");

-- CreateIndex
CREATE INDEX "Club_ownerId_deletedAt_idx" ON "Club"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Club_ownerId_idx" ON "Club"("ownerId");

-- CreateIndex
CREATE INDEX "Club_countryId_idx" ON "Club"("countryId");

-- CreateIndex
CREATE INDEX "Club_regionId_idx" ON "Club"("regionId");

-- CreateIndex
CREATE INDEX "AgeTeam_ownerId_deletedAt_idx" ON "AgeTeam"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "AgeTeam_ownerId_idx" ON "AgeTeam"("ownerId");

-- CreateIndex
CREATE INDEX "AgeTeam_clubId_idx" ON "AgeTeam"("clubId");

-- CreateIndex
CREATE INDEX "AgeTeam_leagueId_idx" ON "AgeTeam"("leagueId");

-- CreateIndex
CREATE INDEX "Person_phoneIndex_idx" ON "Person"("phoneIndex");

-- CreateIndex
CREATE INDEX "Person_emailIndex_idx" ON "Person"("emailIndex");

-- CreateIndex
CREATE INDEX "Person_birthDateIndex_idx" ON "Person"("birthDateIndex");

-- CreateIndex
CREATE INDEX "Person_ownerId_deletedAt_idx" ON "Person"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Person_ownerId_idx" ON "Person"("ownerId");

-- CreateIndex
CREATE INDEX "Agent_ownerId_deletedAt_idx" ON "Agent"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Agent_ownerId_idx" ON "Agent"("ownerId");

-- CreateIndex
CREATE INDEX "Player_birthDateIndex_idx" ON "Player"("birthDateIndex");

-- CreateIndex
CREATE INDEX "Player_phoneIndex_idx" ON "Player"("phoneIndex");

-- CreateIndex
CREATE INDEX "Player_emailIndex_idx" ON "Player"("emailIndex");

-- CreateIndex
CREATE INDEX "Player_ownerId_deletedAt_idx" ON "Player"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Player_ownerId_idx" ON "Player"("ownerId");

-- CreateIndex
CREATE INDEX "Player_currentClubId_idx" ON "Player"("currentClubId");

-- CreateIndex
CREATE INDEX "Player_currentLeagueId_idx" ON "Player"("currentLeagueId");

-- CreateIndex
CREATE INDEX "Player_agentId_idx" ON "Player"("agentId");

-- CreateIndex
CREATE INDEX "Player_ownerId_availabilityUntil_idx" ON "Player"("ownerId", "availabilityUntil");

-- CreateIndex
CREATE INDEX "Player_ownerId_contractEndDate_idx" ON "Player"("ownerId", "contractEndDate");

-- CreateIndex
CREATE INDEX "Player_ownerId_marketValueDate_idx" ON "Player"("ownerId", "marketValueDate");

-- CreateIndex
CREATE INDEX "Contract_ownerId_deletedAt_idx" ON "Contract"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Contract_ownerId_idx" ON "Contract"("ownerId");

-- CreateIndex
CREATE INDEX "Contract_playerId_idx" ON "Contract"("playerId");

-- CreateIndex
CREATE INDEX "Contract_clubId_idx" ON "Contract"("clubId");

-- CreateIndex
CREATE INDEX "Contract_ownerId_signedDate_idx" ON "Contract"("ownerId", "signedDate");

-- CreateIndex
CREATE INDEX "Contract_ownerId_startDate_idx" ON "Contract"("ownerId", "startDate");

-- CreateIndex
CREATE INDEX "Contract_ownerId_endDate_idx" ON "Contract"("ownerId", "endDate");

-- CreateIndex
CREATE INDEX "Contract_ownerId_noticeDeadline_idx" ON "Contract"("ownerId", "noticeDeadline");

-- CreateIndex
CREATE INDEX "PerformanceRecord_ownerId_deletedAt_idx" ON "PerformanceRecord"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "PerformanceRecord_ownerId_idx" ON "PerformanceRecord"("ownerId");

-- CreateIndex
CREATE INDEX "PerformanceRecord_playerId_idx" ON "PerformanceRecord"("playerId");

-- CreateIndex
CREATE INDEX "PerformanceRecord_matchId_idx" ON "PerformanceRecord"("matchId");

-- CreateIndex
CREATE INDEX "PerformanceRecord_ownerId_date_idx" ON "PerformanceRecord"("ownerId", "date");

-- CreateIndex
CREATE INDEX "Request_ownerId_deletedAt_idx" ON "Request"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Request_ownerId_idx" ON "Request"("ownerId");

-- CreateIndex
CREATE INDEX "Request_clubId_idx" ON "Request"("clubId");

-- CreateIndex
CREATE INDEX "Request_requesterId_idx" ON "Request"("requesterId");

-- CreateIndex
CREATE INDEX "Request_ownerId_deadline_idx" ON "Request"("ownerId", "deadline");

-- CreateIndex
CREATE INDEX "Suggestion_ownerId_deletedAt_idx" ON "Suggestion"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Suggestion_ownerId_idx" ON "Suggestion"("ownerId");

-- CreateIndex
CREATE INDEX "Suggestion_requestId_idx" ON "Suggestion"("requestId");

-- CreateIndex
CREATE INDEX "Suggestion_playerId_idx" ON "Suggestion"("playerId");

-- CreateIndex
CREATE INDEX "Suggestion_clubId_idx" ON "Suggestion"("clubId");

-- CreateIndex
CREATE INDEX "Suggestion_personId_idx" ON "Suggestion"("personId");

-- CreateIndex
CREATE INDEX "Suggestion_batchId_idx" ON "Suggestion"("batchId");

-- CreateIndex
CREATE INDEX "Suggestion_ownerId_date_idx" ON "Suggestion"("ownerId", "date");

-- CreateIndex
CREATE INDEX "SalesListing_ownerId_deletedAt_idx" ON "SalesListing"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "SalesListing_ownerId_idx" ON "SalesListing"("ownerId");

-- CreateIndex
CREATE INDEX "SalesListing_playerId_idx" ON "SalesListing"("playerId");

-- CreateIndex
CREATE INDEX "SalesListing_clubId_idx" ON "SalesListing"("clubId");

-- CreateIndex
CREATE INDEX "Presentation_ownerId_deletedAt_idx" ON "Presentation"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Presentation_ownerId_idx" ON "Presentation"("ownerId");

-- CreateIndex
CREATE INDEX "Presentation_clubId_idx" ON "Presentation"("clubId");

-- CreateIndex
CREATE INDEX "Presentation_personId_idx" ON "Presentation"("personId");

-- CreateIndex
CREATE INDEX "Presentation_playerId_idx" ON "Presentation"("playerId");

-- CreateIndex
CREATE INDEX "Presentation_requestId_idx" ON "Presentation"("requestId");

-- CreateIndex
CREATE INDEX "Presentation_ownerId_date_idx" ON "Presentation"("ownerId", "date");

-- CreateIndex
CREATE INDEX "Presentation_ownerId_followUpDate_idx" ON "Presentation"("ownerId", "followUpDate");

-- CreateIndex
CREATE INDEX "Meeting_ownerId_deletedAt_idx" ON "Meeting"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Meeting_ownerId_idx" ON "Meeting"("ownerId");

-- CreateIndex
CREATE INDEX "Meeting_ownerId_date_idx" ON "Meeting"("ownerId", "date");

-- CreateIndex
CREATE INDEX "Task_ownerId_deletedAt_idx" ON "Task"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_ownerId_idx" ON "Task"("ownerId");

-- CreateIndex
CREATE INDEX "Task_entityId_idx" ON "Task"("entityId");

-- CreateIndex
CREATE INDEX "Task_ownerId_dueDate_idx" ON "Task"("ownerId", "dueDate");

-- CreateIndex
CREATE INDEX "Match_ownerId_deletedAt_idx" ON "Match"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Match_ownerId_idx" ON "Match"("ownerId");

-- CreateIndex
CREATE INDEX "Match_leagueId_idx" ON "Match"("leagueId");

-- CreateIndex
CREATE INDEX "Match_ownerId_date_idx" ON "Match"("ownerId", "date");

-- CreateIndex
CREATE INDEX "ScoutReport_ownerId_deletedAt_idx" ON "ScoutReport"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ScoutReport_ownerId_idx" ON "ScoutReport"("ownerId");

-- CreateIndex
CREATE INDEX "ScoutReport_playerId_idx" ON "ScoutReport"("playerId");

-- CreateIndex
CREATE INDEX "ScoutReport_scoutPersonId_idx" ON "ScoutReport"("scoutPersonId");

-- CreateIndex
CREATE INDEX "ScoutReport_ownerId_matchDate_idx" ON "ScoutReport"("ownerId", "matchDate");

-- CreateIndex
CREATE INDEX "Event_ownerId_deletedAt_idx" ON "Event"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Event_ownerId_idx" ON "Event"("ownerId");

-- CreateIndex
CREATE INDEX "Event_ownerId_dateFrom_idx" ON "Event"("ownerId", "dateFrom");

-- CreateIndex
CREATE INDEX "Event_ownerId_dateTo_idx" ON "Event"("ownerId", "dateTo");

-- CreateIndex
CREATE INDEX "Speaker_ownerId_deletedAt_idx" ON "Speaker"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Speaker_ownerId_idx" ON "Speaker"("ownerId");

-- CreateIndex
CREATE INDEX "Speaker_eventId_idx" ON "Speaker"("eventId");

-- CreateIndex
CREATE INDEX "Speaker_personId_idx" ON "Speaker"("personId");

-- CreateIndex
CREATE INDEX "Source_ownerId_deletedAt_idx" ON "Source"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Source_ownerId_idx" ON "Source"("ownerId");

-- CreateIndex
CREATE INDEX "UpdateProposal_ownerId_deletedAt_idx" ON "UpdateProposal"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "UpdateProposal_ownerId_idx" ON "UpdateProposal"("ownerId");

-- CreateIndex
CREATE INDEX "UpdateProposal_targetId_idx" ON "UpdateProposal"("targetId");

-- CreateIndex
CREATE INDEX "Tool_ownerId_deletedAt_idx" ON "Tool"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Tool_ownerId_idx" ON "Tool"("ownerId");

-- CreateIndex
CREATE INDEX "Tool_ownerId_renewalDate_idx" ON "Tool"("ownerId", "renewalDate");

-- CreateIndex
CREATE INDEX "Tool_ownerId_demoDate_idx" ON "Tool"("ownerId", "demoDate");

-- CreateIndex
CREATE INDEX "OutsourceContact_ownerId_deletedAt_idx" ON "OutsourceContact"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "OutsourceContact_ownerId_idx" ON "OutsourceContact"("ownerId");

-- CreateIndex
CREATE INDEX "OutsourceContact_ownerId_dueDate_idx" ON "OutsourceContact"("ownerId", "dueDate");

-- CreateIndex
CREATE INDEX "FinanceEntry_ownerId_deletedAt_idx" ON "FinanceEntry"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinanceEntry_ownerId_idx" ON "FinanceEntry"("ownerId");

-- CreateIndex
CREATE INDEX "FinanceEntry_entityId_idx" ON "FinanceEntry"("entityId");

-- CreateIndex
CREATE INDEX "FinanceEntry_ownerId_date_idx" ON "FinanceEntry"("ownerId", "date");

-- CreateIndex
CREATE INDEX "FinanceEntry_ownerId_exchangeRateDate_idx" ON "FinanceEntry"("ownerId", "exchangeRateDate");

-- CreateIndex
CREATE INDEX "WorkLog_ownerId_deletedAt_idx" ON "WorkLog"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "WorkLog_ownerId_idx" ON "WorkLog"("ownerId");

-- CreateIndex
CREATE INDEX "WorkLog_ownerId_date_idx" ON "WorkLog"("ownerId", "date");

-- CreateIndex
CREATE INDEX "Relation_ownerId_fromType_fromId_idx" ON "Relation"("ownerId", "fromType", "fromId");

-- CreateIndex
CREATE INDEX "Relation_ownerId_toType_toId_idx" ON "Relation"("ownerId", "toType", "toId");

-- CreateIndex
CREATE INDEX "Relation_ownerId_deletedAt_idx" ON "Relation"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Relation_ownerId_idx" ON "Relation"("ownerId");

-- CreateIndex
CREATE INDEX "Relation_fromId_idx" ON "Relation"("fromId");

-- CreateIndex
CREATE INDEX "Relation_toId_idx" ON "Relation"("toId");

-- CreateIndex
CREATE INDEX "Relation_ownerId_startDate_idx" ON "Relation"("ownerId", "startDate");

-- CreateIndex
CREATE INDEX "Relation_ownerId_endDate_idx" ON "Relation"("ownerId", "endDate");

-- CreateIndex
CREATE INDEX "TimelineEvent_ownerId_entityType_entityId_createdAt_idx" ON "TimelineEvent"("ownerId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_ownerId_deletedAt_idx" ON "TimelineEvent"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_ownerId_idx" ON "TimelineEvent"("ownerId");

-- CreateIndex
CREATE INDEX "TimelineEvent_entityId_idx" ON "TimelineEvent"("entityId");

-- CreateIndex
CREATE INDEX "TimelineEvent_batchId_idx" ON "TimelineEvent"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_ownerId_deletedAt_idx" ON "Notification"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Notification_ownerId_idx" ON "Notification"("ownerId");

-- CreateIndex
CREATE INDEX "Notification_entityId_idx" ON "Notification"("entityId");

-- CreateIndex
CREATE INDEX "Notification_ownerId_targetDate_idx" ON "Notification"("ownerId", "targetDate");

-- CreateIndex
CREATE INDEX "Attachment_ownerId_deletedAt_idx" ON "Attachment"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Attachment_ownerId_idx" ON "Attachment"("ownerId");

-- CreateIndex
CREATE INDEX "Attachment_entityId_idx" ON "Attachment"("entityId");

-- CreateIndex
CREATE INDEX "Attachment_ownerId_captureDate_idx" ON "Attachment"("ownerId", "captureDate");

-- CreateIndex
CREATE INDEX "Attachment_ownerId_autoDeleteDate_idx" ON "Attachment"("ownerId", "autoDeleteDate");

-- CreateIndex
CREATE INDEX "SavedView_ownerId_deletedAt_idx" ON "SavedView"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "SavedView_ownerId_idx" ON "SavedView"("ownerId");

-- CreateIndex
CREATE INDEX "UserSettings_ownerId_deletedAt_idx" ON "UserSettings"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserSettings_ownerId_idx" ON "UserSettings"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_ownerId_key" ON "UserSettings"("ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_ownerId_deletedAt_idx" ON "AuditLog"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_ownerId_idx" ON "AuditLog"("ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "TrashEntry_ownerId_deletedAt_idx" ON "TrashEntry"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "TrashEntry_ownerId_idx" ON "TrashEntry"("ownerId");

-- CreateIndex
CREATE INDEX "TrashEntry_entityId_idx" ON "TrashEntry"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "TrashEntry_ownerId_entityType_entityId_key" ON "TrashEntry"("ownerId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Note_ownerId_deletedAt_idx" ON "Note"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Note_ownerId_idx" ON "Note"("ownerId");

-- CreateIndex
CREATE INDEX "Note_entityId_idx" ON "Note"("entityId");

-- CreateIndex
CREATE INDEX "Mandate_ownerId_deletedAt_idx" ON "Mandate"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Mandate_ownerId_idx" ON "Mandate"("ownerId");

-- CreateIndex
CREATE INDEX "Mandate_playerId_idx" ON "Mandate"("playerId");

-- CreateIndex
CREATE INDEX "Mandate_clubId_idx" ON "Mandate"("clubId");

-- CreateIndex
CREATE INDEX "Mandate_ownerId_startDate_idx" ON "Mandate"("ownerId", "startDate");

-- CreateIndex
CREATE INDEX "Mandate_ownerId_endDate_idx" ON "Mandate"("ownerId", "endDate");

-- CreateIndex
CREATE INDEX "Guardian_ownerId_deletedAt_idx" ON "Guardian"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Guardian_ownerId_idx" ON "Guardian"("ownerId");

-- CreateIndex
CREATE INDEX "Guardian_playerId_idx" ON "Guardian"("playerId");

-- CreateIndex
CREATE INDEX "Guardian_phoneIndex_idx" ON "Guardian"("phoneIndex");

-- CreateIndex
CREATE INDEX "Guardian_emailIndex_idx" ON "Guardian"("emailIndex");

-- CreateIndex
CREATE INDEX "MedicalRecord_ownerId_deletedAt_idx" ON "MedicalRecord"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "MedicalRecord_ownerId_idx" ON "MedicalRecord"("ownerId");

-- CreateIndex
CREATE INDEX "MedicalRecord_playerId_idx" ON "MedicalRecord"("playerId");

-- CreateIndex
CREATE INDEX "MedicalRecord_attachmentId_idx" ON "MedicalRecord"("attachmentId");

-- CreateIndex
CREATE INDEX "MedicalRecord_ownerId_date_idx" ON "MedicalRecord"("ownerId", "date");

-- CreateIndex
CREATE INDEX "MedicalRecord_ownerId_returnDate_idx" ON "MedicalRecord"("ownerId", "returnDate");

-- CreateIndex
CREATE INDEX "MedicalAccessLog_ownerId_deletedAt_idx" ON "MedicalAccessLog"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "MedicalAccessLog_ownerId_idx" ON "MedicalAccessLog"("ownerId");

-- CreateIndex
CREATE INDEX "MedicalAccessLog_recordId_idx" ON "MedicalAccessLog"("recordId");

-- CreateIndex
CREATE INDEX "ImageRightsAgreement_ownerId_deletedAt_idx" ON "ImageRightsAgreement"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ImageRightsAgreement_ownerId_idx" ON "ImageRightsAgreement"("ownerId");

-- CreateIndex
CREATE INDEX "ImageRightsAgreement_playerId_idx" ON "ImageRightsAgreement"("playerId");

-- CreateIndex
CREATE INDEX "ImageRightsAgreement_ownerId_startDate_idx" ON "ImageRightsAgreement"("ownerId", "startDate");

-- CreateIndex
CREATE INDEX "ImageRightsAgreement_ownerId_endDate_idx" ON "ImageRightsAgreement"("ownerId", "endDate");

-- CreateIndex
CREATE INDEX "DataImport_ownerId_deletedAt_idx" ON "DataImport"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "DataImport_ownerId_idx" ON "DataImport"("ownerId");

-- CreateIndex
CREATE INDEX "DataImport_mappingProfileId_idx" ON "DataImport"("mappingProfileId");

-- CreateIndex
CREATE INDEX "PlayerStat_ownerId_deletedAt_idx" ON "PlayerStat"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "PlayerStat_ownerId_idx" ON "PlayerStat"("ownerId");

-- CreateIndex
CREATE INDEX "PlayerStat_playerId_idx" ON "PlayerStat"("playerId");

-- CreateIndex
CREATE INDEX "PlayerStat_sourceImportId_idx" ON "PlayerStat"("sourceImportId");

-- CreateIndex
CREATE INDEX "ScoutAssignment_ownerId_deletedAt_idx" ON "ScoutAssignment"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ScoutAssignment_ownerId_idx" ON "ScoutAssignment"("ownerId");

-- CreateIndex
CREATE INDEX "ScoutAssignment_scoutId_idx" ON "ScoutAssignment"("scoutId");

-- CreateIndex
CREATE INDEX "ScoutAssignment_matchId_idx" ON "ScoutAssignment"("matchId");

-- CreateIndex
CREATE INDEX "ScoutAssignment_reportId_idx" ON "ScoutAssignment"("reportId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_ownerId_deletedAt_idx" ON "ExpenseClaim"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ExpenseClaim_ownerId_idx" ON "ExpenseClaim"("ownerId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_scoutId_idx" ON "ExpenseClaim"("scoutId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_receiptAttachmentId_idx" ON "ExpenseClaim"("receiptAttachmentId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_ownerId_date_idx" ON "ExpenseClaim"("ownerId", "date");

-- CreateIndex
CREATE INDEX "WatchlistEntry_ownerId_deletedAt_idx" ON "WatchlistEntry"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "WatchlistEntry_ownerId_idx" ON "WatchlistEntry"("ownerId");

-- CreateIndex
CREATE INDEX "WatchlistEntry_playerId_idx" ON "WatchlistEntry"("playerId");

-- CreateIndex
CREATE INDEX "Deal_ownerId_deletedAt_idx" ON "Deal"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

-- CreateIndex
CREATE INDEX "Deal_ownerId_closeDate_idx" ON "Deal"("ownerId", "closeDate");

-- CreateIndex
CREATE INDEX "CommissionTerm_ownerId_deletedAt_idx" ON "CommissionTerm"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "CommissionTerm_ownerId_idx" ON "CommissionTerm"("ownerId");

-- CreateIndex
CREATE INDEX "CommissionTerm_dealId_idx" ON "CommissionTerm"("dealId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_ownerId_deletedAt_idx" ON "PaymentSchedule"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "PaymentSchedule_ownerId_idx" ON "PaymentSchedule"("ownerId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_commissionTermId_idx" ON "PaymentSchedule"("commissionTermId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_ownerId_dueDate_idx" ON "PaymentSchedule"("ownerId", "dueDate");

-- CreateIndex
CREATE INDEX "PaymentSchedule_ownerId_paidAt_idx" ON "PaymentSchedule"("ownerId", "paidAt");

-- CreateIndex
CREATE INDEX "TransferProcess_ownerId_deletedAt_idx" ON "TransferProcess"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "TransferProcess_ownerId_idx" ON "TransferProcess"("ownerId");

-- CreateIndex
CREATE INDEX "TransferProcess_dealId_idx" ON "TransferProcess"("dealId");

-- CreateIndex
CREATE INDEX "ClubStakeholder_ownerId_deletedAt_idx" ON "ClubStakeholder"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ClubStakeholder_ownerId_idx" ON "ClubStakeholder"("ownerId");

-- CreateIndex
CREATE INDEX "ClubStakeholder_clubId_idx" ON "ClubStakeholder"("clubId");

-- CreateIndex
CREATE INDEX "ClubStakeholder_personId_idx" ON "ClubStakeholder"("personId");

-- CreateIndex
CREATE INDEX "ClubFinancialProfile_ownerId_deletedAt_idx" ON "ClubFinancialProfile"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ClubFinancialProfile_ownerId_idx" ON "ClubFinancialProfile"("ownerId");

-- CreateIndex
CREATE INDEX "ClubFinancialProfile_clubId_idx" ON "ClubFinancialProfile"("clubId");

-- CreateIndex
CREATE INDEX "TransferWindow_ownerId_deletedAt_idx" ON "TransferWindow"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "TransferWindow_ownerId_idx" ON "TransferWindow"("ownerId");

-- CreateIndex
CREATE INDEX "TransferWindow_countryId_idx" ON "TransferWindow"("countryId");

-- CreateIndex
CREATE INDEX "TransferWindow_leagueId_idx" ON "TransferWindow"("leagueId");

-- CreateIndex
CREATE INDEX "TransferWindow_ownerId_opensOn_idx" ON "TransferWindow"("ownerId", "opensOn");

-- CreateIndex
CREATE INDEX "TransferWindow_ownerId_closesOn_idx" ON "TransferWindow"("ownerId", "closesOn");

-- CreateIndex
CREATE INDEX "LicenseRecord_ownerId_deletedAt_idx" ON "LicenseRecord"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "LicenseRecord_ownerId_idx" ON "LicenseRecord"("ownerId");

-- CreateIndex
CREATE INDEX "LicenseRecord_agentId_idx" ON "LicenseRecord"("agentId");

-- CreateIndex
CREATE INDEX "LicenseRecord_attachmentId_idx" ON "LicenseRecord"("attachmentId");

-- CreateIndex
CREATE INDEX "LicenseRecord_ownerId_issuedAt_idx" ON "LicenseRecord"("ownerId", "issuedAt");

-- CreateIndex
CREATE INDEX "LicenseRecord_ownerId_expiresAt_idx" ON "LicenseRecord"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "Case_ownerId_deletedAt_idx" ON "Case"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Case_ownerId_idx" ON "Case"("ownerId");

-- CreateIndex
CREATE INDEX "Case_ownerId_filedAt_idx" ON "Case"("ownerId", "filedAt");

-- CreateIndex
CREATE INDEX "Case_ownerId_nextDeadline_idx" ON "Case"("ownerId", "nextDeadline");

-- CreateIndex
CREATE INDEX "Template_ownerId_deletedAt_idx" ON "Template"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Template_ownerId_idx" ON "Template"("ownerId");

-- CreateIndex
CREATE INDEX "TemplateVersion_ownerId_deletedAt_idx" ON "TemplateVersion"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "TemplateVersion_ownerId_idx" ON "TemplateVersion"("ownerId");

-- CreateIndex
CREATE INDEX "TemplateVersion_templateId_idx" ON "TemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_ownerId_deletedAt_idx" ON "ShareLink"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ShareLink_ownerId_idx" ON "ShareLink"("ownerId");

-- CreateIndex
CREATE INDEX "ShareLink_entityId_idx" ON "ShareLink"("entityId");

-- CreateIndex
CREATE INDEX "MediaContact_ownerId_deletedAt_idx" ON "MediaContact"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "MediaContact_ownerId_idx" ON "MediaContact"("ownerId");

-- CreateIndex
CREATE INDEX "MediaContact_personId_idx" ON "MediaContact"("personId");

-- CreateIndex
CREATE INDEX "PressItem_ownerId_deletedAt_idx" ON "PressItem"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "PressItem_ownerId_idx" ON "PressItem"("ownerId");

-- CreateIndex
CREATE INDEX "PressItem_ownerId_scheduledDate_idx" ON "PressItem"("ownerId", "scheduledDate");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Continent" ADD CONSTRAINT "Continent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "Country_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "Country_continentId_fkey" FOREIGN KEY ("continentId") REFERENCES "Continent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgeTeam" ADD CONSTRAINT "AgeTeam_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgeTeam" ADD CONSTRAINT "AgeTeam_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgeTeam" ADD CONSTRAINT "AgeTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_currentClubId_fkey" FOREIGN KEY ("currentClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_currentLeagueId_fkey" FOREIGN KEY ("currentLeagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesListing" ADD CONSTRAINT "SalesListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesListing" ADD CONSTRAINT "SalesListing_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesListing" ADD CONSTRAINT "SalesListing_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_scoutPersonId_fkey" FOREIGN KEY ("scoutPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Speaker" ADD CONSTRAINT "Speaker_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Speaker" ADD CONSTRAINT "Speaker_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Speaker" ADD CONSTRAINT "Speaker_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateProposal" ADD CONSTRAINT "UpdateProposal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsourceContact" ADD CONSTRAINT "OutsourceContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrashEntry" ADD CONSTRAINT "TrashEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccessLog" ADD CONSTRAINT "MedicalAccessLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccessLog" ADD CONSTRAINT "MedicalAccessLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageRightsAgreement" ADD CONSTRAINT "ImageRightsAgreement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageRightsAgreement" ADD CONSTRAINT "ImageRightsAgreement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "DataImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutAssignment" ADD CONSTRAINT "ScoutAssignment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutAssignment" ADD CONSTRAINT "ScoutAssignment_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutAssignment" ADD CONSTRAINT "ScoutAssignment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutAssignment" ADD CONSTRAINT "ScoutAssignment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ScoutReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_receiptAttachmentId_fkey" FOREIGN KEY ("receiptAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistEntry" ADD CONSTRAINT "WatchlistEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistEntry" ADD CONSTRAINT "WatchlistEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTerm" ADD CONSTRAINT "CommissionTerm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTerm" ADD CONSTRAINT "CommissionTerm_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_commissionTermId_fkey" FOREIGN KEY ("commissionTermId") REFERENCES "CommissionTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferProcess" ADD CONSTRAINT "TransferProcess_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferProcess" ADD CONSTRAINT "TransferProcess_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubStakeholder" ADD CONSTRAINT "ClubStakeholder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubStakeholder" ADD CONSTRAINT "ClubStakeholder_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubStakeholder" ADD CONSTRAINT "ClubStakeholder_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubFinancialProfile" ADD CONSTRAINT "ClubFinancialProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubFinancialProfile" ADD CONSTRAINT "ClubFinancialProfile_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferWindow" ADD CONSTRAINT "TransferWindow_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferWindow" ADD CONSTRAINT "TransferWindow_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferWindow" ADD CONSTRAINT "TransferWindow_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseRecord" ADD CONSTRAINT "LicenseRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseRecord" ADD CONSTRAINT "LicenseRecord_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseRecord" ADD CONSTRAINT "LicenseRecord_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContact" ADD CONSTRAINT "MediaContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContact" ADD CONSTRAINT "MediaContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressItem" ADD CONSTRAINT "PressItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
