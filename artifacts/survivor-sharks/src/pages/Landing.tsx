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
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2 md:mb-4 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            The 2026 Season is Here
          </div>

          {/* Title + Logo — sports poster composite */}
          {/* Extra py gives the absolute logo room to extend above/below the text bounds */}
          <div className="relative flex flex-col items-center leading-none py-[38px] md:py-[44px]">

            {/* SURVIVOR — z-20: sits visually in front of the logo */}
            <span
              className="relative z-20 whitespace-nowrap"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontStyle: "italic",
                fontSize: "clamp(1.2rem, 5.5vw, min(5.2rem, 7vh))",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.93)",
                textShadow: "0 0 30px rgba(30,144,255,0.22), 0 2px 0 rgba(0,0,0,0.6)",
              }}
            >
              SURVIVOR
            </span>

            {/* SHARKS — z-0: logo sits in front of this word */}
            <span
              className="relative z-0 whitespace-nowrap"
              style={{
                fontFamily: "'Black Ops One', cursive",
                fontWeight: 400,
                fontSize: "clamp(2rem, 9vw, min(8.5rem, 12vh))",
                letterSpacing: "0.03em",
                lineHeight: 0.95,
                color: "white",
                textShadow: "0 0 60px rgba(30,144,255,0.3), 0 3px 0 rgba(0,0,0,0.7)",
              }}
            >
              SHARKS
            </span>

            {/* Logo — z-10: bursting through the title */}
            <img
              src="/logo.png"
              alt="Survivor Sharks"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 object-contain pointer-events-none
                         w-[160px] md:w-[min(270px,30vh)]
                         drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)] drop-shadow-[0_0_40px_rgba(30,144,255,0.75)]"
            />
          </div>

          {/* Tagline */}
          <p className="text-xs font-semibold tracking-[0.32em] uppercase mb-3 md:mb-5" style={{ color: "rgba(148,168,210,0.85)" }}>
            ELITE POOLS. RUTHLESS COMPETITION.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3 pb-4 md:pb-6">
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
        <section className="px-6 py-2 border-t border-white/5">
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
        <div className="px-6 py-1.5">
          <AdSlot />
        </div>

        {/* ── Stats strip ────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-10 py-2 border-t border-white/5">
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
