import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlotIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <PlotIcon size={56} className="mx-auto text-primary" />
        <h1 className="mt-4 font-heading text-2xl font-bold">{t("notFound")}</h1>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {t("goHome")}
          </Link>
          <Link href="/browse" className={buttonVariants()}>
            {t("browse")}
          </Link>
        </div>
      </div>
    </div>
  );
}
