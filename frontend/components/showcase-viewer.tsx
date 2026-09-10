"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
          {showcase.creator && (
            <span className="hidden text-[10px] text-zinc-400 sm:block">by {showcase.creator}</span>
          )}
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

function DashboardTarget() {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-slate-400">Thursday, September 10</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-3xl">
            Welcome back, Devansh
          </h2>
          <p className="mt-2 text-sm text-slate-500">A quick look across the workspace.</p>
        </div>
        <button className="h-9 rounded-md bg-cyan-400 px-4 text-xs font-semibold text-slate-950">
          Create project +
        </button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Active projects", "12", "+2 this month"],
          ["Team members", "28", "+4 this month"],
          ["Weekly activity", "84%", "+12.4%"],
        ].map(([label, value, delta]) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            key={label}
          >
            <span className="text-xs font-medium text-slate-500">{label}</span>
            <strong className="mt-5 block text-2xl font-semibold tracking-tight text-slate-900">
              {value}
            </strong>
            <span className="mt-1 block text-[10px] font-medium text-emerald-600">{delta}</span>
          </article>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <article className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-xs font-semibold text-slate-900">Project activity</h3>
            <p className="mt-1 text-[10px] text-slate-400">Deployments over the last 7 days</p>
          </div>
          <div className="flex h-52 items-end gap-3 px-5 pb-5 pt-8">
            {["h-[42%]", "h-[58%]", "h-[36%]", "h-[76%]", "h-[62%]", "h-[88%]", "h-[70%]"].map(
              (height, index) => (
                <div className="flex h-full flex-1 items-end" key={height}>
                  <div
                    className={`w-full rounded-t-sm ${height} ${index === 5 ? "bg-cyan-400" : "bg-slate-100"}`}
                  />
                </div>
              ),
            )}
          </div>
        </article>
        <RecentUpdates />
      </div>
    </>
  );
}

function ProjectsTarget() {
  return (
    <>
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">Projects</h2>
          <p className="mt-2 text-sm text-slate-500">Manage work across the organization.</p>
        </div>
        <button className="rounded-md bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white">
          New project
        </button>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_120px_100px] border-b border-slate-200 bg-slate-50 px-5 py-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Project</span>
          <span>Status</span>
          <span>Updated</span>
        </div>
        {[
          ["Billing API", "Production", "8m ago"],
          ["Atlas Console", "Production", "32m ago"],
          ["Mobile workspace", "Preview", "1h ago"],
          ["Data pipeline", "Production", "Yesterday"],
        ].map(([name, status, time]) => (
          <a
            className="grid grid-cols-[1fr_120px_100px] items-center border-b border-slate-100 px-5 py-4 text-xs transition last:border-0 hover:bg-slate-50"
            href="/admin"
            key={name}
          >
            <span className="flex items-center gap-3 font-semibold text-slate-800">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 font-mono text-[9px]">
                {name.slice(0, 2).toUpperCase()}
              </span>
              {name}
            </span>
            <span className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {status}
            </span>
            <span className="font-mono text-[9px] text-slate-400">{time}</span>
          </a>
        ))}
      </div>
    </>
  );
}

