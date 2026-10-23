"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
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

export function AdminGate({ viewer }: ViewerProps) {
  const { signIn, signOut } = useAuthActions();
  const verifyPasscode = useMutation(api.admin.verifyAdminPasscode);

  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPasscode = passcode.trim();
    if (!cleanPasscode) return;

    setBusy(true);
    setError(null);

    try {
      if (viewer) {
        // Logged-in user: directly elevate privileges with passcode
        await verifyPasscode({ passcode: cleanPasscode });
        toast.success("Admin access granted!");
      } else {
        // Guest user: direct passcode access via system admin authentication
        const adminEmail = "admin@landnestbd.com";
        try {
          await signIn("password", {
            email: adminEmail,
            password: cleanPasscode,
            flow: "signIn",
          });
        } catch {
          await signIn("password", {
            email: adminEmail,
            password: cleanPasscode,
            flow: "signUp",
            name: "System Admin",
          });
        }

        try {
          await verifyPasscode({ passcode: cleanPasscode });
        } catch {
          // Allow momentary delay for auth token propagation over websocket
          await new Promise((r) => setTimeout(r, 500));
          await verifyPasscode({ passcode: cleanPasscode });
        }

        toast.success("Admin access granted!");
      }
    } catch (err: unknown) {
      console.error("Admin verification error:", err);
      const msg = "Invalid admin passcode.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page grid min-h-[75vh] place-items-center py-12">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldAlert className="size-7" />
        </div>

        <div className="mt-4 text-center">
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Admin Portal Access
          </span>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight">
            Enter Admin Passcode
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {viewer ? (
              <>
                Signed in as{" "}
                <span className="font-semibold text-foreground">
                  {viewer.name || viewer.email}
                </span>
                . Enter passcode to unlock the admin dashboard.
              </>
            ) : (
              "Direct administrator access. Enter passcode to proceed to the control panel."
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="admin-passcode"
              className="block text-sm font-medium text-foreground"
            >
              Passcode
            </label>
            <div className="relative mt-1.5">
              <input
                id="admin-passcode"
                type={showPasscode ? "text" : "password"}
                autoFocus
                autoComplete="current-password"
                placeholder="Enter passcode (808080)"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                className="h-12 w-full rounded-xl border border-input bg-background pl-4 pr-20 text-base font-mono tracking-widest outline-none transition-all placeholder:font-sans placeholder:tracking-normal focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                required
              />
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPasscode((s) => !s)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                >
                  {showPasscode ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
                <div className="pointer-events-none p-1 text-muted-foreground">
                  <KeyRound className="size-4" />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <ShieldAlert className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full gap-2 text-base font-medium shadow-sm"
            disabled={busy || !passcode.trim()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-5" />
            )}
            Unlock Admin Panel
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Return to Website
          </Link>

          {viewer && (
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-1 text-destructive hover:underline transition-colors"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
