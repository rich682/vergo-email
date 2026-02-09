-- Partial unique index on Message.providerId (only for non-null values).
-- This prevents duplicate inbound message processing from concurrent webhook calls
-- while allowing outbound messages to have NULL providerId initially.
CREATE UNIQUE INDEX "Message_providerId_unique" ON "Message" ("providerId") WHERE "providerId" IS NOT NULL;
