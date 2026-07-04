import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/AdminAuthContext";
import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import CreatePool from "@/pages/CreatePool";
import JoinPool from "@/pages/JoinPool";
import PoolHome from "@/pages/PoolHome";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminLogin from "@/pages/AdminLogin";
import AdminPanel from "@/pages/AdminPanel";
import ResetPassword from "@/pages/ResetPassword";
import JoinInvite from "@/pages/JoinInvite";
import Picks from "@/pages/Picks";
import Standings from "@/pages/Standings";
import Scores from "@/pages/Scores";

const queryClient = new QueryClient();

const ProtectedRoute = ({ component: Component }: { component: any }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }
  if (!user) return <Redirect to="/" />;
  return <Component />;
};

const AdminRoute = ({ component: Component }: { component: any }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }
  if (!user || user.role !== "admin") return <Redirect to="/dashboard" />;
  return <Component />;
};

const AdminPanelRoute = ({ component: Component }: { component: any }) => {
  const { isAuthenticated, isLoading: adminLoading } = useAdminAuth();
  const { user, isLoading: userLoading } = useAuth();
  if (adminLoading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-destructive"></div>
      </div>
    );
  }
  if (!user || user.role !== "admin") return <Redirect to="/" />;
  if (!isAuthenticated) return <Redirect to="/admin/login" />;
  return <Component />;
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/pools/new">
        {() => <ProtectedRoute component={CreatePool} />}
      </Route>
      <Route path="/pools/join">
        {() => <ProtectedRoute component={JoinPool} />}
      </Route>
      <Route path="/pools/:poolId">
        {() => <ProtectedRoute component={PoolHome} />}
      </Route>
      <Route path="/pools/:poolId/pickem">
        {() => <ProtectedRoute component={PoolHome} />}
      </Route>

      {/* Legacy admin routes (role-based) */}
      <Route path="/admin">
        {() => <AdminRoute component={AdminDashboard} />}
      </Route>
      <Route path="/admin/users">
        {() => <AdminRoute component={AdminUsers} />}
      </Route>

      {/* Standalone admin panel routes — role-gated */}
      <Route path="/admin/login">
        {() => <AdminRoute component={AdminLogin} />}
      </Route>
      <Route path="/admin/dashboard">
        {() => <AdminPanelRoute component={AdminPanel} />}
      </Route>

      <Route path="/join/:inviteCode" component={JoinInvite} />
      <Route path="/reset-password" component={ResetPassword} />

      <Route path="/picks">
        {() => <ProtectedRoute component={Picks} />}
      </Route>
      <Route path="/standings">
        {() => <ProtectedRoute component={Standings} />}
      </Route>
      <Route path="/scores">
        {() => <ProtectedRoute component={Scores} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AdminAuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <DesktopSidebar />
              <div className="pb-16 md:pb-0 md:pl-20">
                <Router />
              </div>
              <BottomNav />
            </AuthProvider>
          </WouterRouter>
        </AdminAuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
