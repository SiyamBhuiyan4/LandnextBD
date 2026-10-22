import { BRAND } from "@/lib/constants";

/** Text logo: the name lowercase, with "bd" in the accent colour. */
export function Wordmark() {
  const name = BRAND.site.toLowerCase();
  const tail = name.endsWith("bd") ? "bd" : "";
  return (
    <span className="lowercase">
      {tail ? name.slice(0, -tail.length) : name}
      {tail && <span className="text-warm">{tail}</span>}
    </span>
  );
}
