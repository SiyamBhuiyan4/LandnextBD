"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-elev-1">
          <TriangleAlert className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 font-heading text-2xl font-extrabold tracking-tight">{t("errorTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("errorBody")}</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">{error.digest}</p>}
        <Button size="lg" className="mt-6 h-11 gap-2 rounded-xl" onClick={reset}>
          <RotateCcw className="size-4" /> {t("retry")}
        </Button>
      </div>
    </div>
  );
}
