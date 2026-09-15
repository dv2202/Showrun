"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { Icon } from "@/components/ui";
import type { ShowcaseMode, ShowcaseRoute } from "@/lib/types";
import { ApiError } from "@/services/api";
import { createShowcase } from "@/services/showcases";

const steps = ["Application", "Showcase mode", "Routes"];
const inputClass =
  "h-11 w-full border border-black/15 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-1 focus:ring-black";

const initialRoutes: ShowcaseRoute[] = [
  { id: "route_initial", path: "/", title: "Overview", description: "" },
];

function routeValid(route: ShowcaseRoute): boolean {
  return (
    route.path.startsWith("/") &&
    !route.path.includes("?") &&
    !route.path.includes("#") &&
    route.title.trim().length > 0
  );
}

export default function Create() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [applicationUrl, setApplicationUrl] = useState("");
  const [mode, setMode] = useState<ShowcaseMode>("selected_routes");
  const [routes, setRoutes] = useState<ShowcaseRoute[]>(initialRoutes);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const validUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(applicationUrl);
  const routesValid = routes.length > 0 && routes.length <= 50 && routes.every(routeValid);

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

  const continueFlow = async () => {
    if (step === 0 && !validUrl) {
      setAttempted(true);
      return;
    }
    if (step < 2) {
      setAttempted(false);
      setStep((current) => current + 1);
      return;
    }
    if (!routesValid) {
      setAttempted(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const host = new URL(applicationUrl).hostname.split(".")[0] || "Private application";
      const name = host
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      const created = await createShowcase({
        name,
        description: routes[0]?.description ?? "Private application showcase.",
        targetUrl: applicationUrl,
        mode,
        routes,
      });
      router.push(`/projects/${created.id}/connect`);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : "The showcase could not be created.",
      );
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell active="Showcases">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            New showcase
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Create a controlled demo</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Configure the application and routes, then sign in through Showrun&apos;s controlled
            browser.
          </p>
        </div>

        <nav
          aria-label="Create showcase progress"
          className="mb-8 grid grid-cols-3 border border-black/10 bg-white"
        >
          {steps.map((title, index) => (
            <div
              aria-current={index === step ? "step" : undefined}
              className={`flex min-h-16 items-center gap-3 border-r border-black/10 px-3 last:border-r-0 sm:px-5 ${
                index === step
                  ? "bg-ink text-white"
                  : index < step
                    ? "bg-signal/30 text-black"
                    : "text-zinc-400"
              }`}
              key={title}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center border text-[10px] font-bold ${
                  index === step
                    ? "border-signal bg-signal text-black"
                    : index < step
                      ? "border-black bg-black text-white"
                      : "border-zinc-300"
                }`}
              >
                {index < step ? <Icon className="h-3.5 w-3.5" name="check" /> : index + 1}
              </span>
              <span className="hidden text-xs font-semibold sm:block">{title}</span>
            </div>
          ))}
        </nav>

        <section className="border border-black/10 bg-white">
          <div className="min-h-[500px] p-6 sm:p-9">
            {step === 0 && (
              <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                    Step 01
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">Connect the application</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Enter the application address. You will log in normally in a controlled browser
                    after the showcase is created.
                  </p>
                  <label className="mt-8 block">
                    <span className="mb-2 block text-xs font-semibold">Application URL</span>
                    <div className="relative">
                      <Icon
                        className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400"
                        name="globe"
                      />
                      <input
                        aria-invalid={attempted && !validUrl}
                        autoFocus
                        className={`${inputClass} pl-10 font-mono text-xs ${attempted && !validUrl ? "border-red-500 ring-1 ring-red-500" : ""}`}
                        onChange={(event) => setApplicationUrl(event.target.value)}
                        placeholder="https://private-project.example.com"
                        type="url"
                        value={applicationUrl}
                      />
                    </div>
                    {attempted && !validUrl && (
                      <span className="mt-2 block text-[11px] text-red-600">
                        Enter a complete HTTPS URL.
                      </span>
                    )}
                  </label>
                </div>
                <aside className="border border-emerald-200 bg-emerald-50 p-5">
                  <span className="grid h-9 w-9 place-items-center bg-emerald-100 text-emerald-700">
                    <Icon name="shield" />
                  </span>
                  <h3 className="mt-6 text-sm font-semibold text-emerald-950">
                    No selectors or tokens
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-emerald-800/70">
                    Showrun captures the browser&apos;s cookies and storage after you log in. You do
                    not need to inspect HTML, find an authenticated selector, or copy a bearer
                    token.
                  </p>
                </aside>
              </div>
            )}

            {step === 1 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                  Step 02
                </p>
                <h2 className="mt-2 text-xl font-semibold">Choose showcase mode</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Selected Routes is recommended for the smallest safe review surface.
                </p>
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  {[
                    {
                      value: "selected_routes" as const,
                      title: "Selected Routes",
                      badge: "Recommended",
                      icon: "stack" as const,
                      copy: "Only the routes you add are available in the controlled browser.",
                    },
                    {
                      value: "full_application" as const,
                      title: "Full Application",
                      badge: "Broader scope",
                      icon: "globe" as const,
                      copy: "Present the configured route set as one complete application experience.",
                    },
                  ].map((option) => (
                    <button
                      aria-pressed={mode === option.value}
                      className={`min-h-52 border p-6 text-left transition ${mode === option.value ? "border-black bg-zinc-50 ring-1 ring-black" : "border-black/10 hover:border-black/30"}`}
                      key={option.value}
                      onClick={() => setMode(option.value)}
                      type="button"
                    >
                      <div className="flex items-start justify-between">
                        <span className="grid h-10 w-10 place-items-center bg-ink text-signal">
                          <Icon name={option.icon} />
                        </span>
                        <span className="bg-zinc-100 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                          {option.badge}
                        </span>
                      </div>
                      <h3 className="mt-8 text-base font-semibold">{option.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">{option.copy}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                      Step 03
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">Configure routes</h2>
                    <p className="mt-2 text-sm text-zinc-500">
                      These routes become the controlled sidebar navigation.
                    </p>
                  </div>
                  <button
                    className="h-9 border border-black/15 px-3 text-xs font-semibold hover:border-black disabled:opacity-50"
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
                <div className="mt-7 space-y-4">
                  {routes.map((route, index) => (
                    <div className="border border-black/10 p-5" key={route.id}>
                      <div className="mb-4 flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-400">
                          Route {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="flex gap-1">
                          <button
                            aria-label="Move route up"
                            className="h-7 w-7 border border-black/10 disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => moveRoute(index, -1)}
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label="Move route down"
                            className="h-7 w-7 border border-black/10 disabled:opacity-30"
                            disabled={index === routes.length - 1}
                            onClick={() => moveRoute(index, 1)}
                            type="button"
                          >
                            ↓
                          </button>
                          <button
                            aria-label="Remove route"
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
                            placeholder="/dashboard"
                            value={route.path}
                          />
                        </label>
                        <label>
                          <span className="mb-2 block text-xs font-semibold">Title</span>
                          <input
                            className={inputClass}
                            onChange={(event) => updateRoute(route.id, "title", event.target.value)}
                            placeholder="Dashboard"
                            value={route.title}
                          />
                        </label>
                      </div>
                      <label className="mt-4 block">
                        <span className="mb-2 block text-xs font-semibold">Description</span>
                        <input
                          className={inputClass}
                          onChange={(event) =>
                            updateRoute(route.id, "description", event.target.value)
                          }
                          placeholder="What the reviewer can explore here"
                          value={route.description}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                {attempted && !routesValid && (
                  <p className="mt-3 text-[11px] text-red-600">
                    Every route needs an absolute path without a query or fragment, plus a title.
                  </p>
                )}
              </div>
            )}
          </div>

          {submitError && (
            <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-xs text-red-700">
              {submitError}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-black/10 bg-zinc-50 px-6 py-4 sm:px-9">
            <button
              className="text-xs font-semibold text-zinc-500 disabled:opacity-30"
              disabled={step === 0 || submitting}
              onClick={() => {
                setAttempted(false);
                setStep((current) => current - 1);
              }}
              type="button"
            >
              Back
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 bg-ink px-5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={submitting}
              onClick={() => void continueFlow()}
              type="button"
            >
              {submitting ? "Creating…" : step === 2 ? "Create and sign in" : "Continue"}
              {!submitting && <Icon name={step === 2 ? "spark" : "arrow"} />}
            </button>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
