import { describe, expect, it } from "vitest";
import { apiRoute, HttpError } from "@/lib/http";

const ok = apiRoute(async () => Response.json({ ok: true }));

describe("apiRoute", () => {
  it("blocks cross-site POSTs (CSRF)", async () => {
    const res = await ok(
      new Request("http://localhost:3000/api/x", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("blocks POSTs with no Origin header", async () => {
    const res = await ok(new Request("http://localhost:3000/api/x", { method: "POST", headers: { host: "localhost:3000" } }));
    expect(res.status).toBe(403);
  });

  it("allows same-origin POSTs", async () => {
    const res = await ok(
      new Request("http://localhost:3000/api/x", {
        method: "POST",
        headers: { origin: "http://localhost:3000", host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns only the public message for known errors and a generic one otherwise", async () => {
    const known = apiRoute(async () => {
      throw new HttpError(429, "Slow down.");
    });
    const unknown = apiRoute(async () => {
      throw new Error("db password=hunter2 failed");
    });
    const get = new Request("http://localhost:3000/api/x");
    expect(await (await known(get)).json()).toEqual({ error: "Slow down." });
    const res = await unknown(get);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });
});
