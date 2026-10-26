import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { renderMessage } from "@/messaging/adapter";
import { LANGUAGES, type InviteLink, type Language } from "@/messaging/templates/types";
import { audit } from "./audit";
import type { Rhythm } from "./dashboard";
import { db } from "./db";
import { splitMonthlyFee } from "./fee-split";
import { decryptField, encryptField } from "./field-crypto";
import { HttpError } from "./http";
import { logger, mask } from "./logger";
import { encryptPayerPhone, MAX_AMOUNT_CENTS, nameSchema, payerPhone, RHYTHMS, todayInSa } from "./payers";
import { saMobileSchema } from "./phone";
import { takeRateLimit } from "./rate-limit";

// Parent self-onboarding. The owner makes an invite (the parent's cellphone, the child, the monthly fee) and
// sends its link; the parent opens it, gives their name, rhythm, payday and language, and agrees to be
// messaged. They can't change the number or the fee. Their answers wait on the invite until the owner
// approves, and only then become a Payer with a Schedule, so no payment request or reminder can go to a
// parent the owner hasn't approved.
//
// The owner's functions take the session's businessId and filter on it. The parent's side has no session:
// the link's secret finds the invite, and that invite's own businessId is the only one it touches.

export const INVITE_TTL_DAYS = 7;
// Per business per SA day. Far above a crèche's needs; stops a runaway script or a shared demo account.
export const MAX_INVITES_PER_DAY = 50;
// Per IP per hour, counting every try (bad links and typos too). Plenty for a crèche's parents on one Wi-Fi.
export const JOIN_LIMITS = { perIpHour: 20 };

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// The rhythms every invite offers, in this order: the fee is monthly, so monthly comes first.
export const INVITE_RHYTHMS = ["MONTHLY", "FORTNIGHTLY", "WEEKLY"] as const satisfies readonly Rhythm[];

// The link's secret: 32 random bytes, base64url. Only its SHA-256 is looked up; the secret itself is kept
// encrypted so the owner can copy the link again.
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link isn't valid.");
const newToken = () => randomBytes(32).toString("base64url");
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenContext = (businessId: string) => `invite.token:${businessId}`;

export const inviteIdSchema = z.uuid();

// Strict: unknown keys (e.g. a smuggled businessId) are rejected, not ignored.
export const inviteInputSchema = z.strictObject({
  phone: z.string({ error: "Enter the parent's cellphone number" }).pipe(saMobileSchema),
  childName: nameSchema("the child's name"),
  monthlyAmountCents: z
    .number({ error: "Enter the school fees" })
    .int("Amount must be in whole cents")
    .min(100, "The fees must be at least R 1.00")
    .max(MAX_AMOUNT_CENTS, "Amount is too large"),
  // The owner confirms the parent agreed to their number being given to Thusa. Recorded in the audit log.
  parentAgreed: z.literal(true, { error: "Tick the box to confirm the parent agreed" }),
});

export type InviteInput = z.infer<typeof inviteInputSchema>;
/** What an invite row is made from (the demo seed has no owner to confirm anything). */
export type InviteFields = Omit<InviteInput, "parentAgreed">;

// What the parent sends. Strict, so an amountCents, phone or businessId in the body is refused rather than
// ignored: the number is the one the owner gave, and the amount always comes from the owner's monthly fee and
// the rhythm chosen. The secret is in the body, not the URL, so it never ends up in a logged path.
export const joinInputSchema = z
  .strictObject({
    token: inviteTokenSchema,
    parentName: nameSchema("your name"),
    rhythm: z.enum(RHYTHMS, { error: "Choose how often you want to pay" }),
    // WEEKLY/FORTNIGHTLY: ISO weekday 1 (Mon) – 7 (Sun). MONTHLY: day of month 1–31.
    payday: z.number({ error: "Choose your payday" }).int("Choose your payday"),
    language: z.enum(LANGUAGES, { error: "Choose a language for messages" }),
    consent: z.literal(true, { error: "Tick the box to agree to payment requests and reminders" }),
  })
  .refine((s) => s.payday >= 1 && s.payday <= (s.rhythm === "MONTHLY" ? 31 : 7), {
    path: ["payday"],
    message: "Choose your payday",
  });

export type JoinInput = z.infer<typeof joinInputSchema>;

/** The words the parent ticks, exactly as stored with their consent. */
export const consentText = (businessName: string) =>
  `I agree to receive payment requests and reminders from ${businessName} through Thusa.`;

