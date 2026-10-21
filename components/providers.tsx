"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { readLocal, writeLocal } from "@/lib/client";
import { CONFIG } from "@/lib/constants";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// ---------- display preferences (full BDT amounts) ----------

const PrefsContext = createContext<{ fullPrice: boolean; setFullPrice: (v: boolean) => void }>({
  fullPrice: false,
  setFullPrice: () => {},
});
export const usePrefs = () => useContext(PrefsContext);

// ---------- compare tray (up to 3 listings, per browser) ----------

type CompareCtx = { ids: string[]; toggle: (id: string) => boolean; clear: () => void; has: (id: string) => boolean };
const CompareContext = createContext<CompareCtx>({ ids: [], toggle: () => false, clear: () => {}, has: () => false });
export const useCompare = () => useContext(CompareContext);

export function Providers({ children }: { children: ReactNode }) {
  const [fullPrice, setFullPriceState] = useState(false);
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setFullPriceState(readLocal("lnb_full_price", false));
    setIds(readLocal<string[]>("lnb_compare", []).slice(0, CONFIG.compareMax));
  }, []);

  const setFullPrice = useCallback((v: boolean) => {
    setFullPriceState(v);
    writeLocal("lnb_full_price", v);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (!ids.includes(id) && ids.length >= CONFIG.compareMax) return false;
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      setIds(next);
      writeLocal("lnb_compare", next);
      return true;
    },
    [ids],
  );
  const compare = useMemo<CompareCtx>(
    () => ({
      ids,
      toggle,
      clear: () => {
        setIds([]);
        writeLocal("lnb_compare", []);
      },
      has: (id) => ids.includes(id),
    }),
    [ids, toggle],
  );

  return (
    <ConvexAuthNextjsProvider client={convex}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <PrefsContext.Provider value={{ fullPrice, setFullPrice }}>
          <CompareContext.Provider value={compare}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster richColors position="top-center" closeButton />
          </CompareContext.Provider>
        </PrefsContext.Provider>
      </ThemeProvider>
    </ConvexAuthNextjsProvider>
  );
}
