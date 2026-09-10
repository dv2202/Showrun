import type { CreateShowcaseInput, PrepareState, Showcase } from "@/lib/types";

// Replace these functions with HTTP calls when the backend API is available.
// Authentication material is deliberately not represented in frontend models.
const records: Showcase[] = [
  {
    id: "prj_01",
    name: "Atlas Console",
    slug: "atlas-console",
    description: "Operations dashboard for the Atlas team.",
    targetUrl: "https://private-project.example.com",
    authMethod: "password",
    status: "active",
    lastAuthenticated: "Today, 09:42",
    visitors: 128,
    createdAt: "Aug 24, 2026",
    accent: "#315b47",
    creator: "Devansh Shah",
    mode: "selected_routes",
    routes: [
      {
        id: "route_atlas_dashboard",
        path: "/dashboard",
        title: "Dashboard",
        description: "Main dashboard showing the application's core metrics and operating health.",
      },
      {
        id: "route_atlas_projects",
        path: "/projects",
        title: "Projects",
        description: "Project management interface with filtering and reusable project cards.",
      },
      {
        id: "route_atlas_analytics",
        path: "/analytics",
        title: "Analytics",
        description: "Data visualization and reporting across the active project portfolio.",
      },
      {
        id: "route_atlas_settings",
        path: "/settings",
        title: "Settings",
        description: "Workspace preferences, access controls, and environment configuration.",
      },
    ],
  },
  {
    id: "prj_02",
    name: "Northstar",
    slug: "northstar",
    description: "A private planning workspace.",
    targetUrl: "https://northstar.internal",
    authMethod: "token",
    status: "active",
    lastAuthenticated: "Yesterday",
    visitors: 64,
    createdAt: "Aug 19, 2026",
    accent: "#315b47",
    mode: "full_application",
    routes: [
      {
        id: "route_northstar_overview",
        path: "/overview",
        title: "Overview",
        description: "Planning overview for current goals, milestones, and team focus.",
      },
      {
        id: "route_northstar_roadmap",
        path: "/roadmap",
        title: "Roadmap",
        description: "Interactive roadmap view presented in read-only showcase mode.",
      },
    ],
  },
  {
    id: "prj_03",
    name: "Ledger Preview",
    slug: "ledger-preview",
    description: "Preview environment for the finance suite.",
    targetUrl: "https://ledger.example.dev",
    authMethod: "manual",
    status: "needs_attention",
    lastAuthenticated: "Aug 28, 2026",
    visitors: 21,
    createdAt: "Aug 11, 2026",
    accent: "#687eaa",
    mode: "selected_routes",
    routes: [
      {
        id: "route_ledger_dashboard",
        path: "/dashboard",
        title: "Dashboard",
        description: "Finance dashboard with current balances and reporting summaries.",
      },
    ],
  },
];
const pause = <T>(data: T) => new Promise<T>((resolve) => setTimeout(() => resolve(data), 380));
export const getShowcases = () => pause(records);
export const getShowcase = (id: string) =>
  pause(records.find((item) => item.id === id || item.slug === id));
export const createShowcase = async (input: CreateShowcaseInput): Promise<Showcase> => {
  // Credentials are request-only. The mock deliberately discards them instead of
  // retaining authentication material in frontend-visible showcase records.
  const { credentials: _credentials, ...publicInput } = input;
  const showcase: Showcase = {
    ...publicInput,
    id: `prj_${records.length + 1}`,
    slug: input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    status: "active",
    authMethod: "password",
    lastAuthenticated: "Just now",
    visitors: 0,
    createdAt: "Today",
  };
  records.push(showcase);
  return pause(showcase);
};
export const updateShowcase = (id: string, input: Partial<CreateShowcaseInput>) =>
  pause({ ...records.find((item) => item.id === id), ...input });
export const getShowcaseStatus = (slug: string) =>
  pause(records.find((item) => item.slug === slug)?.status ?? "active");
export const prepareShowcase = async (
  slug: string,
  requestedPath?: string,
): Promise<PrepareState> => {
  const showcase = records.find((item) => item.slug === slug);
  if (!showcase) return pause({ state: "error", projectName: "Showcase" });
  if (slug === "ledger-preview") {
    return pause({ state: "expired", projectName: showcase.name, showcase });
  }
  if (slug === "unavailable") {
    return pause({ state: "target_unavailable", projectName: showcase.name, showcase });
  }

  const activeRoute = requestedPath
    ? showcase.routes.find((route) => route.path === requestedPath)
    : showcase.routes[0];
  if (!activeRoute) {
    return pause({ state: "route_unavailable", projectName: showcase.name, showcase });
  }
  return pause({ state: "ready", showcase, activeRoute });
};
