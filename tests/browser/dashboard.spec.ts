import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { createHash } from "node:crypto";
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
test.beforeAll(async () => {
  await pool.query('DELETE FROM "LoginLimit"');
});
test.afterAll(async () => {
  await pool.end();
});
const credentials = {
  username: "test-clinic",
  password: "Test-only-password-123!",
};
async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Login", { exact: true }).fill(credentials.username);
  await page.getByLabel("Hasło", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rozmowy pod kontrolą" }),
  ).toBeVisible();
}
test("protects data and rejects cross-origin login", async ({ request }) => {
  expect((await request.get("/api/dashboard")).status()).toBe(401);
  expect((await request.get("/api/calls/demo-0")).status()).toBe(401);
  expect(
    (
      await request.post("/api/auth/login", {
        data: credentials,
        headers: { origin: "https://untrusted.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.post("/api/webhooks/vapi", { data: {} })).status(),
  ).toBe(401);
});
test("clinic workflow, analytics, copy link and logout", async ({
  page,
  context,
}) => {
  const savedNote = `Notatka testowa ${Date.now()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await expect(
    page.getByText("Tryb demonstracyjny", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Kopiuj link do panelu" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("http://localhost:3111");
  await page.locator(".callback-item").first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Transkrypcja", exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Notatka dla zespołu").fill(savedNote);
  await dialog.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status")).toContainText("Zmiany zapisane");
  await page.getByRole("button", { name: "Zamknij szczegóły" }).click();
  await page
    .getByRole("button", { name: "Połączenia", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Szukaj połączeń" })
    .fill("000 000 001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Otwórz połączenie", exact: false })
    .click();
  await expect(page.getByLabel("Notatka dla zespołu")).toHaveValue(savedNote);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Analityka", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Połączenia dzień po dniu" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/analytics-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ustawienia", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dostęp do panelu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wyloguj się" }).click();
  await expect(page).toHaveURL(/login/);
  expect(errors).toEqual([]);
});
test("mobile layout remains usable and contains table overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator(".stats-strip")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Połączenia", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Otwórz połączenie", exact: false })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/detail-mobile.png",
    fullPage: true,
  });
});
test("invalid password does not authenticate", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    headers: { origin: "http://localhost:3111" },
    data: { ...credentials, password: "incorrect" },
  });
  expect(response.status()).toBe(401);
  expect((await request.get("/api/dashboard")).status()).toBe(401);
});

test("prevents lost note updates and expires sessions", async ({ request }) => {
  const auth = await request.post("/api/auth/login", {
    headers: { origin: "http://localhost:3111" },
    data: credentials,
  });
  expect(auth.ok()).toBe(true);
  const call = await (await request.get("/api/calls/demo-0")).json();
  const update = {
    followUp: "CALLBACK",
    note: call.note,
    revision: call.revision,
  };
  expect(
    (
      await request.patch("/api/calls/demo-0", {
        headers: { origin: "http://localhost:3111" },
        data: update,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.patch("/api/calls/demo-0", {
        headers: { origin: "http://localhost:3111" },
        data: update,
      })
    ).status(),
  ).toBe(409);
  const token = (await request.storageState()).cookies.find(
    (c) => c.name === "tatravet_session",
  );
  expect(token?.secure).toBe(true);
  expect(token?.httpOnly).toBe(true);
  expect(token?.sameSite).toBe("Lax");
  const hash = createHash("sha256").update(token!.value).digest("hex");
  await pool.query('UPDATE "Session" SET "expiresAt"=$2 WHERE "tokenHash"=$1', [
    hash,
    new Date(Date.now() - 60000).toISOString(),
  ]);
  expect((await request.get("/api/dashboard")).status()).toBe(401);
});
test("password change revokes every session", async ({
  request,
  playwright,
}) => {
  const second = await playwright.request.newContext({
    baseURL: "http://localhost:3111",
  });
  const options = {
    headers: { origin: "http://localhost:3111" },
    data: credentials,
  };
  await request.post("/api/auth/login", options);
  await second.post("/api/auth/login", options);
  const temporary = "Temporary-test-password-987!";
  expect(
    (
      await request.post("/api/auth/password", {
        headers: options.headers,
        data: { current: credentials.password, password: temporary },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/dashboard")).status()).toBe(401);
  expect((await second.get("/api/dashboard")).status()).toBe(401);
  await request.post("/api/auth/login", {
    headers: options.headers,
    data: { ...credentials, password: temporary },
  });
  expect(
    (
      await request.post("/api/auth/password", {
        headers: options.headers,
        data: { current: temporary, password: credentials.password },
      })
    ).status(),
  ).toBe(200);
  await second.dispose();
});
