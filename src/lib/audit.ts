import { db } from "./db";

export type AuditAction =
  | "auth.login"
  | "auth.otp_locked"
  | "auth.logout"
  | "business.created"
  | "business.updated"
  | "payer.created"
  | "payer.updated"
  | "payer.archived"
  | "collection.requested"
  | "collection.paid"
  | "collection.reminded"
  | "collection.balance_requested"
  | "jobs.daily_run"
  | "demo.reset"
  | "demo.whatsapp_sample"
  | "ai.summary_refreshed";

type AuditEntry = {
  action: AuditAction;
  userId?: string | null;
  businessId?: string | null;
  // Never include phone numbers, account numbers, codes or tokens.
  metadata?: Record<string, string | number | boolean | null>;
};

// `client` lets a caller write the entry inside its own transaction.
export async function audit(entry: AuditEntry, client: Pick<ReturnType<typeof db>, "auditLog"> = db()): Promise<void> {
  await client.auditLog.create({
    data: {
      action: entry.action,
      userId: entry.userId ?? null,
      businessId: entry.businessId ?? null,
      metadata: entry.metadata,
    },
  });
}
