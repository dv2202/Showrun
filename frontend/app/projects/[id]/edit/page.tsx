"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/shell";
import { Icon, Skeleton } from "@/components/ui";
import type { Showcase, ShowcaseMode, ShowcaseRoute } from "@/lib/types";
import { ApiError } from "@/services/api";
import { getShowcase, updateShowcase } from "@/services/showcases";

const inputClass =
  "h-11 w-full border border-black/15 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-1 focus:ring-black";

function routeIsValid(route: ShowcaseRoute): boolean {
  return (
    route.path.startsWith("/") &&
    !route.path.includes("?") &&
    !route.path.includes("#") &&
    route.title.trim().length > 0
  );
}

export default function EditProject() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Showcase | null | undefined>();
  const [mode, setMode] = useState<ShowcaseMode>("selected_routes");
  const [routes, setRoutes] = useState<ShowcaseRoute[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getShowcase(id)
      .then((result) => {
        if (!result) {
          setProject(null);
          return;
        }
        setProject(result);
        setMode(result.mode);
        setRoutes(result.routes);
      })
      .catch(() => setProject(null));
  }, [id]);

  const routesValid = routes.length > 0 && routes.length <= 50 && routes.every(routeIsValid);

  const updateRoute = (routeId: string, field: "path" | "title" | "description", value: string) => {
    setRoutes((current) =>
      current.map((route) => (route.id === routeId ? { ...route, [field]: value } : route)),
    );
  };

  const moveRoute = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= routes.length) return;
    setRoutes((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  const save = async () => {
    setAttempted(true);
    setSaveError(null);
    if (!routesValid) return;

    setSaving(true);
    try {
      await updateShowcase(id, { mode, routes });
      router.push(`/projects/${id}`);
      router.refresh();
    } catch (error) {
      setSaveError(
        error instanceof ApiError ? error.message : "The showcase could not be updated.",
      );
      setSaving(false);
    }
  };

  if (project === undefined) {
    return (
      <DashboardShell active="Showcases">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </DashboardShell>
    );
  }

  if (project === null) {
    return (
      <DashboardShell active="Showcases">
        <div className="grid min-h-[65vh] place-items-center text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center border border-black/10 bg-white">
              <Icon name="warning" />
            </span>
            <h1 className="mt-5 text-xl font-semibold">Showcase not found</h1>
            <p className="mt-2 text-sm text-zinc-500">
              This project does not exist or is not available to your account.
            </p>
            <Link
              className="mt-6 inline-flex h-10 items-center bg-ink px-4 text-xs font-semibold text-white"
              href="/dashboard"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="Showcases">
      <div className="mx-auto max-w-5xl">
        <Link
          className="mb-7 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-black"
          href={`/projects/${project.id}`}
        >
          ← Back to showcase
        </Link>

        <header className="mb-8">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Edit showcase
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">{project.name}</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Change the showcase scope and the routes reviewers are allowed to explore.
          </p>
        </header>

        <div className="space-y-6">
          <section className="border border-black/10 bg-white">
            <div className="border-b border-black/10 px-6 py-5">
              <h2 className="text-sm font-semibold">Showcase scope</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Both options stay read-only and continue to enforce the configured route list.
              </p>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-2">
              {[
                {
                  value: "selected_routes" as const,
                  title: "Selected Routes",
                  badge: "Restricted",
                  icon: "stack" as const,
                  copy: "Limit the showcase to the specific pages listed below.",
                },
                {
                  value: "full_application" as const,
                  title: "Full Application",
                  badge: "Broader scope",
                  icon: "globe" as const,
                  copy: "Present the configured route set as a complete application experience.",
                },
              ].map((option) => (
                <button
                  aria-pressed={mode === option.value}
                  className={`relative min-h-44 border p-5 text-left transition ${
                    mode === option.value
                      ? "border-black bg-zinc-50 ring-1 ring-black"
                      : "border-black/10 hover:border-black/30"
                  }`}
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  type="button"
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`grid h-9 w-9 place-items-center ${
                        mode === option.value ? "bg-ink text-signal" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      <Icon name={option.icon} />
                    </span>
                    <span className="border border-black/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                      {option.badge}
                    </span>
                  </div>
                  <strong className="mt-7 block text-base">{option.title}</strong>
                  <span className="mt-2 block text-xs leading-5 text-zinc-500">{option.copy}</span>
                  <span
                    className={`absolute bottom-5 right-5 grid h-5 w-5 place-items-center rounded-full border ${
                      mode === option.value ? "border-black bg-signal" : "border-zinc-300"
                    }`}
                  >
                    {mode === option.value && <Icon className="h-3 w-3" name="check" />}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="border border-black/10 bg-white">
            <div className="flex flex-col justify-between gap-4 border-b border-black/10 px-6 py-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold">Configured routes</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Add, remove, rename, or reorder the pages available in the showcase.
                </p>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 border border-black/15 bg-white px-4 text-xs font-semibold transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                disabled={routes.length >= 50}
                onClick={() =>
                  setRoutes((current) => [
                    ...current,
                    {
                      id: `route_${Date.now()}`,
                      path: "/",
                      title: "",
                      description: "",
                    },
                  ])
                }
                type="button"
              >
                <span className="text-base leading-none">+</span> Add route
              </button>
            </div>

            <div className="space-y-3 p-6">
              {routes.map((route, index) => {
                const pathInvalid =
                  attempted &&
                  (!route.path.startsWith("/") ||
                    route.path.includes("?") ||
                    route.path.includes("#"));
                const titleInvalid = attempted && !route.title.trim();
                return (
                  <article className="border border-black/10 bg-zinc-50" key={route.id}>
                    <div className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center bg-ink font-mono text-[9px] text-signal">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate text-xs font-semibold">
                          {route.title || "Untitled route"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`Move ${route.title || "route"} up`}
                          className="grid h-8 w-8 place-items-center text-zinc-400 transition hover:bg-zinc-100 hover:text-black disabled:opacity-25"
                          disabled={index === 0}
                          onClick={() => moveRoute(index, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${route.title || "route"} down`}
                          className="grid h-8 w-8 place-items-center text-zinc-400 transition hover:bg-zinc-100 hover:text-black disabled:opacity-25"
                          disabled={index === routes.length - 1}
                          onClick={() => moveRoute(index, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                        <button
                          aria-label={`Remove ${route.title || "route"}`}
                          className="grid h-8 w-8 place-items-center text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-25"
                          disabled={routes.length === 1}
                          onClick={() =>
                            setRoutes((current) => current.filter((item) => item.id !== route.id))
                          }
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-4 p-4 md:grid-cols-[180px_180px_1fr]">
                      <label>
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                          Route
                        </span>
                        <input
                          aria-invalid={pathInvalid}
                          className={`${inputClass} font-mono text-xs ${pathInvalid ? "border-red-500" : ""}`}
                          onChange={(event) => updateRoute(route.id, "path", event.target.value)}
                          placeholder="/dashboard"
                          value={route.path}
                        />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                          Title
                        </span>
                        <input
                          aria-invalid={titleInvalid}
                          className={`${inputClass} ${titleInvalid ? "border-red-500" : ""}`}
                          onChange={(event) => updateRoute(route.id, "title", event.target.value)}
                          placeholder="Dashboard"
                          value={route.title}
                        />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                          Description
                        </span>
                        <input
                          className={inputClass}
                          onChange={(event) =>
                            updateRoute(route.id, "description", event.target.value)
                          }
                          placeholder="What should the interviewer notice?"
                          value={route.description}
                        />
                      </label>
                    </div>
                  </article>
                );
              })}

              {attempted && !routesValid && (
                <p className="text-[11px] text-red-600">
                  Keep at least one route. Every route needs a path beginning with “/”, without a
                  query or fragment, and a title.
                </p>
              )}
            </div>

            <footer className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-black/10 bg-zinc-50 px-6 py-4 sm:flex-row sm:items-center">
              <Link
                className="inline-flex h-10 items-center justify-center px-3 text-xs font-semibold text-zinc-500 transition hover:text-black"
                href={`/projects/${project.id}`}
              >
                Cancel
              </Link>
              <button
                className="inline-flex h-10 min-w-36 items-center justify-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving}
                onClick={save}
                type="button"
              >
                {saving ? "Saving…" : "Save changes"}
                {!saving && <Icon name="check" />}
              </button>
            </footer>

            {saveError && (
              <div
                className="border-t border-red-200 bg-red-50 px-6 py-3 text-xs text-red-700"
                role="alert"
              >
                {saveError}
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
