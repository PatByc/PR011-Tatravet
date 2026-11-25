import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { recordingStorageVariables } from "./recording-config";

export async function replayLivekitReports() {
  const url = process.env.LIVEKIT_EOCR_URL;
  const secret = process.env.LIVEKIT_EOCR_SECRET;
  if (!url && !secret) return { inspected: 0, delivered: 0, failed: 0, skipped: true };
  if (!url || !secret || secret.length < 32) throw new Error("LIVEKIT_EOCR_REPLAY_CONFIG_MISSING");
  const { endpoint, bucket, region, accessKeyId, secretAccessKey } = recordingStorageVariables();
  const client = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } });
  let inspected = 0;
  let delivered = 0;
  let failed = 0;
  try {
    let continuationToken: string | undefined;
    do {
      const list = await client.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: "livekit-eocr/", MaxKeys: 50,
        ContinuationToken: continuationToken,
      }));
      for (const item of list.Contents || []) {
        const key = item.Key;
        if (!key || !/^livekit-eocr\/RM_[A-Za-z0-9]+\.json$/.test(key)) continue;
        inspected++;
        try {
          const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          if (!object.Body || !object.ContentLength || object.ContentLength > 2_000_000)
            throw new Error("LIVEKIT_EOCR_REPLAY_SIZE_INVALID");
          const body = await object.Body.transformToByteArray();
          const response = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
            body: Buffer.from(body),
            signal: AbortSignal.timeout(15_000),
          });
          const result: unknown = await response.json();
          if (!response.ok || !result || typeof result !== "object" || !("accepted" in result) || result.accepted !== true)
            throw new Error("LIVEKIT_EOCR_REPLAY_REJECTED");
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          delivered++;
        } catch {
          failed++;
        }
      }
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);
  } finally {
    client.destroy();
  }
  return { inspected, delivered, failed };
}
