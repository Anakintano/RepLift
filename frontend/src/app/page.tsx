"use client";

/**
 * Marketing landing — minimal single-column pattern (design-system.md):
 * hero, three benefits, product peek, pricing, footer. One primary CTA.
 */

import Link from "next/link";
import { ArrowRight, CloudOff, Search, ChartNoAxesCombined, Check, Flame } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/use-auth";
import { HeroImage } from "@/components/marketing/hero-image";

const REVEAL = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
} as const;
const EASE = [0.16, 1, 0.3, 1] as const;

const BENEFITS = [
  {
    icon: CloudOff,
    title: "Never lose a log",
    body: "Log meals in the gym basement or on a flight. Everything saves on-device instantly and syncs itself when you're back online — no duplicates, no lost entries.",
  },
  {
    icon: Search,
    title: "Search that gets you",
    body: "Typo-tolerant food search that learns what you actually eat. Your usual breakfast is always two taps away — or just type “2 eggs and toast” and let AI parse it.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Progress you can trust",
    body: "Deterministic nutrition math, honest weekly reports, and trends built from your real data — not vibes. Export everything, anytime. It's your data.",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    tagline: "Everything you need to track seriously.",
    features: ["Unlimited food & exercise logging", "Offline-first sync across devices", "Recipes & saved meals", "Weekly reports", "Full data export"],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$4",
    per: "/month",
    tagline: "For people chasing a number.",
    features: ["Everything in Free", "AI natural-language logging", "Micronutrient tracking", "Advanced trends & projections", "Priority support"],
    cta: "Start 14-day trial",
    highlighted: true,
  },
];

export default function LandingPage() {
  const { data: user } = useUser();
  const appHref = user ? "/dashboard" : "/signup";

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-dvh flex flex-col">
      {/* Nav */}
      <header className="glass sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Logo size={32} />
          <nav className="flex items-center gap-2" aria-label="Site">
            {user ? (
              <Button asChild>
                <Link href="/dashboard">
                  Open app <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative px-4 md:px-6 pt-24 pb-20 text-center overflow-hidden">
          <HeroImage />
          <div className="max-w-2xl mx-auto">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 backdrop-blur px-3 py-1 text-xs font-semibold text-white/80 mb-6">
              <Flame className="size-3.5 text-primary" aria-hidden /> Nutrition tracking, engineered properly
            </p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5 text-balance text-white">
              Eat with intent.
              <br />
              <span className="text-primary">Lift</span> your limits.
            </h1>
            <p className="text-lg text-white/75 mb-8 max-w-xl mx-auto">
              RepLift tracks your food, workouts, and progress with an offline-first engine that never loses a log —
              and search smart enough to keep up with real life.
            </p>
            <motion.div className="inline-block" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15, ease: "easeOut" }}>
              <Button size="lg" className="h-12 px-8 text-base" asChild>
                <Link href={appHref}>
                  Start tracking free <ArrowRight className="size-4.5" aria-hidden />
                </Link>
              </Button>
            </motion.div>
            <p className="text-xs text-white/60 mt-3">No credit card. Your data stays yours.</p>
          </div>
        </section>

        {/* Benefits */}
        <section className="px-4 md:px-6 py-16" aria-label="Why RepLift">
          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
            {BENEFITS.map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                {...REVEAL}
                transition={{ duration: 0.36, delay: i * 0.09, ease: EASE }}
                className="card-hover rounded-2xl border bg-card p-6"
              >
                <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="size-5.5 text-primary" aria-hidden />
                </div>
                <h2 className="font-bold text-lg mb-2">{title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Product peek */}
        <section className="px-4 md:px-6 pb-16" aria-label="Product preview">
          <div className="max-w-4xl mx-auto rounded-3xl border bg-gradient-to-br from-slate-950 to-slate-900 p-8 md:p-12 text-center overflow-hidden grain-overlay">
            <div className="max-w-md mx-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 text-left">
              <div className="flex items-center justify-between mb-4">
                <p className="text-white/90 font-semibold text-sm">Today</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                  <CloudOff className="size-3" aria-hidden /> Offline — 3 queued
                </span>
              </div>
              <div className="flex items-center gap-5">
                <div className="relative size-24 shrink-0" aria-hidden>
                  <svg viewBox="0 0 96 96" className="size-24">
                    <circle cx="48" cy="48" r="41" fill="none" strokeWidth="7" className="stroke-white/10" />
                    <circle
                      cx="48" cy="48" r="41" fill="none" strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 41} strokeDashoffset={2 * Math.PI * 41 * 0.35}
                      transform="rotate(-90 48 48)" stroke="#fb923c"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-white font-extrabold tnum leading-none">742</span>
                    <span className="text-white/50 text-[10px]">kcal left</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5">
                  {[
                    ["Protein", "96 / 150 g", "64%", "#60a5fa"],
                    ["Carbs", "148 / 220 g", "67%", "#fbbf24"],
                    ["Fat", "38 / 61 g", "62%", "#a78bfa"],
                  ].map(([label, val, w, color]) => (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] text-white/70 mb-1">
                        <span>{label}</span>
                        <span className="tnum">{val}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: w, backgroundColor: color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-white/60 text-sm mt-6 max-w-md mx-auto">
              Logged offline on the subway. Synced before you reached the office. That's the whole point.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-4 md:px-6 pb-20" aria-label="Pricing">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-center mb-3">Simple pricing</h2>
            <p className="text-muted-foreground text-center mb-10">Free is genuinely useful. Pro is for the obsessed.</p>
            <div className="grid md:grid-cols-2 gap-5">
              {PRICING.map((tier, i) => (
                <motion.div
                  key={tier.name}
                  {...REVEAL}
                  transition={{ duration: 0.36, delay: i * 0.09, ease: EASE }}
                  className={
                    tier.highlighted
                      ? "card-hover rounded-2xl border-2 border-primary bg-card p-6 relative shadow-lg shadow-primary/10"
                      : "card-hover rounded-2xl border bg-card p-6"
                  }
                >
                  {tier.highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 py-1">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-bold text-lg">{tier.name}</h3>
                  <p className="mt-1 mb-1">
                    <span className="text-3xl font-extrabold tnum">{tier.price}</span>
                    {tier.per && <span className="text-muted-foreground text-sm">{tier.per}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground mb-5">{tier.tagline}</p>
                  <ul className="space-y-2.5 mb-6">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="size-4 text-success shrink-0 mt-0.5" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={tier.highlighted ? "default" : "outline"} asChild>
                    <Link href={appHref}>{tier.cta}</Link>
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t px-4 md:px-6 py-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size={26} />
          <p className="text-xs text-muted-foreground text-center">
            RepLift is a portfolio project. Nutrition figures are estimates, not medical advice.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Log in</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
