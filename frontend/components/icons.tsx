// components/icons.tsx
// Professional line-icon set — replaces emojis throughout Flux.
// Style: 1.5px stroke, rounded caps/joins, 24x24 viewbox, currentColor.
// Usage: <IconBatch size={20} /> — color inherits from parent text color.

import { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
});

/* ── Batch Settlement: stacked layers / distribute ── */
export function IconBatch({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/* ── Payment Streams: flowing line with droplet ── */
export function IconStream({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M3 12h7" />
      <path d="M17 12c2.2 0 3.5 1.8 3.5 3.5S19.2 19 17 19a3.5 3.5 0 0 1-3.5-3.5c0-2.5 3.5-6 3.5-8.5A3.5 3.5 0 0 0 13.5 5" />
      <circle cx="3" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Agent Registry: bot / chip ── */
export function IconAgent({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M12 7V4" />
      <circle cx="12" cy="2.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 17h6" />
    </svg>
  );
}

/* ── Withdraw / down arrow into tray ── */
export function IconWithdraw({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3v11" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

/* ── Cancel / X circle ── */
export function IconCancel({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

/* ── Fund treasury / vault ── */
export function IconVault({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <path d="M7 5V3M17 5V3" />
    </svg>
  );
}

/* ── CSV / document upload ── */
export function IconDocument({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M14 3H6a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V8.5L14 3z" />
      <path d="M13.5 3v5h5" />
      <path d="M9 14l1.5 3L12 14l1.5 3L15 14" />
    </svg>
  );
}

/* ── No streams / empty signal ── */
export function IconEmptyStream({ size = 40, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.3} {...p}>
      <path d="M4 12h6" />
      <path d="M18 12c2.5 0 4 2 4 4s-1.5 4-4 4a4 4 0 0 1-4-4c0-3 4-7 4-10a4 4 0 0 0-4-4" strokeDasharray="2 3" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── No batches / empty list ── */
export function IconEmptyList({ size = 40, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.3} {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" strokeDasharray="1.5 2.5" />
    </svg>
  );
}

/* ── No agents registered / robot outline ── */
export function IconEmptyAgent({ size = 40, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.3} {...p}>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 8V5" />
      <circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="15" cy="13.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
      <path d="M9 17h6" strokeDasharray="1.5 2" />
    </svg>
  );
}

/* ── Plug / connect wallet ── */
export function IconPlug({ size = 40, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.3} {...p}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" />
      <path d="M12 17v4" />
    </svg>
  );
}

/* ── Activity feed / radio waves ── */
export function IconActivity({ size = 40, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.3} {...p}>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" opacity="0.45" />
    </svg>
  );
}

/* ── Bell / notifications ── */
export function IconBell({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M18 9a6 6 0 0 0-12 0c0 5-2 7-2 7h16s-2-2-2-7" />
      <path d="M10.5 19a1.7 1.7 0 0 0 3 0" />
    </svg>
  );
}

/* ── Sun / dark-light toggle ── */
export function IconSun({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.8} {...p}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2"  x2="12" y2="5"  />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="4.22" y1="4.22"  x2="6.34" y2="6.34"  />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="2"  y1="12" x2="5"  y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34"  x2="19.78" y2="4.22"  />
    </svg>
  );
}

/* ── Moon ── */
export function IconMoon({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
    </svg>
  );
}

/* ── Spending cap / shield ── */
export function IconShield({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/* ── Lightning / fast finality ── */
export function IconBolt({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Key / connect wallet ── */
export function IconKey({ size = 28, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.5} {...p}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M14.5 14.5L22 22" strokeLinecap="round" />
      <path d="M18.5 18l-2 2" strokeLinecap="round" />
    </svg>
  );
}