export type AuthMethod = "token" | "password" | "manual";
export type ShowcaseStatus = "active" | "needs_attention" | "draft";
export type ShowcaseMode = "selected_routes" | "full_application";

export interface ShowcaseRoute {
  id: string;
  path: string;
  title: string;
  description: string;
}

export interface ShowcaseLoginConfiguration {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  authenticatedSelector: string;
  storageBridge?: {
    storage: "localStorage";
    key: string;
    headerName: "authorization" | "x-api-key";
    prefix: string;
  };
}

export type ShowcaseDependencyCategory =
  "script" | "style" | "font" | "image" | "read_api" | "other";

export interface ShowcaseDependency {
  path: string;
  targetPath: string;
  search: string;
  contentType: string;
  category: ShowcaseDependencyCategory;
  approved: boolean;
  contentHash: string;
  discoveredAt: string;
}

export interface Showcase {
  id: string;
  name: string;
  slug: string;
  description: string;
  targetUrl: string;
  authMethod: AuthMethod;
  authenticationConfigured: boolean;
  status: ShowcaseStatus;
  lastAuthenticated: string;
  createdAt: string;
  mode: ShowcaseMode;
  routes: ShowcaseRoute[];
  dependencies: ShowcaseDependency[];
  login: ShowcaseLoginConfiguration | null;
}
export interface CreateShowcaseInput {
  name: string;
  description: string;
  targetUrl: string;
  credentials: {
    username: string;
    password: string;
  };
  login: ShowcaseLoginConfiguration;
  mode: ShowcaseMode;
  routes: ShowcaseRoute[];
}

export interface UpdateShowcaseInput {
  name?: string;
  targetUrl?: string;
  credentials?: CreateShowcaseInput["credentials"];
  login?: ShowcaseLoginConfiguration;
  mode?: ShowcaseMode;
  routes?: ShowcaseRoute[];
}

export type PrepareState =
  | { state: "ready"; showcase: Showcase; activeRoute: ShowcaseRoute }
  | { state: "expired"; projectName: string; showcase?: Showcase }
  | { state: "target_unavailable"; projectName: string; showcase?: Showcase }
  | { state: "route_unavailable"; projectName: string; showcase?: Showcase }
  | { state: "error"; projectName: string; showcase?: Showcase };
