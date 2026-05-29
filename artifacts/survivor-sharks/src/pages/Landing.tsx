import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, Trophy, Users } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { NavBar } from "@/components/NavBar";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <NavBar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(30,144,255,0.15),rgba(10,14,26,1))]"></div>
          
          <div className="container relative z-10 px-4 md:px-6">
            <div className="text-center max-w-3xl mx-auto space-y-6">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4 backdrop-blur-sm">
                <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                The 2024 Season is Here
              </div>
              <h1 className="font-bebas text-5xl md:text-7xl lg:text-8xl tracking-tight text-foreground drop-shadow-sm">
                SURVIVOR SHARKS
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground font-medium tracking-wide">
                ELITE POOLS. RUTHLESS COMPETITION.
              </p>
              
              <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
                <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" data-testid="link-get-started-hero">
                  Get Started
                </Link>
                <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-card px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" data-testid="link-sign-in-hero">
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="container px-4 py-8">
          <AdSlot />
        </div>

        {/* Features */}
        <section className="py-20 bg-card/30">
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
