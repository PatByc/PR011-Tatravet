UPDATE "Call"
SET "followUp" = CASE
  WHEN "contactReason" IN ('appointment', 'appointment_change', 'animal_health', 'test_results') THEN 'CALLBACK'
  ELSE 'NONE'
END
WHERE "isDemo" = false
  AND "assistantId" <> 'showcase'
  AND "reportedAt" IS NOT NULL
  AND "followUpReviewed" = false
  AND "revision" = 0
  AND "followUp" IN ('NONE', 'CALLBACK');
