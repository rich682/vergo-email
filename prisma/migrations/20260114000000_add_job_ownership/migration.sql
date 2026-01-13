-- Add Job Ownership & Collaboration
-- This migration adds:
-- 1. ownerId to Job (required, with migration for existing jobs)
-- 2. JobCollaborator join table
-- 3. JobComment model for internal collaboration
-- 4. jobId to EmailDraft for Request-level Job association

-- Step 1: Add ownerId column as nullable first
ALTER TABLE "Job" ADD COLUMN "ownerId" TEXT;

-- Step 2: Migrate existing Jobs - set ownerId to first admin in the organization
-- If no admin exists, use the first user in the organization
UPDATE "Job" j
SET "ownerId" = (
  SELECT u.id FROM "User" u
  WHERE u."organizationId" = j."organizationId"
  ORDER BY 
    CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END,
    u."createdAt" ASC
  LIMIT 1
);

-- Step 3: Make ownerId NOT NULL after migration
ALTER TABLE "Job" ALTER COLUMN "ownerId" SET NOT NULL;

-- Step 4: Add foreign key constraint for ownerId
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Create index on ownerId for efficient queries
CREATE INDEX "Job_ownerId_idx" ON "Job"("ownerId");

-- Step 6: Create JobCollaborator join table
CREATE TABLE "JobCollaborator" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'collaborator',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "JobCollaborator_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint to prevent duplicate collaborators
CREATE UNIQUE INDEX "JobCollaborator_jobId_userId_key" ON "JobCollaborator"("jobId", "userId");

-- Create indexes for efficient queries
CREATE INDEX "JobCollaborator_userId_idx" ON "JobCollaborator"("userId");
CREATE INDEX "JobCollaborator_jobId_idx" ON "JobCollaborator"("jobId");

-- Add foreign keys for JobCollaborator
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Create JobComment table for internal collaboration
CREATE TABLE "JobComment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobComment_pkey" PRIMARY KEY ("id")
);

-- Create indexes for JobComment
CREATE INDEX "JobComment_jobId_idx" ON "JobComment"("jobId");
CREATE INDEX "JobComment_authorId_idx" ON "JobComment"("authorId");

-- Add foreign keys for JobComment
ALTER TABLE "JobComment" ADD CONSTRAINT "JobComment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobComment" ADD CONSTRAINT "JobComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 8: Add jobId to EmailDraft for Request-level Job association
ALTER TABLE "EmailDraft" ADD COLUMN "jobId" TEXT;

-- Create index for EmailDraft.jobId
CREATE INDEX "EmailDraft_jobId_idx" ON "EmailDraft"("jobId");

-- Add foreign key for EmailDraft.jobId
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
