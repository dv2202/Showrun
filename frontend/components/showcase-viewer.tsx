"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Brand } from "@/components/shell";
import { Icon, type IconName } from "@/components/ui";
import type { PrepareState, Showcase, ShowcaseRoute } from "@/lib/types";
import { prepareShowcase } from "@/services/showcases";

const routeIcons: IconName[] = ["grid", "stack", "pulse", "settings"];

function PreparingScreen({ phase }: { phase: number }) {
  const tasks = ["Loading showcase", "Preparing authentication", "Loading first route"];

  return (
    <div className="grid min-h-screen bg-[#111310] px-5 py-12 text-white sm:place-items-center">
      <div className="w-full max-w-md">
        <div className="mb-10 flex justify-center">
          <Brand inverse />
        </div>
        <div className="border border-white/10 bg-white/[0.03] p-7 sm:p-9">
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center bg-signal text-black">
              <Icon name="stack" />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
              Secure runtime
            </span>
          </div>
          <h1 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">
            Preparing your showcase
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            The application is being securely prepared.
          </p>
          <div className="mt-9 space-y-1 font-mono text-[11px]">
            {tasks.map((task, index) => {
              const complete = index < phase;
              const current = index === phase;
              return (
                <div
                  className={`flex items-center gap-3 border p-3.5 transition ${
                    current
                      ? "border-signal/30 bg-signal/[0.06] text-white"
                      : "border-transparent text-zinc-600"
                  }`}
                  key={task}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center ${
                      complete ? "text-emerald-400" : current ? "text-signal" : "text-zinc-700"
                    }`}
                  >
                    {complete ? (
                      <Icon className="h-4 w-4" name="check" />
                    ) : current ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                    ) : (
                      <span className="h-2 w-2 rounded-full border border-current" />
                    )}
                  </span>
                  {task}
                  {current && (
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-signal">
                      Running
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <Icon className="h-3.5 w-3.5" name="shield" />
          Private credentials are never shown to visitors
        </p>
      </div>
    </div>
  );
}

function ShowcaseChrome({
  showcase,
  activeRoute,
  children,
}: {
  showcase: Showcase;
  activeRoute?: ShowcaseRoute;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen min-h-[620px] flex-col overflow-hidden bg-[#eceeeb]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 bg-white px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center bg-ink text-signal">
            <span className="h-2 w-2 border border-current" />
          </span>
          <span className="text-xs font-bold tracking-tight">SHOWCASE</span>
          <span className="h-4 w-px bg-black/10" />
          <span className="truncate text-xs text-zinc-500">{showcase.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="group relative inline-flex items-center gap-1.5 border border-black/10 bg-zinc-50 px-2 py-1 text-[9px] font-semibold text-zinc-500"
            tabIndex={0}
          >
            <Icon className="h-3 w-3" name="shield" /> Read only
            <span className="pointer-events-none absolute right-0 top-8 z-50 hidden w-64 border border-black/10 bg-ink p-3 text-[10px] font-normal leading-4 text-white shadow-xl group-hover:block group-focus:block">
              Application actions are disabled. Use the Showcase navigation to explore available
              routes.
            </span>
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-[#111310] text-white md:flex lg:w-60">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
              Overview
            </p>
            <h1 className="mt-3 truncate text-sm font-semibold">{showcase.name}</h1>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
              {showcase.mode === "selected_routes" ? "Selected routes" : "Full application"}
            </p>
          </div>
          <nav aria-label="Showcase routes" className="flex-1 space-y-1 overflow-y-auto p-3">
            <p className="mb-2 px-3 pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
              Explore
            </p>
            {showcase.routes.map((route, index) => {
              const selected = route.id === activeRoute?.id;
              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 text-xs transition ${
                    selected
                      ? "bg-white/10 font-semibold text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                  href={`/showcase/${showcase.slug}${route.path}`}
                  key={route.id}
                >
                  <Icon
                    className={`h-4 w-4 ${selected ? "text-signal" : "text-zinc-600"}`}
                    name={routeIcons[index % routeIcons.length]}
                  />
                  <span className="truncate">{route.title}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 px-5 py-4">
            <p className="flex items-center gap-2 text-[9px] text-zinc-500">
              <Icon className="h-3 w-3" name="shield" />
              Showcase navigation only
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <nav
            aria-label="Showcase routes"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-black/10 bg-[#111310] p-2 md:hidden"
          >
            {showcase.routes.map((route) => {
              const selected = route.id === activeRoute?.id;
              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={`shrink-0 px-3 py-2 text-[10px] font-medium ${selected ? "bg-signal text-black" : "text-zinc-400"}`}
                  href={`/showcase/${showcase.slug}${route.path}`}
                  key={route.id}
                >
                  {route.title}
                </Link>
              );
            })}
          </nav>
          {children}
          <footer className="flex h-8 shrink-0 items-center justify-between border-t border-black/10 bg-white px-4 text-[9px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Icon className="h-3 w-3" name="shield" /> Read-only Showcase
            </span>
            <span className="hidden font-mono sm:block">
              Navigate with the Showcase sidebar · Application actions disabled
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function TargetApplication({ showcase, route }: { showcase: Showcase; route: ShowcaseRoute }) {
  const source = `${showcase.publicUrl.replace(/\/$/, "")}${route.path}`;

  return (
    <iframe
      className="h-full min-h-[520px] w-full border-0 bg-white"
      key={source}
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin"
      src={source}
      title={`${showcase.name} — ${route.title}`}
    />
  );
}

function RouteLoading({ showcase, route }: { showcase: Showcase; route?: ShowcaseRoute }) {
  return (
    <ShowcaseChrome activeRoute={route} showcase={showcase}>
      <div className="flex-1 overflow-hidden bg-[#f8f9fb] p-6 sm:p-10" role="status">
        <div className="mb-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Loading route{route ? ` · ${route.title}` : ""}
        </div>
        <div className="mb-8">
          <div className="h-3 w-24 animate-pulse bg-slate-200" />
          <div className="mt-4 h-8 w-56 animate-pulse bg-slate-200" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white"
              key={item}
            />
          ))}
        </div>
        <div className="mt-5 h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>
    </ShowcaseChrome>
  );
}

function FullPageError({
  kind,
  owner,
}: {
  kind: "expired" | "target_unavailable" | "error";
  owner: boolean;
}) {
  const content =
    kind === "expired"
      ? {
          title: "Authentication expired",
          copy: "The application session needs to be refreshed.",
          icon: "key" as const,
          tone: "bg-amber-100 text-amber-700",
        }
      : kind === "target_unavailable"
        ? {
            title: "Application unavailable",
            copy: "The target application could not be loaded.",
            icon: "warning" as const,
            tone: "bg-red-100 text-red-700",
          }
        : {
            title: "Showcase unavailable",
            copy: "This showcase could not be prepared. Please try again later.",
            icon: "warning" as const,
            tone: "bg-red-100 text-red-700",
          };
  return (
    <div className="grid min-h-screen bg-[#f7f7f5] px-5 py-12 sm:place-items-center">
      <div className="w-full max-w-lg border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <Brand />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-400">
            Runtime unavailable
          </span>
        </div>
        <div className="p-7 sm:p-10">
          <span className={`grid h-11 w-11 place-items-center ${content.tone}`}>
            <Icon name={content.icon} />
          </span>
          <h1 className="mt-7 text-2xl font-semibold tracking-[-0.035em]">{content.title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">{content.copy}</p>
          <div className="mt-7 border-l-2 border-zinc-200 pl-4">
            <p className="text-xs leading-5 text-zinc-600">
              {kind === "expired"
                ? owner
                  ? "Refresh the owner session to make this showcase available again."
                  : "Please ask the project owner to refresh this showcase."
                : "No credentials or internal application details were exposed."}
            </p>
          </div>
          {kind === "expired" && owner && (
            <Link
              className="mt-8 inline-flex h-10 items-center gap-2 bg-ink px-4 text-xs font-semibold text-white"
              href="/auth/setup"
            >
              <Icon name="key" />
              Re-authenticate
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShowcaseViewer() {
  const params = useParams<{ slug: string; route?: string[] }>();
  const [result, setResult] = useState<PrepareState>();
  const [phase, setPhase] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const hasLoaded = useRef(false);
  const requestedPath = useMemo(
    () => (params.route?.length ? `/${params.route.join("/")}` : undefined),
    [params.route],
  );
  useEffect(() => {
    let cancelled = false;
    const isRouteChange = hasLoaded.current;
    if (isRouteChange) setRouteLoading(true);
    else {
      setResult(undefined);
      setPhase(0);
    }
    const timers = !isRouteChange
      ? [window.setTimeout(() => setPhase(1), 350), window.setTimeout(() => setPhase(2), 750)]
      : [];
    const request = prepareShowcase(params.slug, requestedPath);
    Promise.all([
      request,
      new Promise((resolve) => window.setTimeout(resolve, isRouteChange ? 520 : 1150)),
    ]).then(([prepared]) => {
      if (!cancelled) {
        setResult(prepared);
        setRouteLoading(false);
        hasLoaded.current = true;
      }
    });
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [params.slug, requestedPath]);

  if (!result) return <PreparingScreen phase={phase} />;
  if (routeLoading && result.state === "ready") {
    const nextRoute = result.showcase.routes.find((route) => route.path === requestedPath);
    return <RouteLoading route={nextRoute} showcase={result.showcase} />;
  }
  if (
    result.state === "expired" ||
    result.state === "target_unavailable" ||
    result.state === "error"
  )
    return <FullPageError kind={result.state} owner={false} />;
  if (result.state === "route_unavailable")
    return result.showcase ? (
      <ShowcaseChrome showcase={result.showcase}>
        <div className="grid flex-1 place-items-center bg-[#f8f9fb] p-8 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center border border-slate-200 bg-white text-slate-500">
              <Icon name="warning" />
            </span>
            <h1 className="mt-5 text-xl font-semibold text-slate-900">Route unavailable</h1>
            <p className="mt-2 text-sm text-slate-500">
              This route is not currently available in this showcase.
            </p>
            <Link
              className="mt-6 inline-flex h-9 items-center bg-slate-900 px-4 text-xs font-semibold text-white"
              href={`/showcase/${result.showcase.slug}${result.showcase.routes[0].path}`}
            >
              Open first route
            </Link>
          </div>
        </div>
      </ShowcaseChrome>
    ) : (
      <FullPageError kind="error" owner={false} />
    );
  return (
    <ShowcaseChrome activeRoute={result.activeRoute} showcase={result.showcase}>
      <div className="shrink-0 border-b border-black/10 bg-white px-5 py-3 sm:px-7">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold">{result.activeRoute.title}</h1>
          <span className="font-mono text-[9px] text-zinc-400">{result.activeRoute.path}</span>
        </div>
        <p className="mt-1 max-w-3xl text-[11px] leading-5 text-zinc-500">
          {result.activeRoute.description}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <TargetApplication route={result.activeRoute} showcase={result.showcase} />
      </div>
    </ShowcaseChrome>
  );
}