function AnalyticsTarget() {
  return (
    <>
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">Analytics</h2>
        <p className="mt-2 text-sm text-slate-500">Usage and adoption over the last 30 days.</p>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_280px]">
        <article className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-500">Total sessions</p>
              <strong className="mt-2 block text-3xl font-semibold text-slate-900">24,892</strong>
            </div>
            <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px]">
              <option>Last 30 days</option>
            </select>
          </div>
          <div className="mt-10 flex h-56 items-end gap-2">
            {[
              "h-[30%]",
              "h-[44%]",
              "h-[38%]",
              "h-[61%]",
              "h-[54%]",
              "h-[76%]",
              "h-[68%]",
              "h-[88%]",
              "h-[74%]",
              "h-full",
            ].map((height, index) => (
              <div className="flex h-full flex-1 items-end" key={height}>
                <div
                  className={`w-full rounded-t-sm ${height} ${index === 9 ? "bg-cyan-400" : "bg-slate-100"}`}
                />
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-lg border border-slate-200 bg-[#0d1520] p-6 text-white">
          <p className="text-xs text-slate-400">Conversion rate</p>
          <strong className="mt-4 block text-4xl font-semibold">32.8%</strong>
          <div className="mt-8 grid h-32 place-items-center rounded-full border-[18px] border-cyan-400 border-r-slate-700">
            <span className="text-xs text-slate-400">+8.2%</span>
          </div>
          <p className="mt-8 text-[10px] leading-5 text-slate-500">
            Compared with the previous reporting period.
          </p>
        </article>
      </div>
    </>
  );
}

function SettingsTarget() {
  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">Settings</h2>
      <p className="mt-2 text-sm text-slate-500">Workspace preferences and access controls.</p>
      <form className="mt-8 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        <label className="grid gap-2 p-5 sm:grid-cols-[180px_1fr]">
          <span className="text-xs font-semibold text-slate-700">Workspace name</span>
          <input
            className="rounded-md border border-slate-200 px-3 py-2 text-xs"
            defaultValue="Atlas workspace"
          />
        </label>
        <label className="grid gap-2 p-5 sm:grid-cols-[180px_1fr]">
          <span className="text-xs font-semibold text-slate-700">Default environment</span>
          <select className="rounded-md border border-slate-200 px-3 py-2 text-xs">
            <option>Production</option>
          </select>
        </label>
        <div className="flex justify-end p-5">
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
            type="submit"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function RecentUpdates() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-xs font-semibold text-slate-900">Recent updates</h3>
        <p className="mt-1 text-[10px] text-slate-400">Across your projects</p>
      </div>
      <div className="divide-y divide-slate-100">
        {[
          ["Billing API", "8m"],
          ["Admin console", "32m"],
          ["Mobile web", "1h"],
        ].map(([name, time], index) => (
          <div className="flex items-center gap-3 px-5 py-3.5" key={name}>
            <span
              className={`h-2 w-2 rounded-full ${index === 0 ? "bg-emerald-400" : "bg-slate-300"}`}
            />
            <span className="flex-1 text-[11px] font-medium text-slate-700">{name}</span>
            <span className="font-mono text-[9px] text-slate-400">{time}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function TargetApplication({ route }: { route: ShowcaseRoute }) {
  const path = route.path.toLowerCase();
  const content = path.includes("project") ? (
    <ProjectsTarget />
  ) : path.includes("analytic") || path.includes("report") ? (
    <AnalyticsTarget />
  ) : path.includes("setting") ? (
    <SettingsTarget />
  ) : (
    <DashboardTarget />
  );
  const stopPointer = (event: React.SyntheticEvent) => event.stopPropagation();
  const blockAction = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const blockKeyboardAction = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      (event.key === "Enter" || event.key === " ") &&
      target.closest("a, button, input, select, textarea")
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      aria-label="Read-only target application"
      className="relative min-h-full select-text bg-[#f8f9fb]"
      onClickCapture={blockAction}
      onKeyDownCapture={blockKeyboardAction}
      onPointerDownCapture={stopPointer}
      onPointerUpCapture={stopPointer}
      onSubmitCapture={blockAction}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-7">
        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
          <span>Atlas</span>
          <span>/</span>
          <span className="text-slate-700">{route.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden rounded-md border border-slate-200 px-3 py-2 text-[10px] text-slate-500 sm:block">
            ⌘ Search
          </button>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-[8px] font-bold text-white">
            DS
          </span>
        </div>
      </div>
      <div className="p-5 sm:p-8 lg:p-10">{content}</div>
    </div>
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
  const search = useSearchParams();
  const [result, setResult] = useState<PrepareState>();
  const [phase, setPhase] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const hasLoaded = useRef(false);
  const requestedPath = useMemo(
    () => (params.route?.length ? `/${params.route.join("/")}` : undefined),
    [params.route],
  );
  const forcedState = search.get("state");

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
    const request =
      forcedState === "expired"
        ? Promise.resolve<PrepareState>({ state: "expired", projectName: "Atlas Console" })
        : forcedState === "target-unavailable"
          ? Promise.resolve<PrepareState>({
              state: "target_unavailable",
              projectName: "Atlas Console",
            })
          : forcedState === "error"
            ? Promise.resolve<PrepareState>({ state: "error", projectName: "Showcase" })
            : prepareShowcase(params.slug, requestedPath);
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
  }, [forcedState, params.slug, requestedPath]);

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
    return <FullPageError kind={result.state} owner={search.get("owner") === "true"} />;
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
        <TargetApplication route={result.activeRoute} />
      </div>
    </ShowcaseChrome>
  );
}
