import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

const STORAGE_KEY = "admin_token";
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AdminAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const verify = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin-auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      verify(stored).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [verify]);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/admin-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Login failed");
    }
    const { token: t } = await res.json() as { token: string };
    localStorage.setItem(STORAGE_KEY, t);
    setToken(t);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, token, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
