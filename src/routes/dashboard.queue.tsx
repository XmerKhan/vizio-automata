import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/queue")({ component: QueuePage });

type Job = {
  id: string; prompt_text: string; platform: string; status: string;
  progress: number; created_at: string; error: string | null;
};

function QueuePage() {
  const { user } = useSession();
  const [bulk, setBulk] = useState("");
  const [platform, setPlatform] = useState<"seedance" | "dreamina" | "jimeng">("seedance");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("queue_jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    setJobs((data as Job[]) ?? []);
  }

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("queue").on("postgres_changes", { event: "*", schema: "public", table: "queue_jobs", filter: `user_id=eq.${user.id}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  async function addBulk() {
    if (!user) return;
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setLoading(true);
    const rows = lines.map((p) => ({ user_id: user.id, prompt_text: p, platform }));
    const { error } = await supabase.from("queue_jobs").insert(rows);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`Queued ${lines.length} prompts`);
    setBulk("");
  }

  async function remove(id: string) {
    await supabase.from("queue_jobs").delete().eq("id", id);
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl font-bold">Queue</h1>
      <p className="text-muted-foreground mt-1">Bulk-paste prompts. Your extension picks them up automatically.</p>

      <Card className="glass border-0 p-6 mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display font-semibold">Add prompts</h2>
          <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
            <SelectTrigger className="w-44 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dreamina">Dreamina</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="One prompt per line..." rows={6} className="mt-4 bg-white/5 border-white/10 font-mono text-sm" />
        <Button onClick={addBulk} disabled={loading} className="mt-3 btn-gradient text-white border-0">
          {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
          Add to queue
        </Button>
      </Card>

      <Card className="glass border-0 p-6 mt-6">
        <h2 className="font-display font-semibold mb-4">Recent jobs</h2>
        {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet. Paste some prompts above.</p>}
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{j.prompt_text}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="border-white/10">{j.platform}</Badge>
                    <StatusBadge status={j.status} />
                  </div>
                  {j.status === "running" && <Progress value={j.progress} className="mt-3 h-1.5" />}
                  {j.error && <div className="text-xs text-red-400 mt-2">{j.error}</div>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(j.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400",
    running: "bg-blue-500/10 text-blue-400",
    done: "bg-green-500/10 text-green-400",
    failed: "bg-red-500/10 text-red-400",
    cancelled: "bg-white/5 text-muted-foreground",
  };
  return <Badge className={`${map[status] ?? ""} border-0`}>{status}</Badge>;
}
