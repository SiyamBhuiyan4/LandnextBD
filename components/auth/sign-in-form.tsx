"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/button";

const inputCls = "h-11 w-full rounded-xl border bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function SignInForm() {
  const t = useTranslations("auth");
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/"; // no open redirects
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === "signUp" && !name) {
      toast.error("Please enter your name.");
      return;
    }
    setBusy(true);
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: mode,
        ...(mode === "signUp" ? { name: name.trim() } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      if (mode === "signIn") {
        toast.error("Invalid email or password. If you don't have an account, click 'Sign Up'.");
      } else {
        toast.error(msg || "Could not create account. Please check your details.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
      <div className="flex justify-center">
        <LogoMark size={44} />
      </div>
      <h1 className="mt-4 text-center font-heading text-2xl font-bold">
        {mode === "signIn" ? "Welcome back" : "Create an account"}
      </h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {mode === "signIn"
          ? "Sign in to contact sellers and access verified land details"
          : "Sign up to start inquiring, saving, and posting properties"}
      </p>

      {/* Primary: Google Sign In */}
      <div className="mt-6">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full text-base font-medium shadow-sm transition hover:bg-muted"
          onClick={handleGoogleSignIn}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="mr-1.5 size-5" aria-hidden>
              <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23Z" />
              <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8Z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8c.9-2.6 3.4-4.5 6.3-4.5Z" />
            </svg>
          )}
          Sign in with Google
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or with email & password <span className="h-px flex-1 bg-border" />
      </div>

      {/* Direct Email/Password Form (No OTP or 3rd-party SMS required) */}
      <form onSubmit={handlePasswordAuth} className="space-y-3.5">
        {mode === "signUp" && (
          <label className="block text-sm font-medium">
            Full Name
            <input
              className={inputCls}
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email or Username
          <input
            className={inputCls}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className={inputCls}
            type="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {mode === "signIn" ? "Sign In" : "Create Account"}
        </Button>
      </form>

      <div className="mt-4 text-center text-sm">
        {mode === "signIn" ? (
          <p className="text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode("signUp");
                setPassword("");
              }}
            >
              Sign up
            </button>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode("signIn");
                setPassword("");
              }}
            >
              Sign in
            </button>
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t("terms")}</p>
    </div>
  );
}
