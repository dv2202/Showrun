"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { CopyButton, Icon, Skeleton, Status } from "@/components/ui";
import type {
  CompatibilityReport,
  SessionDiagnostic,
  Showcase,
  ShowcaseDependency,
} from "@/lib/types";
import {
  getSessionDiagnostics,
  getShowcase,
  scanShowcaseDependencies,
  testShowcaseCompatibility,
  updateDependencyApprovals,
} from "@/services/showcases";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Showcase | null | undefined>();
  const [scanning, setScanning] = useState(false);
  const [updatingDependency, setUpdatingDependency] = useState<string | null>(null);
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [sessionDiagnostics, setSessionDiagnostics] = useState<SessionDiagnostic[]>([]);
  const [compatibility, setCompatibility] = useState<CompatibilityReport | null>(null);
  const [testingCompatibility, setTestingCompatibility] = useState(false);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    getShowcase(id)
      .then((result) => setProject(result ?? null))
      .catch(() => setProject(null));
  }, [id]);

  useEffect(() => {
    if (!project?.authenticationConfigured) return;
    getSessionDiagnostics(id)
      .then((result) => setSessionDiagnostics(result.candidates))
      .catch(() => setSessionDiagnostics([]));
  }, [id, project?.authenticationConfigured, project?.status]);

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
  const scanDependencies = async () => {
    setScanning(true);
    setDependencyError(null);
    try {
      setProject(await scanShowcaseDependencies(project.id));
    } catch (error) {
      setDependencyError(error instanceof Error ? error.message : "Dependency scan failed.");
    } finally {
      setScanning(false);
    }
  };
  const updateDependency = async (
    dependency: ShowcaseDependency,
    approved: boolean,
    redactedFields: string[] = [],
  ) => {
    if (
      approved &&
      !window.confirm(
        `Allow the public showcase to read ${dependency.path}${dependency.search}? Its response may be visible to visitors.`,
      )
    ) {
      return;
    }
    const key = `${dependency.originAlias ?? "app"}:${dependency.path}${dependency.search}`;
    setUpdatingDependency(key);
    setDependencyError(null);
    try {
      setProject(
        await updateDependencyApprovals(project.id, [
          {
            path: dependency.path,
            search: dependency.search,
            originAlias: dependency.originAlias,
            approved,
            redactedFields,
          },
        ]),
      );
    } catch (error) {
      setDependencyError(error instanceof Error ? error.message : "Dependency update failed.");
    } finally {
      setUpdatingDependency(null);
    }
  };
  const runCompatibilityTest = async () => {
    setTestingCompatibility(true);
    setCompatibilityError(null);
    try {
      setCompatibility(await testShowcaseCompatibility(project.id));
    } catch (error) {
      setCompatibilityError(error instanceof Error ? error.message : "Compatibility test failed.");
    } finally {
      setTestingCompatibility(false);
    }
  };
  const approvedDependencies = project.dependencies.filter((dependency) => dependency.approved);
  const reviewDependencies = project.dependencies.filter((dependency) => !dependency.approved);

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
            <div className="flex flex-col justify-between gap-4 border-b border-black/10 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-zinc-400" name="stack" />
                  <h2 className="text-sm font-semibold">Supporting resources</h2>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  Detect hidden files and read-only data required by your selected pages.
                </p>
              </div>
              <button
                className="group inline-flex h-11 w-full shrink-0 items-center justify-center gap-2.5 border border-ink bg-signal px-4 text-xs font-bold text-ink shadow-[3px_3px_0_0_#181a17] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-[#e1ff89] hover:shadow-[4px_4px_0_0_#181a17] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none sm:w-auto"
                disabled={scanning}
                onClick={scanDependencies}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={
                    scanning
                      ? "grid h-5 w-5 shrink-0 animate-pulse place-items-center"
                      : "grid h-5 w-5 shrink-0 place-items-center"
                  }
                >
                  <Icon className="h-4 w-4" name="scan" />
                </span>
                {scanning
                  ? "Scanning resources…"
                  : project.dependencies.length
                    ? "Scan & republish"
                    : "Scan & publish"}
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-black/10 bg-zinc-50">
              <div className="border-r border-black/10 px-5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  Published
                </p>
                <p className="mt-1 text-sm font-semibold">{approvedDependencies.length}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  Needs review
                </p>
                <p className="mt-1 text-sm font-semibold">{reviewDependencies.length}</p>
              </div>
            </div>

            {project.dependencies.length ? (
              <div className="max-h-80 divide-y divide-black/10 overflow-y-auto">
                {project.dependencies.map((dependency) => {
                  const key = `${dependency.originAlias ?? "app"}:${dependency.path}${dependency.search}`;
                  const automatic = ["script", "style", "font", "image"].includes(
                    dependency.category,
                  );
                  const sensitiveFields = (dependency.responseFields ?? [])
                    .filter((field) => field.sensitivity !== "none")
                    .map((field) => field.path);
                  return (
                    <div className="px-5 py-3" key={key}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p
                            className="truncate font-mono text-[11px] text-zinc-700"
                            title={`${dependency.path}${dependency.search}`}
                          >
                            {dependency.path}
                            {dependency.search}
                          </p>
                          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                            {dependency.category === "read_api"
                              ? "Page data · GET only"
                              : dependency.category.replace("_", " ")}
                            {dependency.approved && (dependency.redactedFields?.length ?? 0) > 0
                              ? ` · ${dependency.redactedFields!.length} fields redacted`
                              : ""}
                            {dependency.originAlias
                              ? ` · isolated ${dependency.originAlias}`
                              : " · app origin"}
                          </p>
                          {dependency.targetOrigin && (
                            <p className="mt-1 truncate font-mono text-[9px] text-zinc-400">
                              {dependency.targetOrigin}
                            </p>
                          )}
                          {(dependency.sessionHeaders?.length ?? 0) > 0 && (
                            <p className="mt-1 truncate font-mono text-[9px] text-emerald-700">
                              Session bridge: {dependency.sessionHeaders!.join(", ")}
                            </p>
                          )}
                        </div>
                        {automatic ? (
                          <span className="shrink-0 text-[10px] font-semibold text-emerald-700">
                            Auto-published
                          </span>
                        ) : (
                          <div className="flex shrink-0 gap-2">
                            {dependency.approved ? (
                              <button
                                className="h-8 border border-red-200 px-3 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                disabled={updatingDependency === key}
                                onClick={() => updateDependency(dependency, false)}
                                type="button"
                              >
                                {updatingDependency === key ? "Saving…" : "Block"}
                              </button>
                            ) : (
                              <>
                                {sensitiveFields.length > 0 && (
                                  <button
                                    className="h-8 border border-amber-300 px-3 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                    disabled={updatingDependency === key}
                                    onClick={() =>
                                      updateDependency(dependency, true, sensitiveFields)
                                    }
                                    type="button"
                                  >
                                    Allow redacted
                                  </button>
                                )}
                                <button
                                  className="h-8 border border-black/15 px-3 text-[10px] font-semibold hover:border-black disabled:opacity-50"
                                  disabled={updatingDependency === key}
                                  onClick={() => updateDependency(dependency, true)}
                                  type="button"
                                >
                                  {updatingDependency === key ? "Saving…" : "Allow full"}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {(dependency.responseFields?.length ?? 0) > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {dependency.responseFields!.slice(0, 12).map((field) => (
                            <span
                              className={`border px-2 py-1 font-mono text-[9px] ${
                                field.sensitivity === "sensitive"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : field.sensitivity === "possible"
                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                    : "border-zinc-200 text-zinc-500"
                              }`}
                              key={field.path}
                            >
                              {field.path} · {field.type}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-xs font-semibold">No dependency manifest yet</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  Run a private scan before sharing this showcase.
                </p>
              </div>
            )}

            <div className="border-t border-black/10 bg-amber-50 px-5 py-3 text-[10px] leading-5 text-amber-900/70">
              Static assets are published automatically. Page-data responses may contain account
              information and stay blocked until you explicitly allow them. Visitor requests can
              never modify this list.
            </div>
            {dependencyError && (
              <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
                {dependencyError}
              </div>
            )}
            {compatibilityError && (
              <p className="border-t border-red-200 bg-red-50 px-5 py-3 text-[10px] text-red-700">
                {compatibilityError}
              </p>
            )}
          </section>

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
            {sessionDiagnostics.length > 0 && (
              <div className="border-t border-black/10 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  Detected session storage
                </p>
                <div className="mt-3 space-y-2">
                  {sessionDiagnostics.map((candidate) => (
                    <div
                      className="flex items-center justify-between gap-4 border border-black/10 px-3 py-2"
                      key={`${candidate.storage}:${candidate.name}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[10px]">{candidate.name}</p>
                        <p className="mt-1 text-[9px] uppercase tracking-wide text-zinc-400">
                          {candidate.storage} · {candidate.confidence} confidence
                          {candidate.requestHeaders.length
                            ? ` · used by ${candidate.requestHeaders.join(", ")}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-[9px] font-semibold ${candidate.selected ? "text-emerald-700" : "text-zinc-400"}`}
                      >
                        {candidate.selected ? "Active bridge" : "Detected only"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-5 text-zinc-500">
                  Only storage names and request-header names are shown. Real values stay encrypted
                  on the server.
                </p>
              </div>
            )}
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
          <section className="border border-black/10 bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-black/10 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-zinc-400" name="shield" />
                  <h2 className="text-sm font-semibold">Compatibility test</h2>
                </div>
                <p className="mt-1 text-[10px] leading-5 text-zinc-500">
                  Opens every route in a clean browser and verifies isolation, authentication, and
                  read-only enforcement.
                </p>
              </div>
              <button
                className="h-9 shrink-0 border border-black/15 px-3 text-[10px] font-semibold hover:border-black disabled:opacity-50"
                disabled={testingCompatibility}
                onClick={runCompatibilityTest}
                type="button"
              >
                {testingCompatibility ? "Testing…" : "Run test"}
              </button>
            </div>
            {compatibility ? (
              <div>
                <div
                  className={`px-5 py-3 text-xs font-semibold ${compatibility.compatible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                >
                  {compatibility.compatible
                    ? "All configured routes passed"
                    : "One or more routes need attention"}
                </div>
                <div className="divide-y divide-black/10">
                  {compatibility.routes.map((route) => {
                    const passed =
                      route.loaded &&
                      !route.loginDetected &&
                      route.originIsolated &&
                      route.mutationsBlocked &&
                      !route.secretsExposed;
                    return (
                      <div className="px-5 py-3" key={route.path}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-[10px]">{route.path}</span>
                          <span
                            className={`text-[9px] font-semibold ${passed ? "text-emerald-700" : "text-amber-800"}`}
                          >
                            {passed ? "Passed" : "Review"}
                          </span>
                        </div>
                        {!passed && (
                          <p className="mt-1 text-[9px] leading-4 text-zinc-500">
                            {route.loginDetected ? "Login page detected. " : ""}
                            {!route.loaded
                              ? `Load failed${route.status ? ` (${route.status})` : ""}. `
                              : ""}
                            {!route.originIsolated ? "Preview left its isolated origin. " : ""}
                            {!route.mutationsBlocked
                              ? "Mutation guard could not be verified. "
                              : ""}
                            {route.secretsExposed
                              ? "A private target or session value was exposed. "
                              : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="px-5 py-4 text-[10px] leading-5 text-zinc-500">
                Run this after authentication and resource approval, before sharing the showcase.
              </p>
            )}
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
