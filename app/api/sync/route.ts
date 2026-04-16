import { NextRequest, NextResponse } from "next/server";

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") return false;
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  return token === secret;
}

function getRequestOrigin(req: NextRequest): string {
  const host = req.headers.get("host");
  if (!host) {
    return "http://localhost:3000";
  }
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text || `HTTP ${res.status}` };
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!authorizeCron(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Combined sync: starting");

    const origin = getRequestOrigin(req);
    const authorization = req.headers.get("authorization") ?? "";

    let googleResult: Record<string, unknown>;
    try {
      const googleRes = await fetch(`${origin}/api/sync/google`, {
        method: "POST",
        headers: { Authorization: authorization },
      });
      googleResult = await readJsonBody(googleRes);
    } catch (err) {
      googleResult = {
        error: err instanceof Error ? err.message : "Google sync request failed",
      };
    }

    let yelpResult: Record<string, unknown>;
    try {
      const yelpRes = await fetch(`${origin}/api/sync/yelp`, {
        method: "POST",
        headers: { Authorization: authorization },
      });
      yelpResult = await readJsonBody(yelpRes);
    } catch (err) {
      yelpResult = {
        error: err instanceof Error ? err.message : "Yelp sync request failed",
      };
    }

    const combined = { google: googleResult, yelp: yelpResult };
    console.log("Combined sync: complete", combined);

    return NextResponse.json(combined);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Combined sync failed";
    console.error("Combined sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
