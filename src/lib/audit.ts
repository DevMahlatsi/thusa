import { db } from "./db";

export type AuditAction =
  | "auth.login"
  | "auth.otp_locked"
  | "auth.logout"
  | "business.created"
  | "business.updated"
  | "payer.created"
  | "payer.updated"
  | "payer.archived";

type AuditEntry = {
  action: AuditAction;
  userId?: string | null;
  businessId?: string | null;
  // Never include phone numbers, account numbers, codes or tokens.
  metadata?: Record<string, string | number | boolean | null>;
};

export async function audit(entry: AuditEntry): Promise<void> {
  await db().auditLog.create({
    data: {
      action: entry.action,
      userId: entry.userId ?? null,
      businessId: entry.businessId ?? null,
      metadata: entry.metadata,
    },
  });
}
