ALTER TABLE "Call" ADD COLUMN "transcriptSegments" JSONB;
ALTER TABLE "Call" ADD COLUMN "recordingState" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Call" ADD COLUMN "recordingObjectKey" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingMime" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingBytes" INTEGER;
ALTER TABLE "Call" ADD COLUMN "recordingAttemptedAt" TIMESTAMP(3);
CREATE INDEX "Call_recordingState_reportedAt_idx" ON "Call"("recordingState", "reportedAt");
UPDATE "Call" SET "recordingState" = 'PENDING'
WHERE "reportedAt" >= NOW() - INTERVAL '14 days' AND "isDemo" = false AND "assistantId" <> 'showcase';
