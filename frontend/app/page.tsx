import Link from "next/link";
import { Brand } from "@/components/shell";
import { Icon, type IconName } from "@/components/ui";

const features: { icon: IconName; label: string; copy: string }[] = [
  {
    icon: "shield",
    label: "Private by design",
    copy: "Your source environment and authentication stay behind the runtime boundary.",
  },
  {
    icon: "pulse",
    label: "Always presentation-ready",
    copy: "Know when a session is healthy, when it was refreshed, and who has visited.",
  },
  {
    icon: "terminal",
    label: "Built for product walkthroughs",
    copy: "Show the real interface as a visual, read-only experience—not a disconnected mockup.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f7f5]">
      <header className="border-b border-black/10 bg-[#f7f7f5]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-xs font-medium text-zinc-600 md:flex">
            <a className="transition hover:text-black" href="#workflow">
              Workflow
            </a>
            <a className="transition hover:text-black" href="#security">
              Security
            </a>
            <Link className="transition hover:text-black" href="/dashboard">
              Dashboard
            </Link>
          </nav>
          <Link
            className="inline-flex h-9 items-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700"
            href="/dashboard"
          >
            Sign in <Icon className="h-3.5 w-3.5" name="arrow" />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative border-b border-black/10">
          <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-36">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Secure showcase infrastructure
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-ink sm:text-6xl lg:text-[72px]">
                Share the work you built—even when the original project can’t be public.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg">
                Choose the routes an interviewer can explore, then share one clean URL. The
                application stays visual and read-only, with credentials hidden from visitors.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-12 items-center gap-3 bg-ink px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
                  href="/create"
                >
                  Create a Showcase <Icon name="arrow" />
                </Link>
                <Link
                  className="inline-flex h-12 items-center gap-2 border border-black/15 bg-white px-5 text-sm font-semibold transition hover:border-black/30 hover:bg-zinc-50"
                  href="/showcase/atlas-console"
                >
                  <Icon name="external" /> View demo
                </Link>
              </div>
            </div>

            <div className="relative lg:pl-6" aria-label="Showcase runtime preview">
              <div className="absolute -left-6 -top-6 h-24 w-24 bg-signal" />
              <div className="relative border border-black/15 bg-[#111310] p-2 shadow-[16px_16px_0_0_rgba(24,26,23,0.08)]">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 text-[10px] text-zinc-500">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-zinc-700" />
                    <span className="h-2 w-2 rounded-full bg-zinc-700" />
                    <span className="h-2 w-2 rounded-full bg-zinc-700" />
                  </div>
                  <span className="font-mono">runtime.showcase.app</span>
                  <Icon className="h-3.5 w-3.5" name="shield" />
                </div>
                <div className="grid min-h-[390px] place-items-center px-6 py-10">
                  <div className="w-full max-w-sm">
                    <div className="mb-7 flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center bg-signal text-black">
                        <Icon name="stack" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">Atlas Console</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">Private application</p>
                      </div>
                    </div>
                    <div className="space-y-2 font-mono text-[11px]">
                      <div className="flex items-center gap-3 border border-white/10 bg-white/[0.03] p-3 text-zinc-300">
                        <Icon className="h-4 w-4 text-emerald-400" name="check" />
                        <span>Configuration loaded</span>
                        <span className="ml-auto text-zinc-600">42ms</span>
                      </div>
                      <div className="flex items-center gap-3 border border-white/10 bg-white/[0.03] p-3 text-zinc-300">
                        <Icon className="h-4 w-4 text-emerald-400" name="check" />
                        <span>Authentication verified</span>
                        <span className="ml-auto text-zinc-600">secure</span>
                      </div>
                      <div className="flex items-center gap-3 border border-signal/30 bg-signal/[0.06] p-3 text-white">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
                        <span>Runtime ready</span>
                        <span className="ml-auto text-signal">live</span>
                      </div>
                    </div>
                    <div className="mt-7 flex items-center gap-2 text-[11px] text-zinc-500">
                      <Icon className="h-3.5 w-3.5" name="globe" />
                      showcase.app/devansh/atlas-console
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28" id="workflow">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              How it works
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              A direct path from private build to public proof.
            </h2>
          </div>
          <div className="grid border-l border-t border-black/10 md:grid-cols-3">
            {[
              {
                n: "01",
                icon: "terminal" as const,
                title: "Private project",
                copy: "Connect the application URL and provide the private account used to prepare it.",
              },
              {
                n: "02",
                icon: "shield" as const,
                title: "Configured routes",
                copy: "Choose each page explicitly and add the context an interviewer should notice.",
              },
              {
                n: "03",
                icon: "globe" as const,
                title: "Shareable URL",
                copy: "Share a read-only viewer where your sidebar is the only navigation surface.",
              },
            ].map((item) => (
              <article
                className="group min-h-64 border-b border-r border-black/10 bg-white p-7 transition hover:bg-signal/10"
                key={item.n}
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[11px] text-zinc-400">{item.n}</span>
                  <Icon
                    className="h-5 w-5 text-zinc-500 transition group-hover:text-black"
                    name={item.icon}
                  />
                </div>
                <h3 className="mt-20 text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-600">{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-black/10 bg-white" id="security">
          <div className="mx-auto grid max-w-7xl md:grid-cols-3">
            {features.map((feature) => (
              <article
                className="border-b border-black/10 p-8 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                key={feature.label}
              >
                <Icon className="mb-8 h-5 w-5" name={feature.icon} />
                <h3 className="text-sm font-semibold">{feature.label}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[#111310] px-5 py-20 text-white sm:px-8 sm:py-24">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-signal">
                Ready when your work is
              </p>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Give private work a public moment.
              </h2>
            </div>
            <Link
              className="inline-flex h-12 items-center gap-3 bg-signal px-5 text-sm font-semibold text-black transition hover:bg-white"
              href="/create"
            >
              Create a Showcase <Icon name="arrow" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
