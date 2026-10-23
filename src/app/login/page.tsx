import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser } from "@/lib/auth";
import { demoLogin, formatSaMobile } from "@/lib/auth/demo";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const demo = demoLogin();
  return (
    <AuthFrame>
      <LoginForm
        showDevOutbox={process.env.NODE_ENV !== "production"}
        demo={demo && { phone: formatSaMobile(demo.phoneE164), phoneE164: demo.phoneE164, code: demo.code }}
      />
    </AuthFrame>
  );
}
