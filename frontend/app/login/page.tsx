"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Brand } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/services/api";
import { getAuthProviders, oauthLoginUrl } from "@/services/auth";

const inputClass =
  "h-11 w-full border border-black/15 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-1 focus:ring-black";

function LoginForm() {
  const search = useSearchParams();
  const router = useRouter();
  const { user, loading, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState({ github: true, google: true });
  const requestedReturnTo = search.get("returnTo") ?? "/dashboard";
  const returnTo =
    requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/dashboard";

  useEffect(() => {
    if (!loading && user) router.replace(returnTo);
  }, [loading, returnTo, router, user]);

  useEffect(() => {
    getAuthProviders()
      .then(setProviders)
      .catch(() => setProviders({ github: false, google: false }));
  }, []);

  const oauthError = search.get("error");
  const externalError = oauthError
    ? oauthError === "oauth_cancelled"
      ? "Sign-in was cancelled. No account changes were made."
      : oauthError === "oauth_state"
        ? "That sign-in request expired. Please start again."
        : "The provider could not complete sign-in. Please try again."
    : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (mode === "register" && name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "register" && password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "register" && !confirmPassword) {
      setError("Confirm your password.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") await login({ email, password });
      else await register({ name, email, password });
      router.replace(returnTo);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
      <section className="relative hidden overflow-hidden border-r border-black/10 bg-[#111310] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative">
          <Brand inverse />
        </div>
        <div className="relative my-auto max-w-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
            Creator workspace
          </p>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-[-0.05em]">
            Private projects.
            <br />
            Controlled showcases.
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-zinc-400">
            Configure exactly what reviewers can see, manage authenticated target sessions, and
            share one presentation-ready URL.
          </p>
        </div>
        <p className="relative text-[11px] text-zinc-600">Secure creator access · Showrun</p>
      </section>

      <section className="flex min-h-screen flex-col bg-white">
        <header className="flex h-16 items-center justify-between border-b border-black/10 px-5 sm:px-8 lg:justify-end">
          <span className="lg:hidden">
            <Brand />
          </span>
          <Link className="text-xs font-medium text-zinc-500 hover:text-black" href="/">
            Back to site
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
          <div className="w-full max-w-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                {mode === "login" ? "Welcome back" : "Create your workspace"}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">
                {mode === "login" ? "Sign in to Showrun" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {mode === "login"
                  ? "Manage your showcases and target sessions."
                  : "Start building controlled demos for your private work."}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <a
                aria-disabled={!providers.github}
                className={`inline-flex h-11 items-center justify-center gap-2 border border-black/15 bg-white text-xs font-semibold transition ${providers.github ? "hover:border-black hover:bg-zinc-50" : "pointer-events-none opacity-40"}`}
                href={providers.github ? oauthLoginUrl("github", returnTo) : undefined}
                title={providers.github ? "Continue with GitHub" : "GitHub login is not configured"}
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.1.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.59.69.48A10 10 0 0 0 12 2Z" />
                </svg>
                GitHub
              </a>
              <a
                aria-disabled={!providers.google}
                className={`inline-flex h-11 items-center justify-center gap-2 border border-black/15 bg-white text-xs font-semibold transition ${providers.google ? "hover:border-black hover:bg-zinc-50" : "pointer-events-none opacity-40"}`}
                href={providers.google ? oauthLoginUrl("google", returnTo) : undefined}
                title={providers.google ? "Continue with Google" : "Google login is not configured"}
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
                  />
                </svg>
                Google
              </a>
            </div>

            <div className="my-7 flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                or continue with email
              </span>
              <span className="h-px flex-1 bg-black/10" />
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === "register" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold">Name</span>
                  <input
                    autoComplete="name"
                    autoFocus
                    className={inputClass}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    value={name}
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-2 block text-xs font-semibold">Email</span>
                <input
                  autoComplete="email"
                  autoFocus={mode === "login"}
                  className={inputClass}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-xs font-semibold">
                  Password
                  <button
                    className="font-normal text-zinc-400 hover:text-black"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={inputClass}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 10 characters" : "Your password"}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
              </label>
              {mode === "register" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold">Confirm password</span>
                  <input
                    autoComplete="new-password"
                    className={inputClass}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter your password again"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                  />
                </label>
              )}

              {(error || externalError) && (
                <div
                  className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700"
                  role="alert"
                >
                  {error ?? externalError}
                </div>
              )}

              <button
                className="inline-flex h-11 w-full items-center justify-center bg-ink px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting || loading}
                type="submit"
              >
                {submitting
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in with email"
                    : "Create account"}
              </button>
            </form>

            <p className="mt-7 text-center text-xs text-zinc-500">
              {mode === "login" ? "New to Showrun?" : "Already have an account?"}{" "}
              <button
                className="font-semibold text-black hover:underline"
                onClick={() => {
                  setMode((current) => (current === "login" ? "register" : "login"));
                  setConfirmPassword("");
                  setError(null);
                }}
                type="button"
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-canvas">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-black/15 border-t-black" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
