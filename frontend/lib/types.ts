export type AuthMethod = "token" | "password" | "manual";
export type ShowcaseStatus = "active" | "needs_attention" | "draft";
export type ShowcaseMode = "selected_routes" | "full_application";

export interface ShowcaseRoute {
  id: string;
  path: string;
  title: string;
  description: string;
}

export interface Showcase {
  id: string;
  name: string;
  slug: string;
  description: string;
  targetUrl: string;
  authMethod: AuthMethod;
  status: ShowcaseStatus;
  lastAuthenticated: string;
  visitors: number;
  createdAt: string;
  accent: string;
  creator?: string;
  mode: ShowcaseMode;
  routes: ShowcaseRoute[];
}
export interface CreateShowcaseInput {
  name: string;
  description: string;
  targetUrl: string;
  credentials: {
    username: string;
    password: string;
  };
  mode: ShowcaseMode;
  routes: ShowcaseRoute[];
  accent: string;
  creator?: string;
}

export type PrepareState =
  | { state: "ready"; showcase: Showcase; activeRoute: ShowcaseRoute }
  | { state: "expired"; projectName: string; showcase?: Showcase }
  | { state: "target_unavailable"; projectName: string; showcase?: Showcase }
  | { state: "route_unavailable"; projectName: string; showcase?: Showcase }
  | { state: "error"; projectName: string; showcase?: Showcase };
