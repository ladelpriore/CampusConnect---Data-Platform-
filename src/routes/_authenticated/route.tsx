import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Database, Upload, ShieldCheck, GitBranch, Sparkles, ScrollText, LogOut, Menu, Github,
} from "lucide-react";
import { GITHUB_REPO_URL } from "@/lib/campus";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/sources", label: "Data Sources", icon: Database },
  { to: "/import", label: "Import & Mapping", icon: Upload },
  { to: "/quality", label: "Data Quality", icon: ShieldCheck },
  { to: "/workflows", label: "Workflows", icon: GitBranch },
  { to: "/assistant", label: "Admissions Assistant", icon: Sparkles },
  { to: "/audit", label: "Audit Log", icon: ScrollText },
] as const;

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-surface flex">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-navy text-navy-foreground flex-col transition-transform lg:relative lg:translate-x-0 lg:flex",
        open ? "flex translate-x-0" : "flex -translate-x-full lg:translate-x-0"
      )}>
        <div className="px-5 h-14 flex items-center gap-2 border-b border-white/10">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-orange text-orange-foreground">
            <Database className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">CampusContext</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
            return (
              <Link key={to} to={to} onClick={() => setOpen(false)} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active ? "bg-white/10 text-navy-foreground" : "text-navy-foreground/70 hover:bg-white/5 hover:text-navy-foreground"
              )}>
                <Icon className={cn("h-4 w-4", active && "text-orange")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3 space-y-2">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-navy-foreground/70 hover:bg-white/5 hover:text-navy-foreground transition-colors"
          >
            <Github className="h-4 w-4" /> View source on GitHub
          </a>
          <div className="px-2 text-xs">
            <div className="text-navy-foreground/50">Signed in as</div>
            <div className="truncate text-navy-foreground/90 font-medium">{user.email}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-navy-foreground/80 hover:bg-white/5 hover:text-navy-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 bg-navy text-navy-foreground flex items-center px-3 gap-3 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-1.5 rounded-md hover:bg-white/10">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">CampusContext</span>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
