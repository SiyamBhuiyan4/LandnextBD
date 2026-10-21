import { ArrowRight, Home } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlotIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="container-page grid min-h-[65vh] place-items-center py-16 text-center">
      <div className="max-w-md">
        <div className="relative mx-auto grid size-28 place-items-center rounded-[2rem] border-2 border-dashed border-primary/30 bg-surface text-primary">
          <PlotIcon size={56} />
          <span className="absolute -top-3 -right-3 rounded-full bg-warm px-2.5 py-1 font-heading text-sm font-extrabold text-warm-foreground shadow-elev-2">404</span>
        </div>
        <h1 className="mt-8 font-heading text-3xl font-extrabold tracking-tight">{t("notFound")}</h1>
        <p className="mt-2 text-muted-foreground">{t("notFoundBody")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 gap-2 rounded-xl")}>
            <Home className="size-4" /> {t("goHome")}
          </Link>
          <Link href="/browse" className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-xl")}>
            {t("browse")} <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
