import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Loader2, Users, CreditCard, Zap, Film } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin")({ component: Admin });

function Admin() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ users: 0, paid: 0, prompts: 0, files: 0 });

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!data) { setAllowed(false); return; }
      setAllowed(true);
      const [u, s, p, f] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).neq("plan", "free"),
        supabase.from("prompts").select("id", { count: "exact", head: true }),
        supabase.from("generated_files").select("id", { count: "exact", head: true }),
      ]);
      setStats({ users: u.count ?? 0, paid: s.count ?? 0, prompts: p.count ?? 0, files: f.count ?? 0 });
    })();
  }, [user, loading, navigate]);

  if (allowed === null) return <div className="p-10"><Loader2 className="animate-spin text-purple-400" /></div>;
  if (!allowed) return <div className="p-10 text-muted-foreground">Admins only.</div>;

  const cards = [
    { l: "Total users", v: stats.users, i: Users },
    { l: "Paid subs", v: stats.paid, i: CreditCard },
    { l: "Prompts saved", v: stats.prompts, i: Zap },
    { l: "Videos generated", v: stats.files, i: Film },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl font-bold">Admin</h1>
      <p className="text-muted-foreground mt-1">Platform overview.</p>
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.l} className="glass border-0 p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">{c.l}<c.i className="size-4" /></div>
            <div className="mt-2 text-3xl font-display font-bold">{c.v}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
