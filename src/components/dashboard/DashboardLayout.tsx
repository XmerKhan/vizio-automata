import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signOut, useSession } from "@/lib/auth";
import {
  LayoutDashboard, ListChecks, Film, Chrome, Settings, Shield,
  Sparkles, LogOut, Loader2, CreditCard, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/workspace", label: "Workspace", icon: Play },
  { to: "/dashboard/queue", label: "Queue", icon: ListChecks },
  { to: "/dashboard/library", label: "Library", icon: Film },
  { to: "/dashboard/extension", label: "Extension", icon: Chrome },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardLayout() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!session) return;
    supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (loading || !session) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-purple-400" /></div>;
  }

  const allItems = isAdmin ? [...items, { to: "/dashboard/admin", label: "Admin", icon: Shield }] : items;

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/5 bg-sidebar">
        <Link to="/" className="px-6 py-5 flex items-center gap-2 font-display font-bold text-lg">
          <span className="size-8 rounded-lg btn-gradient grid place-items-center">
            <Sparkles className="size-4 text-white" />
          </span>
          <span className="gradient-text">Auto Seedance</span>
        </Link>
        <nav className="flex-1 px-3 space-y-1">
          {allItems.map((it) => {
            const active = path === it.to || (it.to !== "/dashboard" && path.startsWith(it.to));
            return (
              <Link key={it.to} to={it.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active ? "btn-gradient text-white" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}>
                <it.icon className="size-4" /> {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/5">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{session.user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
