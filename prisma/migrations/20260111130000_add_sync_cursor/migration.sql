-- Add durable provider sync cursor and timestamp
ALTER TABLE "ConnectedEmailAccount"
ADD COLUMN IF NOT EXISTS "syncCursor" JSONB,
ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);

