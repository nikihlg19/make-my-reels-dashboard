import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const ARCHIVE_MAX_AGE_DAYS = 30;
const BUCKET = "documents";
const ARCHIVE_PREFIX = "archive/";

serve(async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: require CRON_SECRET via Authorization header
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isAuthorized =
    CRON_SECRET &&
    (authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET);

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_MAX_AGE_DAYS);

    // List all files under archive/ recursively
    const filesToDelete: string[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data: files, error } = await supabase.storage
        .from(BUCKET)
        .list(ARCHIVE_PREFIX, {
          limit,
          offset,
          sortBy: { column: "created_at", order: "asc" },
        });

      if (error) throw error;
      if (!files || files.length === 0) break;

      // Also check subdirectories (e.g. archive/aadhaar/)
      for (const file of files) {
        if (file.id === null && file.name) {
          // It's a folder — list its contents
          const { data: subFiles, error: subError } = await supabase.storage
            .from(BUCKET)
            .list(`${ARCHIVE_PREFIX}${file.name}`, {
              limit: 1000,
              sortBy: { column: "created_at", order: "asc" },
            });

          if (subError) {
            console.warn(`Failed to list ${ARCHIVE_PREFIX}${file.name}:`, subError.message);
            continue;
          }

          for (const sub of subFiles || []) {
            if (sub.created_at) {
              const fileDate = new Date(sub.created_at);
              if (fileDate < cutoffDate) {
                filesToDelete.push(`${ARCHIVE_PREFIX}${file.name}/${sub.name}`);
              }
            }
          }
        } else if (file.created_at) {
          const fileDate = new Date(file.created_at);
          if (fileDate < cutoffDate) {
            filesToDelete.push(`${ARCHIVE_PREFIX}${file.name}`);
          }
        }
      }

      if (files.length < limit) break;
      offset += limit;
    }

    if (filesToDelete.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired files to delete", deleted: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete in batches of 100
    let totalDeleted = 0;
    for (let i = 0; i < filesToDelete.length; i += 100) {
      const batch = filesToDelete.slice(i, i + 100);
      const { error: deleteError } = await supabase.storage
        .from(BUCKET)
        .remove(batch);

      if (deleteError) {
        console.error(`Failed to delete batch starting at ${i}:`, deleteError.message);
      } else {
        totalDeleted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Cleanup complete`,
        deleted: totalDeleted,
        files: filesToDelete,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
