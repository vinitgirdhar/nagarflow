import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic browser passphrase!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
}

test("dashboard dispatch works when external map scripts are unavailable", async ({
  page,
}) => {
  await page.route("https://unpkg.com/**", (route) => route.abort());
  await login(page);
  const suggestion = page
    .locator(".dispatch-card-premium")
    .filter({ hasText: "Dharavi" });
  await expect(suggestion).toBeVisible();
  await suggestion
    .getByRole("button", { name: "DISPATCH", exact: true })
    .click();
  const assignment = page.getByRole("article", {
    name: "Assignment Fleet Alpha",
    exact: true,
  });
  await expect(assignment).toBeVisible();
  await page
    .getByRole("button", {
      name: "Confirm arrival for Fleet Alpha",
      exact: true,
    })
    .click();
  const form = page.getByRole("form", {
    name: "Arrival for Fleet Alpha",
    exact: true,
  });
  await form.getByLabel("Observed demand score").fill("60");
  await form.getByLabel("Arrival notes").fill("Recorded by the operator");
  await form
    .getByRole("button", { name: "Record arrival", exact: true })
    .click();
  await expect(assignment).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Arrival confirmed." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".dispatch-card-premium").filter({ hasText: "Dharavi" }),
  ).toHaveCount(0);
  await page.goto("/reports");
  await expect(
    page.getByText("Mean absolute score difference: 30 points.", {
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/NagarFlow_Operations_.*\.pdf$/);
  expect(await file.failure()).toBeNull();
});

test("dispatch page persists acceptance, cancellation and redispatch without false arrival", async ({
  page,
}) => {
  await login(page);
  const before = (await (await page.request.get("/api/reports")).json())
    .score_comparison.observed_count;
  await page.goto("/dispatch");
  const suggestion = page.getByRole("article", {
    name: "Dispatch suggestion for Bandra",
    exact: true,
  });
  await expect(suggestion).toHaveCount(1);
  await suggestion
    .getByRole("button", { name: "DISPATCH", exact: true })
    .click();
  const assignment = page.getByRole("article", {
    name: "Assignment Fleet Beta",
    exact: true,
  });
  await expect(assignment).toBeVisible();
  await page.reload();
  await expect(assignment).toBeVisible();
  await page
    .getByRole("button", {
      name: "Cancel assignment for Fleet Beta",
      exact: true,
    })
    .click();
  const cancellation = page.getByRole("form", {
    name: "Cancellation for Fleet Beta",
    exact: true,
  });
  await cancellation
    .getByLabel("Cancellation reason")
    .fill("Vehicle needs inspection");
  await cancellation
    .getByRole("button", { name: "Cancel dispatch", exact: true })
    .click();
  await expect(assignment).toHaveCount(0);
  await expect(suggestion).toHaveCount(1);
  await suggestion
    .getByRole("button", { name: "DISPATCH", exact: true })
    .click();
  await expect(assignment).toBeVisible();
  await page
    .getByRole("button", {
      name: "Confirm arrival for Fleet Beta",
      exact: true,
    })
    .click();
  await page
    .getByRole("form", { name: "Arrival for Fleet Beta", exact: true })
    .getByRole("button", { name: "Record arrival", exact: true })
    .click();
  await expect(assignment).toHaveCount(0);
  await page.goto("/reports");
  const after = (await (await page.request.get("/api/reports")).json())
    .score_comparison.observed_count;
  expect(after).toBe(before);
});

test("a stale suggestion shows the server conflict and does not assign another vehicle", async ({
  page,
}) => {
  await login(page);
  await page.goto("/dispatch");
  const suggestion = page.getByRole("article", {
    name: "Dispatch suggestion for Kurla",
    exact: true,
  });
  await expect(suggestion).toHaveCount(1);
  await page.route("**/api/dispatch/accept", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The recommendation has changed. Refresh before dispatching.",
      }),
    }),
  );
  await suggestion
    .getByRole("button", { name: "DISPATCH", exact: true })
    .click();
  await expect(
    page.getByText(
      "The recommendation has changed. Refresh before dispatching.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Assignment Fleet Tanker", exact: true }),
  ).toHaveCount(0);
});
