import { z } from "zod";
import { HttpError } from "@/lib/http";

export type Ctx = { params: Promise<{ id: string }> };

// Any id that isn't a UUID can't exist, so it gets the same 404 as another business's collection.
export async function collectionId(ctx: Ctx): Promise<string> {
  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) throw new HttpError(404, "Payment request not found.");
  return parsed.data;
}

// The body must be empty: the server decides what is owed and what the message says, so an amount or a
// businessId sent along is refused rather than ignored.
export const emptyBodySchema = z.strictObject({}, { error: "Invalid request." });
