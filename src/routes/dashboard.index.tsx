import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ListChecks, Film, Zap, Chrome, Activity } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function Overview() {
  const { user } = useSession();
  const [stats, setStats] = useState({ queue: 0, files: 0, today: 0, plan: "free", connected: false });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [q, f, u, sub, p] = await Promise.all([
        supabase.from("queue_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["pending", "running"]),
        supabase.from("generated_files").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("usage_tracking").select("prompts_used").eq("user_id", user.id).eq("day", today).maybeSingle(),
        supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("extension_connected").eq("id", user.id).maybeSingle(),
      ]);
      setStats({
        queue: q.count ?? 0,
        files: f.count ?? 0,
        today: u.data?.prompts_used ?? 0,
        plan: sub.data?.plan ?? "free",
        connected: p.data?.extension_connected ?? false,
      });
    })();
  }, [user]);

  const cards = [
    { label: "Active queue", value: stats.queue, icon: ListChecks, hint: "running + pending" },
    { label: "Generated files", value: stats.files, icon: Film, hint: "all-time" },
    { label: "Prompts today", value: stats.today, icon: Zap, hint: stats.plan === "free" ? "/ 10 daily" : "unlimited" },
    { label: "Plan", value: stats.plan.toUpperCase(), icon: Activity, hint: "current tier" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Welcome back 👋</h1>
          <p className="text-muted-foreground mt-1">Here's what your queue is doing.</p>
        </div>
        <Badge variant="outline" className={`border-white/10 ${stats.connected ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
          <Chrome className="size-3 mr-1" /> Extension {stats.connected ? "connected" : "not connected"}
        </Badge>
      </header>

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="glass border-0 p-5">
              <div className="flex items-center justify-between text-muted-foreground text-sm">
                {c.label} <c.icon className="size-4" />
              </div>
              <div className="mt-2 text-3xl font-display font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.hint}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      {stats.plan === "free" && (
        <Card className="glass border-0 p-6 mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Daily prompt usage</div>
              <div className="font-display font-semibold mt-1">{stats.today} / 10</div>
            </div>
            <Badge className="btn-gradient text-white border-0">Free plan</Badge>
          </div>
          <Progress value={Math.min(100, (stats.today / 10) * 100)} className="mt-4" />
        </Card>
      )}

      <Card className="glass border-0 p-6 mt-6">
        <h2 className="font-display font-semibold text-lg">Quick actions</h2>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <a href="/dashboard/queue" className="rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition">
            <ListChecks className="size-5 text-purple-400" />
            <div className="font-semibold mt-2">Add prompts</div>
            <div className="text-xs text-muted-foreground">Bulk-paste prompts to the queue</div>
          </a>
          <a href="/dashboard/extension" className="rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition">
            <Chrome className="size-5 text-purple-400" />
            <div className="font-semibold mt-2">Install extension</div>
            <div className="text-xs text-muted-foreground">Connect your browser to start automating</div>
          </a>
          <a href="/dashboard/library" className="rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition">
            <Film className="size-5 text-purple-400" />
            <div className="font-semibold mt-2">Browse library</div>
            <div className="text-xs text-muted-foreground">Download finished videos</div>
          </a>
        </div>
      </Card>
    </div>
  );
}
