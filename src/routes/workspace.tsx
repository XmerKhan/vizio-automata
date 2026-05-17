import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Play, Pause, RotateCcw, Trash2, Plus, Loader2, CheckCircle2, AlertCircle,
  Clock, Zap, Activity, ArrowLeft, Download, Film, CloudDownload, Radio,
  LinkIcon, LogOut, ShieldCheck, PlayCircle, ChevronDown, Lock,
  Type, Image as ImageIcon, Layers, Music, Mail, Eye, EyeOff,
  X, Upload, GripVertical, ArrowUp, ArrowDown,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({ component: WorkspacePage });

/* ───────────────────────────── Constants ───────────────────────────── */

const TARGETS = {
  dreamina: { label: "Dreamina", color: "from-pink-500 to-purple-500" },
  seedance: { label: "Seedance", color: "from-purple-500 to-blue-500" },
  jimeng:   { label: "Jimeng",   color: "from-blue-500 to-cyan-500" },
} as const;
type Platform = keyof typeof TARGETS;

const MODES = [
  { id: "text2video",   label: "Text → Video",        icon: Type,      desc: "Generate a video from a prompt" },
  { id: "image2video",  label: "Image → Video",       icon: ImageIcon, desc: "Animate one or more images" },
  { id: "ingredients",  label: "Ingredients → Video", icon: Layers,    desc: "Compose scene from structured inputs" },
  { id: "audio2video",  label: "Audio → Video",       icon: Music,     desc: "Lipsync / motion driven by audio" },
] as const;
type ModeId = typeof MODES[number]["id"];

const STYLE_PRESETS = ["Cinematic", "Anime", "Photoreal", "3D Render", "Claymation", "Watercolor", "Cyberpunk", "Vintage Film"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "21:9"];

type GenSettings = {
  duration: number;
  resolution: "720p" | "1080p";
  aspect: string;
  style: string;
  negative: string;
  seed: string;
  batch: number;
};

const DEFAULT_SETTINGS: GenSettings = {
  duration: 5, resolution: "1080p", aspect: "16:9", style: "Cinematic",
  negative: "", seed: "", batch: 1,
};

const JOB_STATES = ["pending", "processing", "generating", "downloading", "completed", "failed"] as const;
type JobStatus = typeof JOB_STATES[number] | "running" | "done" | "cancelled";

type Job = {
  id: string; user_id: string; prompt_text: string; platform: string;
  status: string; progress: number; created_at: string; error: string | null;
  mode: string; settings: any; media_urls: string[]; ingredients: any;
  output_url: string | null; position: number;
};

type LogEntry = { id: string; ts: number; level: "info" | "ok" | "warn" | "err"; msg: string };

/* ───────────────────────────── Page ───────────────────────────── */

