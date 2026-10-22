"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import { ROLES, type Role } from "@/lib/constants";

type Verif = "unverified" | "pending" | "verified" | "rejected";
const VERIFS: Verif[] = ["unverified", "pending", "verified", "rejected"];

export default function AdminUsers() {
  const t = useTranslations("admin");
  const ta = useTranslations("account");
  const fmt = useFmt();
  const [role, setRole] = useState<Role | undefined>();
  const [verification, setVerification] = useState<Verif | undefined>();
  const [q, setQ] = useState("");
  const all = useQuery(api.admin.users, { role, verification });
  const needle = q.trim().toLowerCase();
  const rows = needle ? all?.filter((u) => [u.name, u.email, u.phone].some((x) => x?.toLowerCase().includes(needle))) : all;
  const update = useMutation(api.admin.updateUser);
  const run = (p: Promise<unknown>) => p.catch((e) => toast.error(errorMessage(e)));
  const sel = "h-8 rounded-md border bg-background px-2 text-xs";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input type="search" className={`${sel} w-full sm:w-64`} placeholder={t("searchUsers")} aria-label={t("searchUsers")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} value={role ?? ""} onChange={(e) => setRole((e.target.value || undefined) as Role | undefined)} aria-label={ta("role")}>
          <option value="">{ta("role")}: —</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ta(`roles.${r}`)}
            </option>
          ))}
        </select>
        <select className={sel} value={verification ?? ""} onChange={(e) => setVerification((e.target.value || undefined) as Verif | undefined)} aria-label={ta("verification")}>
          <option value="">{ta("verification")}: —</option>
          {VERIFS.map((v) => (
            <option key={v} value={v}>
              {ta(`verificationStatus.${v}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("users")}</th>
              <th className="px-3 py-2.5 font-medium">{ta("role")}</th>
              <th className="px-3 py-2.5 font-medium">{ta("verification")}</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows?.map((u) => (
              <tr key={u._id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium">
                    {u.name ?? "—"}
                    {u.banned && <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">{t("banned")}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.email ?? u.phone ?? "—"} · {fmt.ago(u.createdAt)}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <select className={sel} value={u.role} onChange={(e) => run(update({ id: u._id, role: e.target.value as Role }))}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ta(`roles.${r}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <select className={sel} value={u.verificationStatus} onChange={(e) => run(update({ id: u._id, verificationStatus: e.target.value as Verif }))}>
                    {VERIFS.map((v) => (
                      <option key={v} value={v}>
                        {ta(`verificationStatus.${v}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button size="xs" className={u.banned ? undefined : "text-red-700 dark:text-destructive"} variant={u.banned ? "outline" : "destructive"} onClick={() => (u.banned || confirm(t("confirmBan", { name: u.name ?? u.email ?? u.phone ?? "" }))) && run(update({ id: u._id, banned: !u.banned }))}>
                    {u.banned ? t("unban") : t("ban")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
