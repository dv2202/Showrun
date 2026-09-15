"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RemoteBrowser } from "@/components/remote-browser";
import { DashboardShell } from "@/components/shell";
import { Icon, Skeleton } from "@/components/ui";
import type { RemoteBrowserSession, Showcase } from "@/lib/types";
import {
  captureRemoteAuthentication,
  closeRemoteBrowser,
  getShowcase,
  startAuthenticationBrowser,
} from "@/services/showcases";

const inputClass =
  "h-10 w-full border border-black/15 bg-white px-3 font-mono text-xs outline-none focus:border-black focus:ring-1 focus:ring-black";

export default function ConnectShowcase() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Showcase | null | undefined>();
  const [loginUrl, setLoginUrl] = useState("");
  const [session, setSession] = useState<RemoteBrowserSession>();
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    getShowcase(id)
      .then((result) => {
        setProject(result ?? null);
        if (result) setLoginUrl(result.login?.loginUrl ?? result.targetUrl);
      })
      .catch(() => setProject(null));
  }, [id]);

  const start = async () => {
    setStarting(true);
    setError(undefined);
    try {
      setSession(await startAuthenticationBrowser(id, loginUrl));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The login browser could not be started.");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (session) await closeRemoteBrowser(session).catch(() => undefined);
    router.push(`/projects/${id}`);
  };

  const save = async () => {
    if (!session) return;
    setSaving(true);
    setError(undefined);
    try {
      await captureRemoteAuthentication(id, session);
      setSession(undefined);
      router.push(`/projects/${id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The browser session could not be saved.");
      setSaving(false);
    }
  };

  if (project === undefined) {
    return (
      <DashboardShell active="Showcases">
        <div className="space-y-5">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-[650px] w-full" />
        </div>
      </DashboardShell>
    );
  }
  if (!project) {
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
  }

  return (
    <DashboardShell active="Showcases">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <Link className="text-xs text-zinc-500 hover:text-black" href={`/projects/${id}`}>
              ← Back to showcase
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
              Connect {project.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Log in normally inside the controlled browser. When the application is visibly
              authenticated, save the browser session.
            </p>
          </div>
          {session && (
            <div className="flex gap-2">
              <button
                className="h-10 border border-black/15 bg-white px-4 text-xs font-semibold"
                disabled={saving}
                onClick={() => void cancel()}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 bg-ink px-5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={saving}
                onClick={() => void save()}
                type="button"
              >
                <Icon name="check" /> {saving ? "Saving…" : "I’m logged in — save session"}
              </button>
            </div>
          )}
        </div>

        <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="border border-black/10 bg-white p-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Login page
              </span>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  disabled={Boolean(session)}
                  onChange={(event) => setLoginUrl(event.target.value)}
                  type="url"
                  value={loginUrl}
                />
                {!session && (
                  <button
                    className="h-10 shrink-0 bg-ink px-5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={starting || !/^https:\/\//i.test(loginUrl)}
                    onClick={() => void start()}
                    type="button"
                  >
                    {starting ? "Starting…" : "Open browser"}
                  </button>
                )}
              </div>
            </label>
          </div>
          <div className="border border-amber-200 bg-amber-50 p-4 text-[11px] leading-5 text-amber-950/70">
            <strong className="block text-amber-950">Use a dedicated read-only account</strong>
            The captured account determines what visitors can see. Showrun blocks unsafe network
            methods, but application-level read-only permissions remain the strongest protection.
          </div>
        </div>

        {error && (
          <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <section className="h-[min(72vh,900px)] min-h-[560px] overflow-hidden border border-black/20 bg-[#151715]">
          {session ? (
            <RemoteBrowser
              onError={setError}
              onSessionLost={() => {
                setSession(undefined);
                setError(
                  "The controlled browser ended or the server restarted. Open a new browser and log in again.",
                );
              }}
              session={session}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-white">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center border border-white/10 bg-white/5 text-signal">
                  <Icon name="globe" />
                </span>
                <h2 className="mt-5 text-lg font-semibold">Controlled browser is ready to start</h2>
                <p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">
                  Open the browser, complete login or SSO directly, then save the authenticated
                  state. Credentials are never stored by this form.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
