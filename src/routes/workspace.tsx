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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Play, Pause, SkipForward, RotateCcw, Trash2, Plus,
  Loader2, CheckCircle2, AlertCircle, Clock, Zap, Activity,
  ArrowLeft, Download, Sparkles, Film, CloudDownload, Cpu, Radio,
  LinkIcon, LogOut, ShieldCheck, PlayCircle, ChevronDown, Lock,
  Type, Image as ImageIcon, Layers, SlidersHorizontal, Wand2,
  Mail, Video, Music, Aperture, GitCompare, Eye, EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({ component: WorkspacePage });

const TARGETS = {
  dreamina: { label: "Dreamina", color: "from-pink-500 to-purple-500" },
  seedance: { label: "Seedance", color: "from-purple-500 to-blue-500" },
  jimeng:   { label: "Jimeng",   color: "from-blue-500 to-cyan-500" },
} as const;
type Platform = keyof typeof TARGETS;

const MODES = [
  { id: "text2video",     label: "Text → Video",       icon: Type,        desc: "Generate from a written prompt" },
  { id: "image2video",    label: "Image → Video",      icon: ImageIcon,   desc: "Animate a still image" },
  { id: "ingredients",    label: "Ingredients → Video",icon: Layers,      desc: "Mix subjects, props & styles" },
  { id: "firstframe",     label: "First Frame → Video",icon: Aperture,    desc: "Use start frame as anchor" },
  { id: "lastframe",      label: "Last Frame → Video", icon: Aperture,    desc: "Drive towards a final frame" },
  { id: "startend",       label: "Start + End Frame",  icon: GitCompare,  desc: "Interpolate between two frames" },
  { id: "audiovideo",     label: "Audio + Video",      icon: Music,       desc: "Sync motion to audio" },
  { id: "refimages",      label: "Reference Images",   icon: ImageIcon,   desc: "Match style of references" },
  { id: "refvideo",       label: "Reference Video",    icon: Video,       desc: "Inherit motion from a clip" },
  { id: "multiref",       label: "Multi-reference",    icon: Layers,      desc: "Blend multiple references" },
] as const;
type ModeId = typeof MODES[number]["id"];

const STYLE_PRESETS = ["Cinematic", "Anime", "Photoreal", "3D Render", "Claymation", "Watercolor", "Cyberpunk", "Vintage Film"];
const CAMERA_MOVES = ["Static", "Pan Left", "Pan Right", "Zoom In", "Zoom Out", "Orbit", "Dolly", "Crane Up"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "21:9"];

type GenSettings = {
  mode: ModeId;
  duration: number;
  resolution: "720p" | "1080p";
  aspect: string;
  style: string;
  camera: string;
  creativity: number;
  negative: string;
  seed: string;
  batch: number;
};

