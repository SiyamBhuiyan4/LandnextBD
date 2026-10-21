// Original LandnestBD icon set: 24x24, 1.75 stroke, currentColor.
import type { SVGProps } from "react";
import type { Facility, LandType, Utility } from "@/lib/constants";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...p }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

/** Logo mark: a leaf resting in a nest-shaped plot outline. */
export function LogoMark({ size = 32, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" {...p}>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M6.5 20.5c3 3.2 6.2 4.5 9.5 4.5s6.5-1.3 9.5-4.5" stroke="var(--warm)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M8.5 17.5h15" stroke="var(--primary-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.2 2.2" opacity=".75" />
      <path
        d="M16 6.5c4.6 1.6 6.4 5.4 4.8 9.5-3.9.6-7.7-1.3-8.6-5.1 1-1.9 2.2-3.4 3.8-4.4Z"
        fill="var(--primary-foreground)"
      />
      <path d="M12.6 14.6c1.6-1.6 3.4-2.9 5.6-3.8" stroke="var(--primary)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export const LandTypeIcons: Record<LandType, (p: P) => React.JSX.Element> = {
  residential: (p) => (
    <Svg {...p}>
      <path d="M3 20h18" />
      <path d="M5 20v-7.5L11 8l6 4.5V20" />
      <path d="M9 20v-4h4v4" />
      <path d="M17 11V7h2v5.6" />
      <path d="M2.5 23h19" strokeDasharray="1.6 2.2" opacity=".6" />
    </Svg>
  ),
  commercial: (p) => (
    <Svg {...p}>
      <path d="M3 20h18" />
      <path d="M4.5 10 6 4h12l1.5 6" />
      <path d="M4.5 10a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5.5 12v8M18.5 12v8" />
      <path d="M9 20v-4.5h6V20" />
    </Svg>
  ),
  mixed_use: (p) => (
    <Svg {...p}>
      <path d="M3 20h18" />
      <rect x="4" y="9" width="7" height="11" rx="1" />
      <path d="M13 20V5.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V20" />
      <path d="M6.5 12.5h2M6.5 15.5h2M15.5 8h2M15.5 11h2M15.5 14h2" />
    </Svg>
  ),
  industrial: (p) => (
    <Svg {...p}>
      <path d="M3 20h18" />
      <path d="M4 20V11l5 3v-3l5 3v-3l6 3.5V20" />
      <path d="M17 13V4h2.5v10" />
      <path d="M8 17.5h1.5M12 17.5h1.5M16 17.5h1.5" />
    </Svg>
  ),
  farmland: (p) => (
    <Svg {...p}>
      <path d="M2.5 20.5c4-2.6 15-2.6 19 0" />
      <path d="M4 16.5c3.5-2 12.5-2 16 0" />
      <path d="M12 13V5" />
      <path d="M12 8c-2.4 0-3.6-1.4-3.8-3.5 2.3 0 3.6 1.2 3.8 3.5Z" />
      <path d="M12 10.5c2.4 0 3.6-1.4 3.8-3.5-2.3 0-3.6 1.2-3.8 3.5Z" />
    </Svg>
  ),
  quarry: (p) => (
    <Svg {...p}>
      <path d="M2.5 20h19" />
      <path d="M3.5 20 8 12l3 3.5L15 8l5.5 12" />
      <circle cx="17.5" cy="5" r="1.5" />
      <path d="M8.5 20l1.5-2.5h3.5L15 20" />
    </Svg>
  ),
};

export const UtilityIcons: Record<Utility, (p: P) => React.JSX.Element> = {
  electricity: (p) => (
    <Svg {...p}>
      <path d="M13 2.5 5.5 13.5H12L11 21.5l7.5-11H12l1-8Z" />
    </Svg>
  ),
  water: (p) => (
    <Svg {...p}>
      <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </Svg>
  ),
  gas: (p) => (
    <Svg {...p}>
      <path d="M12 21.5a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-8.5-1.5 1.5-2 3-2 4.5C11 10 10 8 10.5 5 7.5 7 6 10.5 6 15.5a6 6 0 0 0 6 6Z" />
      <path d="M12 18.5a2.3 2.3 0 0 1-2.3-2.3c0-1.5 1.2-2.4 2.3-3.7 1.1 1.3 2.3 2.2 2.3 3.7a2.3 2.3 0 0 1-2.3 2.3Z" />
    </Svg>
  ),
  sewerage: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7 9.5h10M6.5 12h11M7 14.5h10" />
    </Svg>
  ),
  drainage: (p) => (
    <Svg {...p}>
      <path d="M3 8c2 0 2-1.5 4.5-1.5S9.5 8 12 8s2-1.5 4.5-1.5S19 8 21 8" />
      <path d="M5 12h14l-2 8H7l-2-8Z" />
      <path d="M9 15.5h6" />
    </Svg>
  ),
};

