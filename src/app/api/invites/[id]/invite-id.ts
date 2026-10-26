import { z } from "zod";
import { HttpError } from "@/lib/http";
import { inviteIdSchema } from "@/lib/invites";

export type Ctx = { params: Promise<{ id: string }> };

// Any id that isn't a UUID can't exist, so it gets the same 404 as another business's invite.
export async function inviteId(ctx: Ctx): Promise<string> {
  const parsed = inviteIdSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw new HttpError(404, "Invite not found.");
  return parsed.data;
}

// The body must be empty: the invite already holds everything, so anything sent along is refused.
export const emptyBodySchema = z.strictObject({}, { error: "Invalid request." });
