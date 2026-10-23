import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthFrame>
      <LoginForm showDevOutbox={process.env.NODE_ENV !== "production"} />
    </AuthFrame>
  );
}
