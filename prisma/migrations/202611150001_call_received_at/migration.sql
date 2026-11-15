ALTER TABLE "Call" ADD COLUMN "reportedAt" TIMESTAMP(3);
CREATE INDEX "Call_isDemo_reportedAt_idx" ON "Call"("isDemo", "reportedAt");
