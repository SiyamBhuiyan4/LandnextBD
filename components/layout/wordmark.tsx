import { BRAND } from "@/lib/constants";

/** Text logo: "land" + accent ".db". Restyle here to change it everywhere. */
export function Wordmark() {
  const [name, tld] = BRAND.site.split(".");
  return (
    <span>
      {name}
      <span className="text-warm">.{tld}</span>
    </span>
  );
}
