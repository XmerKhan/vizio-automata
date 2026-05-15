import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chrome, Download, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/extension")({ component: ExtensionLanding });

function ExtensionLanding() {
  const steps = [
    { t: "Install the extension", d: "One click — Chrome, Edge, Brave, Arc, Opera." },
    { t: "Sign in to Seedance / Dreamina / Jimeng", d: "Use your existing AI account, exactly like normal." },
    { t: "Pair with Seedance AI", d: "Click the icon, sign in once, you're connected." },
    { t: "Run your queue", d: "Add prompts in your dashboard. Automation begins instantly." },
  ];
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <section className="pt-40 pb-20 grid-bg">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Badge variant="outline" className="border-white/10 bg-white/5"><Chrome className="size-3 mr-1" /> Chrome extension</Badge>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-bold">The bridge between you and your AI tools.</h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Our lightweight extension automates Seedance, Dreamina, and Jimeng inside your browser — so you can queue hundreds of prompts and walk away.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="btn-gradient text-white border-0 h-12 px-6"><Download className="size-4 mr-2" /> Install for Chrome</Button>
            <Link to="/auth"><Button size="lg" variant="outline" className="h-12 px-6 border-white/10 bg-white/5">Open dashboard <ArrowRight className="ml-1 size-4" /></Button></Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4 grid md:grid-cols-2 gap-4">
          {steps.map((s, i) => (
            <Card key={s.t} className="glass border-0 p-6">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg btn-gradient grid place-items-center text-white font-display font-bold text-sm">{i + 1}</div>
                <div>
                  <div className="font-semibold">{s.t}</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.d}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-3xl px-4">
          <Card className="glass border-0 p-6">
            <ShieldCheck className="size-6 text-green-400" />
            <h3 className="mt-2 font-display font-semibold">Privacy-first by design</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The extension runs entirely inside your browser. Your AI account login never reaches our servers — we only see queue metadata and the resulting video URLs you choose to sync.
            </p>
            <ul className="mt-4 text-sm space-y-2">
              {[
                "No password storage on our side",
                "End-to-end automation handled locally",
                "Open extension protocol you can audit",
              ].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="size-4 text-green-400" />{t}</li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
