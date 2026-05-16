import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Play, Pause, SkipForward, RotateCcw, Trash2, Plus,
  Loader2, CheckCircle2, AlertCircle, Clock, Zap, Activity,
  ArrowLeft, Download, Sparkles, Film, CloudDownload, Cpu, Radio,
  LinkIcon, LogOut, ShieldCheck, PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({ component: WorkspacePage });

const TARGETS = {
  dreamina: { label: "Dreamina", color: "from-pink-500 to-purple-500" },
  seedance: { label: "Seedance", color: "from-purple-500 to-blue-500" },
  jimeng:   { label: "Jimeng",   color: "from-blue-500 to-cyan-500" },
} as const;
type Platform = keyof typeof TARGETS;

type Job = {
  id: string; prompt_text: string; platform: string; status: string;
  progress: number; created_at: string; error: string | null;
};
type LogEntry = { id: string; ts: number; level: "info" | "ok" | "warn" | "err"; msg: string };
type Phase = "idle" | "queued" | "generating" | "rendering" | "downloading" | "complete";

function WorkspacePage() {
  const { user, session, loading } = useSession();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  const [platform, setPlatform] = useState<Platform>("dreamina");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [bulk, setBulk] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [accounts, setAccounts] = useState<Record<Platform, { email: string } | null>>({
    dreamina: null, seedance: null, jimeng: null,
  });
  const [completedFiles, setCompletedFiles] = useState<Array<{ id: string; prompt_text: string | null; platform: string | null; created_at: string }>>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<number | null>(null);

  // Restore connected accounts (placeholder for Chrome extension session storage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("seedance.accounts");
      if (raw) setAccounts(JSON.parse(raw));
    } catch {}
  }, []);
  function persistAccounts(next: Record<Platform, { email: string } | null>) {
    setAccounts(next);
    try { localStorage.setItem("seedance.accounts", JSON.stringify(next)); } catch {}
  }

  function log(level: LogEntry["level"], msg: string) {
    setLogs((l) => [...l.slice(-200), { id: crypto.randomUUID(), ts: Date.now(), level, msg }]);
  }

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("queue_jobs")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: true }).limit(100);
    setJobs((data as Job[]) ?? []);
  }

  async function loadFiles() {
    if (!user) return;
    const { data } = await supabase.from("generated_files")
      .select("id,prompt_text,platform,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(12);
    setCompletedFiles(data ?? []);
  }

  useEffect(() => { load(); loadFiles(); }, [user]);
  useEffect(() => { logsRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [logs]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("workspace-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_jobs", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "generated_files", filter: `user_id=eq.${user.id}` }, () => loadFiles())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Chrome extension bridge (future)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.source !== "seedance-extension") return;
      const { type, payload } = e.data;
      if (type === "connected") { setExtensionConnected(true); log("ok", "Extension connected"); }
      if (type === "status") log("info", `Extension: ${payload.status} on ${payload.jobId?.slice(0, 6)}`);
      if (type === "download") log("ok", `Downloaded ${payload.filename}`);
      if (type === "error") log("err", payload.message ?? "Extension error");
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const active = useMemo(() => jobs.find((j) => j.status === "running"), [jobs]);
  const pending = useMemo(() => jobs.filter((j) => j.status === "pending"), [jobs]);
  const completed = useMemo(() => jobs.filter((j) => j.status === "done").length, [jobs]);
  const failed = useMemo(() => jobs.filter((j) => j.status === "failed").length, [jobs]);

  // Simulated automation monitor — advances job state when no extension is connected.
  // The extension (when installed) should drive these same DB updates instead.
  useEffect(() => {
    if (!running || !user) return;
    if (extensionConnected) return; // real extension takes over

    let cancelled = false;
    async function step() {
      if (cancelled) return;
      // pick current running job, otherwise promote next pending
      let cur = jobs.find((j) => j.status === "running");
      if (!cur) {
        const next = jobs.find((j) => j.status === "pending");
        if (!next) {
          setRunning(false);
          setPhase("idle");
          log("ok", "Queue complete");
          return;
        }
        await supabase.from("queue_jobs").update({
          status: "running", progress: 5, started_at: new Date().toISOString(),
        }).eq("id", next.id);
        setPhase("generating");
        log("info", `Generating: ${next.prompt_text.slice(0, 60)}`);
        return;
      }
      const next = Math.min(100, cur.progress + Math.floor(8 + Math.random() * 14));
      const newPhase: Phase =
        next < 40 ? "generating" :
        next < 75 ? "rendering" :
        next < 100 ? "downloading" : "complete";
      if (newPhase !== phase) {
        setPhase(newPhase);
        if (newPhase === "rendering") log("info", "Rendering frames…");
        if (newPhase === "downloading") log("info", "Downloading output…");
      }
      if (next >= 100) {
        await supabase.from("queue_jobs").update({
          status: "done", progress: 100, finished_at: new Date().toISOString(),
        }).eq("id", cur.id);
        await supabase.from("generated_files").insert({
          user_id: user!.id, job_id: cur.id, platform: cur.platform as Platform,
          prompt_text: cur.prompt_text,
          url: `seedance://simulated/${cur.id}.mp4`,
        });
        log("ok", `Completed → saved to Library`);
        setPhase("complete");
      } else {
        await supabase.from("queue_jobs").update({ progress: next }).eq("id", cur.id);
      }
    }

    tickRef.current = window.setInterval(step, 1200) as unknown as number;
    return () => {
      cancelled = true;
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [running, user, jobs, phase, extensionConnected]);

  async function addBulk() {
    if (!user) return;
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const rows = lines.map((p) => ({ user_id: user.id, prompt_text: p, platform }));
    const { error } = await supabase.from("queue_jobs").insert(rows);
    if (error) return toast.error(error.message);
    log("ok", `Queued ${lines.length} prompt${lines.length > 1 ? "s" : ""}`);
    setBulk("");
  }

  async function startQueue() {
    if (!accounts[platform]) {
      toast.error(`Connect your ${TARGETS[platform].label} account first`);
      setConnectOpen(true);
      return;
    }
    if (!pending.length && !active) {
      toast.error("Queue is empty — add prompts first");
      return;
    }
    setRunning(true);
    log("info", `Automation started — target: ${TARGETS[platform].label} as ${accounts[platform]?.email}`);
    if (typeof window !== "undefined" && window.SeedanceAI?.sendPrompts) {
      window.SeedanceAI.sendPrompts(pending.map((j) => j.prompt_text));
      log("ok", "Handed off to extension bridge");
    } else {
      log("warn", "Extension not detected — running simulated monitor");
    }
  }
  function pauseQueue() { setRunning(false); setPhase("idle"); log("warn", "Automation paused"); }
  async function skipCurrent() {
    if (!active) return;
    await supabase.from("queue_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", active.id);
    log("warn", `Skipped: ${active.prompt_text.slice(0, 40)}…`);
  }
  async function retry(id: string) {
    await supabase.from("queue_jobs").update({ status: "pending", error: null, progress: 0 }).eq("id", id);
    log("info", `Retrying job ${id.slice(0, 6)}`);
  }
  async function remove(id: string) { await supabase.from("queue_jobs").delete().eq("id", id); }
  async function clearDone() {
    if (!user) return;
    await supabase.from("queue_jobs").delete().eq("user_id", user.id).in("status", ["done", "failed", "cancelled"]);
    log("info", "Cleared completed jobs");
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 h-14 border-b border-white/5 bg-black/30 backdrop-blur-xl flex items-center px-4 gap-3 z-20">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${running ? "bg-green-400 animate-pulse" : "bg-white/30"}`} />
          <span className="font-display font-semibold text-sm">Automation Workspace</span>
        </div>
        <Badge className={`ml-2 border-0 text-[10px] ${extensionConnected ? "bg-green-500/10 text-green-400" : "bg-white/5 text-muted-foreground"}`}>
          <Radio className="size-2.5 mr-1" />
          {extensionConnected ? "Extension live" : "Simulated mode"}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger className="w-36 h-9 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TARGETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setConnectOpen(true)}
            variant="outline"
            className={`h-9 border-white/10 bg-white/5 ${accounts[platform] ? "text-green-300" : ""}`}
          >
            {accounts[platform] ? (
              <><ShieldCheck className="size-4 mr-1.5" /> {accounts[platform]?.email}</>
            ) : (
              <><LinkIcon className="size-4 mr-1.5" /> Connect account</>
            )}
          </Button>
          {!running ? (
            <Button onClick={startQueue} className="btn-gradient text-white border-0 h-9">
              <Play className="size-4 mr-1.5" /> Run queue
            </Button>
          ) : (
            <Button onClick={pauseQueue} variant="outline" className="border-white/10 bg-white/5 h-9">
              <Pause className="size-4 mr-1.5" /> Pause
            </Button>
          )}
        </div>
      </header>

      <ConnectAccountDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        platform={platform}
        platformLabel={TARGETS[platform].label}
        current={accounts[platform]}
        onConnect={(email) => {
          persistAccounts({ ...accounts, [platform]: { email } });
          log("ok", `Connected ${TARGETS[platform].label} account: ${email}`);
          toast.success(`${TARGETS[platform].label} account connected`);
        }}
        onDisconnect={() => {
          persistAccounts({ ...accounts, [platform]: null });
          log("warn", `Disconnected ${TARGETS[platform].label} account`);
        }}
      />

      {/* Split layout — stable, no resize/zoom */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(320px,400px)_1fr]">
        {/* LEFT */}
        <aside className="border-r border-white/5 bg-sidebar/50 backdrop-blur-xl flex flex-col min-h-0 overflow-hidden">
          {/* Stats */}
          <div className="p-4 grid grid-cols-4 gap-2 border-b border-white/5">
            <Stat icon={Clock}        label="Pending" value={pending.length} tone="yellow" />
            <Stat icon={Activity}     label="Running" value={active ? 1 : 0} tone="blue"   />
            <Stat icon={CheckCircle2} label="Done"    value={completed}      tone="green"  />
            <Stat icon={AlertCircle}  label="Failed"  value={failed}         tone="red"    />
          </div>

          {/* Add prompts */}
          <div className="p-4 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Add to queue</div>
            <Textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={`One prompt per line…\nA neon city at night, cinematic\nA whale flying through clouds`}
              rows={3}
              className="bg-white/5 border-white/10 font-mono text-xs resize-none"
            />
            <Button onClick={addBulk} size="sm" className="w-full mt-2 btn-gradient text-white border-0">
              <Plus className="size-3.5 mr-1.5" /> Add prompts
            </Button>
          </div>

          {/* Queue */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queue ({jobs.length})</div>
              <button onClick={clearDone} className="text-[10px] text-muted-foreground hover:text-foreground">
                Clear completed
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {jobs.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8">
                  No prompts yet. Add some above.
                </div>
              )}
              {jobs.map((j) => <JobRow key={j.id} job={j} onRetry={retry} onRemove={remove} />)}
            </div>
          </div>

          {/* Logs */}
          <div className="border-t border-white/5 h-36 flex flex-col">
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5 flex items-center gap-2">
              <Zap className="size-3" /> Activity
            </div>
            <div ref={logsRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-1">
              {logs.length === 0 && <div className="text-muted-foreground">Waiting for activity…</div>}
              {logs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{new Date(l.ts).toLocaleTimeString().slice(0, 8)}</span>
                  <span className={
                    l.level === "ok" ? "text-green-400" :
                    l.level === "warn" ? "text-yellow-400" :
                    l.level === "err" ? "text-red-400" : "text-blue-300"
                  }>›</span>
                  <span className="truncate">{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT — Automation Monitor */}
        <main className="min-w-0 min-h-0 flex flex-col bg-[#0a0a14] p-4 overflow-hidden">
          <AutomationMonitor
            platform={TARGETS[platform].label}
            gradient={TARGETS[platform].color}
            active={active}
            phase={phase}
            running={running}
            completedCount={completed}
            onSkip={skipCurrent}
          />
        </main>
      </div>
    </div>
  );
}

/* ---------------- Automation Monitor ---------------- */

function AutomationMonitor({
  platform, gradient, active, phase, running, completedCount, onSkip,
}: {
  platform: string; gradient: string; active: Job | undefined; phase: Phase;
  running: boolean; completedCount: number; onSkip: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 to-black/30 overflow-hidden flex flex-col shadow-[0_40px_120px_-40px_rgba(168,85,247,0.4)]">
      {/* Header */}
      <div className="shrink-0 h-11 border-b border-white/5 flex items-center px-4 gap-3 bg-black/40">
        <div className={`size-2 rounded-full bg-gradient-to-r ${gradient}`} />
        <span className="font-display font-semibold text-sm">{platform} · Automation Monitor</span>
        <Badge className="bg-white/5 text-muted-foreground border-0 text-[10px]">live</Badge>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="size-3.5" />
          <span>{running ? "Engine running" : "Engine idle"}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {/* Hero status */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent p-6 relative overflow-hidden">
          <AnimatedGrid />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Active prompt</div>
            <div className="mt-2 font-display text-xl md:text-2xl font-bold leading-snug min-h-[2.5rem]">
              {active ? active.prompt_text : running ? "Loading next prompt…" : "Awaiting your queue"}
            </div>

            {active && (
              <>
                <div className="mt-5 grid grid-cols-4 gap-2">
                  <PhaseStep icon={Sparkles}     label="Queued"      reached={true} />
                  <PhaseStep icon={Zap}          label="Generating"  reached={["generating","rendering","downloading","complete"].includes(phase)} active={phase==="generating"} />
                  <PhaseStep icon={Film}         label="Rendering"   reached={["rendering","downloading","complete"].includes(phase)}             active={phase==="rendering"} />
                  <PhaseStep icon={CloudDownload}label="Downloading" reached={["downloading","complete"].includes(phase)}                         active={phase==="downloading"} />
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="capitalize">{phase}</span>
                    <span>{active.progress}%</span>
                  </div>
                  <Progress value={active.progress} className="h-2" />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button size="sm" variant="outline" className="border-white/10 bg-white/5" onClick={onSkip}>
                    <SkipForward className="size-3.5 mr-1.5" /> Skip this prompt
                  </Button>
                  <Link to="/dashboard/library">
                    <Button size="sm" variant="ghost" className="text-muted-foreground">
                      <Download className="size-3.5 mr-1.5" /> View Library
                    </Button>
                  </Link>
                </div>
              </>
            )}

            {!active && !running && (
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Add prompts on the left, then press <span className="text-foreground font-medium">Run queue</span>. The monitor will track every step in real time.
              </p>
            )}
          </div>
        </div>

        {/* Live signals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SignalCard icon={Activity} label="Engine status" value={running ? "Running" : "Paused"} tone={running ? "green" : "muted"} />
          <SignalCard icon={Film}     label="Current phase" value={phase === "idle" ? "—" : phase} tone="blue" />
          <SignalCard icon={CheckCircle2} label="Completed (session)" value={String(completedCount)} tone="purple" />
        </div>

        {/* Visualizer */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-display font-semibold">Render visualizer</div>
              <div className="text-xs text-muted-foreground">Synthetic preview while {platform} runs in your account.</div>
            </div>
            <Badge className="bg-white/5 border-0 text-[10px] text-muted-foreground">{phase}</Badge>
          </div>
          <RenderVisualizer phase={phase} active={!!active && running} />
        </div>

        {/* Extension hint */}
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground flex items-start gap-3">
          <Radio className="size-4 mt-0.5 text-muted-foreground" />
          <div>
            Install the <span className="text-foreground font-medium">Seedance AI Chrome extension</span> to drive {platform} in your real browser tab.
            The queue keeps running here whether or not the extension is connected — your prompts pick up automatically when you reopen this workspace.
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseStep({ icon: Icon, label, reached, active }: { icon: any; label: string; reached: boolean; active?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 transition-colors ${
      active ? "border-purple-400/40 bg-purple-500/10" : reached ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-transparent opacity-50"
    }`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 ${active ? "text-purple-300" : reached ? "text-foreground" : "text-muted-foreground"}`} />
        <span className="text-[11px] font-medium">{label}</span>
        {active && <Loader2 className="size-3 ml-auto animate-spin text-purple-300" />}
      </div>
    </div>
  );
}

function SignalCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "green" | "blue" | "purple" | "muted" }) {
  const map = {
    green: "from-green-500/15 to-transparent text-green-300",
    blue: "from-blue-500/15 to-transparent text-blue-300",
    purple: "from-purple-500/15 to-transparent text-purple-300",
    muted: "from-white/5 to-transparent text-muted-foreground",
  } as const;
  return (
    <div className={`rounded-xl border border-white/10 bg-gradient-to-br ${map[tone]} p-4`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider opacity-80">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="font-display text-xl font-bold mt-1.5 capitalize text-foreground">{value}</div>
    </div>
  );
}

function AnimatedGrid() {
  return (
    <div className="absolute inset-0 opacity-40 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at top right, black, transparent 70%)",
        }}
      />
    </div>
  );
}

function RenderVisualizer({ phase, active }: { phase: Phase; active: boolean }) {
  const bars = Array.from({ length: 36 });
  return (
    <div className="h-32 rounded-xl bg-black/60 border border-white/5 overflow-hidden relative">
      <div className="absolute inset-0 flex items-end gap-1 px-3 pb-3">
        {bars.map((_, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-purple-500/70 to-blue-400/70"
            animate={active ? { height: [`${10 + ((i * 7) % 60)}%`, `${20 + ((i * 11) % 70)}%`, `${15 + ((i * 5) % 50)}%`] } : { height: "8%" }}
            transition={{ duration: 1.2 + (i % 5) * 0.15, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: "100%" }} exit={{ opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          />
        )}
      </AnimatePresence>
      <div className="absolute top-2 left-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        {phase === "idle" ? "standby" : phase}
      </div>
    </div>
  );
}

/* ---------------- Shared bits ---------------- */

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  const map: Record<string, string> = {
    yellow: "text-yellow-400 bg-yellow-500/10",
    blue: "text-blue-400 bg-blue-500/10",
    green: "text-green-400 bg-green-500/10",
    red: "text-red-400 bg-red-500/10",
  };
  return (
    <div className="rounded-lg glass p-2.5">
      <div className={`size-6 rounded-md grid place-items-center ${map[tone]}`}>
        <Icon className="size-3.5" />
      </div>
      <div className="mt-1.5 font-display font-bold text-lg leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function JobRow({ job, onRetry, onRemove }: { job: Job; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const tone: Record<string, string> = {
    pending: "border-l-yellow-500/60",
    running: "border-l-blue-500/80",
    done: "border-l-green-500/60",
    failed: "border-l-red-500/60",
    cancelled: "border-l-white/10",
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`rounded-lg bg-white/[0.02] border border-white/5 border-l-2 ${tone[job.status] ?? ""} p-2.5`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs line-clamp-2">{job.prompt_text}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge className={
              job.status === "running" ? "bg-blue-500/10 text-blue-400 border-0 text-[10px] h-4 px-1.5" :
              job.status === "done"    ? "bg-green-500/10 text-green-400 border-0 text-[10px] h-4 px-1.5" :
              job.status === "failed"  ? "bg-red-500/10 text-red-400 border-0 text-[10px] h-4 px-1.5" :
              "bg-yellow-500/10 text-yellow-400 border-0 text-[10px] h-4 px-1.5"
            }>{job.status}</Badge>
            {job.status === "running" && <span className="text-[10px] text-muted-foreground">{job.progress}%</span>}
          </div>
          {job.error && <div className="text-[10px] text-red-400 mt-1 truncate">{job.error}</div>}
        </div>
        <div className="flex flex-col gap-0.5">
          {job.status === "failed" && (
            <button onClick={() => onRetry(job.id)} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground hover:text-foreground" title="Retry">
              <RotateCcw className="size-3" />
            </button>
          )}
          <button onClick={() => onRemove(job.id)} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground hover:text-red-400" title="Remove">
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
