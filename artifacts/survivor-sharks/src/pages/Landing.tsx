import { Link } from "wouter";
import { Shield, Trophy, Users } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { NavBar } from "@/components/NavBar";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <NavBar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative flex items-center justify-center overflow-hidden border-b border-white/5" style={{ minHeight: "calc(100vh - 64px)" }}>

          {/* Deep background layers */}
          <div className="absolute inset-0 bg-[#060810]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(20,80,200,0.18),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_50%_42%,rgba(30,144,255,0.10),transparent)]" />

          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(rgba(30,144,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(30,144,255,0.8) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />

          {/* Horizontal scan line */}
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" style={{ top: "42%" }} />

          <div className="relative z-10 flex flex-col items-center text-center px-4 py-24 max-w-4xl mx-auto">

            {/* Season badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-primary uppercase mb-10 backdrop-blur-sm shadow-[0_0_20px_rgba(30,144,255,0.15)]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              The 2026 Season is Here
            </div>

            {/* Logo with glow orb */}
            <div className="relative mb-8 flex items-center justify-center">
              <div className="absolute rounded-full bg-primary/20 blur-3xl" style={{ width: 260, height: 260 }} />
              <div className="absolute rounded-full bg-primary/10 blur-2xl" style={{ width: 200, height: 200 }} />
              <div className="absolute rounded-full border border-primary/20" style={{ width: 220, height: 220 }} />
              <img
                src="/logo.png"
                alt="Survivor Sharks"
                className="relative z-10 object-contain drop-shadow-[0_0_40px_rgba(30,144,255,0.7)]"
                style={{ width: 200, height: 200 }}
              />
            </div>

            {/* Title */}
            <h1
              className="font-bebas text-foreground leading-none tracking-wide"
              style={{
                fontSize: "clamp(4rem, 14vw, 9rem)",
                textShadow: "0 0 80px rgba(30,144,255,0.25), 0 2px 0 rgba(0,0,0,0.5)",
                letterSpacing: "0.04em",
              }}
            >
              SURVIVOR SHARKS
            </h1>

            {/* Divider */}
            <div className="flex items-center gap-4 my-5 w-full max-w-sm">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-primary/40" />
              <div className="h-1 w-1 rounded-full bg-primary/60" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary/80" />
              <div className="h-1 w-1 rounded-full bg-primary/60" />
              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-primary/40" />
            </div>

            {/* Tagline */}
            <p
              className="text-sm md:text-base font-semibold tracking-[0.35em] uppercase mb-10"
              style={{ color: "rgba(148,168,210,0.85)" }}
            >
              ELITE POOLS. RUTHLESS COMPETITION.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="/register"
                className="relative inline-flex h-13 items-center justify-center rounded-md px-10 text-sm font-bold tracking-widest text-white uppercase overflow-hidden transition-all duration-200 hover:scale-[1.03] focus-visible:outline-none"
                style={{
                  background: "linear-gradient(135deg, hsl(211,100%,48%), hsl(211,100%,38%))",
                  boxShadow: "0 0 24px rgba(30,144,255,0.5), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
                  paddingTop: "0.85rem",
                  paddingBottom: "0.85rem",
                }}
                data-testid="link-get-started-hero"
              >
                Get Started
              </Link>
              <Link
                href="/login"
                className="inline-flex h-13 items-center justify-center rounded-md border px-10 text-sm font-bold tracking-widest uppercase transition-all duration-200 hover:border-primary/60 hover:text-primary hover:bg-primary/5 focus-visible:outline-none"
                style={{
                  borderColor: "rgba(30,144,255,0.3)",
                  color: "rgba(180,200,230,0.9)",
                  paddingTop: "0.85rem",
                  paddingBottom: "0.85rem",
                }}
                data-testid="link-sign-in-hero"
              >
                Sign In
              </Link>
            </div>

            {/* Stats strip */}
            <div className="mt-16 flex items-center gap-8 text-center">
              {[["10K+", "MEMBERS"], ["500+", "POOLS RUN"], ["5", "SPORTS"]].map(([val, label]) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="font-bebas text-2xl text-primary tracking-wider">{val}</span>
                  <span className="text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ad slot */}
        <div className="container px-4 py-8">
          <AdSlot />
        </div>

        {/* Features */}
        <section className="py-20 bg-card/20">
          <div className="container px-4 md:px-6">
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="flex flex-col items-center text-center p-6 shark-card rounded-lg">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bebas text-2xl mb-2">Automated Results</h3>
                <p className="text-muted-foreground">Games are graded automatically. No manual tracking or spreadsheets required.</p>
              </div>

              <div className="flex flex-col items-center text-center p-6 shark-card rounded-lg">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-4">
                  <Trophy className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-bebas text-2xl mb-2">Multi-Sport</h3>
                <p className="text-muted-foreground">Run pools for NFL, NBA, MLB, NHL, and soccer. One platform for all your leagues.</p>
              </div>

              <div className="flex flex-col items-center text-center p-6 shark-card rounded-lg">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bebas text-2xl mb-2">Private & Secure</h3>
                <p className="text-muted-foreground">Invite-only private pools with powerful commissioner tools to manage your members.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 bg-background">
        <div className="container text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} Survivor Sharks. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
