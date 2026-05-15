import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Play, Pause, SkipForward, RotateCcw, Trash2, Plus, ExternalLink,
  Loader2, CheckCircle2, AlertCircle, Clock, Zap, Activity, Lock,
  RefreshCw, ArrowLeft, Maximize2, Minimize2, Globe, Download,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({ component: WorkspacePage });

const TARGETS = {
  dreamina: { label: "Dreamina", url: "https://dreamina.capcut.com/ai-tool/home/?type=video", color: "from-pink-500 to-purple-500" },
  seedance: { label: "Seedance", url: "https://seedance.com/", color: "from-purple-500 to-blue-500" },
  jimeng:   { label: "Jimeng",   url: "https://jimeng.jianying.com/", color: "from-blue-500 to-cyan-500" },
} as const;
type Platform = keyof typeof TARGETS;

type Job = {
  id: string; prompt_text: string; platform: string; status: string;
  progress: number; created_at: string; error: string | null;
};
type LogEntry = { id: string; ts: number; level: "info" | "ok" | "warn" | "err"; msg: string };

function WorkspacePage() {
  const { user } = useSession();
  const [platform, setPlatform] = useState<Platform>("dreamina");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [bulk, setBulk] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);

  const targetUrl = TARGETS[platform].url;

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

  useEffect(() => { load(); }, [user]);
  useEffect(() => { logsRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [logs]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("workspace-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_jobs", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Connect to (future) Chrome extension bridge
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.source !== "seedance-extension") return;
      const { type, payload } = e.data;
      if (type === "status") log("info", `Extension: ${payload.status} on job ${payload.jobId?.slice(0, 6)}`);
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
    setRunning(true);
    log("info", `Automation started — target: ${TARGETS[platform].label}`);
    if (typeof window !== "undefined" && window.SeedanceAI?.sendPrompts) {
      window.SeedanceAI.sendPrompts(pending.map((j) => j.prompt_text));
      log("ok", "Handed off to extension bridge");
    } else {
      log("warn", "Chrome extension not detected — prompts queued, install the extension to execute");
    }
  }
  function pauseQueue() { setRunning(false); log("warn", "Automation paused"); }
  function skipCurrent() { if (active) log("warn", `Skipped: ${active.prompt_text.slice(0, 40)}…`); }

  async function retry(id: string) {
    await supabase.from("queue_jobs").update({ status: "pending", error: null, progress: 0 }).eq("id", id);
    log("info", `Retrying job ${id.slice(0, 6)}`);
  }
  async function remove(id: string) { await supabase.from("queue_jobs").delete().eq("id", id); }
  async function clearDone() {
    if (!user) return;
    await supabase.from("queue_jobs").delete().eq("user_id", user.id).in("status", ["done", "failed"]);
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
          <span className="size-2 rounded-full bg-green-400 animate-pulse" />
          <span className="font-display font-semibold text-sm">Automation Workspace</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={platform} onValueChange={(v) => { setPlatform(v as Platform); setIframeKey((k) => k + 1); }}>
            <SelectTrigger className="w-36 h-9 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TARGETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {!running ? (
            <Button onClick={startQueue} disabled={!pending.length} className="btn-gradient text-white border-0 h-9">
              <Play className="size-4 mr-1.5" /> Start queue
            </Button>
          ) : (
            <Button onClick={pauseQueue} variant="outline" className="border-white/10 bg-white/5 h-9">
              <Pause className="size-4 mr-1.5" /> Pause
            </Button>
          )}
        </div>
      </header>

      {/* Split layout */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT */}
        <AnimatePresence initial={false}>
          {!fullscreen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 420, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="shrink-0 border-r border-white/5 bg-sidebar/50 backdrop-blur-xl flex flex-col min-h-0 overflow-hidden"
            >
              <div className="w-[420px] flex flex-col h-full min-h-0">
                {/* Stats */}
                <div className="p-4 grid grid-cols-4 gap-2 border-b border-white/5">
                  <Stat icon={Clock}        label="Pending"   value={pending.length} tone="yellow" />
                  <Stat icon={Activity}     label="Running"   value={active ? 1 : 0} tone="blue"   />
                  <Stat icon={CheckCircle2} label="Done"      value={completed}      tone="green"  />
                  <Stat icon={AlertCircle}  label="Failed"    value={failed}         tone="red"    />
                </div>

                {/* Active prompt */}
                <div className="p-4 border-b border-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Now generating</div>
                  {active ? (
                    <div className="rounded-xl glass p-3">
                      <div className="text-sm line-clamp-2">{active.prompt_text}</div>
                      <Progress value={active.progress} className="mt-3 h-1.5" />
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <Badge className="bg-blue-500/10 text-blue-400 border-0">{active.platform}</Badge>
                        <span>{active.progress}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground text-center">
                      {running ? "Waiting for next prompt…" : "Idle — press Start queue"}
                    </div>
                  )}
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
                <div className="border-t border-white/5 h-40 flex flex-col">
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
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* RIGHT — embedded browser */}
        <main className="flex-1 min-w-0 flex flex-col bg-[#0a0a14] p-3">
          <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/40 overflow-hidden flex flex-col shadow-[0_40px_120px_-40px_rgba(168,85,247,0.4)]">
            {/* Browser chrome */}
            <div className="shrink-0 h-10 bg-black/60 border-b border-white/5 flex items-center px-3 gap-3">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-red-500/70" />
                <span className="size-3 rounded-full bg-yellow-500/70" />
                <span className="size-3 rounded-full bg-green-500/70" />
              </div>
              <button onClick={() => setIframeKey((k) => k + 1)} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="size-3.5" />
              </button>
              <div className="flex-1 h-6 rounded-md bg-white/5 border border-white/5 px-2.5 flex items-center gap-2 text-xs text-muted-foreground truncate">
                <Lock className="size-3 text-green-400 shrink-0" />
                <span className="truncate">{targetUrl}</span>
              </div>
              <a href={targetUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Open in new tab">
                <ExternalLink className="size-3.5" />
              </a>
              <button onClick={() => setFullscreen((f) => !f)} className="text-muted-foreground hover:text-foreground">
                {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
            </div>

            {/* Iframe area */}
            <div className="relative flex-1 min-h-0 bg-white">
              {!iframeLoaded && (
                <div className="absolute inset-0 grid place-items-center bg-[#0a0a14] z-10">
                  <div className="flex items-center gap-3 text-muted-foreground text-sm">
                    <Loader2 className="size-4 animate-spin" /> Loading {TARGETS[platform].label}…
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={targetUrl}
                onLoad={() => setIframeLoaded(true)}
                title={TARGETS[platform].label}
                className="absolute inset-0 w-full h-full border-0"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
              />
              {/* Fallback overlay (shows over the iframe space if site blocks framing) */}
              <FrameBlockedFallback url={targetUrl} platform={TARGETS[platform].label} />
            </div>
          </div>

          {/* Bottom strip */}
          <div className="shrink-0 mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="size-3.5" />
            <span>Use your own {TARGETS[platform].label} account — Seedance AI never stores credentials.</span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={skipCurrent} disabled={!active} className="h-7 text-xs">
                <SkipForward className="size-3 mr-1" /> Skip
              </Button>
              <Link to="/dashboard/library">
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  <Download className="size-3 mr-1" /> Library
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

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

function FrameBlockedFallback({ url, platform }: { url: string; platform: string }) {
  // Many AI sites set X-Frame-Options: DENY. Show a graceful CTA layered behind the iframe;
  // it will be visually covered if the iframe successfully loads.
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#0a0a14] pointer-events-none">
      <div className="text-center max-w-md px-6 pointer-events-auto">
        <div className="mx-auto size-14 rounded-2xl btn-gradient grid place-items-center mb-4">
          <Globe className="size-6 text-white" />
        </div>
        <h3 className="font-display text-lg font-bold">If {platform} doesn't load here</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Some sites block embedded mode. Open it in a new tab — the Seedance AI extension still drives it from your browser.
        </p>
        <a href={url} target="_blank" rel="noreferrer">
          <Button className="mt-4 btn-gradient text-white border-0">
            <ExternalLink className="size-4 mr-1.5" /> Open {platform}
          </Button>
        </a>
      </div>
    </div>
  );
}
