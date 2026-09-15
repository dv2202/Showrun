"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { Icon, Skeleton } from "@/components/ui";
import type { Showcase, ShowcaseMode, ShowcaseRoute } from "@/lib/types";
import { ApiError } from "@/services/api";
import { getShowcase, updateShowcase } from "@/services/showcases";

const inputClass =
  "h-11 w-full border border-black/15 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-1 focus:ring-black";

function routeValid(route: ShowcaseRoute): boolean {
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
  const [name, setName] = useState("");
  const [applicationUrl, setApplicationUrl] = useState("");
  const [mode, setMode] = useState<ShowcaseMode>("selected_routes");
  const [routes, setRoutes] = useState<ShowcaseRoute[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    getShowcase(id)
      .then((result) => {
        if (!result) return setProject(null);
        setProject(result);
        setName(result.name);
        setApplicationUrl(result.targetUrl);
        setMode(result.mode);
        setRoutes(result.routes);
      })
      .catch(() => setProject(null));
  }, [id]);

  const validUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(applicationUrl);
  const valid =
    name.trim().length > 0 &&
    validUrl &&
    routes.length > 0 &&
    routes.length <= 50 &&
    routes.every(routeValid);

  const updateRoute = (routeId: string, field: "path" | "title" | "description", value: string) => {
    setRoutes((current) =>
      current.map((route) => (route.id === routeId ? { ...route, [field]: value } : route)),
    );
  };

  const save = async () => {
    if (!project || !valid) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const targetChanged = applicationUrl !== project.targetUrl;
      await updateShowcase(id, { name: name.trim(), targetUrl: applicationUrl, mode, routes });
      router.push(targetChanged ? `/projects/${id}/connect` : `/projects/${id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The showcase could not be updated.");
      setSaving(false);
    }
  };

  if (project === undefined)
    return (
      <DashboardShell active="Showcases">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </DashboardShell>
    );
  if (!project)
    return (
      <DashboardShell active="Showcases">
        <div className="grid min-h-[60vh] place-items-center text-center">
          <div>
            <Icon className="mx-auto" name="warning" />
            <h1 className="mt-4 text-xl font-semibold">Showcase not found</h1>
            <Link className="mt-5 inline-block text-xs underline" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </DashboardShell>
    );

  return (
    <DashboardShell active="Showcases">
      <div className="mx-auto max-w-5xl">
        <Link className="text-xs text-zinc-500 hover:text-black" href={`/projects/${id}`}>
          ← Back to showcase
        </Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Showcase settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Edit controlled demo</h1>
          </div>
          <Link
            className="inline-flex h-9 items-center gap-2 border border-black/15 bg-white px-4 text-xs font-semibold"
            href={`/projects/${id}/connect`}
          >
            <Icon name="key" /> Refresh browser session
          </Link>
        </div>

        <section className="mt-8 border border-black/10 bg-white">
          <div className="grid gap-6 border-b border-black/10 p-6 sm:grid-cols-2 sm:p-8">
            <label>
              <span className="mb-2 block text-xs font-semibold">Showcase name</span>
              <input
                aria-invalid={attempted && !name.trim()}
                className={inputClass}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold">Application URL</span>
              <input
                aria-invalid={attempted && !validUrl}
                className={`${inputClass} font-mono text-xs`}
                onChange={(event) => setApplicationUrl(event.target.value)}
                type="url"
                value={applicationUrl}
              />
              <span className="mt-2 block text-[10px] leading-4 text-zinc-500">
                Changing this address clears the saved browser session and requires login again.
              </span>
            </label>
          </div>

          <div className="border-b border-black/10 p-6 sm:p-8">
            <h2 className="text-sm font-semibold">Showcase mode</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                {
                  value: "selected_routes" as const,
                  title: "Selected routes",
                  copy: "Expose only the routes configured below.",
                },
                {
                  value: "full_application" as const,
                  title: "Full application",
                  copy: "Present the configured route set as a complete experience.",
                },
              ].map((option) => (
                <button
                  aria-pressed={mode === option.value}
                  className={`border p-4 text-left ${mode === option.value ? "border-black bg-zinc-50 ring-1 ring-black" : "border-black/10"}`}
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  type="button"
                >
                  <span className="text-xs font-semibold">{option.title}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-zinc-500">
                    {option.copy}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Sidebar routes</h2>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Only these destinations can be opened as top-level pages.
                </p>
              </div>
              <button
                className="h-9 border border-black/15 px-3 text-xs font-semibold disabled:opacity-40"
                disabled={routes.length >= 50}
                onClick={() =>
                  setRoutes((current) => [
                    ...current,
                    { id: `route_${Date.now()}`, path: "/", title: "", description: "" },
                  ])
                }
                type="button"
              >
                + Add route
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {routes.map((route, index) => (
                <div className="border border-black/10 p-5" key={route.id}>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-400">
                      ROUTE {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="flex gap-1">
                      <button
                        className="h-7 w-7 border border-black/10 disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() =>
                          setRoutes((current) => {
                            const next = [...current];
                            [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                            return next;
                          })
                        }
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        className="h-7 w-7 border border-black/10 disabled:opacity-30"
                        disabled={index === routes.length - 1}
                        onClick={() =>
                          setRoutes((current) => {
                            const next = [...current];
                            [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                            return next;
                          })
                        }
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="h-7 w-7 border border-black/10 text-red-600 disabled:opacity-30"
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="mb-2 block text-xs font-semibold">Path</span>
                      <input
                        aria-invalid={attempted && !routeValid(route)}
                        className={`${inputClass} font-mono text-xs`}
                        onChange={(event) => updateRoute(route.id, "path", event.target.value)}
                        value={route.path}
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold">Title</span>
                      <input
                        className={inputClass}
                        onChange={(event) => updateRoute(route.id, "title", event.target.value)}
                        value={route.title}
                      />
                    </label>
                  </div>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold">Description</span>
                    <input
                      className={inputClass}
                      onChange={(event) => updateRoute(route.id, "description", event.target.value)}
                      value={route.description}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {attempted && !valid && (
            <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-xs text-red-700">
              Complete the name, HTTPS URL, and every route.
            </div>
          )}
          {error && (
            <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-black/10 bg-zinc-50 px-6 py-4">
            <Link
              className="grid h-10 place-items-center border border-black/15 bg-white px-4 text-xs font-semibold"
              href={`/projects/${id}`}
            >
              Cancel
            </Link>
            <button
              className="h-10 bg-ink px-5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void save()}
              type="button"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
