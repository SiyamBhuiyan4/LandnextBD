export default function Template({ children }: { children: React.ReactNode }) {
  // Re-mounts on every navigation, so each page eases in instead of snapping.
  return <div className="page-in">{children}</div>;
}
