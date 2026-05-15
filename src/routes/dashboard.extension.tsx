import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chrome, Download, CheckCircle2, ArrowRight, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/dashboard/extension")({ component: ExtensionPage });

function ExtensionPage() {
  const { user } = useSession();
  const [connected, setConnected] = useState(false);
  const [browser, setBrowser] = useState("Unknown");

  async function refresh() {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("extension_connected").eq("id", user.id).maybeSingle();
    setConnected(!!data?.extension_connected);
  }

  useEffect(() => {
    refresh();
    const ua = navigator.userAgent;
    if (ua.includes("Edg")) setBrowser("Edge");
    else if (ua.includes("Brave")) setBrowser("Brave");
    else if (ua.includes("Chrome")) setBrowser("Chrome");
    else if (ua.includes("Firefox")) setBrowser("Firefox");
    else setBrowser("Safari");
  }, [user]);

  const steps = [
    { t: "Install the extension", d: "Add Seedance AI to Chrome / Edge / Brave from the store." },
    { t: "Sign in to your AI account", d: "Open Seedance, Dreamina or Jimeng — log in as you normally would." },
    { t: "Pair the extension", d: "Click the extension icon and sign in with your Seedance AI account." },
    { t: "Start the queue", d: "Add prompts, hit Run — automation begins instantly." },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl font-bold">Extension</h1>
      <p className="text-muted-foreground mt-1">Your browser is the engine. The extension is the bridge.</p>

      <Card className="glass border-0 p-6 mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`size-12 rounded-xl grid place-items-center ${connected ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
            <Chrome className={`size-6 ${connected ? "text-green-400" : "text-yellow-400"}`} />
          </div>
          <div>
            <div className="font-display font-semibold">{connected ? "Extension connected" : "Extension not detected"}</div>
            <div className="text-xs text-muted-foreground">Browser: {browser}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-white/10 bg-white/5" onClick={refresh}><RefreshCw className="size-4 mr-2" /> Refresh</Button>
          <Button className="btn-gradient text-white border-0"><Download className="size-4 mr-2" /> Install extension</Button>
        </div>
      </Card>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        {steps.map((s, i) => (
          <motion.div key={s.t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="glass border-0 p-6 h-full">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg btn-gradient grid place-items-center text-white font-display font-bold text-sm">{i + 1}</div>
                <div>
                  <div className="font-semibold">{s.t}</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.d}</div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="glass border-0 p-6 mt-8">
        <Badge variant="outline" className="border-white/10 bg-white/5">Workflow</Badge>
        <h2 className="font-display text-2xl font-bold mt-3">How a job flows</h2>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          {["You add prompt", "Saved to queue", "Extension picks it up", "Drives Seedance", "Video downloaded", "Synced to library"].map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2">
              <span className="px-3 py-2 rounded-lg glass">{s}</span>
              {i < arr.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-400" /> Your AI account credentials never leave your browser.
        </p>
      </Card>
    </div>
  );
}

declare global {
  interface Window {
    SeedanceAI?: {
      connect: (token: string) => void;
      sendPrompts: (prompts: string[]) => void;
      onStatus: (cb: (s: { jobId: string; status: string; progress: number }) => void) => void;
    };
  }
}
