import type {
  CreateShowcaseInput,
  PrepareState,
  RemoteBrowserFrame,
  RemoteBrowserInput,
  RemoteBrowserSession,
  Showcase,
  ShowcaseDependency,
  ShowcaseLoginConfiguration,
  ShowcaseRoute,
  SessionDiagnostic,
  CompatibilityReport,
  UpdateShowcaseInput,
} from "@/lib/types";
import { ApiError, apiRequest } from "@/services/api";

type BackendState = "CREATED" | "PREPARING" | "ACTIVE" | "AUTHENTICATION_EXPIRED" | "ERROR";

interface BackendShowcaseRoute {
  path: string;
  title: string;
  description: string;
}

interface BackendShowcase {
  id: string;
  name: string;
  slug: string;
  publicUrl: string;
  targetUrl: string;
  mode: "selected_routes" | "full_application";
  routes: BackendShowcaseRoute[];
  dependencies: ShowcaseDependency[];
  state: BackendState;
  lastErrorCode: string | null;
  authenticationConfigured: boolean;
  authenticationProvider?: "token" | "password" | "manual_session" | null;
  authenticationConfig?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface PublicShowcaseStatus {
  name: string;
  slug: string;
  publicUrl: string;
  status: "preparing" | "ready" | "auth_required" | "error";
  mode: "selected_routes" | "full_application";
  routes: BackendShowcaseRoute[];
}

function routesWithIds(slug: string, routes: BackendShowcaseRoute[]): ShowcaseRoute[] {
  return routes.map((route, index) => ({
    ...route,
    id: `${slug}_${index}_${route.path}`,
  }));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function passwordLoginConfiguration(record: BackendShowcase): ShowcaseLoginConfiguration | null {
  if (record.authenticationProvider !== "password" || !record.authenticationConfig) return null;
  const config = record.authenticationConfig;
  const verification = config.verification;
  if (!verification || typeof verification !== "object") return null;
  const selector = "selector" in verification ? verification.selector : null;
  const fields = [
    config.loginUrl,
    config.usernameSelector,
    config.passwordSelector,
    config.submitSelector,
    selector,
  ];
  if (!fields.every((value) => typeof value === "string")) return null;
  const sessionValue = config.sessionToken;
  const sessionToken =
    sessionValue &&
    typeof sessionValue === "object" &&
    "storage" in sessionValue &&
    (sessionValue.storage === "cookie" ||
      sessionValue.storage === "localStorage" ||
      sessionValue.storage === "sessionStorage") &&
    "name" in sessionValue &&
    typeof sessionValue.name === "string"
      ? {
          storage: sessionValue.storage as "cookie" | "localStorage" | "sessionStorage",
          name: sessionValue.name,
        }
      : undefined;
  return {
    loginUrl: config.loginUrl as string,
    usernameSelector: config.usernameSelector as string,
    passwordSelector: config.passwordSelector as string,
    submitSelector: config.submitSelector as string,
    authenticatedSelector: selector as string,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

function toShowcase(record: BackendShowcase): Showcase {
  const routes = routesWithIds(record.slug, record.routes);
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    publicUrl: record.publicUrl,
    description: routes[0]?.description || "Private application showcase.",
    targetUrl: record.targetUrl,
    authMethod:
      record.authenticationProvider === "token"
        ? "token"
        : record.authenticationProvider === "password"
          ? "password"
          : "browser",
    authenticationConfigured: record.authenticationConfigured,
    status:
      record.state === "ACTIVE"
        ? "active"
        : record.state === "AUTHENTICATION_EXPIRED" || record.state === "ERROR"
          ? "needs_attention"
          : "draft",
    lastAuthenticated: record.state === "ACTIVE" ? "Session active" : "Not active",
    createdAt: formatDate(record.createdAt),
    mode: record.mode,
    routes,
    dependencies: record.dependencies ?? [],
    login: passwordLoginConfiguration(record),
  };
}

function publicToShowcase(record: PublicShowcaseStatus): Showcase {
  return {
    id: record.slug,
    name: record.name,
    slug: record.slug,
    publicUrl: record.publicUrl,
    description: record.routes[0]?.description || "Private application showcase.",
    targetUrl: "",
    authMethod: "browser",
    authenticationConfigured: false,
    status: record.status === "ready" ? "active" : "needs_attention",
    lastAuthenticated: record.status === "ready" ? "Session active" : "Not active",
    createdAt: "",
    mode: record.mode,
    routes: routesWithIds(record.slug, record.routes),
    dependencies: [],
    login: null,
  };
}

export async function getShowcases(): Promise<Showcase[]> {
  return (await apiRequest<BackendShowcase[]>("/showcases")).map(toShowcase);
}

export async function getShowcase(id: string): Promise<Showcase | undefined> {
  try {
    return toShowcase(await apiRequest<BackendShowcase>(`/showcases/${encodeURIComponent(id)}`));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function createShowcase(input: CreateShowcaseInput): Promise<Showcase> {
  const authentication =
    input.login && input.credentials
      ? {
          provider: "password" as const,
          config: {
            loginUrl: input.login.loginUrl,
            usernameSelector: input.login.usernameSelector,
            passwordSelector: input.login.passwordSelector,
            submitSelector: input.login.submitSelector,
            verification: {
              type: "expected_selector" as const,
              selector: input.login.authenticatedSelector,
            },
            ...(input.login.sessionToken ? { sessionToken: input.login.sessionToken } : {}),
          },
          secret: input.credentials,
        }
      : undefined;
  const created = await apiRequest<BackendShowcase>("/showcases", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      targetUrl: input.targetUrl,
      mode: input.mode,
      routes: input.routes.map(({ path, title, description }) => ({ path, title, description })),
      ...(authentication ? { authentication } : {}),
    }),
  });
  return toShowcase(created);
}

export async function updateShowcase(id: string, input: UpdateShowcaseInput): Promise<Showcase> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.targetUrl !== undefined) payload.targetUrl = input.targetUrl;
  if (input.mode !== undefined) payload.mode = input.mode;
  if (input.routes !== undefined) {
    payload.routes = input.routes.map(({ path, title, description }) => ({
      path,
      title,
      description,
    }));
  }
  if (input.login !== undefined) {
    payload.authentication = {
      provider: "password",
      config: {
        loginUrl: input.login.loginUrl,
        usernameSelector: input.login.usernameSelector,
        passwordSelector: input.login.passwordSelector,
        submitSelector: input.login.submitSelector,
        verification: {
          type: "expected_selector",
          selector: input.login.authenticatedSelector,
        },
        ...(input.login.sessionToken ? { sessionToken: input.login.sessionToken } : {}),
      },
      ...(input.credentials ? { secret: input.credentials } : {}),
    };
  }
  return toShowcase(
    await apiRequest<BackendShowcase>(`/showcases/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  );
}

export async function reauthenticateShowcase(id: string): Promise<Showcase> {
  return toShowcase(
    await apiRequest<BackendShowcase>(`/showcases/${encodeURIComponent(id)}/re-authenticate`, {
      method: "POST",
    }),
  );
}

export async function scanShowcaseDependencies(id: string): Promise<Showcase> {
  return toShowcase(
    await apiRequest<BackendShowcase>(`/showcases/${encodeURIComponent(id)}/scan-dependencies`, {
      method: "POST",
    }),
  );
}

export async function updateDependencyApprovals(
  id: string,
  approvals: Array<{
    path: string;
    search: string;
    originAlias?: string | null;
    approved: boolean;
    redactedFields?: string[];
  }>,
): Promise<Showcase> {
  return toShowcase(
    await apiRequest<BackendShowcase>(`/showcases/${encodeURIComponent(id)}/dependencies`, {
      method: "PATCH",
      body: JSON.stringify({ approvals }),
    }),
  );
}

export async function getSessionDiagnostics(
  id: string,
): Promise<{ active: boolean; candidates: SessionDiagnostic[] }> {
  return apiRequest(`/showcases/${encodeURIComponent(id)}/session-diagnostics`);
}

export async function testShowcaseCompatibility(id: string): Promise<CompatibilityReport> {
  return apiRequest(`/showcases/${encodeURIComponent(id)}/compatibility-test`, { method: "POST" });
}

export async function getShowcaseStatus(slug: string): Promise<PublicShowcaseStatus> {
  return apiRequest<PublicShowcaseStatus>(`/showcases/${encodeURIComponent(slug)}/status`);
}

export async function prepareShowcase(slug: string, requestedPath?: string): Promise<PrepareState> {
  try {
    let status = await getShowcaseStatus(slug);
    const knownRoute = requestedPath
      ? status.routes.find((route) => route.path === requestedPath)
      : status.routes[0];
    if (!knownRoute) {
      return {
        state: "route_unavailable",
        projectName: status.name,
        showcase: publicToShowcase(status),
      };
    }
    if (status.status === "preparing") {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        status = await getShowcaseStatus(slug);
        if (status.status !== "preparing") break;
      }
    }
    const showcase = publicToShowcase(status);
    const activeRoute = requestedPath
      ? showcase.routes.find((route) => route.path === requestedPath)
      : showcase.routes[0];
    if (!activeRoute) return { state: "route_unavailable", projectName: status.name, showcase };
    if (status.status === "error") return { state: "error", projectName: status.name, showcase };
    if (status.status === "auth_required") {
      return { state: "expired", projectName: status.name, showcase };
    }
    return { state: "ready", showcase, activeRoute };
  } catch {
    return { state: "target_unavailable", projectName: "Showcase" };
  }
}

const runtimeHeaders = (session: RemoteBrowserSession) => ({
  "x-showrun-runtime-token": session.token,
});

export async function startViewerBrowser(
  slug: string,
  path: string,
): Promise<RemoteBrowserSession> {
  return apiRequest(`/showcases/${encodeURIComponent(slug)}/remote-browser`, {
    method: "POST",
    body: JSON.stringify({ path, viewport: { width: 1440, height: 900 } }),
  });
}

export async function startAuthenticationBrowser(
  id: string,
  initialUrl?: string,
): Promise<RemoteBrowserSession> {
  return apiRequest(`/showcases/${encodeURIComponent(id)}/auth-browser`, {
    method: "POST",
    body: JSON.stringify({
      ...(initialUrl ? { initialUrl } : {}),
      viewport: { width: 1440, height: 900 },
    }),
  });
}

export async function getRemoteBrowserFrame(
  session: RemoteBrowserSession,
): Promise<RemoteBrowserFrame> {
  const response = await fetch(
    `/backend-api/remote-browser/${encodeURIComponent(session.id)}/frame`,
    { credentials: "include", cache: "no-store", headers: runtimeHeaders(session) },
  );
  if (!response.ok) {
    let body: { error?: { code?: string; message?: string } } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Keep the safe fallback when the response is not JSON.
    }
    throw new ApiError(
      body.error?.message ?? "The remote browser frame could not be loaded.",
      response.status,
      body.error?.code,
    );
  }
  const blob = await response.blob();
  const encodedPath = response.headers.get("x-showrun-current-path") ?? "";
  return {
    url: URL.createObjectURL(blob),
    currentPath: encodedPath ? decodeURIComponent(encodedPath) : session.currentPath,
    blockedRequests: Number(response.headers.get("x-showrun-blocked-requests") ?? "0"),
  };
}

export async function sendRemoteBrowserInput(
  session: RemoteBrowserSession,
  input: RemoteBrowserInput,
): Promise<void> {
  await apiRequest(`/remote-browser/${encodeURIComponent(session.id)}/input`, {
    method: "POST",
    headers: runtimeHeaders(session),
    body: JSON.stringify(input),
  });
}

export async function navigateRemoteBrowser(
  session: RemoteBrowserSession,
  path: string,
): Promise<void> {
  await apiRequest(`/remote-browser/${encodeURIComponent(session.id)}/navigate`, {
    method: "POST",
    headers: runtimeHeaders(session),
    body: JSON.stringify({ path }),
  });
}

export async function closeRemoteBrowser(session: RemoteBrowserSession): Promise<void> {
  await apiRequest(`/remote-browser/${encodeURIComponent(session.id)}`, {
    method: "DELETE",
    headers: runtimeHeaders(session),
  });
}

export async function captureRemoteAuthentication(
  id: string,
  session: RemoteBrowserSession,
): Promise<Showcase> {
  return toShowcase(
    await apiRequest<BackendShowcase>(
      `/showcases/${encodeURIComponent(id)}/auth-browser/${encodeURIComponent(session.id)}/capture`,
      { method: "POST", headers: runtimeHeaders(session) },
    ),
  );
}
