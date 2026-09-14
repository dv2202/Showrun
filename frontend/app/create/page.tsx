"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { Icon } from "@/components/ui";
import type { ShowcaseMode, ShowcaseRoute } from "@/lib/types";
import { ApiError } from "@/services/api";
import { createShowcase } from "@/services/showcases";

const steps = ["Connect application", "Showcase mode", "Configure routes"];
const inputClass =
  "h-11 w-full border border-black/15 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-1 focus:ring-black";
const defaultRoutes: ShowcaseRoute[] = [
  {
    id: "route_initial",
    path: "/",
    title: "",
    description: "",
  },
];

export default function Create() {
  const [step, setStep] = useState(0);
  const [applicationUrl, setApplicationUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [usernameSelector, setUsernameSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [authenticatedSelector, setAuthenticatedSelector] = useState("");
  const [usesStorageBridge, setUsesStorageBridge] = useState(false);
  const [storageKey, setStorageKey] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState<"authorization" | "x-api-key">(
    "authorization",
  );
  const [authHeaderPrefix, setAuthHeaderPrefix] = useState("Bearer ");
  const [mode, setMode] = useState<ShowcaseMode>("selected_routes");
  const [routes, setRoutes] = useState<ShowcaseRoute[]>(defaultRoutes);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();
  const validUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(applicationUrl);
  const validLoginUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(loginUrl);
  const loginMappingValid =
    validLoginUrl &&
    usernameSelector.trim() &&
    passwordSelector.trim() &&
    submitSelector.trim() &&
    authenticatedSelector.trim() &&
    (!usesStorageBridge || storageKey.trim());
  const routesValid =
    routes.length > 0 && routes.every((route) => route.path.startsWith("/") && route.title.trim());

  const updateRoute = (id: string, field: "path" | "title" | "description", value: string) => {
    setRoutes((current) =>
      current.map((route) => (route.id === id ? { ...route, [field]: value } : route)),
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
    if (step === 0 && (!validUrl || !username.trim() || !password || !loginMappingValid)) {
      setAttempted(true);
      return;
    }
    if (step === 1) {
      setAttempted(false);
      setStep(2);
      return;
    }
    if (step === 0) {
      setAttempted(false);
      setStep(1);
      return;
    }
    if (!routesValid) {
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const credentials = { username, password };
      const host = new URL(applicationUrl).hostname.split(".")[0];
      const name = host
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      const created = await createShowcase({
        name,
        description: routes[0]?.description ?? "Private application showcase.",
        targetUrl: applicationUrl,
        credentials,
        login: {
          loginUrl,
          usernameSelector,
          passwordSelector,
          submitSelector,
          authenticatedSelector,
          ...(usesStorageBridge
            ? {
                storageBridge: {
                  storage: "localStorage" as const,
                  key: storageKey.trim(),
                  headerName: authHeaderName,
                  prefix: authHeaderPrefix,
                },
              }
            : {}),
        },
        mode,
        routes,
      });
      setUsername("");
      setPassword("");
      router.push(`/projects/${created.id}`);
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
            Connect the application, choose its scope, and define the routes reviewers can explore.
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
                      These credentials are used only to prepare the private session.
                    </p>
                  </div>
                  <div className="space-y-5">
                    <label className="block">
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
                        <span className="mt-1.5 block text-[11px] text-red-600">
                          Enter a complete HTTPS URL.
                        </span>
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold">Username</span>
                      <input
                        aria-invalid={attempted && !username.trim()}
                        autoComplete="username"
                        className={`${inputClass} ${attempted && !username.trim() ? "border-red-500 ring-1 ring-red-500" : ""}`}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="demo@company.com"
                        value={username}
                      />
                      {attempted && !username.trim() && (
                        <span className="mt-1.5 block text-[11px] text-red-600">
                          Enter the project account username.
                        </span>
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold">Password</span>
                      <input
                        aria-invalid={attempted && !password}
                        autoComplete="current-password"
                        className={`${inputClass} ${attempted && !password ? "border-red-500 ring-1 ring-red-500" : ""}`}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••••••"
                        type="password"
                        value={password}
                      />
                      {attempted && !password && (
                        <span className="mt-1.5 block text-[11px] text-red-600">
                          Enter the project account password.
                        </span>
                      )}
                    </label>
                    <div className="border-t border-black/10 pt-6">
                      <div className="mb-4">
                        <h3 className="text-xs font-semibold">Login mapping</h3>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                          Tell the secure browser where to sign in and how it confirms success.
                          Selectors are explicit and are never guessed.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold">Login URL</span>
                          <input
                            aria-describedby="login-url-help"
                            aria-invalid={attempted && !validLoginUrl}
                            className={`${inputClass} font-mono text-xs ${attempted && !validLoginUrl ? "border-red-500 ring-1 ring-red-500" : ""}`}
                            onChange={(event) => setLoginUrl(event.target.value)}
                            placeholder="e.g. https://app.example.com/login"
                            type="url"
                            value={loginUrl}
                          />
                          <span
                            className="mt-1.5 block text-[11px] leading-4 text-zinc-500"
                            id="login-url-help"
                          >
                            The exact HTTPS page where the project account signs in.
                          </span>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {[
                            {
                              id: "username-selector",
                              label: "Username selector",
                              placeholder: 'e.g. input[name="email"]',
                              help: "The email or username input on the login page.",
                              value: usernameSelector,
                              setValue: setUsernameSelector,
                            },
                            {
                              id: "password-selector",
                              label: "Password selector",
                              placeholder: 'e.g. input[type="password"]',
                              help: "The password input on the login page.",
                              value: passwordSelector,
                              setValue: setPasswordSelector,
                            },
                            {
                              id: "submit-selector",
                              label: "Submit selector",
                              placeholder: 'e.g. button[type="submit"]',
                              help: "The button that submits the login form.",
                              value: submitSelector,
                              setValue: setSubmitSelector,
                            },
                            {
                              id: "authenticated-selector",
                              label: "Authenticated selector",
                              placeholder: 'e.g. [data-testid="profile-button"]',
                              help: "An element visible only after login, such as the profile or account button.",
                              value: authenticatedSelector,
                              setValue: setAuthenticatedSelector,
                            },
                          ].map((field) => (
                            <label className="block" key={field.label}>
                              <span className="mb-2 block text-xs font-semibold">
                                {field.label}
                              </span>
                              <input
                                aria-describedby={`${field.id}-help`}
                                aria-invalid={attempted && !field.value.trim()}
                                className={`${inputClass} font-mono text-xs ${attempted && !field.value.trim() ? "border-red-500 ring-1 ring-red-500" : ""}`}
                                onChange={(event) => field.setValue(event.target.value)}
                                placeholder={field.placeholder}
                                value={field.value}
                              />
                              <span
                                className="mt-1.5 block text-[11px] leading-4 text-zinc-500"
                                id={`${field.id}-help`}
                              >
                                {field.help}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="border border-black/10 bg-zinc-50 p-4">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              checked={usesStorageBridge}
                              className="mt-0.5 h-4 w-4 accent-black"
                              onChange={(event) => setUsesStorageBridge(event.target.checked)}
                              type="checkbox"
                            />
                            <span>
                              <span className="block text-xs font-semibold">
                                The app keeps its session token in localStorage
                              </span>
                              <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
                                Showrun will capture the token securely and expose only a harmless
                                placeholder inside the public showcase.
                              </span>
                            </span>
                          </label>
                          {usesStorageBridge && (
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <label className="block sm:col-span-2">
                                <span className="mb-2 block text-xs font-semibold">
                                  localStorage key
                                </span>
                                <input
                                  aria-invalid={attempted && !storageKey.trim()}
                                  className={`${inputClass} font-mono text-xs ${attempted && !storageKey.trim() ? "border-red-500 ring-1 ring-red-500" : ""}`}
                                  onChange={(event) => setStorageKey(event.target.value)}
                                  placeholder="e.g. access_token"
                                  value={storageKey}
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-xs font-semibold">API header</span>
                                <select
                                  className={inputClass}
                                  onChange={(event) =>
                                    setAuthHeaderName(
                                      event.target.value as "authorization" | "x-api-key",
                                    )
                                  }
                                  value={authHeaderName}
                                >
                                  <option value="authorization">Authorization</option>
                                  <option value="x-api-key">X-API-Key</option>
                                </select>
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-xs font-semibold">
                                  Header prefix
                                </span>
                                <input
                                  className={`${inputClass} font-mono text-xs`}
                                  onChange={(event) => setAuthHeaderPrefix(event.target.value)}
                                  placeholder="Bearer "
                                  value={authHeaderPrefix}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                      {attempted && !loginMappingValid && (
                        <p className="mt-3 text-[11px] text-red-600">
                          Complete the HTTPS login URL and all four selectors.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <aside className="h-fit space-y-4">
                  <div className="border border-emerald-200 bg-emerald-50 p-5">
                    <span className="grid h-9 w-9 place-items-center bg-emerald-100 text-emerald-700">
                      <Icon name="shield" />
                    </span>
                    <h3 className="mt-6 text-sm font-semibold text-emerald-950">
                      Private connection
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-emerald-800/70">
                      Credentials are request-only. After creation, this interface shows only
                      session health—never the saved username or password.
                    </p>
                  </div>
                  <div className="border border-black/10 bg-zinc-50 p-5">
                    <h3 className="text-sm font-semibold">How to find a selector</h3>
                    <ol className="mt-3 space-y-2 text-[11px] leading-5 text-zinc-600">
                      <li>1. Open the page in Chrome and right-click the element.</li>
                      <li>2. Choose Inspect and look at the highlighted HTML.</li>
                      <li>
                        3. Prefer a stable <code className="font-mono text-black">id</code>,{" "}
                        <code className="font-mono text-black">name</code>, or{" "}
                        <code className="font-mono text-black">data-testid</code> attribute.
                      </li>
                    </ol>
                    <div className="mt-4 border-l-2 border-signal bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                        Your screenshot
                      </p>
                      <code className="mt-1 block break-all font-mono text-[11px] text-black">
                        [data-testid=&quot;profile-button&quot;]
                      </code>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                      Avoid generated class names and selectors containing nth-child because they
                      can change when the page layout changes.
                    </p>
                  </div>
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
                    Selected Routes is recommended. Both modes remain read-only and
                    backend-enforced.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    {
                      value: "selected_routes" as const,
                      title: "Selected Routes",
                      badge: "Recommended",
                      icon: "stack" as const,
                      copy: "Expose only the pages you deliberately add to the showcase route list.",
                    },
                    {
                      value: "full_application" as const,
                      title: "Full Application",
                      badge: "Broader scope",
                      icon: "globe" as const,
                      copy: "Expose the full configured route set, while keeping application actions disabled.",
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
                <div className="mt-5 flex items-start gap-3 border border-black/10 bg-zinc-50 p-4">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" name="shield" />
                  <p className="text-[11px] leading-5 text-zinc-500">
                    Full Application does not mean unrestricted access. Only configured routes are
                    exposed, and target application controls remain non-operable.
                  </p>
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
                      Add routes manually. Their title and description appear in the interviewer UI.
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 border border-black/15 bg-white px-4 text-xs font-semibold transition hover:border-black"
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
                    const pathInvalid = attempted && !route.path.startsWith("/");
                    const titleInvalid = attempted && !route.title.trim();
                    return (
                      <article className="border border-black/10 bg-zinc-50" key={route.id}>
                        <div className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-6 w-6 place-items-center bg-ink font-mono text-[9px] text-signal">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="text-xs font-semibold">
                              {route.title || "Untitled route"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              aria-label={`Move ${route.title} up`}
                              className="grid h-8 w-8 place-items-center text-zinc-400 transition hover:bg-zinc-100 hover:text-black disabled:opacity-25"
                              disabled={index === 0}
                              onClick={() => moveRoute(index, -1)}
                              type="button"
                            >
                              ↑
                            </button>
                            <button
                              aria-label={`Move ${route.title} down`}
                              className="grid h-8 w-8 place-items-center text-zinc-400 transition hover:bg-zinc-100 hover:text-black disabled:opacity-25"
                              disabled={index === routes.length - 1}
                              onClick={() => moveRoute(index, 1)}
                              type="button"
                            >
                              ↓
                            </button>
                            <button
                              aria-label={`Remove ${route.title}`}
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
                    Every route needs a path beginning with “/” and a title.
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-black/10 bg-zinc-50 px-6 py-4 sm:px-9">
            <button
              className="h-10 px-2 text-xs font-semibold text-zinc-500 transition hover:text-black"
              onClick={() => (step ? setStep((current) => current - 1) : router.back())}
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
                disabled={submitting}
                onClick={continueFlow}
                type="button"
              >
                {submitting ? "Creating…" : step === 2 ? "Create Showcase" : "Continue"}
                {!submitting && <Icon name={step === 2 ? "spark" : "arrow"} />}
              </button>
            </div>
          </footer>
          {submitError && (
            <div
              className="border-t border-red-200 bg-red-50 px-6 py-3 text-xs text-red-700 sm:px-9"
              role="alert"
            >
              {submitError}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
