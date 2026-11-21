import { describe, expect, it } from "vitest";
import { recordingStorageVariables } from "../lib/recording-config";

describe("Railway recording storage variables", () => {
  it("accepts the AWS variables created by Add to Service", () => {
    expect(recordingStorageVariables({
      AWS_ENDPOINT_URL: "https://t3.storageapi.dev",
      AWS_S3_BUCKET_NAME: "recordings-test",
      AWS_DEFAULT_REGION: "auto",
      AWS_ACCESS_KEY_ID: "test-access",
      AWS_SECRET_ACCESS_KEY: "test-secret",
    })).toEqual({
      endpoint: "https://t3.storageapi.dev",
      bucket: "recordings-test",
      region: "auto",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
    });
  });

  it("falls back to existing RECORDINGS variables when AWS references are empty", () => {
    expect(recordingStorageVariables({
      AWS_ENDPOINT_URL: "",
      RECORDINGS_ENDPOINT: "https://t3.storageapi.dev",
      RECORDINGS_BUCKET: "recordings-test",
      RECORDINGS_REGION: "auto",
      RECORDINGS_ACCESS_KEY_ID: "test-access",
      RECORDINGS_SECRET_ACCESS_KEY: "test-secret",
    }).bucket).toBe("recordings-test");
  });

  it("reports missing or unresolved references without including values", () => {
    expect(() => recordingStorageVariables({})).toThrowError("AWS_ENDPOINT_URL_OR_RECORDINGS_ENDPOINT_MISSING");
    expect(() => recordingStorageVariables({
      AWS_ENDPOINT_URL: "${{WrongBucket.ENDPOINT}}",
    })).toThrowError("AWS_ENDPOINT_URL_OR_RECORDINGS_ENDPOINT_UNRESOLVED_REFERENCE");
  });
});
