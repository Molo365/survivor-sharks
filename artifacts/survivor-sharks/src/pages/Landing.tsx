import { Link, Redirect } from "wouter";
import { Shield, Trophy, Users, UserPlus, Target, Medal, Grid3x3, Star, BarChart3, Timer } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import underwaterBg from "@assets/Underwater_1781045385578.jpg";

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setDiff(Math.max(0, target.getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1_000);
  return { days, hours, mins, secs };
}

export default function Landing() {
  const { user, isLoading } = useAuth();
  const nflKickoff = new Date("2026-09-09T20:20:00-04:00");
  const countdown = useCountdown(nflKickoff);

  if (!isLoading && user) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* ── Fixed background: underwater image + dark overlay ───────── */}
      <div
        className="fixed inset-0 -z-20"
        style={{
          backgroundImage: `url(${underwaterBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      />
      {/* Dark overlay so text stays readable */}
      <div className="fixed inset-0 -z-10 bg-[#060810]/82" />
      {/* Subtle blue radial */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_45%_at_50%_30%,rgba(20,80,200,0.22),transparent)]" />

      <NavBar />

      <main className="flex-1 flex flex-col">

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="flex flex-col items-center justify-center text-center px-4 pt-4 pb-2 relative" style={{ minHeight: "calc(100dvh - 56px)" }}>
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent top-1/2" />

          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-3 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            The 2026 Season is Here
          </div>

          <div className="relative w-full max-w-[900px] mb-1">
            <img
              src="/hero-banner-clean.jpg"
              alt="Survivor Sharks"
              className="w-full object-contain block"
              style={{ maxHeight: "min(240px, 32vh)" }}
            />
            <div className="absolute inset-y-0 left-0 w-[12%] pointer-events-none"
              style={{ background: "linear-gradient(to right, rgba(6,8,16,0.82), transparent)" }} />
            <div className="absolute inset-y-0 right-0 w-[12%] pointer-events-none"
              style={{ background: "linear-gradient(to left, rgba(6,8,16,0.82), transparent)" }} />
            <div className="absolute inset-x-0 bottom-0 h-[18%] pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(6,8,16,0.82), transparent)" }} />
          </div>

          <p className="text-xs font-semibold tracking-[0.32em] uppercase mb-4" style={{ color: "rgba(148,168,210,0.85)" }}>
            ELITE POOLS. RUTHLESS COMPETITION.
          </p>

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

        {/* ── Feature cards ──────────────────────────────────────────── */}
        <section className="px-6 py-4 border-t border-white/5">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: Shield, color: "primary", title: "Automated Results", desc: "Games graded automatically — no spreadsheets." },
              { icon: Trophy, color: "accent",   title: "Multi-Sport",       desc: "NFL, NBA, MLB, NHL, and soccer in one place." },
              { icon: Users,  color: "primary",  title: "Private & Secure",  desc: "Invite-only pools with full commissioner tools." },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex items-center gap-3 p-3 rounded-lg bg-black/30 border border-white/[0.08] backdrop-blur-sm">
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

        {/* ── Ad slot ────────────────────────────────────────────────── */}
        <div className="px-6 pb-3">
          <AdSlot />
        </div>

        {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
        <section className="px-6 py-5 border-t border-white/5">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-bebas text-2xl md:text-3xl tracking-widest text-center text-foreground mb-5">
              HOW IT WORKS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { step: "01", icon: UserPlus, title: "Create or Join a Pool", desc: "Commissioner creates a pool and shares the invite link. Your crew signs up and you're in." },
                { step: "02", icon: Target,   title: "Make Your Picks",       desc: "Pick game winners, predict standings, or assign confidence points." },
                { step: "03", icon: Medal,    title: "Win the Prize Pot",     desc: "Most correct picks at the end wins. Your crew decides the stakes." },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="relative flex flex-col items-center text-center p-5 rounded-xl bg-black/30 border border-white/[0.07] backdrop-blur-sm">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-[10px] font-bold tracking-widest text-primary uppercase">
                    Step {step}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 mt-1">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-bebas text-lg tracking-wider text-foreground mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground/70 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── POOL TYPES ──────────────────────────────────────────────── */}
        <section className="px-6 py-5 border-t border-white/5">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-bebas text-2xl md:text-3xl tracking-widest text-center text-foreground mb-1">
              POOL TYPES
            </h2>
            <p className="text-center text-xs text-muted-foreground/55 mb-4">Pick the format that fits your crew.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Shield,   label: "Survivor",           color: "hsl(211,100%,58%)", bg: "rgba(30,144,255,0.07)",  border: "rgba(30,144,255,0.16)", desc: "One pick per week. Pick wrong and you're out. Last one standing wins." },
                { icon: BarChart3, label: "Pick-Ems",          color: "hsl(38,100%,58%)",  bg: "rgba(255,160,20,0.07)",  border: "rgba(255,160,20,0.16)", desc: "Pick every game each week. Most correct picks at season's end takes it." },
                { icon: Star,     label: "Confidence Picks",   color: "hsl(280,80%,65%)",  bg: "rgba(160,80,220,0.07)",  border: "rgba(160,80,220,0.16)", desc: "Assign confidence points to each pick — bigger number means you're more sure." },
                { icon: Grid3x3,  label: "Division Predictor", color: "hsl(160,70%,50%)",  bg: "rgba(40,200,120,0.07)",  border: "rgba(40,200,120,0.16)", desc: "Predict how every group or division finishes. Points for every correct placement." },
              ].map(({ icon: Icon, label, color, bg, border, desc }) => (
                <div key={label} className="flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm" style={{ background: bg, borderColor: border }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: bg, border: `1px solid ${border}` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <h3 className="font-bebas text-base tracking-wider mb-0.5" style={{ color }}>{label}</h3>
                    <p className="text-xs text-muted-foreground/70 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FREE TO PLAY + NFL COUNTDOWN (side by side on lg) ────────── */}
        <section className="px-6 py-5 border-t border-white/5">
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Free to play */}
            <div
              className="rounded-xl px-6 py-6 border relative overflow-hidden flex flex-col items-center text-center backdrop-blur-sm"
              style={{
                background: "linear-gradient(135deg, rgba(30,144,255,0.10), rgba(20,60,160,0.06))",
                borderColor: "rgba(30,144,255,0.18)",
              }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.2em] text-primary uppercase mb-2">
                  <Trophy className="w-3 h-3" />
                  100% Free to Play
                </div>
                <h2 className="font-bebas text-3xl md:text-4xl tracking-widest text-foreground mb-2 leading-tight">
                  NO ENTRY FEES. EVER.
                </h2>
                <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                  Prize pots are funded by your crew — we just run the pool. The only currency here is{" "}
                  <span className="text-foreground/90 font-semibold">bragging rights</span>.
                </p>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-md px-7 py-2 text-sm font-bold tracking-widest text-white uppercase transition-all hover:scale-[1.03]"
                  style={{
                    background: "linear-gradient(135deg, hsl(211,100%,48%), hsl(211,100%,38%))",
                    boxShadow: "0 0 16px rgba(30,144,255,0.35), 0 4px 8px rgba(0,0,0,0.35)",
                  }}
                >
                  Start Your Free Pool
                </Link>
              </div>
            </div>

            {/* NFL Countdown */}
            <div
              className="rounded-xl px-6 py-6 border flex flex-col items-center text-center backdrop-blur-sm"
              style={{ background: "rgba(0,0,0,0.28)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Timer className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold tracking-[0.25em] text-primary uppercase">NFL Season Kickoff</span>
              </div>
              <h2 className="font-bebas text-2xl tracking-widest text-foreground mb-4">
                SEPTEMBER 9, 2026
              </h2>
              <div className="flex items-center gap-2 md:gap-3 mb-4">
                {[
                  { val: countdown.days,  label: "Days" },
                  { val: countdown.hours, label: "Hrs" },
                  { val: countdown.mins,  label: "Min" },
                  { val: countdown.secs,  label: "Sec" },
                ].map(({ val, label }, i) => (
                  <div key={label} className="flex items-center gap-2 md:gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-14 h-14 rounded-lg flex items-center justify-center border"
                        style={{ background: "rgba(30,144,255,0.09)", borderColor: "rgba(30,144,255,0.20)" }}
                      >
                        <span className="font-bebas text-2xl tracking-wider text-primary leading-none">
                          {String(val).padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[9px] tracking-[0.18em] text-muted-foreground/45 uppercase mt-1">{label}</span>
                    </div>
                    {i < 3 && <span className="font-bebas text-xl text-primary/35 mb-3">:</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/50 mb-3">
                Set up your pool now — your crew needs to be ready for Week 1.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-md border px-6 py-2 text-xs font-bold tracking-widest uppercase transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5"
                style={{ borderColor: "rgba(30,144,255,0.28)", color: "rgba(180,200,230,0.85)" }}
              >
                Get Ready for Week 1
              </Link>
            </div>

          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="py-4 border-t border-white/5 text-center text-[10px] tracking-wider text-muted-foreground/25 uppercase">
          © 2026 Survivor Sharks — Free to play. Always.
        </div>

      </main>
    </div>
  );
}
