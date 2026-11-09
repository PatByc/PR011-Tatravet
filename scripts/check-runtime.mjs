import "dotenv/config";

const missing = ["PUBLIC_URL", "DATABASE_URL"].filter(
  (name) => !process.env[name]?.trim(),
);
if (missing.length) {
  console.error("runtime_configuration_missing:", missing.join(", "));
  process.exit(1);
}
let publicOrigin;
try {
  const url = new URL(process.env.PUBLIC_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error();
  publicOrigin = url.origin;
} catch {
  console.error(
    "runtime_configuration_invalid: PUBLIC_URL must be an http(s) URL",
  );
  process.exit(1);
}
try {
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) throw new Error();
} catch {
  console.error(
    "runtime_configuration_invalid: DATABASE_URL must be a resolved PostgreSQL connection string",
  );
  process.exit(1);
}
console.info(
  "runtime_configuration:",
  JSON.stringify({ publicOrigin, databaseConfigured: true }),
);
