function configError(code: string) {
  return Object.assign(new Error(code), { code });
}

type RecordingEnvironment = Record<string, string | undefined>;

function required(env: RecordingEnvironment, names: string[]) {
  const values = names.map((name) => env[name]).filter((value): value is string => Boolean(value));
  const resolved = values.find((value) => !value.includes("${{"));
  if (resolved) return resolved;
  const suffix = values.length ? "UNRESOLVED_REFERENCE" : "MISSING";
  throw configError(`${names.join("_OR_")}_${suffix}`);
}

export function recordingStorageVariables(env: RecordingEnvironment = process.env) {
  const endpoint = required(env, ["AWS_ENDPOINT_URL", "RECORDINGS_ENDPOINT"]);
  if (!endpoint.startsWith("https://")) throw configError("RECORDINGS_ENDPOINT_INVALID");
  return {
    endpoint,
    bucket: required(env, ["AWS_S3_BUCKET_NAME", "RECORDINGS_BUCKET"]),
    region: required(env, ["AWS_DEFAULT_REGION", "RECORDINGS_REGION"]),
    accessKeyId: required(env, ["AWS_ACCESS_KEY_ID", "RECORDINGS_ACCESS_KEY_ID"]),
    secretAccessKey: required(env, ["AWS_SECRET_ACCESS_KEY", "RECORDINGS_SECRET_ACCESS_KEY"]),
  };
}
