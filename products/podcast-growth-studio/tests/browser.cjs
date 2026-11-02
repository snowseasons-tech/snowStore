const { chromium } = require("playwright");
const fs = require("fs");
fs.mkdirSync("test-results", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const title = "Browser QA " + Date.now();
  const hook = "Updated " + Date.now();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.BASE_URL || "http://localhost:8000");
  await page.getByRole("heading", { name: "Welcome to the studio" }).waitFor();
  if (!process.env.APP_PASSWORD)
    throw Error("Set APP_PASSWORD to the test workspace password");
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.APP_USER || "admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.APP_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "01 · Add episode" }).waitFor();
  await page.getByLabel("Episode title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Save episode", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit episode", exact: true })
    .first()
    .waitFor();
  await page
    .getByLabel("Episode", { exact: true })
    .selectOption({ label: title });
  await page
    .getByLabel("Opening hook", { exact: true })
    .fill("A conversation worth sharing");
  await page
    .getByLabel("Edited clip asset URL (required before scheduling)", {
      exact: true,
    })
    .fill("https://example.com/clip.mp4");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to review", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Edit draft", exact: true })
    .first()
    .click();
  await page.getByLabel("Opening hook", { exact: true }).fill(hook);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText(hook, { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Move to review", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Move to approved", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Move to scheduled", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Schedule a clip", exact: true })
    .waitFor();
  const future = new Date(Date.now() + 86400000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Local date and time", { exact: true }).fill(local);
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .first()
    .waitFor();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw Error("Mobile horizontal overflow");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome to the studio" }).waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Browser flow passed: login, create episode, create/edit draft, review, approve, schedule, mobile overflow, logout; no JS errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
