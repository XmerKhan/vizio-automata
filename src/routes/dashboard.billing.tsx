import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plans } from "@/routes/index";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/billing")({ component: Billing });

function Billing() {
  const { user } = useSession();
  const [current, setCurrent] = useState<string>("free");

  useEffect(() => {
    if (!user) return;
    supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setCurrent(data?.plan ?? "free"));
  }, [user]);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl font-bold">Billing</h1>
      <p className="text-muted-foreground mt-1">Manage your plan. Stripe checkout coming soon.</p>

      <Card className="glass border-0 p-5 mt-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Current plan</div>
          <div className="font-display font-bold text-2xl mt-1">{current.toUpperCase()}</div>
        </div>
        <Sparkles className="size-8 text-purple-400" />
      </Card>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <Card key={p.name} className={`glass border-0 p-6 ${p.featured ? "glow-purple" : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">{p.name}</h3>
              {p.badge && <Badge className="btn-gradient text-white border-0">{p.badge}</Badge>}
            </div>
            <div className="mt-2 text-2xl font-display font-bold">
              {p.price}<span className="text-sm font-normal text-muted-foreground">{p.suffix}</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2"><Check className="size-4 text-purple-400 shrink-0" />{f}</li>
              ))}
            </ul>
            <Button
              onClick={() => toast.info("Stripe checkout coming soon — billing infrastructure is ready.")}
              className={`w-full mt-5 ${p.featured ? "btn-gradient text-white border-0" : ""}`}
              variant={p.featured ? "default" : "outline"}
              disabled={current === p.name.toLowerCase()}
            >
              {current === p.name.toLowerCase() ? "Current" : p.cta}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
