import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Auto Seedance is Free During Early Access" },
      { name: "description", content: "Auto Seedance is currently 100% free during Early Access. Unlimited bulk AI prompt queueing and browser-based Dreamina automation." },
      { property: "og:title", content: "Pricing — Auto Seedance" },
      { property: "og:description", content: "100% free during Early Access. Unlimited bulk AI automation." },
      { property: "og:url", content: "https://vizio-automata.lovable.app/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://vizio-automata.lovable.app/pricing" }],
  }),
});

const features = [
  "Unlimited local workflow automation",
  "Bulk prompt queueing",
  "Browser-based automation",
  "AI creator productivity tools",
  "Chrome &amp; Microsoft Edge support",
  "Auto-download &amp; organized library",
];

function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <section className="pt-40 pb-24 grid-bg">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Badge variant="outline" className="border-border bg-muted/50">Pricing</Badge>
          <h1 className="mt-4 font-display text-5xl font-bold">Currently Free During Early Access</h1>
          <p className="mt-3 text-muted-foreground">No credit card. No paid tiers. Just install and automate.</p>

          <Card className="glass border-0 p-8 mt-12 glow-purple text-left">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display font-semibold text-2xl">Auto Seedance — Free</h2>
                <p className="text-sm text-muted-foreground mt-1">Everything you need to automate bulk AI generation.</p>
              </div>
              <Badge className="btn-gradient text-white border-0">Early Access</Badge>
            </div>
            <div className="mt-6 text-5xl font-display font-bold">
              $0<span className="text-base font-normal text-muted-foreground">/forever during Early Access</span>
            </div>
            <ul className="mt-6 grid sm:grid-cols-2 gap-2 text-sm">
              {features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="size-4 text-purple-400 shrink-0 mt-0.5" />
                  <span dangerouslySetInnerHTML={{ __html: f }} />
                </li>
              ))}
            </ul>
            <Link to="/extension" className="block mt-8">
              <Button size="lg" className="w-full btn-gradient text-white border-0 h-12">
                Start Free <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