const DEFAULT_SETTINGS: GenSettings = {
  mode: "text2video",
  duration: 5,
  resolution: "1080p",
  aspect: "16:9",
  style: "Cinematic",
  camera: "Static",
  creativity: 60,
  negative: "",
  seed: "",
  batch: 1,
};

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
  const [accounts, setAccounts] = useState<Record<Platform, { email: string; method: "google" | "password" } | null>>({
    dreamina: null, seedance: null, jimeng: null,
  });
  const [completedFiles, setCompletedFiles] = useState<Array<{ id: string; prompt_text: string | null; platform: string | null; created_at: string }>>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [settings, setSettings] = useState<GenSettings>(DEFAULT_SETTINGS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("seedance.accounts");
      if (raw) setAccounts(JSON.parse(raw));
      const s = localStorage.getItem("seedance.settings");
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
    } catch {}
  }, []);
  function persistAccounts(next: typeof accounts) {
    setAccounts(next);
    try { localStorage.setItem("seedance.accounts", JSON.stringify(next)); } catch {}
  }
  function updateSettings(patch: Partial<GenSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("seedance.settings", JSON.stringify(next)); } catch {}
      return next;
    });
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

  useEffect(() => {
    if (!running || !user) return;
    if (extensionConnected) return;

    let cancelled = false;
    async function step() {
      if (cancelled) return;
      let cur = jobs.find((j) => j.status === "running");
      if (!cur) {
        const next = jobs.find((j) => j.status === "pending");
        if (!next) {
          setRunning(false); setPhase("idle"); log("ok", "Queue complete");
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
    const rows: { user_id: string; prompt_text: string; platform: Platform }[] = [];
    for (const line of lines) {
      for (let i = 0; i < settings.batch; i++) {
        rows.push({ user_id: user.id, prompt_text: line, platform });
      }
    }
    const { error } = await supabase.from("queue_jobs").insert(rows);
    if (error) return toast.error(error.message);
    log("ok", `Queued ${rows.length} job${rows.length > 1 ? "s" : ""} · ${currentMode().label}`);
    setBulk("");
  }

  function currentMode() {
    return MODES.find((m) => m.id === settings.mode) ?? MODES[0];
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
    log("info", `Automation started — ${TARGETS[platform].label} · ${currentMode().label} · ${settings.resolution} ${settings.aspect}`);
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

  const lineCount = bulk.split("\n").map((l) => l.trim()).filter(Boolean).length;

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

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(360px,440px)_1fr]">
        {/* LEFT */}
        <aside className="border-r border-white/5 bg-sidebar/50 backdrop-blur-xl flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 grid grid-cols-4 gap-2 border-b border-white/5">
            <Stat icon={Clock}        label="Pending" value={pending.length} tone="yellow" />
            <Stat icon={Activity}     label="Running" value={active ? 1 : 0} tone="blue"   />
            <Stat icon={CheckCircle2} label="Done"    value={completed}      tone="green"  />
            <Stat icon={AlertCircle}  label="Failed"  value={failed}         tone="red"    />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Mode selector */}
            <div className="p-4 border-b border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wand2 className="size-3" /> Generation mode
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = settings.mode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => updateSettings({ mode: m.id })}
                      className={`group text-left rounded-lg border p-2 transition-all ${
                        active
                          ? "border-purple-400/50 bg-gradient-to-br from-purple-500/20 to-blue-500/10 shadow-[0_0_0_1px_rgba(168,85,247,0.3)]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                      }`}
                      title={m.desc}
                    >
                      <Icon className={`size-3.5 ${active ? "text-purple-300" : "text-muted-foreground"}`} />
                      <div className={`mt-1 text-[11px] font-medium leading-tight ${active ? "text-foreground" : "text-muted-foreground"}`}>
                        {m.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add prompts */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Add to queue</div>
                <div className="text-[10px] text-muted-foreground">
                  {lineCount} line{lineCount === 1 ? "" : "s"} × {settings.batch} = {lineCount * settings.batch} job{lineCount * settings.batch === 1 ? "" : "s"}
                </div>
              </div>
              <Textarea
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={`One prompt per line…\nA neon city at night, cinematic\nA whale flying through clouds`}
                rows={4}
                className="bg-white/5 border-white/10 font-mono text-xs resize-none"
              />
              <Button onClick={addBulk} size="sm" className="w-full mt-2 btn-gradient text-white border-0" disabled={!lineCount}>
                <Plus className="size-3.5 mr-1.5" /> Queue {lineCount * settings.batch || ""} job{lineCount * settings.batch === 1 ? "" : "s"}
              </Button>
            </div>

            {/* Advanced controls */}
            <div className="border-b border-white/5">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02]"
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="size-3" /> Advanced controls
                </span>
                <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {advancedOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3">
                      <Field label={`Duration · ${settings.duration}s`}>
                        <Slider value={[settings.duration]} min={2} max={15} step={1} onValueChange={([v]) => updateSettings({ duration: v })} />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Resolution">
                          <Select value={settings.resolution} onValueChange={(v) => updateSettings({ resolution: v as GenSettings["resolution"] })}>
                            <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="720p">720p</SelectItem>
                              <SelectItem value="1080p">1080p</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Aspect ratio">
                          <Select value={settings.aspect} onValueChange={(v) => updateSettings({ aspect: v })}>
                            <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ASPECT_RATIOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Style preset">
                          <Select value={settings.style} onValueChange={(v) => updateSettings({ style: v })}>
                            <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STYLE_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Camera movement">
                          <Select value={settings.camera} onValueChange={(v) => updateSettings({ camera: v })}>
                            <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CAMERA_MOVES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <Field label={`Creativity · ${settings.creativity}`}>
                        <Slider value={[settings.creativity]} min={0} max={100} step={5} onValueChange={([v]) => updateSettings({ creativity: v })} />
                      </Field>
                      <Field label="Negative prompt">
                        <Textarea
                          value={settings.negative}
                          onChange={(e) => updateSettings({ negative: e.target.value })}
                          placeholder="blurry, low quality, watermark…"
                          rows={2}
                          className="bg-white/5 border-white/10 text-xs resize-none"
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Seed">
                          <Input
                            value={settings.seed}
                            onChange={(e) => updateSettings({ seed: e.target.value })}
                            placeholder="random"
                            className="h-8 bg-white/5 border-white/10 text-xs"
                          />
                        </Field>
                        <Field label="Batch / prompt">
                          <Input
                            type="number" min={1} max={8}
                            value={settings.batch}
                            onChange={(e) => updateSettings({ batch: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) })}
                            className="h-8 bg-white/5 border-white/10 text-xs"
                          />
                        </Field>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Queue */}
            <div className="flex flex-col">
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queue ({jobs.length})</div>
                <button onClick={clearDone} className="text-[10px] text-muted-foreground hover:text-foreground">
                  Clear completed
                </button>
              </div>
              <div className="p-3 space-y-2">
                {jobs.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    No prompts yet. Add some above.
                  </div>
                )}
                {jobs.map((j) => <JobRow key={j.id} job={j} gradient={TARGETS[(j.platform as Platform) ?? "dreamina"]?.color ?? "from-purple-500 to-blue-500"} onRetry={retry} onRemove={remove} />)}
              </div>
            </div>
          </div>

          {/* Logs */}
          <div className="shrink-0 border-t border-white/5 h-32 flex flex-col">
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

        {/* RIGHT */}
        <main className="min-w-0 min-h-0 flex flex-col bg-[#0a0a14] p-4 overflow-hidden">
          <AutomationMonitor
            platform={TARGETS[platform].label}
            gradient={TARGETS[platform].color}
            active={active}
            phase={phase}
            running={running}
            completedCount={completed}
            completedFiles={completedFiles}
            connectedAs={accounts[platform]?.email ?? null}
            mode={currentMode()}
            settings={settings}
            onSkip={skipCurrent}
          />
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