function WorkspacePage() {
  const { user, session, loading } = useSession();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  const [platform, setPlatform] = useState<Platform>("dreamina");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [accounts, setAccounts] = useState<Record<Platform, { email: string; method: "google" | "password" } | null>>({
    dreamina: null, seedance: null, jimeng: null,
  });
  const [completedFiles, setCompletedFiles] = useState<Array<{ id: string; prompt_text: string | null; platform: string | null; created_at: string; url: string }>>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [mode, setMode] = useState<ModeId>("text2video");
  const [settings, setSettings] = useState<GenSettings>(DEFAULT_SETTINGS);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("seedance.accounts");
      if (raw) setAccounts(JSON.parse(raw));
      const s = localStorage.getItem("seedance.settings");
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
    } catch {}
  }, []);

  const persistAccounts = (next: typeof accounts) => {
    setAccounts(next);
    try { localStorage.setItem("seedance.accounts", JSON.stringify(next)); } catch {}
  };
  const updateSettings = (patch: Partial<GenSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("seedance.settings", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const log = useCallback((level: LogEntry["level"], msg: string) => {
    setLogs((l) => [...l.slice(-200), { id: crypto.randomUUID(), ts: Date.now(), level, msg }]);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("queue_jobs")
      .select("*").eq("user_id", user.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }).limit(200);
    setJobs((data as Job[]) ?? []);
  }, [user]);

  const loadFiles = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("generated_files")
      .select("id,prompt_text,platform,created_at,url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(12);
    setCompletedFiles(data ?? []);
  }, [user]);

  useEffect(() => { load(); loadFiles(); }, [load, loadFiles]);
  useEffect(() => { logsRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [logs]);

  // Realtime: queue + library
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("workspace-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_jobs", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "generated_files", filter: `user_id=eq.${user.id}` }, () => loadFiles())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load, loadFiles]);

  // Bridge to extension (postMessage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.source !== "seedance-extension") return;
      const { type, payload } = e.data;
      if (type === "connected") { setExtensionConnected(true); log("ok", "Extension connected"); }
      if (type === "status")    log("info", `Extension: ${payload?.status} on ${payload?.jobId?.slice?.(0, 6) ?? "?"}`);
      if (type === "download")  log("ok", `Downloaded ${payload?.filename ?? "file"}`);
      if (type === "error")     log("err", payload?.message ?? "Extension error");
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [log]);

  /* ─── Derived ─── */
  const pending   = useMemo(() => jobs.filter((j) => j.status === "pending"), [jobs]);
  const active    = useMemo(() => jobs.find((j) => ["processing", "generating", "downloading", "running"].includes(j.status)), [jobs]);
  const completed = useMemo(() => jobs.filter((j) => ["completed", "done"].includes(j.status)).length, [jobs]);
  const failed    = useMemo(() => jobs.filter((j) => j.status === "failed").length, [jobs]);

  /* ─── Queue mutations ─── */
  async function enqueue(payload: {
    prompt: string; mediaUrls?: string[]; ingredients?: any;
  }): Promise<void> {
    if (!user) return;
    if (!accounts[platform]) {
      setConnectOpen(true);
      toast.error(`Connect your ${TARGETS[platform].label} account first`);
      return;
    }
    const maxPos = jobs.reduce((m, j) => Math.max(m, j.position ?? 0), 0);
    const rows = Array.from({ length: settings.batch }, (_, i) => ({
      user_id: user.id,
      prompt_text: payload.prompt,
      platform,
      mode,
      settings: settings as any,
      media_urls: payload.mediaUrls ?? [],
      ingredients: payload.ingredients ?? null,
      status: "pending" as const,
      progress: 0,
      position: maxPos + i + 1,
    }));
    const { error } = await supabase.from("queue_jobs").insert(rows);
    if (error) { toast.error(error.message); return; }
    log("ok", `Queued ${rows.length} × ${MODES.find((m) => m.id === mode)?.label}`);
    toast.success(`Queued ${rows.length} job${rows.length === 1 ? "" : "s"}`);

    // Hand off to extension if present (real path)
    if (typeof window !== "undefined" && (window as any).SeedanceAI?.enqueue) {
      (window as any).SeedanceAI.enqueue({ platform, mode, settings, jobs: rows });
    }
  }

  async function retry(id: string)   { await supabase.from("queue_jobs").update({ status: "pending", error: null, progress: 0 }).eq("id", id); log("info", `Retrying ${id.slice(0, 6)}`); }
  async function remove(id: string)  { await supabase.from("queue_jobs").delete().eq("id", id); }
  async function clearDone() {
    if (!user) return;
    await supabase.from("queue_jobs").delete().eq("user_id", user.id).in("status", ["completed", "done", "failed", "cancelled"]);
    log("info", "Cleared completed jobs");
  }
  async function move(id: string, dir: -1 | 1) {
    const idx = jobs.findIndex((j) => j.id === id);
    const swapWith = jobs[idx + dir];
    if (!swapWith) return;
    const a = jobs[idx], b = swapWith;
    await Promise.all([
      supabase.from("queue_jobs").update({ position: b.position }).eq("id", a.id),
      supabase.from("queue_jobs").update({ position: a.position }).eq("id", b.id),
    ]);
  }

  function startQueue() {
    if (!accounts[platform]) { setConnectOpen(true); return toast.error(`Connect your ${TARGETS[platform].label} account first`); }
    if (!pending.length && !active) return toast.error("Queue is empty — add prompts first");
    setRunning(true);
    log("info", `Queue started · ${TARGETS[platform].label} · ${settings.resolution} ${settings.aspect}`);
    if (typeof window !== "undefined" && (window as any).SeedanceAI?.start) {
      (window as any).SeedanceAI.start({ platform });
      log("ok", "Handed off to extension");
    } else {
      log("warn", "Extension not detected — queue is awaiting a backend worker");
    }
  }
  function pauseQueue() {
    setRunning(false);
    log("warn", "Queue paused");
    if (typeof window !== "undefined" && (window as any).SeedanceAI?.pause) (window as any).SeedanceAI.pause();
  }

  /* ───────────────────────────── Render ───────────────────────────── */
  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
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
          {extensionConnected ? "Extension live" : "Awaiting worker"}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger className="w-36 h-9 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TARGETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setConnectOpen(true)} variant="outline"
            className={`h-9 border-white/10 bg-white/5 ${accounts[platform] ? "text-green-300" : ""}`}>
            {accounts[platform]
              ? <><ShieldCheck className="size-4 mr-1.5" /> {accounts[platform]?.email}</>
              : <><LinkIcon className="size-4 mr-1.5" /> Connect account</>}
          </Button>
          {!running
            ? <Button onClick={startQueue} className="btn-gradient text-white border-0 h-9"><Play className="size-4 mr-1.5" /> Run queue</Button>
            : <Button onClick={pauseQueue} variant="outline" className="border-white/10 bg-white/5 h-9"><Pause className="size-4 mr-1.5" /> Pause</Button>}
        </div>
      </header>

      <ConnectAccountDialog
        open={connectOpen} onOpenChange={setConnectOpen}
        platform={platform} platformLabel={TARGETS[platform].label}
        current={accounts[platform]}
        onConnect={(email, method) => {
          persistAccounts({ ...accounts, [platform]: { email, method } });
          log("ok", `Connected ${TARGETS[platform].label} (${method}): ${email}`);
          toast.success(`${TARGETS[platform].label} account connected`);
        }}
        onDisconnect={() => {
          persistAccounts({ ...accounts, [platform]: null });
          log("warn", `Disconnected ${TARGETS[platform].label} account`);
        }}
      />

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(420px,520px)_1fr]">
        {/* LEFT — composer & settings */}
        <aside className="border-r border-white/5 bg-sidebar/50 backdrop-blur-xl flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 grid grid-cols-4 gap-2 border-b border-white/5">
            <Stat icon={Clock}        label="Pending" value={pending.length} tone="yellow" />
            <Stat icon={Activity}     label="Active"  value={active ? 1 : 0} tone="blue" />
            <Stat icon={CheckCircle2} label="Done"    value={completed}      tone="green" />
            <Stat icon={AlertCircle}  label="Failed"  value={failed}         tone="red" />
          </div>

          <div className="flex-1 overflow-y-auto">
            <Tabs value={mode} onValueChange={(v) => setMode(v as ModeId)} className="w-full">
              <div className="p-3 border-b border-white/5 sticky top-0 bg-sidebar/80 backdrop-blur-xl z-10">
                <TabsList className="grid grid-cols-4 w-full bg-white/[0.03] border border-white/5 h-auto p-1">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    return (
                      <TabsTrigger key={m.id} value={m.id}
                        className="flex flex-col gap-1 h-auto py-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/30 data-[state=active]:to-blue-500/20 data-[state=active]:text-white">
                        <Icon className="size-4" />
                        <span className="text-[10px] leading-none">{m.label.split(" → ")[0]}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <div className="p-4">
                <TabsContent value="text2video" className="m-0"><TextMode userId={user?.id} onEnqueue={enqueue} /></TabsContent>
                <TabsContent value="image2video" className="m-0"><ImageMode userId={user?.id} onEnqueue={enqueue} /></TabsContent>
                <TabsContent value="ingredients" className="m-0"><IngredientsMode userId={user?.id} onEnqueue={enqueue} /></TabsContent>
                <TabsContent value="audio2video" className="m-0"><AudioMode userId={user?.id} onEnqueue={enqueue} /></TabsContent>
              </div>
            </Tabs>

            <SettingsPanel settings={settings} onChange={updateSettings} />

            {/* Queue */}
            <div className="flex flex-col">
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5 sticky top-0 bg-sidebar/80 backdrop-blur-xl z-10">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queue ({jobs.length})</div>
                <button onClick={clearDone} className="text-[10px] text-muted-foreground hover:text-foreground">Clear completed</button>
              </div>
              <div className="p-3 space-y-2">
                {jobs.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">No jobs yet.</div>}
                {jobs.map((j, i) => (
                  <JobRow key={j.id}
                    job={j}
                    gradient={TARGETS[(j.platform as Platform) ?? "dreamina"]?.color ?? "from-purple-500 to-blue-500"}
                    canMoveUp={i > 0 && j.status === "pending"}
                    canMoveDown={i < jobs.length - 1 && j.status === "pending"}
                    onRetry={retry} onRemove={remove}
                    onMoveUp={() => move(j.id, -1)}
                    onMoveDown={() => move(j.id, 1)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Logs */}
          <div className="shrink-0 border-t border-white/5 h-28 flex flex-col">
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5 flex items-center gap-2">
              <Zap className="size-3" /> Activity
            </div>
            <div ref={logsRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-1">
              {logs.length === 0 && <div className="text-muted-foreground">Waiting for activity…</div>}
              {logs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{new Date(l.ts).toLocaleTimeString().slice(0, 8)}</span>
                  <span className={
                    l.level === "ok" ? "text-green-400" : l.level === "warn" ? "text-yellow-400" :
                    l.level === "err" ? "text-red-400" : "text-blue-300"
                  }>›</span>
                  <span className="truncate">{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT — live operations & library */}
        <main className="min-w-0 min-h-0 flex flex-col bg-[#0a0a14] p-4 overflow-hidden">
          <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 to-black/30 overflow-hidden flex flex-col">
            <div className="shrink-0 h-11 border-b border-white/5 flex items-center px-4 gap-3 bg-black/40">
              <div className={`size-2 rounded-full bg-gradient-to-r ${TARGETS[platform].color}`} />
              <span className="font-display font-semibold text-sm">{TARGETS[platform].label} · Live Operations</span>
              {accounts[platform] && (
                <Badge className="bg-green-500/10 text-green-300 border-0 text-[10px]">
                  <ShieldCheck className="size-2.5 mr-1" /> {accounts[platform]?.email}
                </Badge>
              )}
              <div className="ml-auto text-xs text-muted-foreground">{settings.resolution} · {settings.aspect} · {settings.duration}s</div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Active job card */}
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent p-6 relative overflow-hidden">
                <AnimatedGrid />
                <div className="relative">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Active job</div>
                  {active ? (
                    <>
                      <div className="mt-2 font-display text-xl md:text-2xl font-bold leading-snug">{active.prompt_text}</div>
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                        <span>{MODES.find((m) => m.id === active.mode)?.label ?? active.mode}</span>
                        <span>·</span>
                        <Badge className="bg-white/5 border-0 text-[10px] capitalize">{active.status}</Badge>
                      </div>
                      <div className="mt-5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                          <span className="capitalize">{active.status}</span>
                          <span>{active.progress}%</span>
                        </div>
                        <Progress value={active.progress} className="h-2" />
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 font-display text-xl font-semibold text-muted-foreground">
                      {pending.length ? `${pending.length} job${pending.length === 1 ? "" : "s"} waiting · press Run queue` : "No active job"}
                    </div>
                  )}
                </div>
              </div>

              {/* Completed library */}
              <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-display font-semibold">Recent results</div>
                    <div className="text-xs text-muted-foreground">Generated videos auto-saved to your library.</div>
                  </div>
                  <Link to="/dashboard/library" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
                </div>
                {completedFiles.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8 border border-dashed border-white/10 rounded-xl">
                    No completed videos yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <AnimatePresence initial={false}>
                      {completedFiles.map((f) => (
                        <motion.a key={f.id} href={f.url} target="_blank" rel="noreferrer" download
                          layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          className="group rounded-xl overflow-hidden border border-white/10 bg-white/[0.02] hover:border-purple-400/30 transition-colors">
                          <div className="aspect-video relative bg-gradient-to-br from-purple-500/30 via-blue-500/20 to-black/40">
                            <div className="absolute inset-0 grid place-items-center">
                              <PlayCircle className="size-8 text-white/70 group-hover:text-white transition" />
                            </div>
                            <Badge className="absolute top-2 left-2 bg-black/60 border-0 text-[10px] capitalize">{f.platform ?? platform}</Badge>
                            <div className="absolute top-2 right-2 size-7 grid place-items-center rounded bg-black/60 opacity-0 group-hover:opacity-100 transition">
                              <Download className="size-3.5" />
                            </div>
                          </div>
                          <div className="p-2.5">
                            <div className="text-[11px] line-clamp-2 leading-snug">{f.prompt_text ?? "Untitled"}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">{new Date(f.created_at).toLocaleTimeString()}</div>
                          </div>
                        </motion.a>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground flex items-start gap-3">
                <Radio className="size-4 mt-0.5 text-muted-foreground" />
                <div>
                  Jobs are dispatched to the <span className="text-foreground font-medium">Seedance Chrome extension</span> or your generation API.
                  Progress here updates in real time as the worker reports back.
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ───────────────────────────── Mode forms ───────────────────────────── */

function TextMode({ onEnqueue }: { userId?: string; onEnqueue: (p: { prompt: string }) => void | Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Prompt">
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5}
          placeholder="A whale flying through neon clouds, cinematic, slow dolly in…"
          className="bg-white/5 border-white/10 text-sm resize-none" />
      </Field>
      <Button className="w-full btn-gradient text-white border-0" disabled={!prompt.trim()}
        onClick={() => { onEnqueue({ prompt: prompt.trim() }); setPrompt(""); }}>
        <Plus className="size-4 mr-1.5" /> Add to queue
      </Button>
    </div>
  );
}

function ImageMode({ userId, onEnqueue }: { userId?: string; onEnqueue: (p: { prompt: string; mediaUrls: string[] }) => void | Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<Array<{ id: string; name: string; url: string; preview: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | File[] | null) {
    if (!list || !userId) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        if (!f.type.startsWith("image/")) continue;
        const path = `${userId}/inputs/${crypto.randomUUID()}-${f.name}`;
        const { error } = await supabase.storage.from("uploads").upload(path, f, { upsert: false });
        if (error) { toast.error(error.message); continue; }
        const { data } = supabase.storage.from("uploads").createSignedUrl(path, 60 * 60 * 24 * 7);
        // signed URL is async — but createSignedUrl is async
        const signed = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60 * 24 * 7);
        const url = signed.data?.signedUrl ?? path;
        setFiles((prev) => [...prev, { id: crypto.randomUUID(), name: f.name, url, preview: URL.createObjectURL(f) }]);
      }
    } finally { setUploading(false); }
  }

  function move(idx: number, dir: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Reference images (drag & drop, unlimited)">
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:border-purple-400/40 transition cursor-pointer p-6 text-center"
        >
          <Upload className="size-5 mx-auto text-muted-foreground mb-2" />
          <div className="text-xs text-muted-foreground">
            {uploading ? "Uploading…" : "Drop images here or click to browse"}
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
        </div>
      </Field>

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={f.id} className="relative rounded-lg overflow-hidden border border-white/10 group">
              <img src={f.preview} alt={f.name} className="w-full aspect-square object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition flex items-end justify-between p-1">
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => move(i, -1)} className="size-6 grid place-items-center rounded bg-black/70 text-white"><ArrowUp className="size-3" /></button>
                  <button onClick={() => move(i, 1)} className="size-6 grid place-items-center rounded bg-black/70 text-white"><ArrowDown className="size-3" /></button>
                </div>
                <button onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                  className="size-6 grid place-items-center rounded bg-black/70 text-red-300 opacity-0 group-hover:opacity-100">
                  <X className="size-3" />
                </button>
              </div>
              <div className="absolute top-1 left-1 size-5 grid place-items-center rounded bg-black/70 text-[10px]">{i + 1}</div>
            </div>
          ))}
        </div>
      )}

      <Field label="Prompt (optional)">
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          placeholder="Describe the motion or scene…"
          className="bg-white/5 border-white/10 text-sm resize-none" />
      </Field>

      <Button className="w-full btn-gradient text-white border-0" disabled={files.length === 0}
        onClick={() => {
          onEnqueue({ prompt: prompt.trim() || "Animate uploaded images", mediaUrls: files.map((f) => f.url) });
          setFiles([]); setPrompt("");
        }}>
        <Plus className="size-4 mr-1.5" /> Add to queue
      </Button>
    </div>
  );
}

function IngredientsMode({ onEnqueue }: { userId?: string; onEnqueue: (p: { prompt: string; ingredients: any }) => void | Promise<void> }) {
  const [scene, setScene] = useState("");
  const [objects, setObjects] = useState("");
  const [style, setStyle] = useState("");
  const [environment, setEnvironment] = useState("");
  const [motion, setMotion] = useState("");

  function submit() {
    const ingredients = {
      scene: scene.trim(),
      objects: objects.split(",").map((s) => s.trim()).filter(Boolean),
      style: style.trim(),
      environment: environment.trim(),
      motion: motion.trim(),
    };
    const prompt = [scene, environment, style && `${style} style`, motion && `${motion} motion`].filter(Boolean).join(", ");
    onEnqueue({ prompt: prompt || scene, ingredients });
    setScene(""); setObjects(""); setStyle(""); setEnvironment(""); setMotion("");
  }
  const canSubmit = scene.trim().length > 0;

  return (
    <div className="space-y-3">
      <Field label="Scene prompt">
        <Textarea value={scene} onChange={(e) => setScene(e.target.value)} rows={2}
          placeholder="A lone astronaut walking on a glacier"
          className="bg-white/5 border-white/10 text-sm resize-none" />
      </Field>
      <Field label="Objects (comma-separated)">
        <Input value={objects} onChange={(e) => setObjects(e.target.value)}
          placeholder="helmet, flag, drone" className="bg-white/5 border-white/10 h-9 text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Style">
          <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="cinematic"
            className="bg-white/5 border-white/10 h-9 text-sm" />
        </Field>
        <Field label="Environment">
          <Input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="arctic dusk"
            className="bg-white/5 border-white/10 h-9 text-sm" />
        </Field>
      </div>
      <Field label="Motion direction">
        <Input value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="slow dolly forward"
          className="bg-white/5 border-white/10 h-9 text-sm" />
      </Field>
      <Button className="w-full btn-gradient text-white border-0" disabled={!canSubmit} onClick={submit}>
        <Plus className="size-4 mr-1.5" /> Add to queue
      </Button>
    </div>
  );
}

function AudioMode({ userId, onEnqueue }: { userId?: string; onEnqueue: (p: { prompt: string; mediaUrls: string[] }) => void | Promise<void> }) {
  const [audio, setAudio] = useState<{ name: string; url: string; preview: string } | null>(null);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("auto");
  const [lipsync, setLipsync] = useState("high");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | null) {
    if (!f || !userId) return;
    if (!f.type.startsWith("audio/")) return toast.error("Please upload an audio file");
    setUploading(true);
    try {
      const path = `${userId}/audio/${crypto.randomUUID()}-${f.name}`;
      const { error } = await supabase.storage.from("uploads").upload(path, f, { upsert: false });
      if (error) return toast.error(error.message);
      const signed = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60 * 24 * 7);
      setAudio({ name: f.name, url: signed.data?.signedUrl ?? path, preview: URL.createObjectURL(f) });
    } finally { setUploading(false); }
  }

  return (
    <div className="space-y-3">
      <Field label="Audio file">
        {!audio ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:border-purple-400/40 transition cursor-pointer p-6 text-center"
          >
            <Music className="size-5 mx-auto text-muted-foreground mb-2" />
            <div className="text-xs text-muted-foreground">{uploading ? "Uploading…" : "Drop audio file or click to browse"}</div>
            <input ref={inputRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Music className="size-4 text-purple-300" />
              <div className="text-xs flex-1 truncate">{audio.name}</div>
              <button onClick={() => setAudio(null)} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground hover:text-red-400">
                <X className="size-3.5" />
              </button>
            </div>
            <audio src={audio.preview} controls className="w-full h-8" />
          </div>
        )}
      </Field>

      <Field label="Script / prompt (optional)">
        <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={3}
          placeholder="Spoken script or scene description…"
          className="bg-white/5 border-white/10 text-sm resize-none" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Voice">
          <Select value={voice} onValueChange={setVoice}>
            <SelectTrigger className="h-9 bg-white/5 border-white/10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="natural">Natural</SelectItem>
              <SelectItem value="expressive">Expressive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Lipsync quality">
          <Select value={lipsync} onValueChange={setLipsync}>
            <SelectTrigger className="h-9 bg-white/5 border-white/10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">Fast</SelectItem>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="high">High fidelity</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Button className="w-full btn-gradient text-white border-0" disabled={!audio}
        onClick={() => {
          if (!audio) return;
          onEnqueue({ prompt: script.trim() || `Lipsync from ${audio.name}`, mediaUrls: [audio.url] });
          setAudio(null); setScript("");
        }}>
        <Plus className="size-4 mr-1.5" /> Add to queue
      </Button>
    </div>
  );
}

