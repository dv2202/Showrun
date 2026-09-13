"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";

const runtimeSteps = [
  { label: "Configuration loaded", complete: "ready" },
  { label: "Authentication verified", complete: "secure" },
  { label: "Runtime ready", complete: "live" },
];

const routes = ["/overview", "/analytics", "/activity"];

function subscribeToReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LandingRuntime() {
  const [stage, setStage] = useState(0);
  const browserRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    () => false,
  );
  const visibleStage = reducedMotion ? 3 : stage;

  useEffect(() => {
    if (reducedMotion) return;

    const timers: number[] = [];
    const play = () => {
      setStage(0);
      timers.push(window.setTimeout(() => setStage(1), 900));
      timers.push(window.setTimeout(() => setStage(2), 1800));
      timers.push(window.setTimeout(() => setStage(3), 2900));
    };

    timers.push(window.setTimeout(() => setStage(1), 900));
    timers.push(window.setTimeout(() => setStage(2), 1800));
    timers.push(window.setTimeout(() => setStage(3), 2900));
    const interval = window.setInterval(play, 6800);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearInterval(interval);
    };
  }, [reducedMotion]);

  return (
    <div
      aria-label="Showcase runtime preview"
      className="landing-preview-enter relative lg:pl-6"
      onPointerLeave={() => {
        if (browserRef.current) browserRef.current.style.transform = "";
      }}
      onPointerMove={(event) => {
        if (reducedMotion || !browserRef.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        browserRef.current.style.transform = `perspective(900px) rotateY(${x * 3.5}deg) rotateX(${-y * 3.5}deg)`;
      }}
    >
      <div className="landing-signal-square absolute -left-6 -top-6 h-24 w-24 bg-signal" />
      <div
        className="landing-runtime-browser relative border border-black/15 bg-[#111310] shadow-[16px_16px_0_0_rgba(24,26,23,0.08),0_28px_65px_rgba(24,26,23,0.13)]"
        ref={browserRef}
      >
        <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center border-b border-white/10 px-3 text-[10px] text-zinc-500">
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            <span className="h-2 w-2 rounded-full bg-green-400" />
          </div>
          <span className="font-mono">read-only runtime</span>
          <Icon className="ml-auto h-3.5 w-3.5" name="shield" />
        </div>

        <div className="grid min-h-[448px] place-items-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-7 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center bg-signal text-black">
                <Icon name="stack" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Your private application</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Secure viewer session</p>
              </div>
            </div>

            <div className="space-y-2 font-mono text-[11px]" aria-live="polite">
              {runtimeSteps.map((step, index) => {
                const active = visibleStage === index;
                const complete = visibleStage > index;
                return (
                  <div
                    className={`landing-runtime-step flex items-center gap-3 border p-3 ${
                      active
                        ? "landing-runtime-step-active border-signal/30 bg-signal/[0.06] text-white"
                        : complete
                          ? "landing-runtime-step-complete border-white/10 bg-white/[0.03] text-zinc-300"
                          : "border-white/10 bg-white/[0.03] text-zinc-500"
                    }`}
                    key={step.label}
                  >
                    {complete ? (
                      <Icon className="h-4 w-4 text-emerald-400" name="check" />
                    ) : (
                      <span
                        className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-signal" : "bg-zinc-700"}`}
                      />
                    )}
                    <span>{step.label}</span>
                    <span className={`ml-auto ${active ? "text-signal" : "text-zinc-600"}`}>
                      {active
                        ? index === 2
                          ? "live"
                          : "checking"
                        : complete
                          ? step.complete
                          : "waiting"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex gap-2 overflow-hidden">
              {routes.map((route, index) => (
                <span
                  className={`landing-route shrink-0 border border-white/10 px-2.5 py-1.5 font-mono text-[9px] text-zinc-500 ${visibleStage === 3 ? "landing-route-visible" : ""}`}
                  key={route}
                  style={{ transitionDelay: `${index * 120}ms` }}
                >
                  {route}
                </span>
              ))}
            </div>

            <div className="mt-6 h-[3px] overflow-hidden bg-white/[0.08]">
              <span
                className="block h-full bg-signal transition-[width] duration-500 ease-out"
                style={{ width: `${Math.min((visibleStage + 1) * 33.34, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              <span>Configured routes only</span>
              <span
                className={`text-signal transition-opacity ${visibleStage === 3 ? "opacity-100" : "opacity-0"}`}
              >
                Live · Shareable
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
