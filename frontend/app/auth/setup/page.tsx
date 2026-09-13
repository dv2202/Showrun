"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DashboardShell } from "@/components/shell";
import { Icon, Skeleton } from "@/components/ui";
import type { Showcase } from "@/lib/types";
import { ApiError } from "@/services/api";
import { getShowcase, reauthenticateShowcase } from "@/services/showcases";

function RefreshAuthentication() {
  const search = useSearchParams();
  const projectId = search.get("id");
  const [loadedProject, setProject] = useState<Showcase | null>();
  const [state, setState] = useState<"idle" | "connecting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    getShowcase(projectId)
      .then((record) => setProject(record ?? null))
      .catch(() => setProject(null));
  }, [projectId]);

  const project = projectId ? loadedProject : null;

  const backUrl = project ? `/projects/${project.id}` : "/dashboard";

  return (
    <DashboardShell active="Showcases">
      <div className="mx-auto max-w-3xl">
        <Link
          className="mb-7 inline-flex items-center text-xs font-medium text-zinc-500 transition hover:text-black"
          href={backUrl}
        >
          ← {project?.name ?? "All showcases"}
        </Link>

        {project === undefined ? (
          <div className="space-y-5">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : project === null ? (
          <div className="grid min-h-96 place-items-center border border-black/10 bg-white p-8 text-center">
            <div>
              <Icon className="mx-auto h-7 w-7 text-zinc-400" name="warning" />
              <h1 className="mt-5 text-xl font-semibold">Choose a showcase to refresh</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Open a project from the dashboard and select Re-authenticate.
              </p>
              <Link
                className="mt-6 inline-flex h-10 items-center bg-ink px-4 text-xs font-semibold text-white"
                href="/dashboard"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Owner-only action
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em]">Refresh authentication</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Reconnect the secure project session for {project.name}.
              </p>
            </div>

            <section className="border border-black/10 bg-white">
              <div className="grid md:grid-cols-[220px_1fr]">
                <aside className="border-b border-black/10 bg-[#111310] p-6 text-white md:border-b-0 md:border-r md:border-white/10">
                  <span className="grid h-10 w-10 place-items-center bg-signal text-black">
                    <Icon name="key" />
                  </span>
                  <h2 className="mt-8 text-sm font-semibold">Secure handoff</h2>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    The backend uses the encrypted target credentials already configured for this
                    showcase. They are never returned to this page.
                  </p>
                  <div className="mt-10 space-y-4 font-mono text-[10px] text-zinc-500">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Owner session required
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Secrets remain server-side
                    </div>
                  </div>
                </aside>

                <div className="p-6 sm:p-9">
                  {state === "done" ? (
                    <div
                      className="flex min-h-80 flex-col items-start justify-center"
                      role="status"
                    >
                      <span className="grid h-12 w-12 place-items-center bg-emerald-100 text-emerald-700">
                        <Icon className="h-6 w-6" name="check" />
                      </span>
                      <h2 className="mt-6 text-xl font-semibold tracking-tight">
                        Authentication refreshed
                      </h2>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                        {project.name} has a fresh target session and its public showcase is ready.
                      </p>
                      <div className="mt-7 flex flex-wrap gap-2">
                        <Link
                          className="inline-flex h-10 items-center gap-2 bg-ink px-4 text-xs font-semibold text-white"
                          href={`/showcase/${project.slug}`}
                        >
                          Open showcase <Icon name="external" />
                        </Link>
                        <Link
                          className="inline-flex h-10 items-center border border-black/15 px-4 text-xs font-semibold"
                          href={backUrl}
                        >
                          Back to project
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                        Authentication session
                      </p>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight">
                        Prepare a fresh target session
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-zinc-500">
                        The isolated browser signs in using the saved encrypted configuration. It
                        closes as soon as the session is captured.
                      </p>
                      <div className="my-7 border border-black/10 bg-zinc-50">
                        <div className="flex items-center gap-3 border-b border-black/10 p-4">
                          <span className="grid h-8 w-8 place-items-center bg-ink font-mono text-[9px] font-bold text-signal">
                            {project.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">{project.name}</p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
                              {project.targetUrl.replace(/^https?:\/\//, "")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-4">
                          <span className="text-[11px] text-zinc-500">Method</span>
                          <strong className="text-xs">
                            {project.authMethod === "password"
                              ? "Username + Password"
                              : project.authMethod === "token"
                                ? "Token / Header"
                                : "Manual session"}
                          </strong>
                        </div>
                      </div>
                      {error && (
                        <div
                          className="mb-5 border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"
                          role="alert"
                        >
                          {error}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          className="px-2 py-3 text-xs font-semibold text-zinc-500 hover:text-black"
                          href={backUrl}
                        >
                          Cancel
                        </Link>
                        <button
                          className="inline-flex h-11 min-w-44 items-center justify-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
                          disabled={state === "connecting"}
                          onClick={async () => {
                            setState("connecting");
                            setError(null);
                            try {
                              const refreshed = await reauthenticateShowcase(project.id);
                              setProject(refreshed);
                              setState("done");
                            } catch (caught) {
                              setError(
                                caught instanceof ApiError
                                  ? caught.message
                                  : "Authentication could not be refreshed.",
                              );
                              setState("idle");
                            }
                          }}
                          type="button"
                        >
                          {state === "connecting" ? (
                            <>
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                              Preparing…
                            </>
                          ) : (
                            <>
                              Re-authenticate <Icon name="arrow" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

export default function AuthSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <RefreshAuthentication />
    </Suspense>
  );
}
