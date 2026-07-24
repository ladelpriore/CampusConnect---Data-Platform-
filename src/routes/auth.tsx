import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Database } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — CampusContext" },
      { name: "description", content: "Sign in to the CampusContext admissions data platform." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  async function demoUser() {
    setLoading(true);
    const demoEmail = `demo+${Math.random().toString(36).slice(2, 8)}@campuscontext.app`;
    const demoPass = "Demo-CampusContext-2026!";
    try {
      const { error } = await supabase.auth.signUp({
        email: demoEmail, password: demoPass,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      // Try immediate sign-in in case email confirmation is disabled
      await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPass });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-navy text-navy-foreground p-12">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-orange text-orange-foreground">
            <Database className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CampusContext</span>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Agent-ready admissions data, without the plumbing.</h1>
          <p className="text-sm text-navy-foreground/70 leading-relaxed">
            Unify data from your SIS, CRM and marketing tools. Resolve duplicates and missing fields. Give AI assistants controlled, auditable access to trusted applicant context.
          </p>
          <ul className="space-y-2 text-sm text-navy-foreground/80">
            <li>• Standardized applicant profiles</li>
            <li>• Data-quality review queues</li>
            <li>• Human-in-the-loop workflow automation</li>
            <li>• Auditable AI assistant tools</li>
          </ul>
        </div>
        <p className="text-xs text-navy-foreground/50">Prototype — synthetic data only. Not for production use.</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-navy text-navy-foreground">
              <Database className="h-4 w-4" />
            </div>
            <span className="font-semibold">CampusContext</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">{mode === "signin" ? "Sign in" : "Create account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enrollment operations console</p>

          <form onSubmit={handle} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-navy hover:bg-navy-muted text-navy-foreground">
              {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={demoUser} disabled={loading}>
            Continue as demo user
          </Button>

          <p className="mt-6 text-sm text-muted-foreground text-center">
            {mode === "signin" ? "Need an account?" : "Have an account?"}{" "}
            <button type="button" className="font-medium text-navy hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
