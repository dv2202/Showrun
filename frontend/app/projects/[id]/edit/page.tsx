"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/shell";
import { Icon, Skeleton } from "@/components/ui";
import type { Showcase, ShowcaseMode, ShowcaseRoute } from "@/lib/types";
import { ApiError } from "@/services/api";
import { getShowcase, updateShowcase } from "@/services/showcases";

const steps = ["Connect application", "Showcase mode", "Configure routes"];
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
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [applicationUrl, setApplicationUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [usernameSelector, setUsernameSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [authenticatedSelector, setAuthenticatedSelector] = useState("");
  const [sessionStorageType, setSessionStorageType] = useState<
    "cookie" | "localStorage" | "sessionStorage"
  >("cookie");
  const [sessionName, setSessionName] = useState("");
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
        setName(result.name);
        setApplicationUrl(result.targetUrl);
        setMode(result.mode);
        setRoutes(result.routes);
        if (result.login) {
          setLoginUrl(result.login.loginUrl);
          setUsernameSelector(result.login.usernameSelector);
          setPasswordSelector(result.login.passwordSelector);
          setSubmitSelector(result.login.submitSelector);
          setAuthenticatedSelector(result.login.authenticatedSelector);
          if (result.login.sessionToken) {
            setSessionStorageType(result.login.sessionToken.storage);
            setSessionName(result.login.sessionToken.name);
          }
        }
      })
      .catch(() => setProject(null));
  }, [id]);

  const validName = name.trim().length > 0;
  const validUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(applicationUrl);
  const validLoginUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(loginUrl);
  const loginMappingValid = Boolean(
    validLoginUrl &&
    usernameSelector.trim() &&
    passwordSelector.trim() &&
    submitSelector.trim() &&
    authenticatedSelector.trim() &&
    sessionName.trim(),
  );
  const credentialsValid = project?.authenticationConfigured
    ? (!username && !password) || Boolean(username.trim() && password)
    : Boolean(username.trim() && password);
  const connectionValid = validName && validUrl && loginMappingValid && credentialsValid;
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

  const continueFlow = async () => {
    setSaveError(null);
    if (step === 0) {
      if (!connectionValid) {
        setAttempted(true);
        return;
      }
      setAttempted(false);
      setStep(1);
      return;
    }
    if (step === 1) {
      setAttempted(false);
      setStep(2);
      return;
    }
    if (!routesValid || !project) {
      setAttempted(true);
      return;
    }

    const login = {
      loginUrl,
      usernameSelector,
      passwordSelector,
      submitSelector,
      authenticatedSelector,
      sessionToken: {
        storage: sessionStorageType,
        name: sessionName.trim(),
      },
    };
    const loginChanged = JSON.stringify(login) !== JSON.stringify(project.login);
    const routesChanged =
      JSON.stringify(
        routes.map(({ path, title, description }) => ({ path, title, description })),
      ) !==
      JSON.stringify(
        project.routes.map(({ path, title, description }) => ({ path, title, description })),
      );

    setSaving(true);
    try {
      await updateShowcase(id, {
        ...(name.trim() !== project.name ? { name: name.trim() } : {}),
        ...(applicationUrl !== project.targetUrl ? { targetUrl: applicationUrl } : {}),
        mode,
        ...(routesChanged ? { routes } : {}),
        ...(loginChanged || username || password ? { login } : {}),
        ...(username && password ? { credentials: { username: username.trim(), password } } : {}),
      });
      setUsername("");
      setPassword("");
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
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-96 w-full" />
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
            Revisit every setup step, then save all changes together.
          </p>
        </header>

        <nav
          aria-label="Edit showcase progress"
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
          <div className="min-h-[520px] p-6 sm:p-9">
            {step === 0 && (
              <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
                <div>
                  <div className="mb-8">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                      Step 01
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight">
                      Connect application
                    </h2>
                    <p className="mt-2 text-sm text-zinc-500">
                      Update the target application, credentials, or its login mapping.
                    </p>
                  </div>

                  <div className="space-y-5">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold">Showcase name</span>
                      <input
                        aria-invalid={attempted && !validName}
                        autoFocus
                        className={`${inputClass} ${attempted && !validName ? "border-red-500 ring-1 ring-red-500" : ""}`}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="My application"
                        value={name}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold">Application URL</span>
                      <div className="relative">
                        <Icon
                          className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400"
                          name="globe"
                        />
                        <input
                          aria-invalid={attempted && !validUrl}
                          className={`${inputClass} pl-10 font-mono text-xs ${attempted && !validUrl ? "border-red-500 ring-1 ring-red-500" : ""}`}
                          onChange={(event) => setApplicationUrl(event.target.value)}
                          placeholder="https://private-project.example.com"
                          type="url"
                          value={applicationUrl}
                        />
                      </div>
                      {attempted && !validUrl && (
                        <span className="mt-1.5 block text-[11px] text-red-600">
                          Enter a complete HTTPS URL.
                        </span>
                      )}
                    </label>

                    <div className="border border-black/10 bg-zinc-50 p-4">
                      <h3 className="text-xs font-semibold">Replace saved credentials</h3>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Saved credentials are encrypted and cannot be displayed. Leave both fields
                        blank to keep them, or enter both to replace them.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="mb-2 block text-xs font-semibold">Username</span>
                          <input
                            aria-invalid={attempted && !credentialsValid}
                            autoComplete="off"
                            className={`${inputClass} ${attempted && !credentialsValid ? "border-red-500 ring-1 ring-red-500" : ""}`}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="Leave blank to keep saved"
                            value={username}
                          />
                        </label>
                        <label>
                          <span className="mb-2 block text-xs font-semibold">Password</span>
                          <input
                            aria-invalid={attempted && !credentialsValid}
                            autoComplete="new-password"
                            className={`${inputClass} ${attempted && !credentialsValid ? "border-red-500 ring-1 ring-red-500" : ""}`}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Leave blank to keep saved"
                            type="password"
                            value={password}
                          />
                        </label>
                      </div>
                      {attempted && !credentialsValid && (
                        <p className="mt-3 text-[11px] text-red-600">
                          Enter both the username and password, or leave both blank.
                        </p>
                      )}
                    </div>

                    <div className="border-t border-black/10 pt-6">
                      <div className="mb-4">
                        <h3 className="text-xs font-semibold">Login mapping</h3>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                          Change where the secure browser signs in and how it confirms success.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold">Login URL</span>
                          <input
                            aria-invalid={attempted && !validLoginUrl}
                            className={`${inputClass} font-mono text-xs ${attempted && !validLoginUrl ? "border-red-500 ring-1 ring-red-500" : ""}`}
                            onChange={(event) => setLoginUrl(event.target.value)}
                            placeholder="https://app.example.com/login"
                            type="url"
                            value={loginUrl}
                          />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {[
                            {
                              label: "Username selector",
                              placeholder: 'input[name="email"]',
                              value: usernameSelector,
                              setValue: setUsernameSelector,
                            },
                            {
                              label: "Password selector",
                              placeholder: 'input[type="password"]',
                              value: passwordSelector,
                              setValue: setPasswordSelector,
                            },
                            {
                              label: "Submit selector",
                              placeholder: 'button[type="submit"]',
                              value: submitSelector,
                              setValue: setSubmitSelector,
                            },
                            {
                              label: "Authenticated selector",
                              placeholder: '[data-testid="profile-button"]',
                              value: authenticatedSelector,
                              setValue: setAuthenticatedSelector,
                            },
                          ].map((field) => (
                            <label className="block" key={field.label}>
                              <span className="mb-2 block text-xs font-semibold">
                                {field.label}
                              </span>
                              <input
                                aria-invalid={attempted && !field.value.trim()}
                                className={`${inputClass} font-mono text-xs ${attempted && !field.value.trim() ? "border-red-500 ring-1 ring-red-500" : ""}`}
                                onChange={(event) => field.setValue(event.target.value)}
                                placeholder={field.placeholder}
                                value={field.value}
                              />
                            </label>
                          ))}
                        </div>
                        <div className="border border-black/10 bg-zinc-50 p-4">
                          <h3 className="text-xs font-semibold">Session storage</h3>
                          <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                            Tell Showrun where the target stores its session and the entry name.
                            Never paste the cookie or token value.
                          </p>
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-xs font-semibold">Stored in</span>
                              <select
                                className={inputClass}
                                onChange={(event) =>
                                  setSessionStorageType(
                                    event.target.value as
                                      "cookie" | "localStorage" | "sessionStorage",
                                  )
                                }
                                value={sessionStorageType}
                              >
                                <option value="cookie">Cookie</option>
                                <option value="localStorage">localStorage</option>
                                <option value="sessionStorage">sessionStorage</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-xs font-semibold">
                                {sessionStorageType === "cookie"
                                  ? "Cookie name"
                                  : `${sessionStorageType} key`}
                              </span>
                              <input
                                aria-invalid={attempted && !sessionName.trim()}
                                className={`${inputClass} font-mono text-xs ${attempted && !sessionName.trim() ? "border-red-500 ring-1 ring-red-500" : ""}`}
                                onChange={(event) => setSessionName(event.target.value)}
                                placeholder={
                                  sessionStorageType === "cookie"
                                    ? "e.g. session"
                                    : "e.g. access_token"
                                }
                                value={sessionName}
                              />
                            </label>
                          </div>
                          {sessionStorageType !== "cookie" && (
                            <p className="mt-3 text-[11px] leading-4 text-emerald-700">
                              The application&apos;s own request determines the header and format;
                              Showrun substitutes only its placeholder value.
                            </p>
                          )}
                        </div>
                      </div>
                      {attempted && !loginMappingValid && (
                        <p className="mt-3 text-[11px] text-red-600">
                          Complete the login URL, selectors, and session storage details.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <aside className="h-fit border border-emerald-200 bg-emerald-50 p-5">
                  <span className="grid h-9 w-9 place-items-center bg-emerald-100 text-emerald-700">
                    <Icon name="shield" />
                  </span>
                  <h3 className="mt-6 text-sm font-semibold text-emerald-950">
                    Credentials stay private
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-emerald-800/70">
                    Existing credentials never return to this page. Replacements are encrypted by
                    the backend, and changing connection details invalidates the old target session.
                  </p>
                </aside>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="mb-8 max-w-2xl">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                    Step 02
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">
                    Choose showcase mode
                  </h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Both modes remain read-only and enforce the configured route list.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    {
                      value: "selected_routes" as const,
                      title: "Selected Routes",
                      badge: "Restricted",
                      icon: "stack" as const,
                      copy: "Limit the showcase to the specific pages configured in the next step.",
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
                      className={`relative min-h-60 border p-6 text-left transition ${
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
                          className={`grid h-10 w-10 place-items-center ${mode === option.value ? "bg-ink text-signal" : "bg-zinc-100 text-zinc-500"}`}
                        >
                          <Icon name={option.icon} />
                        </span>
                        <span className="border border-black/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                          {option.badge}
                        </span>
                      </div>
                      <strong className="mt-14 block text-lg">{option.title}</strong>
                      <span className="mt-2 block max-w-sm text-xs leading-5 text-zinc-500">
                        {option.copy}
                      </span>
                      <span
                        className={`absolute bottom-5 right-5 grid h-5 w-5 place-items-center rounded-full border ${mode === option.value ? "border-black bg-signal" : "border-zinc-300"}`}
                      >
                        {mode === option.value && <Icon className="h-3 w-3" name="check" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div className="max-w-2xl">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                      Step 03 ·{" "}
                      {mode === "selected_routes" ? "Selected routes" : "Full application"}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight">Configure routes</h2>
                    <p className="mt-2 text-sm text-zinc-500">
                      Add, remove, rename, or reorder pages available in the showcase.
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

                <div className="space-y-3">
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
                                setRoutes((current) =>
                                  current.filter((item) => item.id !== route.id),
                                )
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
                              onChange={(event) =>
                                updateRoute(route.id, "path", event.target.value)
                              }
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
                              onChange={(event) =>
                                updateRoute(route.id, "title", event.target.value)
                              }
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
                </div>
                {attempted && !routesValid && (
                  <p className="mt-3 text-[11px] text-red-600">
                    Keep at least one route. Every route needs a path beginning with “/”, without a
                    query or fragment, and a title.
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-black/10 bg-zinc-50 px-6 py-4 sm:px-9">
            <button
              className="h-10 px-2 text-xs font-semibold text-zinc-500 transition hover:text-black"
              onClick={() =>
                step ? setStep((current) => current - 1) : router.push(`/projects/${project.id}`)
              }
              type="button"
            >
              {step ? "← Back" : "Cancel"}
            </button>
            <div className="flex items-center gap-4">
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-400 sm:block">
                {step + 1} / {steps.length}
              </span>
              <button
                className="inline-flex h-10 min-w-36 items-center justify-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving}
                onClick={continueFlow}
                type="button"
              >
                {saving ? "Saving…" : step === 2 ? "Save changes" : "Continue"}
                {!saving && <Icon name={step === 2 ? "check" : "arrow"} />}
              </button>
            </div>
          </footer>

          {saveError && (
            <div
              className="border-t border-red-200 bg-red-50 px-6 py-3 text-xs text-red-700 sm:px-9"
              role="alert"
            >
              {saveError}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
