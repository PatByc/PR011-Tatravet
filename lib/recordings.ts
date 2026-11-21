import { Readable, Transform } from "node:stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "./db";
import { assistantIds } from "./vapi";

const maxRecordingBytes = 100 * 1024 * 1024;
const retryDelayMs = 6 * 60 * 60 * 1000;
const archiveWindowMs = 14 * 24 * 60 * 60 * 1000;

function storageConfig() {
  const endpoint = process.env.RECORDINGS_ENDPOINT;
  const bucket = process.env.RECORDINGS_BUCKET;
  const region = process.env.RECORDINGS_REGION;
  const accessKeyId = process.env.RECORDINGS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.RECORDINGS_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey)
    throw new Error("RecordingStorageNotConfigured");
  if (!endpoint.startsWith("https://")) throw new Error("InvalidRecordingStorageEndpoint");
  return {
    bucket,
    client: new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } }),
  };
}

export async function recordingPlaybackUrl(objectKey: string) {
  const { client, bucket } = storageConfig();
  try {
    return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: 300 });
  } finally {
    client.destroy();
  }
}

async function fetchRecording(callId: string, apiKey: string) {
  const response = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}/mono-recording`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "manual",
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  if (response.status === 404) throw new Error("RecordingUnavailable");
  if (response.status !== 302 && response.status !== 303 && !response.ok)
    throw new Error("RecordingFetchFailed");
  if (response.status === 302 || response.status === 303) {
    const location = response.headers.get("location");
    if (!location || !location.startsWith("https://")) throw new Error("InvalidRecordingRedirect");
    const signed = await fetch(location, { redirect: "error", signal: AbortSignal.timeout(90_000), cache: "no-store" });
    if (!signed.ok) throw new Error("RecordingDownloadFailed");
    return signed;
  }
  return response;
}

export async function archivePendingRecordings() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("VapiApiKeyNotConfigured");
  const allowedAssistants = assistantIds();
  if (!allowedAssistants.length) throw new Error("VapiAssistantAllowlistNotConfigured");
  const { client, bucket } = storageConfig();
  const eligibleBefore = new Date(Date.now() - retryDelayMs);
  const archiveCutoff = new Date(Date.now() - archiveWindowMs);
  await db.call.updateMany({
    where: { isDemo: false, assistantId: { in: allowedAssistants }, recordingObjectKey: null, reportedAt: { lt: archiveCutoff }, recordingState: { in: ["PENDING", "FAILED", "PROCESSING"] } },
    data: { recordingState: "UNAVAILABLE" },
  });
  const calls = await db.call.findMany({
    where: {
      isDemo: false,
      assistantId: { in: allowedAssistants },
      reportedAt: { gte: archiveCutoff },
      recordingObjectKey: null,
      recordingState: { in: ["PENDING", "FAILED", "PROCESSING"] },
      OR: [{ recordingAttemptedAt: null }, { recordingAttemptedAt: { lt: eligibleBefore } }],
    },
    orderBy: { reportedAt: "desc" },
    take: 50,
    select: { id: true },
  });
  let archived = 0;
  let failed = 0;
  try {
    for (const call of calls) {
      const claim = await db.call.updateMany({
        where: {
          id: call.id, recordingObjectKey: null,
          recordingState: { in: ["PENDING", "FAILED", "PROCESSING"] },
          OR: [{ recordingAttemptedAt: null }, { recordingAttemptedAt: { lt: eligibleBefore } }],
        },
        data: { recordingState: "PROCESSING", recordingAttemptedAt: new Date() },
      });
      if (!claim.count) continue;
      try {
        const response = await fetchRecording(call.id, apiKey);
        const length = Number(response.headers.get("content-length"));
        if (Number.isFinite(length) && length > maxRecordingBytes) throw new Error("RecordingTooLarge");
        if (!response.body) throw new Error("EmptyRecordingBody");
        const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
        if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream")
          throw new Error("UnexpectedRecordingType");
        let bytes = 0;
        const limit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            callback(bytes <= maxRecordingBytes ? null : new Error("RecordingTooLarge"), chunk);
          },
        });
        const key = `calls/${encodeURIComponent(call.id)}/mono`;
        await new Upload({
          client,
          params: {
            Bucket: bucket, Key: key, Body: Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(limit),
            ContentType: contentType,
          },
          queueSize: 2,
          leavePartsOnError: false,
        }).done();
        await db.call.update({
          where: { id: call.id },
          data: { recordingState: "ARCHIVED", recordingObjectKey: key, recordingMime: contentType, recordingBytes: bytes },
        });
        archived++;
      } catch {
        await db.call.update({ where: { id: call.id }, data: { recordingState: "FAILED" } });
        failed++;
      }
    }
  } finally {
    client.destroy();
  }
  return { inspected: calls.length, archived, failed };
}
