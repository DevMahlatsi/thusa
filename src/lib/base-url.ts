import { headers } from "next/headers";

/**
 * Where links for people (e.g. invite links) should point: the address the owner is using, so on the live
 * site that's https://mythusa.vercel.app. Deliberately not PUBLIC_BASE_URL: that's for provider webhooks and
 * is an ngrok tunnel in development. Server components only.
 */
export async function appBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
