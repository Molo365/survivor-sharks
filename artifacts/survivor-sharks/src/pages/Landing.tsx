import { Link, Redirect } from "wouter";
import { Shield, Trophy, Users } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/contexts/AuthContext";

export default function Landing() {
  const { user, isLoading } = useAuth();

  if (!isLoading && user) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-[100dvh] md:h-[100dvh] flex flex-col md:overflow-hidden">
      {/* Background layers — fixed behind everything */}
      <div className="fixed inset-0 bg-[#060810] -z-10" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,rgba(20,80,200,0.20),transparent)] -z-10" />
      <div className="fixed inset-0 -z-10 opacity-[0.035]" style={{
        backgroundImage: `linear-gradient(rgba(30,144,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(30,144,255,0.8) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      <NavBar />

      <main className="flex-1 flex flex-col min-h-0">

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="flex-1 flex flex-col items-center justify-center text-center px-4 min-h-0 relative">
          {/* Scan line */}
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent top-1/2" />

          {/* Season badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-4 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            The 2026 Season is Here
          </div>

          {/* Logo */}
          <div className="relative mb-3 flex items-center justify-center">
            <div className="absolute rounded-full bg-primary/20 blur-2xl" style={{ width: 140, height: 140 }} />
            <div className="absolute rounded-full bg-primary/10 blur-xl" style={{ width: 100, height: 100 }} />
            <div className="absolute rounded-full border border-primary/20" style={{ width: 118, height: 118 }} />
            <img
              src="/logo.png"
              alt="Survivor Sharks"
              className="relative z-10 object-contain drop-shadow-[0_0_30px_rgba(30,144,255,0.7)]"
              style={{ width: 96, height: 96 }}
            />
          </div>

          {/* Title */}
          <h1
            className="font-bebas text-foreground leading-none tracking-wide whitespace-nowrap"
            style={{
              fontSize: "clamp(1.85rem, 10vw, 7.5rem)",
              textShadow: "0 0 60px rgba(30,144,255,0.22), 0 2px 0 rgba(0,0,0,0.5)",
              letterSpacing: "0.04em",
            }}
          >
            SURVIVOR SHARKS
          </h1>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2.5 w-full max-w-xs">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-primary/40" />
            <div className="h-1 w-1 rounded-full bg-primary/60" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/80" />
            <div className="h-1 w-1 rounded-full bg-primary/60" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-primary/40" />
          </div>

          {/* Tagline */}
          <p className="text-xs font-semibold tracking-[0.32em] uppercase mb-5" style={{ color: "rgba(148,168,210,0.85)" }}>
            ELITE POOLS. RUTHLESS COMPETITION.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md px-8 py-2.5 text-sm font-bold tracking-widest text-white uppercase transition-all hover:scale-[1.03] focus-visible:outline-none"
              style={{
                background: "linear-gradient(135deg, hsl(211,100%,48%), hsl(211,100%,38%))",
                boxShadow: "0 0 20px rgba(30,144,255,0.45), 0 4px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              data-testid="link-get-started-hero"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border px-8 py-2.5 text-sm font-bold tracking-widest uppercase transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5 focus-visible:outline-none"
              style={{ borderColor: "rgba(30,144,255,0.3)", color: "rgba(180,200,230,0.9)" }}
              data-testid="link-sign-in-hero"
            >
              Sign In
            </Link>
          </div>
        </section>

        {/* ── Feature cards — compact horizontal row ─────────────────── */}
        <section className="px-6 py-3 border-t border-white/5">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: Shield, color: "primary", title: "Automated Results", desc: "Games graded automatically — no spreadsheets." },
              { icon: Trophy, color: "accent",   title: "Multi-Sport",       desc: "NFL, NBA, MLB, NHL, and soccer in one place." },
              { icon: Users,  color: "primary",  title: "Private & Secure",  desc: "Invite-only pools with full commissioner tools." },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex items-center gap-3 p-3 rounded-lg bg-card/30 border border-white/[0.06] backdrop-blur-sm">
                <div className={`w-8 h-8 rounded-full bg-${color}/15 border border-${color}/20 flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 text-${color}`} />
                </div>
                <div className="text-left min-w-0">
                  <h3 className="font-bebas text-base tracking-wide text-foreground/90 leading-tight">{title}</h3>
                  <p className="text-[11px] text-muted-foreground/65 leading-tight mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Sportsbook partner banner ───────────────────────────────── */}
        <div className="px-6 py-2">
          <AdSlot />
        </div>

        {/* ── Stats strip ────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-10 py-3 border-t border-white/5">
          {[["10K+", "Members"], ["500+", "Pools Run"], ["5", "Sports"]].map(([val, label]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="font-bebas text-xl text-primary tracking-wider leading-none">{val}</span>
              <span className="text-[10px] tracking-[0.18em] text-muted-foreground/55 uppercase leading-none">{label}</span>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
