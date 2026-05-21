import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chrome, Download, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { CHROME_STORE_URL, EDGE_STORE_URL } from "@/routes/index";

export const Route = createFileRoute("/extension")({
  component: ExtensionLanding,
  head: () => ({
    meta: [
      { title: "Install the Auto Seedance Extension — Chrome & Microsoft Edge" },
      { name: "description", content: "Install Auto Seedance for Chrome or Microsoft Edge to automate bulk Dreamina AI image and video generation directly in your browser." },
      { property: "og:title", content: "Install Auto Seedance — Chrome & Edge Extension" },
      { property: "og:description", content: "Automate bulk Dreamina AI image and video generation directly in your browser." },
      { property: "og:url", content: "https://vizio-automata.lovable.app/extension" },
    ],
    links: [{ rel: "canonical", href: "https://vizio-automata.lovable.app/extension" }],
  }),
});

function ExtensionLanding() {
  const steps = [
    { t: "Install the extension", d: "One-click install for Chrome and Microsoft Edge." },
    { t: "Sign in to Dreamina", d: "Use your existing Dreamina account normally." },
    { t: "Open Auto Seedance", d: "Connect your workflow dashboard instantly." },
    { t: "Run your queue", d: "Queue prompts and automate generation workflows." },
  ];
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <section id="install" className="pt-40 pb-20 grid-bg">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Badge variant="outline" className="border-white/10 bg-white/5"><Chrome className="size-3 mr-1" /> Chrome &amp; Edge Extension</Badge>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-bold">The bridge between you and your AI tools.</h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Our lightweight extension automates Dreamina inside your browser — queue hundreds of prompts and walk away.
          </p>
          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-xl mx-auto">
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="w-full btn-gradient text-white border-0 h-12">
                <Download className="size-4 mr-2" /> Install for Chrome
              </Button>
            </a>
            <a href={EDGE_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="w-full btn-gradient text-white border-0 h-12">
                <Download className="size-4 mr-2" /> Install for Microsoft Edge
              </Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Also works on Brave, Arc, and Opera (Chromium).</p>
          <div className="mt-6">
            <Link to="/dashboard"><Button variant="outline" className="h-11 px-6 border-white/10 bg-white/5">Open Dashboard <ArrowRight className="ml-1 size-4" /></Button></Link>
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
              The extension runs entirely inside your browser. Your Dreamina account login never reaches our servers — we only see queue metadata and the resulting URLs you choose to sync.
            </p>
            <ul className="mt-4 text-sm space-y-2">
              {[
                "No password storage on our side",
                "End-to-end automation handled locally",
                "Browser permissions used only for workflow functionality",
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
