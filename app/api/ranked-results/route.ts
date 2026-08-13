import { parseRankedState, rankedStateMatchesPack, sanitizeRankedState } from "../../../lib/ranked-state";
import { getD1, jsonError, requireUser, uid } from "../../../lib/server";
import type { JsonValue } from "../../../lib/json-value";
import type {
  Pack,
  PackItem,
  PackVisibility,
  RankedResult,
  SourceType,
} from "../../../lib/types";

type ResultRow = {
  id: string;
  pack_id: string;
  state_json: string;
  pack_json: string;
  completed_at: string;
};

type PackRow = {
  id: string;
  owner_id: string;
  owner_nickname: string | null;
  name: string;
  source_type: SourceType;
  source_url: string;
  cover_type: "thumbnail" | "emoji";
  cover_value: string;
  visibility: PackVisibility;
  item_count: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  position: number;
  title: string;
  channel: string;
  video_id: string;
  thumbnail_url: string;
  youtube_url: string;
  duration: string | null;
};

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response;
    }
    const rows = (
      await getD1()
        .prepare(
          `SELECT id, pack_id, state_json, pack_json, completed_at
           FROM ranked_results WHERE user_id = ? ORDER BY completed_at DESC`,
        )
        .bind(auth.user.id)
        .all<ResultRow>()
    ).results;
    const results = rows.flatMap((row): RankedResult[] => {
      const state = parseRankedState(row.state_json);
      const pack = parseStoredPack(row.pack_json);
      return state &&
        state.status === "complete" &&
        pack &&
        rankedStateMatchesPack(state, new Set(pack.items.map((item) => item.id)))
        ? [{ id: row.id, packId: row.pack_id, state, pack, completedAt: row.completed_at }]
        : [];
    });
    return Response.json({ results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response;
    }
    const body = (await request.json()) as {
      result?: { id?: string; packId?: string; state?: JsonValue };
    };
    const packId = body.result?.packId?.trim() ?? "";
    const state = sanitizeRankedState(body.result?.state);
    if (!packId || !state || state.status !== "complete") {
      return Response.json({ error: "Completed ranked result required" }, { status: 400 });
    }
    const pack = await loadPackSnapshot(packId, true);
    if (!pack || pack.ownerId !== auth.user.id) {
      return Response.json({ error: "Pack not found" }, { status: 404 });
    }
    if (!rankedStateMatchesPack(state, new Set(pack.items.map((item) => item.id)))) {
      return Response.json({ error: "Ranked result does not match this pack" }, { status: 400 });
    }
    const db = getD1();
    const requestedId = body.result?.id?.trim();
    if (requestedId) {
      const owner = await db
        .prepare("SELECT user_id FROM ranked_results WHERE id = ?")
        .bind(requestedId)
        .first<{ user_id: string }>();
      if (owner && owner.user_id !== auth.user.id) {
        return Response.json({ error: "Ranked result id is unavailable" }, { status: 409 });
      }
    }
    const id = requestedId || uid("ranked-result");
    const completedAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO ranked_results
           (id, user_id, pack_id, state_json, pack_json, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           state_json = excluded.state_json,
           pack_json = excluded.pack_json,
           completed_at = excluded.completed_at`,
      )
      .bind(
        id,
        auth.user.id,
        packId,
        JSON.stringify(state),
        JSON.stringify(pack),
        completedAt,
      )
      .run();
    await db
      .prepare("DELETE FROM ranked_runs WHERE user_id = ? AND pack_id = ?")
      .bind(auth.user.id, packId)
      .run();
    return Response.json({
      result: { id, packId, state, pack, completedAt } satisfies RankedResult,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response;
    }
    const body = (await request.json()) as { id?: string; state?: JsonValue };
    const id = body.id?.trim() ?? "";
    const state = sanitizeRankedState(body.state);
    if (!id || !state || state.status !== "complete") {
      return Response.json({ error: "Completed ranked result required" }, { status: 400 });
    }
    const db = getD1();
    const row = await db
      .prepare(
        `SELECT id, pack_id, state_json, pack_json, completed_at
         FROM ranked_results WHERE id = ? AND user_id = ?`,
      )
      .bind(id, auth.user.id)
      .first<ResultRow>();
    const pack = row ? parseStoredPack(row.pack_json) : null;
    if (
      !row ||
      !pack ||
      !rankedStateMatchesPack(state, new Set(pack.items.map((item) => item.id)))
    ) {
      return Response.json({ error: "Ranked result not found" }, { status: 404 });
    }
    await db
      .prepare("UPDATE ranked_results SET state_json = ? WHERE id = ? AND user_id = ?")
      .bind(JSON.stringify(state), id, auth.user.id)
      .run();
    return Response.json({
      result: {
        id,
        packId: row.pack_id,
        state,
        pack,
        completedAt: row.completed_at,
      } satisfies RankedResult,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response;
    }
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return Response.json({ error: "Ranked result id required" }, { status: 400 });
    }
    await getD1()
      .prepare("DELETE FROM ranked_results WHERE id = ? AND user_id = ?")
      .bind(id, auth.user.id)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

async function loadPackSnapshot(packId: string, activeOnly = false) {
  const row = await getD1()
    .prepare(
      `SELECT p.*, u.nickname AS owner_nickname
       FROM packs p LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.id = ? ${activeOnly ? "AND p.deleted_at IS NULL" : ""}`,
    )
    .bind(packId)
    .first<PackRow>();
  if (!row) {
    return null;
  }
  const items = (
    await getD1()
      .prepare("SELECT * FROM pack_items WHERE pack_id = ? ORDER BY position ASC")
      .bind(packId)
      .all<ItemRow>()
  ).results;
  return packFromRow(row, items);
}

function packFromRow(row: PackRow, items: ItemRow[]): Pack {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerNickname: row.owner_nickname ?? "Deleted user",
    name: row.name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    coverType: row.cover_type,
    coverValue: row.cover_value,
    visibility: row.visibility,
    itemCount: row.item_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map(itemFromRow),
  };
}

function itemFromRow(item: ItemRow): PackItem {
  return {
    id: item.id,
    position: item.position,
    title: item.title,
    channel: item.channel,
    videoId: item.video_id,
    thumbnailUrl: item.thumbnail_url,
    youtubeUrl: item.youtube_url,
    duration: item.duration,
  };
}

function parseStoredPack(value: string): Pack | null {
  try {
    const parsed = JSON.parse(value) as Pack;
    return parsed && Array.isArray(parsed.items)
      ? { ...parsed, visibility: parsed.visibility === "public" ? "public" : "private" }
      : null;
  } catch {
    return null;
  }
}