/** The invite page on Thusa's own host. Refuses anything but https (or plain http on localhost, for dev). */
export function inviteLink(baseUrl: string, token: string): InviteLink {
  const base = new URL(baseUrl);
  const local = base.hostname === "localhost" || base.hostname === "127.0.0.1";
  if ((base.protocol !== "https:" && !(base.protocol === "http:" && local)) || base.username || base.password) {
    throw new Error("Invite links need an https base URL");
  }
  if (!inviteTokenSchema.safeParse(token).success) throw new Error("Not an invite token");
  return `${base.origin}/join/${token}` as InviteLink;
}

// How the owner sees an invite. EXPIRED is an OPEN invite past its expiry; AWAITING_APPROVAL is SUBMITTED.
export type InviteState = "OPEN" | "EXPIRED" | "AWAITING_APPROVAL" | "APPROVED" | "DECLINED" | "CANCELLED";

type StatusRow = { status: "OPEN" | "SUBMITTED" | "APPROVED" | "DECLINED" | "CANCELLED"; expiresAt: Date };

export function inviteState(invite: StatusRow, now = new Date()): InviteState {
  if (invite.status === "OPEN") return invite.expiresAt.getTime() > now.getTime() ? "OPEN" : "EXPIRED";
  if (invite.status === "SUBMITTED") return "AWAITING_APPROVAL";
  return invite.status;
}

export type RhythmOption = { rhythm: Rhythm; amountCents: number };

/** The rhythms the parent may choose, each with what one collection asks for, worked out on the server. */
export function rhythmOptions(invite: { monthlyAmountCents: number; allowedRhythms: Rhythm[] }): RhythmOption[] {
  return INVITE_RHYTHMS.filter((r) => invite.allowedRhythms.includes(r)).map((rhythm) => ({
    rhythm,
    amountCents: splitMonthlyFee(invite.monthlyAmountCents, rhythm),
  }));
}

/** Why the parent can't use a link any more, in words the invite page and the API both use. */
export function closedMessage(state: InviteState, businessName: string): string {
  if (state === "EXPIRED") return `This link has expired. Ask ${businessName} to send you a new one.`;
  if (state === "CANCELLED") return `This link is no longer valid. Ask ${businessName} to send you a new one.`;
  return `This link has already been used. If you filled it in, ${businessName} will check your details.`;
}

const toDbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

type Ctx = { userId: string; businessId: string };

/** A new invite's row. The demo seed writes it inside its own transaction; everyone else uses createInvite. */
export function newInviteData(ctx: { userId: string | null; businessId: string }, input: InviteFields, now = new Date()) {
  const token = newToken();
  return {
    businessId: ctx.businessId,
    tokenHash: hashInviteToken(token),
    tokenEncrypted: encryptField(token, tokenContext(ctx.businessId)),
    // Encrypted for this business's payer phones, so approval moves it to the Payer as it is.
    phoneEncrypted: encryptPayerPhone(ctx.businessId, input.phone),
    childName: input.childName,
    monthlyAmountCents: input.monthlyAmountCents,
    allowedRhythms: [...INVITE_RHYTHMS],
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY),
    createdByUserId: ctx.userId,
  };
}

export async function createInvite(ctx: Ctx, input: InviteInput, now = new Date()) {
  // South Africa has no daylight saving, so midnight is always +02:00.
  const since = new Date(`${todayInSa(now)}T00:00:00+02:00`);
  const today = await db().payerInvite.count({ where: { businessId: ctx.businessId, createdAt: { gte: since } } });
  if (today >= MAX_INVITES_PER_DAY) throw new HttpError(429, "That's the most invites for one day. Try again tomorrow.");

  const invite = await db().payerInvite.create({ data: newInviteData(ctx, input, now) });
  await audit({
    action: "invite.created",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: { inviteId: invite.id, parentAgreed: input.parentAgreed },
  });
  return invite;
}

/** Null if the invite doesn't exist or belongs to another business. */
export async function getInvite(businessId: string, inviteId: string) {
  return db().payerInvite.findFirst({ where: { id: inviteId, businessId }, include: { consent: true } });
}

