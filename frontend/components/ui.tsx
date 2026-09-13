"use client";

import { useState } from "react";

export type IconName =
  | "arrow"
  | "check"
  | "chevron"
  | "copy"
  | "external"
  | "globe"
  | "grid"
  | "key"
  | "pulse"
  | "settings"
  | "shield"
  | "spark"
  | "stack"
  | "terminal"
  | "user"
  | "warning";

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </>
    ),
    external: (
      <>
        <path d="M15 3h6v6" />
        <path d="m10 14 11-11" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8-8m-2 2 2 2m-5 1 2 2" />
      </>
    ),
    pulse: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6L12 3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    spark: <path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" />,
    stack: (
      <>
        <path d="m12 3-9 5 9 5 9-5-9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    terminal: (
      <>
        <path d="m5 7 4 4-4 4M12 17h7" />
        <rect x="2" y="3" width="20" height="18" rx="2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    warning: (
      <>
        <path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center gap-2 border border-black/10 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-black/20 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        onClick={async () => {
          const copyValue = value.startsWith("/")
            ? new URL(value, window.location.origin).href
            : value;
          await navigator.clipboard.writeText(copyValue);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }}
        type="button"
      >
        <Icon name={copied ? "check" : "copy"} />
        {copied ? "Copied" : "Copy URL"}
      </button>
      {copied && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-ink px-4 py-3 text-xs font-medium text-white shadow-xl"
          role="status"
        >
          <Icon className="h-4 w-4 text-signal" name="check" />
          Public URL copied
        </div>
      )}
    </>
  );
}

export function Status({ value }: { value: "active" | "needs_attention" | "draft" }) {
  const config = {
    active: { label: "Live", style: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    needs_attention: {
      label: "Needs refresh",
      style: "border-amber-200 bg-amber-50 text-amber-700",
    },
    draft: { label: "Draft", style: "border-zinc-200 bg-zinc-100 text-zinc-600" },
  }[value];

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold ${config.style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-200/80 ${className}`} />;
}
