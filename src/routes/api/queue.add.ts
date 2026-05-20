import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Worker-Secret",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function authorized(request: Request): boolean {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get("x-worker-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return header === secret;
}

export const Route = createFileRoute("/api/queue/add")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const {
          user_id,
          prompts,
          platform = "seedance",
          mode = "text2video",
          settings = {},
          media_urls = [],
          ingredients = null,
        } = body ?? {};

        if (!user_id) return json({ error: "Missing user_id" }, 400);
        const list = Array.isArray(prompts) ? prompts : prompts ? [prompts] : [];
        const cleaned = list.map((p: unknown) => String(p ?? "").trim()).filter(Boolean);
        if (!cleaned.length) return json({ error: "No prompts provided" }, 400);

        const { data: last } = await supabaseAdmin
          .from("queue_jobs")
          .select("position")
          .eq("user_id", user_id)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const startPos = (last?.position ?? 0) + 1;

        const rows = cleaned.map((prompt_text, i) => ({
          user_id,
          prompt_text,
          platform,
          mode,
          settings,
          media_urls,
          ingredients,
          status: "pending" as any,
          position: startPos + i,
        }));

        const { data, error } = await supabaseAdmin
          .from("queue_jobs")
          .insert(rows)
          .select("id, position, status");
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, count: data?.length ?? 0, jobs: data ?? [] }, 201);
      },
    },
  },
});