export function CompassIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21" />
    </Svg>
  );
}

export function RoadIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M8 3 4 21M16 3l4 18" />
      <path d="M12 4v2.5M12 10.5v3M12 17.5V20" />
    </Svg>
  );
}

export function PlotIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
      <path d="M4 12.5 12 16l8-3.5" strokeDasharray="2 2" />
      <path d="M4 7.5v9L12 20l8-3.5v-9" />
    </Svg>
  );
}

export function WallIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <path d="M3 10h18M3 14h18M8 6v4M15 6v4M11.5 10v4M6 14v4M17 14v4" />
    </Svg>
  );
}

export function DeedIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M9 11h6M9 14h6M9 17h3" />
    </Svg>
  );
}

const genericFacility = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="10" r="3" />
    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
  </Svg>
);

export const FacilityIcons: Partial<Record<Facility, (p: P) => React.JSX.Element>> = {
  car_parking: (p) => (
    <Svg {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="M10 16.5v-9h3a2.5 2.5 0 0 1 0 5h-3" />
    </Svg>
  ),
  school: (p) => (
    <Svg {...p}>
      <path d="m2.5 9 9.5-5 9.5 5-9.5 5-9.5-5Z" />
      <path d="M6.5 11v5c3 2.5 8 2.5 11 0v-5" />
    </Svg>
  ),
  hospital: (p) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  ),
  mosque: (p) => (
    <Svg {...p}>
      <path d="M4 20h16" />
      <path d="M6.5 20v-6a5.5 5.5 0 0 1 11 0v6" />
      <path d="M12 8.5V6.5M12 4.5a1 1 0 1 0 0-.01" />
      <path d="M3 20v-9M21 20v-9" />
    </Svg>
  ),
  market: (p) => (
    <Svg {...p}>
      <path d="M4 9h16l-1 11H5L4 9Z" />
      <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
    </Svg>
  ),
  park: (p) => (
    <Svg {...p}>
      <path d="M12 21v-7" />
      <path d="M12 14c-3.8 0-6-2.3-6-5.3S8.7 3 12 3s6 2.7 6 5.7-2.2 5.3-6 5.3Z" />
      <path d="M5 21h14" />
    </Svg>
  ),
  bus_stand: (p) => (
    <Svg {...p}>
      <rect x="4.5" y="3.5" width="15" height="14" rx="3" />
      <path d="M4.5 11h15M7.5 20.5v-3M16.5 20.5v-3" />
      <circle cx="8" cy="14.3" r=".6" />
      <circle cx="16" cy="14.3" r=".6" />
    </Svg>
  ),
  highway: (p) => <RoadIcon {...p} />,
  lake_view: (p) => (
    <Svg {...p}>
      <path d="M2.5 15c2 0 2-1.5 4.75-1.5S9.5 15 12 15s2.25-1.5 4.75-1.5S19.5 15 21.5 15" />
      <path d="M2.5 19c2 0 2-1.5 4.75-1.5S9.5 19 12 19s2.25-1.5 4.75-1.5S19.5 19 21.5 19" />
      <circle cx="12" cy="7.5" r="3" />
    </Svg>
  ),
  security: (p) => (
    <Svg {...p}>
      <path d="M12 3 5 6v5.5c0 4.3 3 7.6 7 9.5 4-1.9 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
};

export function FacilityIcon({ facility, ...p }: P & { facility: Facility }) {
  const I = FacilityIcons[facility] ?? genericFacility;
  return <I {...p} />;
}
