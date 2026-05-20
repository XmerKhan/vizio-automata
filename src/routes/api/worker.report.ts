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

export const Route = createFileRoute("/api/worker/report")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const action = payload?.action as string | undefined;
        if (!action) return json({ error: "Missing action" }, 400);

        try {
          if (action === "claim") {
            const limit = Math.min(Math.max(Number(payload.limit ?? 1), 1), 10);
            const platform = payload.platform as string | undefined;

            let q = supabaseAdmin
              .from("queue_jobs")
              .select("id")
              .eq("status", "pending")
              .order("position", { ascending: true })
              .order("created_at", { ascending: true })
              .limit(limit);
            if (platform) q = q.eq("platform", platform as any);

            const { data: candidates, error: selErr } = await q;
            if (selErr) return json({ error: selErr.message }, 500);
            if (!candidates?.length) return json({ jobs: [] });

            const ids = candidates.map((c) => c.id);
            const { data: claimed, error: upErr } = await supabaseAdmin
              .from("queue_jobs")
              .update({
                status: "generating" as any,
                started_at: new Date().toISOString(),
              })
              .in("id", ids)
              .eq("status", "pending")
              .select("*");
            if (upErr) return json({ error: upErr.message }, 500);
            return json({ jobs: claimed ?? [] });
          }

          if (action === "progress") {
            const { job_id, progress, message, level } = payload;
            if (!job_id) return json({ error: "Missing job_id" }, 400);

            if (typeof progress === "number") {
              const { error } = await supabaseAdmin
                .from("queue_jobs")
                .update({ progress })
                .eq("id", job_id);
              if (error) return json({ error: error.message }, 500);
            }

            if (message) {
              const { data: job } = await supabaseAdmin
                .from("queue_jobs")
                .select("user_id")
                .eq("id", job_id)
                .single();
              if (job?.user_id) {
                await supabaseAdmin.from("job_logs").insert({
                  job_id,
                  user_id: job.user_id,
                  message: String(message),
                  level: String(level ?? "info"),
                });
              }
            }
            return json({ ok: true });
          }

          if (action === "complete") {
            const { job_id, output_url, thumbnail_url, duration_seconds } = payload;
            if (!job_id || !output_url)
              return json({ error: "Missing job_id or output_url" }, 400);

            const { data: job, error: jobErr } = await supabaseAdmin
              .from("queue_jobs")
              .update({
                status: "completed" as any,
                progress: 100,
                output_url,
                finished_at: new Date().toISOString(),
              })
              .eq("id", job_id)
              .select("*")
              .single();
            if (jobErr) return json({ error: jobErr.message }, 500);

            await supabaseAdmin.from("generated_files").insert({
              user_id: job.user_id,
              job_id: job.id,
              platform: job.platform,
              prompt_text: job.prompt_text,
              url: output_url,
              thumbnail_url: thumbnail_url ?? null,
              duration_seconds: duration_seconds ?? null,
            });

            const today = new Date().toISOString().slice(0, 10);
            const { data: existing } = await supabaseAdmin
              .from("usage_tracking")
              .select("id, prompts_used")
              .eq("user_id", job.user_id)
              .eq("day", today)
              .maybeSingle();
            if (existing) {
              await supabaseAdmin
                .from("usage_tracking")
                .update({ prompts_used: (existing.prompts_used ?? 0) + 1 })
                .eq("id", existing.id);
            } else {
              await supabaseAdmin
                .from("usage_tracking")
                .insert({ user_id: job.user_id, day: today, prompts_used: 1 });
            }
            return json({ ok: true, job });
          }

          if (action === "error") {
            const { job_id, error: errMsg, retry } = payload;
            if (!job_id) return json({ error: "Missing job_id" }, 400);

            const { data: job } = await supabaseAdmin
              .from("queue_jobs")
              .update({
                status: (retry ? "pending" : "failed") as any,
                error: String(errMsg ?? "Unknown error"),
                finished_at: retry ? null : new Date().toISOString(),
              })
              .eq("id", job_id)
              .select("user_id")
              .single();

            if (job?.user_id) {
              await supabaseAdmin.from("job_logs").insert({
                job_id,
                user_id: job.user_id,
                message: String(errMsg ?? "Unknown error"),
                level: "error",
              });
            }
            return json({ ok: true });
          }

          return json({ error: `Unknown action: ${action}` }, 400);
        } catch (e: any) {
          console.error("[worker.report]", e);
          return json({ error: e?.message ?? "Internal error" }, 500);
        }
      },
    },
  },
});
