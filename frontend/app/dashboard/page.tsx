"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/shell";
import { CopyButton, Icon, Skeleton, Status } from "@/components/ui";
import type { Showcase } from "@/lib/types";
import { getShowcases } from "@/services/showcases";

export default function Dashboard() {
  const [projects, setProjects] = useState<Showcase[] | null>(null);

  useEffect(() => {
    getShowcases().then(setProjects);
  }, []);

  const active = projects?.filter((project) => project.status === "active").length;
  const warnings = projects?.filter((project) => project.status === "needs_attention").length;

  return (
    <DashboardShell>
      <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Devansh’s workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Good morning, Devansh.
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Everything you’re sharing, in one place.</p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 bg-ink px-4 text-sm font-semibold text-white transition hover:bg-zinc-700"
          href="/create"
        >
          Create showcase <Icon name="arrow" />
        </Link>
      </div>

      <section
        className="mb-8 grid border-l border-t border-black/10 bg-white sm:grid-cols-3"
        aria-label="Workspace summary"
      >
        {[
          {
            label: "Published",
            value: active,
            detail: "Public and available",
            icon: "globe" as const,
          },
          {
            label: "All projects",
            value: projects?.length,
            detail: "Across this workspace",
            icon: "stack" as const,
          },
          {
            label: "Auth warnings",
            value: warnings,
            detail: warnings ? "Action recommended" : "No action needed",
            icon: "key" as const,
          },
        ].map((metric) => (
          <div className="border-b border-r border-black/10 p-5 sm:p-6" key={metric.label}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">{metric.label}</span>
              <Icon className="h-4 w-4 text-zinc-400" name={metric.icon} />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-[-0.05em]">{metric.value ?? "—"}</p>
            <p className="mt-1 text-[11px] text-zinc-400">{metric.detail}</p>
          </div>
        ))}
      </section>

      <section className="border border-black/10 bg-white" id="showcases">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Recent showcases</h2>
            <p className="mt-1 text-xs text-zinc-500">Projects recently viewed or updated</p>
          </div>
          <button
            className="text-xs font-semibold text-zinc-500 transition hover:text-black"
            type="button"
          >
            View all
          </button>
        </div>

        {!projects ? (
          <div className="space-y-3 p-5 sm:p-6">
            {[0, 1, 2].map((item) => (
              <Skeleton className="h-16 w-full" key={item} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-11 w-11 place-items-center border border-black/10">
                <Icon name="stack" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">No showcases yet</h3>
              <p className="mt-2 text-xs text-zinc-500">
                Connect your first private project to get started.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-black/10">
            <div className="hidden grid-cols-[minmax(220px,1.5fr)_130px_150px_minmax(180px,1fr)_auto] gap-4 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 xl:grid">
              <span>Project</span>
              <span>Status</span>
              <span>Authenticated</span>
              <span>Public URL</span>
              <span>Actions</span>
            </div>
            {projects.map((project) => (
              <article
                className="grid items-center gap-4 px-5 py-5 transition hover:bg-zinc-50 sm:px-6 xl:grid-cols-[minmax(220px,1.5fr)_130px_150px_minmax(180px,1fr)_auto]"
                key={project.id}
              >
                <Link
                  className="group flex min-w-0 items-center gap-3"
                  href={`/projects/${project.id}`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center bg-ink font-mono text-[10px] font-bold text-signal">
                    {project.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:underline">
                      {project.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {project.description}
                    </span>
                  </span>
                </Link>
                <div>
                  <Status value={project.status} />
                </div>
                <p className="text-xs text-zinc-500">
                  <span className="mr-2 text-zinc-400 xl:hidden">Authenticated</span>
                  {project.lastAuthenticated}
                </p>
                <p className="truncate font-mono text-[11px] text-zinc-500">
                  showcase.app/devansh/{project.slug}
                </p>
                <div className="flex items-center gap-2">
                  <CopyButton value={`https://showcase.app/devansh/${project.slug}`} />
                  <Link
                    aria-label={`Manage ${project.name}`}
                    className="grid h-9 w-9 place-items-center border border-black/10 bg-white text-zinc-500 transition hover:border-black/20 hover:text-black"
                    href={`/projects/${project.id}`}
                  >
                    <Icon name="chevron" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_.6fr]" id="activity">
        <div className="border border-black/10 bg-white p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Activity</h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              Last 24 hours
            </span>
          </div>
          <div className="space-y-5">
            <div className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <div>
                <p className="text-xs">
                  <strong>Atlas Console</strong> was opened from a shared link
                </p>
                <time className="mt-1 block text-[11px] text-zinc-400">17 minutes ago</time>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal ring-1 ring-black/20" />
              <div>
                <p className="text-xs">
                  <strong>Ledger Preview</strong> authentication expired
                </p>
                <time className="mt-1 block text-[11px] text-zinc-400">2 hours ago</time>
              </div>
            </div>
          </div>
        </div>
        <div className="border border-black/10 bg-[#111310] p-6 text-white">
          <Icon className="h-5 w-5 text-signal" name="shield" />
          <h2 className="mt-8 text-lg font-semibold tracking-tight">2 showcases are healthy</h2>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            Authentication checks run before every public session.
          </p>
        </div>
      </section>
    </DashboardShell>
  );
}
