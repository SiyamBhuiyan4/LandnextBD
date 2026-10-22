"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { Loader2, Mail, Smartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { normalizeBdPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

const inputCls = "h-11 w-full rounded-xl border bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function SignInForm() {
  const t = useTranslations("auth");
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const config = useQuery(api.meta.config);
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/"; // no open redirects
  const [kind, setKind] = useState<"email" | "phone">("email");
  const [target, setTarget] = useState("");
  const [step, setStep] = useState<"target" | "code">("target");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step !== "code" || now >= resendAt) return;
    const h = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(h);
  }, [step, now, resendAt]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(next);
      router.refresh();
    }
  }, [isAuthenticated, next, router]);

  const provider = kind === "email" ? "email-otp" : "phone-otp";
  const identifier = kind === "email" ? target.trim().toLowerCase() : (normalizeBdPhone(target) ?? target);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (kind === "phone" && !normalizeBdPhone(target)) return toast.error(t("invalidPhone"));
    setBusy(true);
    try {
      await signIn(provider, { [kind]: identifier });
      setStep("code");
      setCode("");
      setResendAt(Date.now() + 30_000);
      setNow(Date.now());
    } catch {
      toast.error(t("sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e?: React.FormEvent, value = code) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await signIn(provider, { [kind]: identifier, code: value.trim() });
    } catch {
      toast.error(t("invalidCode"));
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
      <LogoMark size={40} />
      <h1 className="mt-4 font-heading text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {config?.googleEnabled && step === "target" && (
        <>
          <Button variant="outline" className="mt-6 h-11 w-full" onClick={() => void signIn("google", { redirectTo: next })}>
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23Z" />
              <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8Z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8c.9-2.6 3.4-4.5 6.3-4.5Z" />
            </svg>
            {t("google")}
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> {t("or")} <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {step === "target" ? (
        <form onSubmit={sendCode} className={cn("space-y-4", !config?.googleEnabled && "mt-6")}>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
            {(
              [
                ["email", Mail, t("email")],
                ["phone", Smartphone, t("phone")],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => {
                  setKind(k);
                  setTarget("");
                }}
                className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition", kind === k ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <label className="block text-sm font-medium">
            {kind === "email" ? t("emailLabel") : t("phoneLabel")}
            <input
              className={cn(inputCls, "mt-1.5")}
              type={kind === "email" ? "email" : "tel"}
              inputMode={kind === "email" ? "email" : "tel"}
              autoComplete={kind === "email" ? "email" : "tel"}
              placeholder={kind === "email" ? "you@example.com" : "01XXXXXXXXX"}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </label>
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <p className="text-sm">{t("codeSentTo", { target: identifier })}</p>
          <label className="block text-sm font-medium">
            {t("code")}
            <input
              className={cn(inputCls, "mt-1.5 text-center font-mono text-xl tracking-[0.5em]")}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                // Auto-submit once all six digits are in (also covers SMS autofill).
                if (v.length === 6 && code.length !== 6) void verify(undefined, v);
              }}
              required
              autoFocus
            />
          </label>
          <Button type="submit" className="h-11 w-full" disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="animate-spin" />} {t("verify")}
          </Button>
          <button type="button" className="w-full text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={busy || now < resendAt} onClick={() => void sendCode()}>
            {now < resendAt ? t("resendIn", { s: Math.ceil((resendAt - now) / 1000) }) : t("resend")}
          </button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => {
              setStep("target");
              setCode("");
            }}
          >
            {t("changeTarget", { kind: kind === "email" ? t("email") : t("phone") })}
          </button>
          {config && (kind === "email" ? !config.emailDelivery : !config.smsDelivery) && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{t("devHint")}</p>}
        </form>
      )}
      <p className="mt-6 text-xs text-muted-foreground">{t("terms")}</p>
    </div>
  );
}
