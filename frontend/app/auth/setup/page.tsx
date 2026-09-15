"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LegacyAuthenticationRedirect() {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get("id");

  useEffect(() => {
    router.replace(projectId ? `/projects/${encodeURIComponent(projectId)}/connect` : "/dashboard");
  }, [projectId, router]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#111310] text-xs text-zinc-400">
      Opening the controlled browser…
    </div>
  );
}

export default function AuthSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#111310]" />}>
      <LegacyAuthenticationRedirect />
    </Suspense>
  );
}
