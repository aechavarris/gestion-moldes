import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Serves a photo (or its thumbnail with ?thumb) only to signed-in users. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const thumb = new URL(request.url).searchParams.has("thumb");
  const photo = thumb
    ? await db.photo.findUnique({ where: { id }, select: { thumbnail: true } }).then((p) => p?.thumbnail)
    : await db.photo.findUnique({ where: { id }, select: { data: true } }).then((p) => p?.data);
  if (!photo) return new Response("Not found", { status: 404 });
  const bytes = photo;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Photos never change (a new one gets a new id); private so no shared cache keeps them.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
