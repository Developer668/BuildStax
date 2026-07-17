import { getPreviewByToken } from "@/lib/db/queries";
import { readBuildArtifact } from "@/lib/builds/artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await getPreviewByToken(token);
  if (!row) return new Response("Not found", { status: 404 });
  const artifact = await readBuildArtifact(row.project.id);
  if (!artifact) return new Response("Build artifact unavailable", { status: 404 });
  return new Response(artifact.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self';",
      "x-content-type-options": "nosniff",
    },
  });
}
