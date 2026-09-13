import { apiRequest } from "@/services/api";

export interface Creator {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface SessionResponse {
  user: Creator;
}

export const getCreatorSession = () => apiRequest<SessionResponse>("/auth/session");

export const getAuthProviders = () =>
  apiRequest<{ github: boolean; google: boolean }>("/auth/providers");

export const loginWithEmail = (input: { email: string; password: string }) =>
  apiRequest<SessionResponse>("/auth/email/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const registerWithEmail = (input: { name: string; email: string; password: string }) =>
  apiRequest<SessionResponse>("/auth/email/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const logoutCreator = () =>
  apiRequest<void>("/auth/logout", {
    method: "POST",
  });

export function oauthLoginUrl(provider: "github" | "google", returnTo: string): string {
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
  return `/backend-api/auth/oauth/${provider}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
