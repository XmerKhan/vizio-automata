import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles, Zap, Layers, Workflow, ShieldCheck, Download, Chrome,
  Play, ArrowRight, Check, Cpu, Bot, Clock,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <LogosStrip />
      <DemoSection />
      <Features />
      <HowItWorks />
      <PricingTeaser />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative pt-40 pb-28 grid-bg overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Badge variant="outline" className="border-white/10 bg-white/5 backdrop-blur text-xs">
            <Sparkles className="size-3 mr-1 text-purple-400" /> New · Bulk queue mode v2
          </Badge>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-6 font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]"
        >
          Automate AI video generation
          <br />
          <span className="gradient-text">at scale.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
        >
          Batch generate cinematic AI videos using your own Seedance, Dreamina,
          or Jimeng account. Queue, automate, and download — all on autopilot.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-9 flex flex-wrap justify-center gap-3"
        >
          <Link to="/auth">
            <Button size="lg" className="btn-gradient text-white border-0 h-12 px-6">
              Get Started <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
          <Link to="/extension">
            <Button size="lg" variant="outline" className="h-12 px-6 border-white/10 bg-white/5 backdrop-blur">
              <Chrome className="mr-2 size-4" /> Install Extension
            </Button>
          </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-16 mx-auto max-w-5xl"
        >
          <div className="glass rounded-2xl p-2 glow-purple">
            <div className="rounded-xl bg-[oklch(0.13_0.03_270)] aspect-[16/9] grid place-items-center relative overflow-hidden">
              <div className="absolute inset-0 grid-bg opacity-60" />
              <div className="relative text-center">
                <div className="size-16 rounded-full btn-gradient grid place-items-center mx-auto glow-purple">
                  <Play className="size-7 text-white ml-1" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">Live automation preview</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LogosStrip() {
  const items = ["Seedance", "Dreamina", "Jimeng", "Runway", "Pika", "Kling"];
  return (
    <div className="border-y border-white/5 py-8">
      <div className="mx-auto max-w-6xl px-4 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-muted-foreground/80">
        <span className="text-xs uppercase tracking-widest">Works with</span>
        {items.map((i) => (
          <span key={i} className="font-display font-semibold text-base opacity-70">{i}</span>
        ))}
      </div>
    </div>
  );
}

