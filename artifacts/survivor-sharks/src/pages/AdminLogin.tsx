import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, AlertCircle } from "lucide-react";

export default function AdminLogin() {
  const { login, isAuthenticated } = useAdminAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    setLocation("/admin/dashboard");
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      setLocation("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
              <Shield className="w-7 h-7 text-destructive" />
            </div>
          </div>
          <h1 className="font-bebas text-4xl tracking-widest text-foreground">ADMIN ACCESS</h1>
          <p className="text-muted-foreground text-sm mt-1">Survivor Sharks Control Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4 shadow-lg">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs uppercase tracking-wider text-muted-foreground">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bebas tracking-widest text-base"
            >
              {loading ? "Authenticating…" : "Sign In"}
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          Sessions expire after 2 hours of inactivity
        </p>
      </div>
    </div>
  );
}