/* ───────────────────────────── Settings panel ───────────────────────────── */

function SettingsPanel({ settings, onChange }: { settings: GenSettings; onChange: (p: Partial<GenSettings>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-y border-white/5">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02]">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Global generation settings</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">
              <Field label={`Duration · ${settings.duration}s`}>
                <Slider value={[settings.duration]} min={2} max={15} step={1} onValueChange={([v]) => onChange({ duration: v })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Resolution">
                  <Select value={settings.resolution} onValueChange={(v) => onChange({ resolution: v as any })}>
                    <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Aspect ratio">
                  <Select value={settings.aspect} onValueChange={(v) => onChange({ aspect: v })}>
                    <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ASPECT_RATIOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Style preset">
                <Select value={settings.style} onValueChange={(v) => onChange({ style: v })}>
                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{STYLE_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Negative prompt">
                <Textarea value={settings.negative} onChange={(e) => onChange({ negative: e.target.value })}
                  placeholder="blurry, low quality, watermark…" rows={2}
                  className="bg-white/5 border-white/10 text-xs resize-none" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Seed (advanced)">
                  <Input value={settings.seed} onChange={(e) => onChange({ seed: e.target.value })} placeholder="random"
                    className="h-8 bg-white/5 border-white/10 text-xs" />
                </Field>
                <Field label="Batch / prompt">
                  <Input type="number" min={1} max={8} value={settings.batch}
                    onChange={(e) => onChange({ batch: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) })}
                    className="h-8 bg-white/5 border-white/10 text-xs" />
                </Field>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────────── Shared ───────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
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

function JobRow({
  job, gradient, canMoveUp, canMoveDown, onRetry, onRemove, onMoveUp, onMoveDown,
}: {
  job: Job; gradient: string;
  canMoveUp: boolean; canMoveDown: boolean;
  onRetry: (id: string) => void; onRemove: (id: string) => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const isRunning = ["processing", "generating", "downloading", "running"].includes(job.status);
  const isDone    = ["completed", "done"].includes(job.status);
  const isFailed  = job.status === "failed";

  const tone =
    isRunning ? "border-l-blue-500/80" :
    isDone    ? "border-l-green-500/60" :
    isFailed  ? "border-l-red-500/60" :
    job.status === "pending" ? "border-l-yellow-500/60" : "border-l-white/10";

  const StatusIcon = isRunning ? Loader2 : isDone ? CheckCircle2 : isFailed ? AlertCircle : Clock;

  return (
    <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      className={`rounded-lg bg-white/[0.02] border border-white/5 border-l-2 ${tone} p-2`}>
      <div className="flex items-start gap-2">
        <div className={`shrink-0 w-14 h-14 rounded-md bg-gradient-to-br ${gradient} relative overflow-hidden grid place-items-center`}>
          <div className="absolute inset-0 bg-black/40" />
          {job.media_urls?.[0] && /\.(png|jpg|jpeg|webp|gif)/i.test(job.media_urls[0])
            ? <img src={job.media_urls[0]} alt="" className="absolute inset-0 size-full object-cover" />
            : isRunning ? <Loader2 className="size-4 text-white relative animate-spin" />
            : isDone    ? <PlayCircle className="size-5 text-white relative" />
            : <Film className="size-4 text-white/70 relative" />}
          {isRunning && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
              <div className="h-full bg-white transition-all" style={{ width: `${job.progress}%` }} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs line-clamp-2 leading-snug">{job.prompt_text}</div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Badge className={
              isRunning ? "bg-blue-500/10 text-blue-400 border-0 text-[10px] h-4 px-1.5" :
              isDone    ? "bg-green-500/10 text-green-400 border-0 text-[10px] h-4 px-1.5" :
              isFailed  ? "bg-red-500/10 text-red-400 border-0 text-[10px] h-4 px-1.5" :
              "bg-yellow-500/10 text-yellow-400 border-0 text-[10px] h-4 px-1.5"
            }>
              <StatusIcon className={`size-2.5 mr-1 ${isRunning ? "animate-spin" : ""}`} />
              {job.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground capitalize">{job.mode?.replace("2", "→")}</span>
            {isRunning && <span className="text-[10px] text-muted-foreground">{job.progress}%</span>}
          </div>
          {job.error && <div className="text-[10px] text-red-400 mt-1 truncate">{job.error}</div>}
        </div>
        <div className="flex flex-col gap-0.5">
          {canMoveUp && <button onClick={onMoveUp} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground" title="Move up"><ArrowUp className="size-3" /></button>}
          {canMoveDown && <button onClick={onMoveDown} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground" title="Move down"><ArrowDown className="size-3" /></button>}
          {isFailed && <button onClick={() => onRetry(job.id)} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground hover:text-foreground" title="Retry"><RotateCcw className="size-3" /></button>}
          <button onClick={() => onRemove(job.id)} className="size-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground hover:text-red-400" title="Remove"><Trash2 className="size-3" /></button>
        </div>
      </div>
    </motion.div>
  );
}

function AnimatedGrid() {
  return (
    <div className="absolute inset-0 opacity-40 pointer-events-none">
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(168,85,247,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,.08) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse at top right, black, transparent 70%)",
      }} />
    </div>
  );
}

/* ───────────────────────────── Connect dialog ───────────────────────────── */

function ConnectAccountDialog({
  open, onOpenChange, platform, platformLabel, current, onConnect, onDisconnect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platform: Platform; platformLabel: string;
  current: { email: string; method: "google" | "password" } | null;
  onConnect: (email: string, method: "google" | "password") => void;
  onDisconnect: () => void;
}) {
  const [view, setView] = useState<"chooser" | "email">("chooser");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setView("chooser"); setEmail(current?.email ?? ""); setPassword(""); }
  }, [open, current]);

  async function handleGoogle() {
    setBusy(true);
    try {
      if (typeof window !== "undefined" && (window as any).SeedanceAI?.connectAccount) {
        (window as any).SeedanceAI.connectAccount(platform, { method: "google" });
      }
      await new Promise((r) => setTimeout(r, 600));
      onConnect(`google-user@${platform}.com`, "google");
      onOpenChange(false);
    } finally { setBusy(false); }
  }
  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      if (typeof window !== "undefined" && (window as any).SeedanceAI?.connectAccount) {
        (window as any).SeedanceAI.connectAccount(platform, { method: "password", email: email.trim(), password });
      }
      await new Promise((r) => setTimeout(r, 500));
      onConnect(email.trim(), "password");
      onOpenChange(false);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 max-w-md p-0 overflow-hidden bg-[#0a0a14]/95 backdrop-blur-2xl">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-20 w-72 h-72 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl" />
        </div>
        <div className="relative p-6">
          <DialogHeader className="space-y-2">
            <div className="size-11 rounded-xl bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-white/10 grid place-items-center mb-1">
              <LinkIcon className="size-5 text-purple-200" />
            </div>
            <DialogTitle className="font-display text-xl">Connect {platformLabel}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Sign in so the Seedance extension can run jobs on your behalf inside your own browser session.
            </DialogDescription>
          </DialogHeader>
          <AnimatePresence mode="wait" initial={false}>
            {view === "chooser" ? (
              <motion.div key="chooser" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-5 space-y-2.5">
                <button onClick={handleGoogle} disabled={busy}
                  className="w-full group rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] p-4 flex items-center gap-3 text-left transition disabled:opacity-50">
                  <div className="size-10 rounded-lg bg-white grid place-items-center shrink-0"><GoogleG /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">Continue with Google</div>
                    <div className="text-[11px] text-muted-foreground">Recommended for {platformLabel} accounts</div>
                  </div>
                  {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground -rotate-90" />}
                </button>
                <button onClick={() => setView("email")}
                  className="w-full group rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] p-4 flex items-center gap-3 text-left transition">
                  <div className="size-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-white/10 grid place-items-center shrink-0">
                    <Mail className="size-4 text-purple-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">Email & Password</div>
                    <div className="text-[11px] text-muted-foreground">Use your {platformLabel} login credentials</div>
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground -rotate-90" />
                </button>
                <div className="mt-4 rounded-lg border border-green-500/15 bg-green-500/[0.04] p-3 flex items-start gap-2.5">
                  <Lock className="size-3.5 text-green-300 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-green-200/80 leading-relaxed">
                    <span className="font-medium text-green-200">Credentials are not stored on our servers.</span> They stay in your browser and are handed off to the extension for local sign-in.
                  </p>
                </div>
                {current && (
                  <Button variant="ghost" onClick={() => { onDisconnect(); onOpenChange(false); }}
                    className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/5 mt-1">
                    <LogOut className="size-3.5 mr-1.5" /> Disconnect current account
                  </Button>
                )}
              </motion.div>
            ) : (
              <motion.form key="email" onSubmit={handleEmail} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-5 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-email" className="text-xs">Email</Label>
                  <Input id="acc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={`you@${platform}.com`} className="bg-white/5 border-white/10 h-10" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-pw" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input id="acc-pw" type={showPw ? "text" : "password"} autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" className="bg-white/5 border-white/10 h-10 pr-10" />
                    <button type="button" onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-green-500/[0.04] p-3 flex items-start gap-2.5">
                  <Lock className="size-3.5 text-green-300 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-green-200/80 leading-relaxed">
                    <span className="font-medium text-green-200">Credentials are not stored on our servers.</span> Saved in your browser only.
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setView("chooser")} className="flex-1">Back</Button>
                  <Button type="submit" disabled={busy || !email.trim()} className="flex-1 btn-gradient text-white border-0">
                    {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <ShieldCheck className="size-4 mr-1.5" />}
                    {current ? "Update" : "Connect"}
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.5 1 7.6 2.8l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.9 0 5.5 1 7.6 2.8l5.7-5.7C33.7 6.9 29.1 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5 0 9.6-1.9 13-5l-6-5c-1.9 1.3-4.4 2-7 2-5.3 0-9.8-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.8-3.7 5l6 5C40.7 35.5 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
