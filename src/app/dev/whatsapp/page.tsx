import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requirePageBusinessUser } from "@/lib/auth";
import { mask } from "@/lib/logger";
import { saMobileSchema } from "@/lib/phone";
import { sendWhatsApp, whatsAppConfig } from "@/messaging/adapter";
import { allWhatsAppTemplateDefinitions, exampleWhatsAppMessage } from "@/messaging/templates/whatsapp";
import { createWhatsAppTemplate, listWhatsAppTemplates, type WhatsAppTemplateStatus } from "@/messaging/whatsapp";

export const dynamic = "force-dynamic";

// Development only: submits Thusa's WhatsApp templates to Meta for review, straight from the code, so the
// approved wording is exactly what Thusa sends and records. Shows Meta's review status for each, and can
// send the example payment request to a phone to check the token, the number and the approval end to end.
// Owners only. Needs WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID.

const resultSchema = z.string().max(500).optional();
const testSchema = z.object({ phone: saMobileSchema, language: z.enum(["en", "zu"]) });

async function ownerConfig() {
  if (process.env.NODE_ENV === "production") notFound();
  const { role } = await requirePageBusinessUser();
  if (role !== "OWNER") redirect("/dev/whatsapp");
  const cfg = whatsAppConfig();
  if (!cfg) redirect("/dev/whatsapp?result=WhatsApp+isn%27t+set+up+in+.env");
  return cfg;
}

const back = (result: string) => redirect(`/dev/whatsapp?result=${encodeURIComponent(result)}`);

async function submitTemplates() {
  "use server";
  const cfg = await ownerConfig();
  let existing: WhatsAppTemplateStatus[];
  try {
    existing = await listWhatsAppTemplates(cfg);
  } catch (err) {
    return back(`Couldn't list templates: ${(err as Error).message}`);
  }
  const results: string[] = [];
  for (const definition of allWhatsAppTemplateDefinitions()) {
    if (existing.some((t) => t.name === definition.name && t.language === definition.language)) continue;
    try {
      results.push(`${definition.name} (${definition.language}): ${await createWhatsAppTemplate(cfg, definition)}`);
    } catch (err) {
      // Only status and error codes: see src/messaging/whatsapp.ts.
      results.push(`${definition.name} (${definition.language}): ${(err as Error).message}`);
    }
  }
  return back(results.length ? results.join("; ") : "Every template is already with Meta.");
}

async function sendTest(formData: FormData) {
  "use server";
  await ownerConfig();
  const form = testSchema.safeParse({ phone: formData.get("phone"), language: formData.get("language") });
  if (!form.success) return back(form.error.issues[0]?.message ?? "Invalid request.");
  const { phone, language } = form.data;
  // redirect() throws, so it stays outside the try.
  let result: string;
  try {
    await sendWhatsApp(phone, exampleWhatsAppMessage(language, "payment_request"));
    result = `Meta accepted it for ${mask(phone)}. Check that phone's WhatsApp.`;
  } catch (err) {
    result = `Not sent to ${mask(phone)}: ${(err as Error).message}`;
  }
  return back(result);
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DevWhatsAppPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { role } = await requirePageBusinessUser();
  const result = resultSchema.safeParse((await searchParams).result);

  let cfg: ReturnType<typeof whatsAppConfig> = null;
  let configProblem: string | null = null;
  try {
    cfg = whatsAppConfig();
  } catch (err) {
    configProblem = (err as Error).message;
  }

  let statuses: WhatsAppTemplateStatus[] | null = null;
  let listProblem: string | null = null;
  if (cfg?.businessAccountId) {
    try {
      statuses = await listWhatsAppTemplates(cfg);
    } catch (err) {
      listProblem = (err as Error).message;
    }
  }
  const definitions = allWhatsAppTemplateDefinitions();

  return (
    <main className="content stack narrow">
      <div>
        <h1>WhatsApp templates</h1>
        <p className="muted">
          Thusa&apos;s templates, from <code>src/messaging/templates/whatsapp.ts</code>, and Meta&apos;s review status for
          each. Owners only.
        </p>
      </div>

      {result.success && result.data && (
        <p className="message" role="status">
          {result.data}
        </p>
      )}

      <section className="panel stack">
        <h2>Setup</h2>
        {configProblem ? (
          <p className="message problem">{configProblem}</p>
        ) : cfg ? (
          <p className="small">
            WhatsApp is on. Phone number id set. Business account id {cfg.businessAccountId ? "set" : "NOT set (needed here)"}.
          </p>
        ) : (
          <p className="small">
            WhatsApp is off. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID in .env and
            restart <code>npm run dev</code>.
          </p>
        )}
        {listProblem && <p className="message problem">Couldn&apos;t read templates from Meta: {listProblem}</p>}
      </section>

      <section className="panel stack">
        <h2>Templates</h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Language</th>
              <th scope="col">Meta status</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((d) => (
              <tr key={`${d.name}-${d.language}`}>
                <td>{d.name}</td>
                <td>{d.language}</td>
                <td>
                  {statuses
                    ? (statuses.find((s) => s.name === d.name && s.language === d.language)?.status ?? "Not submitted")
                    : "Unknown"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {role === "OWNER" && cfg?.businessAccountId && (
          <form action={submitTemplates}>
            <button type="submit">Submit missing templates to Meta</button>
          </form>
        )}
        <details>
          <summary>What gets submitted</summary>
          <pre className="small">{JSON.stringify(definitions, null, 2)}</pre>
        </details>
      </section>

      {role === "OWNER" && cfg && (
        <section className="panel stack">
          <h2>Send a test</h2>
          <p className="muted small">
            Sends the example payment request (made-up crèche and amounts) to one phone. Works once Meta has approved
            thusa_payment_request_v1 in that language.
          </p>
          <form action={sendTest} className="stack">
            <div>
              <label htmlFor="test-phone">Cellphone</label>
              <input id="test-phone" name="phone" type="tel" inputMode="tel" placeholder="082 123 4567" maxLength={20} />
            </div>
            <div>
              <label htmlFor="test-language">Language</label>
              <select id="test-language" name="language" defaultValue="en">
                <option value="en">English</option>
                <option value="zu">isiZulu</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit">Send test</button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
