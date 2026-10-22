import { BRAND } from "@/lib/constants";

/** Text logo: "Landnest" + accent "BD". Restyle here to change it everywhere. */
export function Wordmark() {
  const name = BRAND.site;
  const tail = name.endsWith("BD") ? "BD" : "";
  return (
    <span>
      {tail ? name.slice(0, -tail.length) : name}
      {tail && <span className="text-warm">{tail}</span>}
    </span>
  );
}
