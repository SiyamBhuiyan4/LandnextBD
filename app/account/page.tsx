"use client";

import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { usePrefs } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/client";
import type { AccountType } from "@/lib/constants";

const inputCls = "mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

export default function AccountPage() {
  const t = useTranslations("account");
  const ts = useTranslations("sellerType");
  const tc = useTranslations("common");
  const me = useQuery(api.users.viewer);
  const update = useMutation(api.users.updateProfile);
  const requestVerification = useMutation(api.users.requestVerification);
  const { fullPrice, setFullPrice } = usePrefs();
  const [form, setForm] = useState({ name: "", accountType: "owner" as AccountType, companyName: "", bio: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me) setForm({ name: me.name ?? "", accountType: me.accountType, companyName: me.companyName ?? "", bio: me.bio ?? "" });
  }, [me?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <div className="container-page py-20 text-center"><Loader2 className="mx-auto animate-spin" /></div>;

  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {me.email ?? me.phone} · {t(`roles.${me.role}`)}
      </p>

      <form
        className="mt-6 space-y-4 rounded-2xl border bg-card p-5 shadow-soft"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await update({ name: form.name, accountType: form.accountType, companyName: form.companyName || undefined, bio: form.bio || undefined });
            toast.success(t("saved"));
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="font-heading font-semibold">{t("profile")}</h2>
        <label className="block text-sm font-medium">
          {t("name")}
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={60} />
        </label>
        <label className="block text-sm font-medium">
          {t("accountType")}
          <select className={inputCls} value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value as AccountType })}>
            {(["owner", "broker", "company"] as const).map((k) => (
              <option key={k} value={k}>
                {ts(k)}
              </option>
            ))}
          </select>
        </label>
        {form.accountType === "company" && (
          <label className="block text-sm font-medium">
            {t("companyName")}
            <input className={inputCls} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} maxLength={80} />
          </label>
        )}
        <label className="block text-sm font-medium">
          {t("bio")}
          <textarea className={`${inputCls} h-24 py-2`} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={500} />
        </label>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {t("saveProfile")}
        </Button>
      </form>

      {me.role !== "buyer" && (
        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-heading font-semibold">
            {t("verification")} {me.verificationStatus === "verified" && <BadgeCheck className="size-5 text-primary" />}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("verificationBody")}</p>
          <p className="mt-3 text-sm font-medium">{t(`verificationStatus.${me.verificationStatus}`)}</p>
          {(me.verificationStatus === "unverified" || me.verificationStatus === "rejected") && (
            <Button className="mt-3" variant="outline" onClick={() => requestVerification().then(() => toast.success(t("verificationStatus.pending")), (e) => toast.error(errorMessage(e)))}>
              {t("requestVerification")}
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border bg-card p-5 shadow-soft">
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          {tc("showFullPrice")}
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={fullPrice} onChange={(e) => setFullPrice(e.target.checked)} />
        </label>
      </div>
    </div>
  );
}
