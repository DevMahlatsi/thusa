"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "./api-client";
import { LogoutIcon } from "./icons";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="icon"
      title="Log out"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await sendJson("/api/auth/logout", "POST").catch(() => undefined);
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogoutIcon size={18} />
      <span className="sr-only">Log out</span>
    </button>
  );
}
