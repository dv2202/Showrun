"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { Icon, type IconName } from "@/components/ui";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      aria-label="Showcase home"
      className={`inline-flex items-center gap-2.5 text-sm font-bold tracking-tight ${inverse ? "text-white" : "text-ink"}`}
      href="/"
    >
      <span
        className={`grid h-7 w-7 place-items-center ${inverse ? "bg-signal text-black" : "bg-ink text-signal"}`}
      >
        <span className="h-2.5 w-2.5 border-2 border-current" />
      </span>
      SHOWCASE
    </Link>
  );
}

const navigation: { label: string; href: string; icon: IconName }[] = [
  { label: "Overview", href: "/dashboard", icon: "grid" },
  { label: "Showcases", href: "/dashboard#showcases", icon: "stack" },
];

export function DashboardShell({
  children,
  active = "Overview",
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, user]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas" role="status">
        <div className="text-center">
          <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-black/15 border-t-black" />
          <p className="mt-4 text-xs font-medium text-zinc-500">Loading workspace…</p>
        </div>
      </div>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-black/10 bg-[#111310] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-white/10 px-6 py-5">
          <Brand inverse />
        </div>
        <div className="px-3 py-6">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Workspace
          </p>
          <nav aria-label="Dashboard navigation" className="space-y-1">
            {navigation.map((item) => (
              <Link
                className={`flex items-center gap-3 px-3 py-2.5 text-sm transition ${active === item.label ? "bg-white/10 font-medium text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
                href={item.href}
                key={item.label}
              >
                <Icon className="h-4 w-4" name={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-white/10 p-4">
          <button
            className="flex w-full items-center gap-3 p-2 text-left transition hover:bg-white/5"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            type="button"
          >
            <span className="grid h-8 w-8 place-items-center bg-signal text-xs font-bold text-black">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{user.name}</span>
              <span className="block truncate text-[11px] text-zinc-500">{user.email}</span>
            </span>
            <span className="text-[10px] font-medium text-zinc-500">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-black/10 bg-white px-5 lg:hidden">
          <Brand />
          <Link className="bg-ink px-3 py-2 text-xs font-semibold text-white" href="/create">
            New showcase
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10 xl:px-16">
          {children}
        </main>
      </div>
    </div>
  );
}
