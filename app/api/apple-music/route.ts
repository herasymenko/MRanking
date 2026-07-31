import { parseAppleMusicPlaylist } from "../../../lib/apple-music";
import { jsonError, requireUser } from "../../../lib/server";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) {
    return auth.response;
  }
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url?.trim()) {
      return Response.json(
        { error: "Paste an Apple Music playlist URL" },
        { status: 400 },
      );
    }
    return Response.json({
      kind: "playlist",
      playlist: await parseAppleMusicPlaylist(body.url, request.signal),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /^(?:Paste|Only|This link|The Apple Music playlist)/i.test(
      message,
    )
      ? 400
      : /Apple Music/i.test(message)
        ? 502
        : 500;
    return jsonError(error, "Apple Music import failed", status);
  }
}
