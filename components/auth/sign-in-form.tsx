"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function SignInForm() {
  const t = useTranslations("auth");
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/"; // no open redirects
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(next);
      router.refresh();
    }
  }, [isAuthenticated, next, router]);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      await signIn("google", { redirectTo: next });
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft sm:p-8 text-center">
      <div className="flex justify-center">
        <LogoMark size={48} />
      </div>
      <h1 className="mt-4 font-heading text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sign in with your Google account to contact sellers and access verified land details.
      </p>

      <div className="mt-8">
        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full text-base font-medium shadow-sm transition hover:bg-muted"
          onClick={handleGoogleSignIn}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5 mr-1" aria-hidden>
              <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23Z" />
              <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8Z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8c.9-2.6 3.4-4.5 6.3-4.5Z" />
            </svg>
          )}
          Sign in with Google
        </Button>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">{t("terms")}</p>
    </div>
  );
}
