"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardShell } from "@/components/shell";
import { Icon } from "@/components/ui";

export default function AuthSetup() {
  const [state, setState] = useState<"idle" | "connecting" | "done">("idle");

  return (
    <DashboardShell active="Showcases">
      <div className="mx-auto max-w-3xl">
        <Link
          className="mb-7 inline-flex items-center text-xs font-medium text-zinc-500 transition hover:text-black"
          href="/projects/prj_01"
        >
          ← Atlas Console
        </Link>
        <div className="mb-8">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Owner-only action
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Refresh authentication</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Reconnect the secure project session for Atlas Console.
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
                This action belongs to the project owner and is never visible in the public
                experience.
              </p>
              <div className="mt-10 space-y-4 font-mono text-[10px] text-zinc-500">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Encrypted connection
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  No public credentials
                </div>
              </div>
            </aside>

            <div className="p-6 sm:p-9">
              {state === "done" ? (
                <div className="flex min-h-80 flex-col items-start justify-center" role="status">
                  <span className="grid h-12 w-12 place-items-center bg-emerald-100 text-emerald-700">
                    <Icon className="h-6 w-6" name="check" />
                  </span>
                  <h2 className="mt-6 text-xl font-semibold tracking-tight">
                    Authentication refreshed
                  </h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                    Atlas Console has a fresh authenticated session and the public showcase is
                    ready.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-2">
                    <Link
                      className="inline-flex h-10 items-center gap-2 bg-ink px-4 text-xs font-semibold text-white"
                      href="/showcase/atlas-console"
                    >
                      Open showcase <Icon name="external" />
                    </Link>
                    <Link
                      className="inline-flex h-10 items-center border border-black/15 px-4 text-xs font-semibold"
                      href="/projects/prj_01"
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
                    Continue to the project sign-in
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    You’ll complete the project’s normal private login flow in a secure owner
                    session. The public showcase stays unavailable until this finishes.
                  </p>
                  <div className="my-7 border border-black/10 bg-zinc-50">
                    <div className="flex items-center gap-3 border-b border-black/10 p-4">
                      <span className="grid h-8 w-8 place-items-center bg-ink font-mono text-[9px] font-bold text-signal">
                        AC
                      </span>
                      <div>
                        <p className="text-xs font-semibold">Atlas Console</p>
                        <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
                          private-project.example.com
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <span className="text-[11px] text-zinc-500">Method</span>
                      <strong className="text-xs">Username + Password</strong>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      className="px-2 py-3 text-xs font-semibold text-zinc-500 hover:text-black"
                      href="/projects/prj_01"
                    >
                      Cancel
                    </Link>
                    <button
                      className="inline-flex h-11 min-w-44 items-center justify-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
                      disabled={state === "connecting"}
                      onClick={() => {
                        setState("connecting");
                        window.setTimeout(() => setState("done"), 900);
                      }}
                      type="button"
                    >
                      {state === "connecting" ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          Continue securely <Icon name="arrow" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <p className="mt-4 text-center text-[11px] text-zinc-400">
          The current flow is a frontend demonstration. No credentials are collected or stored.
        </p>
      </div>
    </DashboardShell>
  );
}
