"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { KeyRound, Loader2, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

interface ViewerProps {
  viewer: {
    _id: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

const inputCls =
  "h-11 w-full rounded-xl border bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function AdminGate({ viewer }: ViewerProps) {
  const { signIn, signOut } = useAuthActions();
  const verifyPasscode = useMutation(api.admin.verifyAdminPasscode);

  const [passcode, setPasscode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flow 1: User is already signed in, enter passcode to elevate role
  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await verifyPasscode({ passcode: passcode.trim() });
      toast.success("Admin privileges unlocked!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid admin passcode.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // Flow 2: User is not signed in yet, sign in / sign up with email and passcode
  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPasscode = passcode.trim();
    if (!cleanEmail || !cleanPasscode) return;

    setBusy(true);
    setError(null);

    try {
      // First try signing in
      let signedIn = false;
      try {
        await signIn("password", {
          email: cleanEmail,
          password: cleanPasscode,
          flow: "signIn",
        });
        signedIn = true;
      } catch {
        // If signIn fails (e.g. account doesn't exist), try signUp
        await signIn("password", {
          email: cleanEmail,
          password: cleanPasscode,
          flow: "signUp",
          name: "Admin User",
        });
        signedIn = true;
      }

      if (signedIn) {
        // Automatically promote role using verifyAdminPasscode
        await verifyPasscode({ passcode: cleanPasscode });
        toast.success("Signed in as Admin!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
      toast.error(msg);
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      await signIn("google", { redirectTo: "/admin" });
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="container-page grid min-h-[75vh] place-items-center py-12">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldAlert className="size-7" />
        </div>

        <h1 className="mt-4 text-center font-heading text-2xl font-bold">
          Admin Portal Access
        </h1>

        {viewer ? (
          // Signed-in User: Enter 6-digit passcode
          <div className="mt-3">
            <p className="text-center text-sm text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{viewer.name || viewer.email}</span>.
              <br />
              Enter the admin passcode to unlock the dashboard.
            </p>

            <form onSubmit={handleVerifyPasscode} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium">
                  Admin Passcode
                </label>
                <div className="relative mt-1">
                  <input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    autoComplete="current-password"
                    placeholder="Enter admin passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className={inputCls}
                    required
                  />
                  <KeyRound className="absolute right-3.5 top-3 size-5 text-muted-foreground" />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 w-full gap-2 text-base" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-5" />}
                Unlock Admin Panel
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
              <Link href="/" className="hover:underline">
                &larr; Return to Home
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-1 text-destructive hover:underline"
              >
                <LogOut className="size-3.5" /> Sign out
              </button>
            </div>
          </div>
        ) : (
          // Guest User: Direct Admin Sign-in
          <div className="mt-3">
            <p className="text-center text-sm text-muted-foreground">
              Sign in with your administrator credentials or passcode to continue.
            </p>

            <form onSubmit={handleAdminSignIn} className="mt-6 space-y-3.5">
              <label className="block text-sm font-medium">
                Admin Email
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="admin@landnext.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  required
                />
              </label>

              <label className="block text-sm font-medium">
                Admin Passcode / Password
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Admin passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className={inputCls}
                  required
                />
              </label>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 w-full gap-2" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Sign In as Admin
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full text-sm font-medium"
              onClick={handleGoogleSignIn}
              disabled={busy}
            >
              Sign in with Google
            </Button>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              <Link href="/" className="hover:underline">
                &larr; Back to Website
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
