import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Film } from "lucide-react";

export const Route = createFileRoute("/dashboard/library")({ component: Library });

type File = { id: string; url: string; thumbnail_url: string | null; prompt_text: string | null; created_at: string; duration_seconds: number | null };

function Library() {
  const { user } = useSession();
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("generated_files").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setFiles((data as File[]) ?? []));
  }, [user]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl font-bold">Library</h1>
      <p className="text-muted-foreground mt-1">All your generated videos in one place.</p>

      {files.length === 0 ? (
        <Card className="glass border-0 p-12 text-center mt-8">
          <Film className="size-10 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nothing here yet. Once your queue produces videos, they'll appear here.</p>
        </Card>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((f) => (
            <Card key={f.id} className="glass border-0 overflow-hidden">
              <div className="aspect-video bg-black grid place-items-center">
                {f.thumbnail_url ? <img src={f.thumbnail_url} alt="" className="size-full object-cover" /> : <Film className="size-8 text-muted-foreground" />}
              </div>
              <div className="p-4">
                <div className="text-sm line-clamp-2">{f.prompt_text ?? "Untitled"}</div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(f.created_at).toLocaleString()}</div>
                <a href={f.url} download target="_blank" rel="noreferrer" className="block mt-3">
                  <Button variant="outline" size="sm" className="w-full border-white/10 bg-white/5"><Download className="size-4 mr-2" /> Download</Button>
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
