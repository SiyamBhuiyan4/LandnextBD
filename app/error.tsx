"use client";

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
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("errorTitle")}</h1>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">{error.digest}</p>}
        <Button className="mt-6" onClick={reset}>
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
