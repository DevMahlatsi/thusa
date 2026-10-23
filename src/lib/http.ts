import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export const unauthorised = () => new HttpError(401, "Please log in again.");
export const forbidden = () => new HttpError(403, "You don't have permission to do that.");

// Ctx is Next's second route argument, e.g. { params: Promise<{ id: string }> } for dynamic routes.
// It's optional on the wrapped route so tests can call it with just a request.
type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/**
 * Wraps an API route: rejects cross-site mutations (CSRF), turns HttpErrors into
 * generic JSON errors and logs unexpected failures through the PII-masking logger.
 */
export function apiRoute<Ctx = unknown>(handler: Handler<Ctx>): (req: Request, ctx?: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx as Ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.publicMessage }, { status: err.status });
      }
      logger.error("api.unhandled_error", { path: new URL(req.url).pathname, error: err });
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new HttpError(403, "Request blocked.");
  }
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  return parsed.data;
}

export function clientIp(req: Request): string {
  // On Vercel the first x-forwarded-for entry is the client; locally there may be none.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