/** For the parents page: answers awaiting approval, open links, and open links that expired in the last week. */
export async function listPendingInvites(businessId: string, now = new Date()) {
  return db().payerInvite.findMany({
    where: {
      businessId,
      OR: [{ status: "SUBMITTED" }, { status: "OPEN", expiresAt: { gt: new Date(now.getTime() - INVITE_TTL_DAYS * DAY) } }],
    },
    include: { consent: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

type InviteRow = NonNullable<Awaited<ReturnType<typeof getInvite>>>;

const maskedPhone = (invite: { businessId: string; phoneEncrypted: string | null }) =>
  invite.phoneEncrypted ? mask(payerPhone({ businessId: invite.businessId, phoneEncrypted: invite.phoneEncrypted })) : null;

/** Safe for the owner's pages: the parent's phone is masked (••••4567) and the link's secret is left out. */
export function toInviteDto(invite: InviteRow, now = new Date()) {
  const { rhythm, payday, amountCents, language, submittedAt } = invite;
  return {
    id: invite.id,
    childName: invite.childName,
    monthlyAmountCents: invite.monthlyAmountCents,
    options: rhythmOptions(invite),
    state: inviteState(invite, now),
    expiresOn: todayInSa(invite.expiresAt),
    // Null once the link is declined, cancelled or expired: the number is cleared then.
    phoneMasked: maskedPhone(invite),
    answers:
      rhythm && payday !== null && amountCents !== null && language && submittedAt
        ? {
            // Null once declined.
            parentName: invite.parentName,
            language,
            rhythm,
            payday,
            amountCents,
            submittedAt: submittedAt.toISOString(),
          }
        : null,
    consent: invite.consent && { text: invite.consent.text, consentedAt: invite.consent.consentedAt.toISOString() },
    payerId: invite.payerId,
  };
}

export type InviteDto = ReturnType<typeof toInviteDto>;

/** The link and the message to send with it, in every language, for the owner to copy. */
export function inviteShare(invite: InviteRow, businessName: string, baseUrl: string) {
  const link = inviteLink(baseUrl, decryptField(invite.tokenEncrypted, tokenContext(invite.businessId)));
  const params = { business: businessName, child: invite.childName, link, expiresOn: todayInSa(invite.expiresAt) };
  const messages = {} as Record<Language, string>;
  for (const language of LANGUAGES) messages[language] = renderMessage(language, "parent_invite", params);
  return { link, messages };
}

// ---- The parent's side (public, no session) -----------------------------------------------------------

const invalidLink = () => new HttpError(404, "This link isn't valid. Ask the crèche to send you a new one.");

const findByToken = (token: string) =>
  db().payerInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { business: { select: { name: true, defaultLanguage: true } } },
  });

/** What the invite page shows. Null for a link that doesn't exist. The number only masked, never anyone's answers. */
export async function findInviteForJoin(token: string, now = new Date()) {
  if (!inviteTokenSchema.safeParse(token).success) return null;
  const invite = await findByToken(token);
  if (!invite) return null;
  return {
    state: inviteState(invite, now),
    businessName: invite.business.name,
    defaultLanguage: invite.business.defaultLanguage,
    childName: invite.childName,
    phoneMasked: maskedPhone(invite),
    monthlyAmountCents: invite.monthlyAmountCents,
    options: rhythmOptions(invite),
    expiresOn: todayInSa(invite.expiresAt),
  };
}

/** 429 once this IP has tried JOIN_LIMITS.perIpHour times in the last hour. Called before the body is read. */
export async function assertJoinAllowed(ip: string, now = new Date()) {
  if (await takeRateLimit("join", [{ key: `ip:${ip}`, limit: JOIN_LIMITS.perIpHour, windowMs: HOUR }], now)) return;
  logger.warn("invite.join_rate_limited");
  throw new HttpError(429, "Too many tries. Please wait an hour and try again.");
}

/** The parent's answers. The invite must be open and unexpired; afterwards it waits for the owner. */
export async function submitInvite(input: JoinInput, now = new Date()) {
  const invite = await findByToken(input.token);
  if (!invite) throw invalidLink();
  const businessName = invite.business.name;
  const state = inviteState(invite, now);
  if (state !== "OPEN") throw new HttpError(410, closedMessage(state, businessName));
  if (!invite.allowedRhythms.includes(input.rhythm)) throw new HttpError(400, "Choose one of the ways to pay on this page.");

  const { id, businessId } = invite;
  await db().$transaction(async (tx) => {
    // Single use: only one submission can move the invite on from OPEN, and only before it expires. The
    // phone stays the owner's; one cleared (cancelled or expired) can't be submitted.
    const claimed = await tx.payerInvite.updateMany({
      where: { id, businessId, status: "OPEN", expiresAt: { gt: now }, phoneEncrypted: { not: null } },
      data: {
        status: "SUBMITTED",
        parentName: input.parentName,
        language: input.language,
        rhythm: input.rhythm,
        payday: input.payday,
        // From the owner's monthly fee, never from the request.
        amountCents: splitMonthlyFee(invite.monthlyAmountCents, input.rhythm),
        submittedAt: now,
      },
    });
    if (claimed.count === 0) throw new HttpError(410, closedMessage("AWAITING_APPROVAL", businessName));
    await tx.messagingConsent.create({ data: { businessId, inviteId: id, text: consentText(businessName), consentedAt: now } });
    await audit({ action: "invite.submitted", businessId, metadata: { inviteId: id } }, tx);
  });
  return { businessName };
}

// ---- The owner's decision -------------------------------------------------------------------------------

const notWaiting = () => new HttpError(409, "This invite isn't waiting for approval.");

/** 404 if the invite isn't this business's, else 409: it exists but isn't in the state the action needs. */
async function missingOr(conflict: HttpError, businessId: string, inviteId: string): Promise<HttpError> {
  const invite = await db().payerInvite.findFirst({ where: { id: inviteId, businessId }, select: { id: true } });
  return invite ? conflict : new HttpError(404, "Invite not found.");
}

/** Turns the parent's answers into a Payer with a Schedule starting today. Only now can requests go out. */
export async function approveInvite(ctx: Ctx, inviteId: string, now = new Date()) {
  return db().$transaction(async (tx) => {
    const invite = await tx.payerInvite.findFirst({ where: { id: inviteId, businessId: ctx.businessId } });
    if (!invite) throw new HttpError(404, "Invite not found.");
    const { parentName, phoneEncrypted, rhythm, payday, amountCents, language } = invite;
    if (invite.status !== "SUBMITTED" || !parentName || !phoneEncrypted || !rhythm || payday === null || amountCents === null) {
      throw notWaiting();
    }
    const payerId = randomUUID();
    const payer = await tx.payer.create({
      data: {
        id: payerId,
        businessId: ctx.businessId,
        parentName,
        childName: invite.childName,
        // The number the owner gave, encrypted for this business's payer phones, so it moves across as it is.
        phoneEncrypted,
        language,
        schedule: { create: { amountCents, rhythm, payday, startsOn: toDbDate(todayInSa(now)) } },
      },
      include: { schedule: true },
    });
    // Two approvals at once: the second finds the invite already APPROVED and rolls back its payer.
    const claimed = await tx.payerInvite.updateMany({
      where: { id: inviteId, businessId: ctx.businessId, status: "SUBMITTED" },
      data: { status: "APPROVED", payerId, decidedAt: now, decidedByUserId: ctx.userId },
    });
    if (claimed.count === 0) throw notWaiting();
    await audit(
      { action: "invite.approved", userId: ctx.userId, businessId: ctx.businessId, metadata: { inviteId, payerId } },
      tx,
    );
    return payer;
  });
}

/** Turns the answers down. The parent's name and phone are cleared; the consent record stays as evidence. */
export async function declineInvite(ctx: Ctx, inviteId: string, now = new Date()) {
  const declined = await db().payerInvite.updateMany({
    where: { id: inviteId, businessId: ctx.businessId, status: "SUBMITTED" },
    data: { status: "DECLINED", parentName: null, phoneEncrypted: null, decidedAt: now, decidedByUserId: ctx.userId },
  });
  if (declined.count === 0) throw await missingOr(notWaiting(), ctx.businessId, inviteId);
  await audit({ action: "invite.declined", userId: ctx.userId, businessId: ctx.businessId, metadata: { inviteId } });
}

/** Withdraws a link the parent hasn't used, expired or not. The parent's number is cleared. */
export async function cancelInvite(ctx: Ctx, inviteId: string, now = new Date()) {
  const cancelled = await db().payerInvite.updateMany({
    where: { id: inviteId, businessId: ctx.businessId, status: "OPEN" },
    data: { status: "CANCELLED", phoneEncrypted: null, decidedAt: now, decidedByUserId: ctx.userId },
  });
  if (cancelled.count === 0) {
    throw await missingOr(new HttpError(409, "This link has already been used or cancelled."), ctx.businessId, inviteId);
  }
  await audit({ action: "invite.cancelled", userId: ctx.userId, businessId: ctx.businessId, metadata: { inviteId } });
}

/** Clears the number from links that expired unused (the daily job). Across businesses: nothing else changes. */
export async function clearExpiredInvitePhones(now = new Date()): Promise<number> {
  const { count } = await db().payerInvite.updateMany({
    where: { status: "OPEN", expiresAt: { lte: now }, phoneEncrypted: { not: null } },
    data: { phoneEncrypted: null },
  });
  return count;
}
