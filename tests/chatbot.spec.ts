import { test, expect } from "@playwright/test";

test.describe("Chatbot UI", () => {
  test("renders the chat interface", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Trippy Tacos — Review Insights")).toBeVisible();
    await expect(page.getByPlaceholder("What do customers say about...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("send button is enabled when input has text", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What do customers say about...").fill("hello");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("shows user message after sending", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What do customers say about...").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("hello")).toBeVisible();
  });

  test("receives a response from the chatbot", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What do customers say about...").fill("what are the most popular menu items?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for assistant response (up to 15s for API call)
    const assistantMessage = page.locator("div").filter({ hasText: /taco|nacho|birria|menu/i }).last();
    await expect(assistantMessage).toBeVisible({ timeout: 15000 });
  });

  test("response has no duplicated text", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What do customers say about...").fill("how is the service?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for response
    await page.waitForTimeout(10000);

    // Get all assistant messages
    const messages = page.locator("[style*='flex-start']");
    const count = await messages.count();
    if (count > 0) {
      const lastMessage = await messages.last().textContent();
      if (lastMessage) {
        // Check no sentence appears twice in a row
        const sentences = lastMessage.split(". ");
        for (let i = 0; i < sentences.length - 1; i++) {
          if (sentences[i].length > 20) {
            expect(sentences[i]).not.toBe(sentences[i + 1]);
          }
        }
      }
    }
  });
});

test.describe("API Routes", () => {
  test("POST /api/chat returns a response", async ({ request }) => {
    const response = await request.post("/api/chat", {
      data: { message: "what do people think about the tacos?" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    const json = await response.json();
    expect(typeof json.text).toBe("string");
    expect(json.text.length).toBeGreaterThan(10);
    expect(Array.isArray(json.sources)).toBe(true);
  });

  test("POST /api/chat returns 400 without message", async ({ request }) => {
    const response = await request.post("/api/chat", {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test("POST /api/ingest returns 400 without reviews", async ({ request }) => {
    const response = await request.post("/api/ingest", {
      data: {},
    });
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("reviews");
  });
});
