"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { CopyButton, Icon, Skeleton, Status } from "@/components/ui";
import type { Showcase } from "@/lib/types";
import { getShowcase } from "@/services/showcases";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Showcase | null | undefined>();
  const { user } = useAuth();

  useEffect(() => {
    getShowcase(id)
      .then((result) => setProject(result ?? null))
      .catch(() => setProject(null));
  }, [id]);

  if (project === undefined) {
    return (
      <DashboardShell active="Showcases">
        <div className="space-y-8">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-10 w-64" />
            <Skeleton className="mt-3 h-4 w-80" />
          </div>
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
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

  const publicUrl = `/showcase/${project.slug}`;
  const authName =
    project.authMethod === "password"
      ? "Username + Password"
      : project.authMethod === "token"
        ? "Token / Header"
        : "Manual Login";

  return (
    <DashboardShell active="Showcases">
      <Link
        className="mb-7 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-black"
        href="/dashboard"
      >
        ← All showcases
      </Link>
      <header className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center bg-ink font-mono text-xs font-bold text-signal">
              {project.name.slice(0, 2).toUpperCase()}
            </span>
            <Status value={project.status} />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{project.name}</h1>
          <p className="mt-2 text-sm text-zinc-500">{project.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={publicUrl} />
          <Link
            className="inline-flex h-9 items-center gap-2 border border-black/15 bg-white px-4 text-xs font-semibold transition hover:border-black"
            href={`/projects/${project.id}/edit`}
          >
            <Icon name="settings" /> Edit showcase
          </Link>
          <Link
            className="inline-flex h-9 items-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700"
            href={`/showcase/${project.slug}`}
          >
            Open showcase <Icon name="external" />
          </Link>
        </div>
      </header>

      <div className="mb-8 flex flex-col justify-between gap-4 border border-black/10 bg-white p-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Public endpoint
          </p>
          <p className="mt-2 truncate font-mono text-xs">{publicUrl}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span
            className={`h-2 w-2 rounded-full ${project.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {project.status === "active" ? "Available publicly" : "Authentication required"}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <section className="border border-black/10 bg-white">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-zinc-400" name="key" />
                <h2 className="text-sm font-semibold">Authentication</h2>
              </div>
            </div>
            <div className="grid sm:grid-cols-3">
              {[
                { label: "Session", value: <Status value={project.status} /> },
                { label: "Last authenticated", value: project.lastAuthenticated },
                { label: "Method", value: authName },
              ].map((item) => (
                <div
                  className="border-b border-black/10 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                  key={item.label}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    {item.label}
                  </p>
                  <div className="mt-3 text-xs font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-black/10 bg-zinc-50 px-5 py-4">
              <p className="text-[11px] text-zinc-500">
                Refresh access before an important review.
              </p>
              <Link
                className="inline-flex h-9 items-center gap-2 border border-black/15 bg-white px-3 text-xs font-semibold transition hover:border-black"
                href={`/auth/setup?id=${encodeURIComponent(project.id)}`}
              >
                <Icon name="key" />
                Re-authenticate
              </Link>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="border border-black/10 bg-white">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-zinc-400" name="globe" />
                <h2 className="text-sm font-semibold">Showcase</h2>
              </div>
            </div>
            <dl className="divide-y divide-black/10">
              {[
                { label: "Created", value: project.createdAt },
                {
                  label: "Mode",
                  value:
                    project.mode === "selected_routes" ? "Selected routes" : "Full application",
                },
                { label: "Configured routes", value: project.routes.length.toString() },
                { label: "URL slug", value: project.slug },
              ].map((row) => (
                <div className="flex items-center justify-between gap-4 px-5 py-4" key={row.label}>
                  <dt className="text-xs text-zinc-500">{row.label}</dt>
                  <dd className="font-mono text-xs font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="border border-black/10 bg-[#111310] text-white">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-zinc-500" name="terminal" />
                <h2 className="text-sm font-semibold">Project information</h2>
              </div>
            </div>
            <dl className="divide-y divide-white/10">
              {[
                { label: "Target", value: project.targetUrl.replace(/^https?:\/\//, "") },
                { label: "Creator", value: user?.name ?? "Workspace owner" },
                { label: "Project ID", value: project.id },
              ].map((row) => (
                <div className="px-5 py-4" key={row.label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {row.label}
                  </dt>
                  <dd className="mt-2 break-all font-mono text-xs text-zinc-200">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
