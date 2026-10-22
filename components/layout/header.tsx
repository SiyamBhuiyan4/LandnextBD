"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Bell, GitCompareArrows, Heart, LayoutDashboard, LogOut, Menu, MessageSquare, Moon, Plus, Search, Shield, Sun, User, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { LogoMark } from "@/components/icons";
import { Wordmark } from "@/components/layout/wordmark";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const next = locale === "bn" ? "en" : "bn";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("font-semibold", className)}
      aria-label={`${t("language")}: ${next === "bn" ? "বাংলা" : "English"}`}
      onClick={() => {
        document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {next === "bn" ? "বাংলা" : "EN"}
    </Button>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label={`${t("theme")}: ${dark ? t("light") : t("dark")}`} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function NotificationsBell({ unread }: { unread: number }) {
  const t = useTranslations("common");
  const items = useQuery(api.users.notifications);
  const markRead = useMutation(api.users.markNotificationsRead);
  const fmt = useFmt();
  return (
    <Popover onOpenChange={(open) => open && unread > 0 && void markRead()}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
        aria-label={`${t("notifications")}${unread ? ` (${unread})` : ""}`}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warm px-1 text-[10px] font-bold text-warm-foreground">
            {unread > 9 ? "9+" : fmt.digits(unread)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{t("notifications")}</div>
        <ul className="max-h-96 overflow-y-auto">
          {items?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noNotifications")}</li>}
          {items?.map((n) => (
            <li key={n._id} className={cn("border-b last:border-0", !n.read && "bg-secondary/60")}>
              <Link href={n.href ?? "#"} className="block px-4 py-3 hover:bg-muted">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{fmt.ago(n.createdAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const t = useTranslations("common");
  if (viewer === undefined) return <div className="size-8 animate-pulse rounded-full bg-muted" />;
  if (viewer === null)
    return (
      <Link href="/signin" className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t("signIn")}
      </Link>
    );
  const isSeller = viewer.role !== "buyer";
  const initials = (viewer.name ?? viewer.email ?? viewer.phone ?? "U").slice(0, 1).toUpperCase();
  return (
    <div className="flex items-center gap-1">
      <NotificationsBell unread={viewer.unreadNotifications} />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={t("account")}
        >
          {initials}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{viewer.name ?? viewer.email ?? viewer.phone}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/account")}>
            <User /> {t("account")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/saved")}>
            <Heart /> {t("saved")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/inquiries")}>
            <MessageSquare /> {t("inquiries")}
          </DropdownMenuItem>
          {isSeller && (
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <LayoutDashboard /> {t("dashboard")}
            </DropdownMenuItem>
          )}
          {viewer.role === "admin" && (
            <DropdownMenuItem onClick={() => router.push("/admin")}>
              <Shield /> {t("admin")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await signOut();
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut /> {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const MOBILE_NAV = [
  { href: "/browse", key: "browse", Icon: Search },
  { href: "/videos", key: "videos", Icon: Video },
  { href: "/compare", key: "compare", Icon: GitCompareArrows },
  { href: "/saved", key: "saved", Icon: Heart },
] as const;

const NAV = [
  { href: "/browse", key: "browse" },
  { href: "/videos", key: "videos" },
  { href: "/compare", key: "compare" },
] as const;

export function Header() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 shadow-elev-1 backdrop-blur-xl backdrop-saturate-150">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        {t("skipToContent")}
      </a>
      <div className="container-page flex h-16 items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight" aria-label={t("homeLink", { site: "land.db" })}>
          <LogoMark size={30} />
          <Wordmark />
        </Link>
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label={t("mainNav")}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname.startsWith(n.href) && "bg-secondary font-semibold text-secondary-foreground",
              )}
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/dashboard/listings/new" className={cn(buttonVariants({ size: "sm" }), "mr-1 hidden gap-1 rounded-full bg-warm px-3.5 font-semibold text-warm-foreground shadow-elev-1 hover:bg-warm/90 sm:inline-flex")}>
            <Plus /> {t("postAd")}
          </Link>
          <LanguageToggle className="hidden sm:inline-flex" />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <UserMenu />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")} aria-label={t("menu")}>
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-80 max-w-[85vw] flex-col p-0">
              <SheetTitle className="flex items-center gap-2 border-b px-4 py-4 font-heading">
                <LogoMark size={26} /> <Wordmark />
                <span className="sr-only">{t("menu")}</span>
              </SheetTitle>
              <nav className="flex flex-col gap-0.5 p-2" aria-label={t("menu")}>
                {MOBILE_NAV.map(({ href, key, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={pathname.startsWith(href) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-muted",
                      pathname.startsWith(href) && "bg-secondary font-semibold text-secondary-foreground",
                    )}
                  >
                    <Icon className="size-4.5 text-primary" aria-hidden /> {t(key)}
                  </Link>
                ))}
                <Link href="/dashboard/listings/new" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-warm px-3 py-3 font-semibold text-warm-foreground shadow-elev-1">
                  <Plus className="size-4" /> {t("postAd")}
                </Link>
              </nav>
              <div className="mt-auto grid grid-cols-2 gap-2 border-t p-3">
                <div className="flex flex-col items-start gap-1 rounded-xl bg-muted/60 p-2">
                  <span className="px-1 text-[11px] font-semibold text-muted-foreground uppercase">{t("language")}</span>
                  <LanguageToggle />
                </div>
                <div className="flex flex-col items-start gap-1 rounded-xl bg-muted/60 p-2">
                  <span className="px-1 text-[11px] font-semibold text-muted-foreground uppercase">{t("theme")}</span>
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
