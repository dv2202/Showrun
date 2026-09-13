import Link from "next/link";
import { LandingRuntime } from "@/components/landing-runtime";
import { RevealGrid } from "@/components/reveal-grid";
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
    copy: "See whether each private application session is ready or needs to be refreshed.",
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
      <header className="relative z-30 border-b border-black/10 bg-[#f7f7f5]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-xs font-medium text-zinc-600 md:flex">
            <a className="transition hover:text-black" href="#workflow">
              Workflow
            </a>
            <a className="transition hover:text-black" href="#security">
              Security
            </a>
            <Link className="transition hover:text-black" href="/login?returnTo=%2Fdashboard">
              Dashboard
            </Link>
          </nav>
          <Link
            className="inline-flex h-9 items-center gap-2 bg-ink px-4 text-xs font-semibold text-white transition hover:bg-zinc-700"
            href="/login?returnTo=%2Fdashboard"
          >
            Sign in <Icon className="h-3.5 w-3.5" name="arrow" />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative min-h-[calc(100vh-64px)] border-b border-black/10">
          <div className="landing-grid-drift pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="landing-hero-glow pointer-events-none absolute -right-56 -top-56 h-[520px] w-[520px] rounded-full bg-signal/30 opacity-40 blur-[90px]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-16">
            <div>
              <div className="landing-hero-eyebrow mb-7 inline-flex items-center gap-2 border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Secure showcase infrastructure
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-ink sm:text-6xl lg:text-[72px]">
                <span className="landing-headline-line">
                  <span className="landing-headline-text landing-headline-text-1">
                    Share the work
                  </span>
                </span>
                <span className="landing-headline-line">
                  <span className="landing-headline-text landing-headline-text-2">
                    that can’t be
                  </span>
                </span>
                <span className="landing-headline-line">
                  <span className="landing-headline-text landing-headline-text-3">
                    made public.
                  </span>
                </span>
              </h1>
              <p className="landing-hero-copy mt-7 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg">
                Choose the routes an interviewer can explore, then share one clean URL. The
                application stays visual and read-only, with credentials hidden from visitors.
              </p>
              <div className="landing-hero-actions mt-9 flex flex-wrap gap-3">
                <Link
                  className="group inline-flex h-12 items-center gap-3 bg-ink px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700 hover:shadow-lg"
                  href="/login?returnTo=%2Fcreate"
                >
                  Create a Showcase
                  <Icon
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    name="arrow"
                  />
                </Link>
                <a
                  className="inline-flex h-12 items-center gap-2 border border-black/15 bg-white px-5 text-sm font-semibold transition hover:border-black/30 hover:bg-zinc-50"
                  href="#workflow"
                >
                  How it works <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
            <LandingRuntime />
          </div>
        </section>

        <div className="overflow-hidden border-b border-black/10 bg-signal" aria-hidden="true">
          <div className="landing-ticker flex w-max font-mono text-[10px] font-bold uppercase tracking-[0.11em]">
            {[0, 1].map((group) => (
              <div className="flex" key={group}>
                {[
                  "Credentials stay private",
                  "Configured routes only",
                  "One clean share URL",
                  "Read-only by design",
                ].map((item) => (
                  <span
                    className="flex items-center gap-5 whitespace-nowrap px-6 py-3 after:text-[7px] after:content-['◆']"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28" id="workflow">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              How it works
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              A direct path from private build to public proof.
            </h2>
          </div>
          <RevealGrid className="grid border-l border-t border-black/10 md:grid-cols-3">
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
          </RevealGrid>
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

        <section className="landing-closing relative overflow-hidden bg-[#111310] px-5 py-20 text-white sm:px-8 sm:py-24">
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
              className="group inline-flex h-12 items-center gap-3 bg-signal px-5 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-white"
              href="/login?returnTo=%2Fcreate"
            >
              Create a Showcase
              <Icon
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                name="arrow"
              />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-[#111310] px-5 text-white sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 py-12 sm:grid-cols-2 md:grid-cols-[1.7fr_1fr_1fr] md:gap-12">
            <div className="sm:col-span-2 md:col-span-1">
              <Brand inverse />
              <p className="mt-5 max-w-sm text-xs leading-6 text-zinc-500">
                Secure, presentation-ready views of the private applications you’re proud to have
                built.
              </p>
            </div>
            <div>
              <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                Product
              </p>
              <nav className="grid gap-3 text-xs text-zinc-400">
                <a
                  className="w-fit transition hover:translate-x-0.5 hover:text-white"
                  href="#workflow"
                >
                  Workflow
                </a>
                <a
                  className="w-fit transition hover:translate-x-0.5 hover:text-white"
                  href="#security"
                >
                  Security
                </a>
                <Link
                  className="w-fit transition hover:translate-x-0.5 hover:text-white"
                  href="/login?returnTo=%2Fcreate"
                >
                  Create showcase
                </Link>
              </nav>
            </div>
            <div>
              <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                Account
              </p>
              <nav className="grid gap-3 text-xs text-zinc-400">
                <Link
                  className="w-fit transition hover:translate-x-0.5 hover:text-white"
                  href="/login"
                >
                  Sign in
                </Link>
                <Link
                  className="w-fit transition hover:translate-x-0.5 hover:text-white"
                  href="/login?returnTo=%2Fdashboard"
                >
                  Dashboard
                </Link>
              </nav>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/10 py-5 font-mono text-[9px] uppercase tracking-[0.05em] text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Showcase · Private work, ready to share</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_0_4px_rgba(215,255,100,0.07)]" />
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