function DemoSection() {
  return (
    <section id="how" className="py-28">
      <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <Badge variant="outline" className="border-white/10 bg-white/5">Automation</Badge>
          <h2 className="mt-4 font-display text-4xl font-bold">Your prompts → our queue → real videos.</h2>
          <p className="mt-4 text-muted-foreground">
            Drop a list of prompts, hit run. Our Chrome extension takes over the
            browser, drives Seedance / Dreamina / Jimeng with your account, and
            streams the finished videos back to your dashboard.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Bulk paste hundreds of prompts at once",
              "Smart retries, throttling, anti-rate-limit",
              "Auto-download & organized library",
              "Realtime queue progress in your dashboard",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 size-5 rounded-md btn-gradient grid place-items-center">
                  <Check className="size-3 text-white" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <motion.div
          initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
        >
          <Card className="glass border-0 p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Queue · 124 jobs</span>
              <span className="text-green-400">● Running</span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { p: "Cinematic drone shot of Tokyo at dusk, neon", s: 100 },
                { p: "Macro shot of glowing crystal forming, slow", s: 72 },
                { p: "Astronaut floating through neon nebula 4k", s: 41 },
                { p: "Liquid metal morphing into a rose, studio", s: 0 },
              ].map((j, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="text-xs truncate">{j.p}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full btn-gradient" style={{ width: `${j.s}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: Workflow, title: "Bulk prompt queue", desc: "Paste hundreds of prompts and let the queue grind through them, 24/7." },
    { icon: Bot, title: "Browser automation", desc: "Our extension drives Seedance / Dreamina / Jimeng with your own account." },
    { icon: Download, title: "Auto download library", desc: "Every output is saved, tagged, and previewable in your dashboard." },
    { icon: Zap, title: "Fast & throttled", desc: "Smart pacing avoids rate limits while keeping throughput high." },
    { icon: ShieldCheck, title: "Secrets stay yours", desc: "Your AI account credentials never leave your browser." },
    { icon: Cpu, title: "Future API mode", desc: "Premium tier (coming soon) generates directly via API — no extension needed." },
  ];
  return (
    <section id="features" className="py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="outline" className="border-white/10 bg-white/5">Features</Badge>
          <h2 className="mt-4 font-display text-4xl font-bold">Everything a video creator needs.</h2>
          <p className="mt-3 text-muted-foreground">A premium automation layer for the AI video tools you already use.</p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {items.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Card className="glass border-0 p-6 h-full hover:translate-y-[-2px] transition">
                <div className="size-10 rounded-xl btn-gradient grid place-items-center">
                  <f.icon className="size-5 text-white" />
                </div>
                <h3 className="mt-4 font-display font-semibold text-lg">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Install extension", d: "One click — Chrome, Edge, Brave." },
    { n: "02", t: "Connect your AI account", d: "Sign into Seedance / Dreamina / Jimeng as usual." },
    { n: "03", t: "Queue prompts", d: "Paste, schedule, hit run — the queue takes over." },
    { n: "04", t: "Download outputs", d: "Videos auto-sync to your library, ready to share." },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="outline" className="border-white/10 bg-white/5">How it works</Badge>
          <h2 className="mt-4 font-display text-4xl font-bold">From prompt to library in 4 steps.</h2>
        </div>
        <div className="mt-12 grid md:grid-cols-4 gap-5">
          {steps.map((s) => (
            <Card key={s.n} className="glass border-0 p-6">
              <div className="text-xs gradient-text font-display font-bold">{s.n}</div>
              <div className="mt-2 font-semibold">{s.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.d}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="outline" className="border-white/10 bg-white/5">Pricing</Badge>
          <h2 className="mt-4 font-display text-4xl font-bold">Simple plans. Serious automation.</h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <Card key={p.name} className={`glass border-0 p-7 ${p.featured ? "glow-purple" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-lg">{p.name}</h3>
                {p.badge && <Badge className="btn-gradient text-white border-0">{p.badge}</Badge>}
              </div>
              <div className="mt-3 text-3xl font-display font-bold">
                {p.price}<span className="text-sm font-normal text-muted-foreground">{p.suffix}</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="size-4 text-purple-400 shrink-0" />{f}</li>
                ))}
              </ul>
              <Link to="/pricing" className="block mt-6">
                <Button className={p.featured ? "w-full btn-gradient text-white border-0" : "w-full"} variant={p.featured ? "default" : "outline"}>
                  {p.cta}
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export const plans = [
  { name: "Free", price: "$0", suffix: "/mo", badge: null as string | null, featured: false,
    features: ["10 prompts daily", "Basic automation", "Use your own Seedance account", "Community support"], cta: "Start free" },
  { name: "Basic", price: "$19", suffix: "/mo", badge: "Popular", featured: true,
    features: ["Unlimited prompts", "Batch queue & retries", "Auto-download library", "Faster automation", "Priority support"], cta: "Upgrade" },
  { name: "Premium", price: "$49", suffix: "/mo", badge: "Coming soon", featured: false,
    features: ["Direct API video generation", "No external account needed", "Premium rendering", "Fastest queue", "Dedicated support"], cta: "Join waitlist" },
];

function FAQ() {
  const faqs = [
    { q: "Does Seedance AI generate videos itself?", a: "Not on the Free and Basic plans. You connect your own Seedance, Dreamina, or Jimeng account, and our Chrome extension automates the workflow on your behalf. Premium API mode (no external account) is coming soon." },
    { q: "Are my AI account credentials safe?", a: "Yes. The extension runs locally in your browser. We never see or store your AI account passwords." },
    { q: "Which browsers are supported?", a: "Any Chromium browser — Chrome, Edge, Brave, Arc, Opera." },
    { q: "Can I cancel anytime?", a: "Absolutely. Cancel from your dashboard in one click. No questions asked." },
    { q: "Do you offer team plans?", a: "Team plans are coming soon. Reach out for early access." },
  ];
  return (
    <section id="faq" className="py-24">
      <div className="mx-auto max-w-3xl px-4">
        <div className="text-center">
          <Badge variant="outline" className="border-white/10 bg-white/5">FAQ</Badge>
          <h2 className="mt-4 font-display text-4xl font-bold">Questions, answered.</h2>
        </div>
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-white/5">
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-4">
        <div className="glass rounded-3xl p-12 text-center grid-bg">
          <Layers className="size-10 mx-auto text-purple-400" />
          <h2 className="mt-4 font-display text-4xl font-bold">Stop babysitting prompts.</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Let Seedance AI run the queue while you focus on the next idea.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/auth"><Button size="lg" className="btn-gradient text-white border-0 h-12 px-6">Start free</Button></Link>
            <Link to="/extension"><Button size="lg" variant="outline" className="h-12 px-6 border-white/10 bg-white/5"><Clock className="mr-2 size-4" /> See how it works</Button></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
