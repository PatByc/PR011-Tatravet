import { Readable, Transform } from "node:stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "./db";
import { assistantIds } from "./vapi";
import { safeErrorDetails } from "./diagnostics";

const maxRecordingBytes = 100 * 1024 * 1024;
const retryDelayMs = 6 * 60 * 60 * 1000;
const archiveWindowMs = 14 * 24 * 60 * 60 * 1000;

function archiveError(code: string) {
  return Object.assign(new Error(code), { code });
}

function requiredConfig(name: string) {
  const value = process.env[name];
  if (!value) throw archiveError(`${name}_MISSING`);
  if (value.includes("${{")) throw archiveError(`${name}_UNRESOLVED_REFERENCE`);
  return value;
}

function storageConfig() {
  const endpoint = requiredConfig("RECORDINGS_ENDPOINT");
  const bucket = requiredConfig("RECORDINGS_BUCKET");
  const region = requiredConfig("RECORDINGS_REGION");
  const accessKeyId = requiredConfig("RECORDINGS_ACCESS_KEY_ID");
  const secretAccessKey = requiredConfig("RECORDINGS_SECRET_ACCESS_KEY");
  if (!endpoint.startsWith("https://")) throw archiveError("RECORDINGS_ENDPOINT_INVALID");
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
  if (response.status === 404) throw archiveError("RECORDING_UNAVAILABLE");
  if (response.status !== 302 && response.status !== 303 && !response.ok)
    throw archiveError("RECORDING_FETCH_FAILED");
  if (response.status === 302 || response.status === 303) {
    const location = response.headers.get("location");
    if (!location || !location.startsWith("https://")) throw archiveError("RECORDING_REDIRECT_INVALID");
    const signed = await fetch(location, { redirect: "error", signal: AbortSignal.timeout(90_000), cache: "no-store" });
    if (!signed.ok) throw archiveError("RECORDING_DOWNLOAD_FAILED");
    return signed;
  }
  return response;
}

export async function archivePendingRecordings() {
  requiredConfig("DATABASE_URL");
  const apiKey = requiredConfig("VAPI_API_KEY");
  const allowedAssistants = assistantIds();
  if (!allowedAssistants.length) throw archiveError("VAPI_ASSISTANT_IDS_MISSING");
  if (allowedAssistants.some((id) => id.includes("${{")))
    throw archiveError("VAPI_ASSISTANT_IDS_UNRESOLVED_REFERENCE");
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
  const failureCodes: Record<string, number> = {};
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
        if (Number.isFinite(length) && length > maxRecordingBytes) throw archiveError("RECORDING_TOO_LARGE");
        if (!response.body) throw archiveError("RECORDING_BODY_EMPTY");
        const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
        if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream")
          throw archiveError("RECORDING_TYPE_UNEXPECTED");
        let bytes = 0;
        const limit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            callback(bytes <= maxRecordingBytes ? null : archiveError("RECORDING_TOO_LARGE"), chunk);
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
      } catch (error) {
        await db.call.update({ where: { id: call.id }, data: { recordingState: "FAILED" } });
        failed++;
        const code = safeErrorDetails(error).code || "RECORDING_COPY_FAILED";
        failureCodes[code] = (failureCodes[code] || 0) + 1;
      }
    }
  } finally {
    client.destroy();
  }
  return { inspected: calls.length, archived, failed, failureCodes };
}
