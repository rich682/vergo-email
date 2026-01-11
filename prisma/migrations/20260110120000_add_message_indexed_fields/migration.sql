-- AlterTable
ALTER TABLE "Message" ADD COLUMN "messageIdHeader" TEXT,
ADD COLUMN "threadId" TEXT;

-- CreateIndex
CREATE INDEX "Message_messageIdHeader_idx" ON "Message"("messageIdHeader");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");


