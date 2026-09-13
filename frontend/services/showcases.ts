import type { CreateShowcaseInput, PrepareState, Showcase, ShowcaseRoute } from "@/lib/types";
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
  targetUrl: string;
  mode: "selected_routes" | "full_application";
  routes: BackendShowcaseRoute[];
  state: BackendState;
  lastErrorCode: string | null;
  authenticationConfigured: boolean;
  authenticationProvider?: "token" | "password" | "manual_session" | null;
  createdAt: string;
  updatedAt: string;
}

interface PublicShowcaseStatus {
  name: string;
  slug: string;
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

function toShowcase(record: BackendShowcase): Showcase {
  const routes = routesWithIds(record.slug, record.routes);
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: routes[0]?.description || "Private application showcase.",
    targetUrl: record.targetUrl,
    authMethod:
      record.authenticationProvider === "token"
        ? "token"
        : record.authenticationProvider === "manual_session"
          ? "manual"
          : "password",
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
  };
}

function publicToShowcase(record: PublicShowcaseStatus): Showcase {
  return {
    id: record.slug,
    name: record.name,
    slug: record.slug,
    description: record.routes[0]?.description || "Private application showcase.",
    targetUrl: "",
    authMethod: "password",
    status: record.status === "ready" ? "active" : "needs_attention",
    lastAuthenticated: record.status === "ready" ? "Session active" : "Not active",
    createdAt: "",
    mode: record.mode,
    routes: routesWithIds(record.slug, record.routes),
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
  const created = await apiRequest<BackendShowcase>("/showcases", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      targetUrl: input.targetUrl,
      mode: input.mode,
      routes: input.routes.map(({ path, title, description }) => ({ path, title, description })),
      authentication: {
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
        },
        secret: input.credentials,
      },
    }),
  });
  return toShowcase(created);
}

export async function updateShowcase(
  id: string,
  input: Partial<CreateShowcaseInput>,
): Promise<Showcase> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.targetUrl !== undefined) payload.targetUrl = input.targetUrl;
  if (input.routes !== undefined) {
    payload.routes = input.routes.map(({ path, title, description }) => ({
      path,
      title,
      description,
    }));
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
    if (status.status === "auth_required") {
      await fetch(`/backend-showcase/${encodeURIComponent(slug)}${knownRoute.path}`, {
        method: "HEAD",
        credentials: "omit",
      });
    }
    if (status.status === "auth_required" || status.status === "preparing") {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        status = await getShowcaseStatus(slug);
        if (status.status !== "preparing" && status.status !== "auth_required") break;
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
