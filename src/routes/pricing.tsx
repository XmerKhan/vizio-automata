import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { plans } from "@/routes/index";

export const Route = createFileRoute("/pricing")({ component: PricingPage });

function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <section className="pt-40 pb-24 grid-bg">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center max-w-2xl mx-auto">
            <Badge variant="outline" className="border-white/10 bg-white/5">Pricing</Badge>
            <h1 className="mt-4 font-display text-5xl font-bold">Built for creators. Priced like a startup.</h1>
            <p className="mt-3 text-muted-foreground">Start free. Upgrade when you need more throughput.</p>
          </div>
          <div className="mt-14 grid md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <Card key={p.name} className={`glass border-0 p-7 ${p.featured ? "glow-purple" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-lg">{p.name}</h3>
                  {p.badge && <Badge className="btn-gradient text-white border-0">{p.badge}</Badge>}
                </div>
                <div className="mt-3 text-4xl font-display font-bold">
                  {p.price}<span className="text-sm font-normal text-muted-foreground">{p.suffix}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="size-4 text-purple-400 shrink-0" />{f}</li>
                  ))}
                </ul>
                <Link to="/auth" className="block mt-6">
                  <Button className={`w-full ${p.featured ? "btn-gradient text-white border-0" : ""}`} variant={p.featured ? "default" : "outline"}>
                    {p.cta}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