/* ---------------- Automation Monitor ---------------- */

type CompletedFile = { id: string; prompt_text: string | null; platform: string | null; created_at: string };

function AutomationMonitor({
  platform, gradient, active, phase, running, completedCount, completedFiles, connectedAs, mode, settings, onSkip,
}: {
  platform: string; gradient: string; active: Job | undefined; phase: Phase;
  running: boolean; completedCount: number;
  completedFiles: CompletedFile[]; connectedAs: string | null;
  mode: typeof MODES[number]; settings: GenSettings;
  onSkip: () => void;
}) {
  const typed = useTypewriter(active?.prompt_text ?? "", 18);
  return (
    <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 to-black/30 overflow-hidden flex flex-col shadow-[0_40px_120px_-40px_rgba(168,85,247,0.4)]">
      <div className="shrink-0 h-11 border-b border-white/5 flex items-center px-4 gap-3 bg-black/40">
        <div className={`size-2 rounded-full bg-gradient-to-r ${gradient}`} />
        <span className="font-display font-semibold text-sm">{platform} · Live Generation Workspace</span>
        <Badge className="bg-white/5 text-muted-foreground border-0 text-[10px]">{mode.label}</Badge>
        {connectedAs && (
          <Badge className="bg-green-500/10 text-green-300 border-0 text-[10px]">
            <ShieldCheck className="size-2.5 mr-1" /> {connectedAs}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="hidden md:inline">{settings.resolution} · {settings.aspect} · {settings.duration}s</span>
          <Cpu className="size-3.5" />
          <span>{running ? "Engine running" : "Engine idle"}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent p-6 relative overflow-hidden">
          <AnimatedGrid />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Active prompt · {mode.label}</div>
            <div className="mt-2 font-display text-xl md:text-2xl font-bold leading-snug min-h-[2.5rem]">
              {active ? (
                <>
                  <span>{typed}</span>
                  <motion.span aria-hidden animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }}
                    className="inline-block w-[2px] h-5 align-middle bg-purple-300 ml-1" />
                </>
              ) : running ? "Loading next prompt…" : "Awaiting your queue"}
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
                Pick a generation mode, add prompts, then press <span className="text-foreground font-medium">Run queue</span>.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SignalCard icon={Activity}     label="Engine"     value={running ? "Running" : "Paused"} tone={running ? "green" : "muted"} />
          <SignalCard icon={Film}         label="Phase"      value={phase === "idle" ? "—" : phase} tone="blue" />
          <SignalCard icon={Aperture}     label="Resolution" value={`${settings.resolution} ${settings.aspect}`} tone="purple" />
          <SignalCard icon={CheckCircle2} label="Completed"  value={String(completedCount)} tone="green" />
        </div>

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

        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-display font-semibold">Completed videos</div>
              <div className="text-xs text-muted-foreground">Auto-saved to your Library as the queue finishes.</div>
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
                  <motion.div key={f.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="group rounded-xl overflow-hidden border border-white/10 bg-white/[0.02] hover:border-purple-400/30 transition-colors">
                    <div className="aspect-video relative bg-gradient-to-br from-purple-500/30 via-blue-500/20 to-black/40">
                      <div className="absolute inset-0 grid place-items-center">
                        <PlayCircle className="size-8 text-white/70 group-hover:text-white transition" />
                      </div>
                      <Badge className="absolute top-2 left-2 bg-black/60 border-0 text-[10px] capitalize">{f.platform ?? platform}</Badge>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[11px] line-clamp-2 leading-snug">{f.prompt_text ?? "Untitled"}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(f.created_at).toLocaleTimeString()}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground flex items-start gap-3">
          <Radio className="size-4 mt-0.5 text-muted-foreground" />
          <div>
            Install the <span className="text-foreground font-medium">Seedance AI Chrome extension</span> to drive {platform} in your real browser tab.
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
      <div className="font-display text-lg font-bold mt-1.5 capitalize text-foreground truncate">{value}</div>
    </div>
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

function RenderVisualizer({ phase, active }: { phase: Phase; active: boolean }) {
  const bars = Array.from({ length: 36 });
  return (
    <div className="h-32 rounded-xl bg-black/60 border border-white/5 overflow-hidden relative">
      <div className="absolute inset-0 flex items-end gap-1 px-3 pb-3">
        {bars.map((_, i) => (
          <motion.span key={i} className="flex-1 rounded-t bg-gradient-to-t from-purple-500/70 to-blue-400/70"
            animate={active ? { height: [`${10 + ((i * 7) % 60)}%`, `${20 + ((i * 11) % 70)}%`, `${15 + ((i * 5) % 50)}%`] } : { height: "8%" }}
            transition={{ duration: 1.2 + (i % 5) * 0.15, repeat: Infinity, ease: "easeInOut" }} />
        ))}
      </div>
      <AnimatePresence>
        {active && (
          <motion.div initial={{ x: "-100%" }} animate={{ x: "100%" }} exit={{ opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        )}
      </AnimatePresence>
      <div className="absolute top-2 left-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        {phase === "idle" ? "standby" : phase}
      </div>
    </div>
  );
}

/* ---------------- Shared ---------------- */

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

function JobRow({ job, gradient, onRetry, onRemove }: { job: Job; gradient: string; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const tone: Record<string, string> = {
    pending: "border-l-yellow-500/60",
    running: "border-l-blue-500/80",
    done: "border-l-green-500/60",
    failed: "border-l-red-500/60",
    cancelled: "border-l-white/10",
  };
  const StatusIcon = job.status === "running" ? Loader2 : job.status === "done" ? CheckCircle2 : job.status === "failed" ? AlertCircle : Clock;
  return (
    <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      className={`rounded-lg bg-white/[0.02] border border-white/5 border-l-2 ${tone[job.status] ?? ""} p-2`}>
      <div className="flex items-start gap-2">
        {/* Thumbnail */}
        <div className={`shrink-0 w-14 h-14 rounded-md bg-gradient-to-br ${gradient} relative overflow-hidden grid place-items-center`}>
          <div className="absolute inset-0 bg-black/40" />
          {job.status === "running" ? (
            <Loader2 className="size-4 text-white relative animate-spin" />
          ) : job.status === "done" ? (
            <PlayCircle className="size-5 text-white relative" />
          ) : (
            <Film className="size-4 text-white/70 relative" />
          )}
          {job.status === "running" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
              <div className="h-full bg-white transition-all" style={{ width: `${job.progress}%` }} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs line-clamp-2 leading-snug">{job.prompt_text}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge className={
              job.status === "running" ? "bg-blue-500/10 text-blue-400 border-0 text-[10px] h-4 px-1.5" :
              job.status === "done"    ? "bg-green-500/10 text-green-400 border-0 text-[10px] h-4 px-1.5" :
              job.status === "failed"  ? "bg-red-500/10 text-red-400 border-0 text-[10px] h-4 px-1.5" :
              "bg-yellow-500/10 text-yellow-400 border-0 text-[10px] h-4 px-1.5"
            }>
              <StatusIcon className={`size-2.5 mr-1 ${job.status === "running" ? "animate-spin" : ""}`} />
              {job.status}
            </Badge>
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

/* ---------------- Typewriter ---------------- */

function useTypewriter(text: string, charsPerSec = 24) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    if (!text) return;
    let i = 0;
    const ms = Math.max(15, Math.floor(1000 / charsPerSec));
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, ms);
    return () => window.clearInterval(id);
  }, [text, charsPerSec]);
  return out;
}

/* ---------------- Connect Account Dialog ---------------- */

function ConnectAccountDialog({
  open, onOpenChange, platform, platformLabel, current, onConnect, onDisconnect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platform: Platform;
  platformLabel: string;
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
    if (open) {
      setView("chooser");
      setEmail(current?.email ?? "");
      setPassword("");
    }
  }, [open, current]);

  async function handleGoogle() {
    setBusy(true);
    try {
      if (typeof window !== "undefined" && (window as any).SeedanceAI?.connectAccount) {
        (window as any).SeedanceAI.connectAccount(platform, { method: "google" });
      }
      await new Promise((r) => setTimeout(r, 700));
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
      await new Promise((r) => setTimeout(r, 600));
      onConnect(email.trim(), "password");
      onOpenChange(false);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 max-w-md p-0 overflow-hidden bg-[#0a0a14]/95 backdrop-blur-2xl shadow-[0_40px_120px_-20px_rgba(168,85,247,0.45)]">
        {/* Glow background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-20 w-72 h-72 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute inset-0" style={{
            backgroundImage: "linear-gradient(rgba(168,85,247,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse at top, black, transparent 75%)",
          }} />
        </div>

        <div className="relative p-6 pb-5">
          <DialogHeader className="space-y-2">
            <div className="size-11 rounded-xl bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-white/10 grid place-items-center mb-1">
              <LinkIcon className="size-5 text-purple-200" />
            </div>
            <DialogTitle className="font-display text-xl">Connect {platformLabel}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Sign in so the Seedance AI extension can run prompts on your behalf inside your own browser session.
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait" initial={false}>
            {view === "chooser" ? (
              <motion.div
                key="chooser"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mt-5 space-y-2.5"
              >
                <button
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full group rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 p-4 flex items-center gap-3 text-left transition-all disabled:opacity-50"
                >
                  <div className="size-10 rounded-lg bg-white grid place-items-center shrink-0">
                    <GoogleG />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">Continue with Google</div>
                    <div className="text-[11px] text-muted-foreground">Recommended for {platformLabel} accounts</div>
                  </div>
                  {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
                    <ChevronDown className="size-4 text-muted-foreground -rotate-90 group-hover:translate-x-0.5 transition-transform" />}
                </button>

                <button
                  onClick={() => setView("email")}
                  className="w-full group rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 p-4 flex items-center gap-3 text-left transition-all"
                >
                  <div className="size-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-white/10 grid place-items-center shrink-0">
                    <Mail className="size-4 text-purple-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">Email & Password</div>
                    <div className="text-[11px] text-muted-foreground">Use your {platformLabel} login credentials</div>
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground -rotate-90 group-hover:translate-x-0.5 transition-transform" />
                </button>

                <div className="mt-4 rounded-lg border border-green-500/15 bg-green-500/[0.04] p-3 flex items-start gap-2.5">
                  <Lock className="size-3.5 text-green-300 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-green-200/80 leading-relaxed">
                    <span className="font-medium text-green-200">Credentials are not stored on our servers.</span> They stay in your browser and are handed off to the extension for local sign-in.
                  </p>
                </div>

                {current && (
                  <Button
                    type="button" variant="ghost" onClick={() => { onDisconnect(); onOpenChange(false); }}
                    className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/5 mt-1"
                  >
                    <LogOut className="size-3.5 mr-1.5" /> Disconnect current account
                  </Button>
                )}
              </motion.div>
            ) : (
              <motion.form
                key="email"
                onSubmit={handleEmail}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mt-5 space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="acc-email" className="text-xs">Email</Label>
                  <Input
                    id="acc-email" type="email" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={`you@${platform}.com`}
                    className="bg-white/5 border-white/10 h-10" required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-pw" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      id="acc-pw" type={showPw ? "text" : "password"} autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white/5 border-white/10 h-10 pr-10"
                    />
                    <button
                      type="button" onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded text-muted-foreground hover:text-foreground"
                    >
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
                  <Button type="button" variant="ghost" onClick={() => setView("chooser")} className="flex-1">
                    Back
                  </Button>
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
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 7.9-21.1l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.5-5.2l-6.2-5.3A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4 5.5l6.2 5.3C41 35 44 30 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
