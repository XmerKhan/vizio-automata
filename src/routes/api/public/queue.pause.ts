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

/**
 * POST /api/public/queue/pause
 * Body: { user_id?: string, resume?: boolean, job_ids?: string[] }
 *
 * Pauses all pending jobs (status -> "paused") or resumes ("paused" -> "pending").
 * Scope to a user or specific jobs. Without filters, applies globally.
 */
export const Route = createFileRoute("/api/public/queue/pause")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // empty body allowed
        }

        const { user_id, job_ids, resume } = body ?? {};
        const fromStatus = resume ? "paused" : "pending";
        const toStatus = resume ? "pending" : "paused";

        let q = supabaseAdmin
          .from("queue_jobs")
          .update({ status: toStatus as any })
          .eq("status", fromStatus as any);

        if (user_id) q = q.eq("user_id", user_id);
        if (Array.isArray(job_ids) && job_ids.length) q = q.in("id", job_ids);

        const { data, error } = await q.select("id, status");
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, updated: data?.length ?? 0, jobs: data ?? [] });
      },
    },
  },
});
