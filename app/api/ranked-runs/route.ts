import { parseRankedState, rankedStateMatchesPack, sanitizeRankedState } from "../../../lib/ranked-state";
import { getD1, jsonError, requireUser, uid } from "../../../lib/server";
import type { JsonValue } from "../../../lib/json-value";
import type { RankedRun } from "../../../lib/types";

type RunRow = {
  id: string;
  pack_id: string;
  state_json: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response;
    }
    const db = getD1();
    const rows = (
      await db
        .prepare(
          `SELECT rr.id, rr.pack_id, rr.state_json, rr.updated_at
           FROM ranked_runs rr
           JOIN packs p ON p.id = rr.pack_id
           WHERE rr.user_id = ? AND p.deleted_at IS NULL
           ORDER BY rr.updated_at DESC`,
        )
        .bind(auth.user.id)
        .all<RunRow>()
    ).results;
    const runs: RankedRun[] = [];
    for (const row of rows) {
      const state = parseRankedState(row.state_json);
      if (!state || state.status !== "active") {
        continue;
      }
      const membership = await packMembership(row.pack_id);
      if (!rankedStateMatchesPack(state, membership)) {
        continue;
      }
      runs.push({
        id: row.id,
        packId: row.pack_id,
        state,
        updatedAt: row.updated_at,
      });
    }
    return Response.json({ runs });
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
    const body = (await request.json()) as {
      run?: { id?: string; packId?: string; state?: JsonValue };
    };
    const packId = body.run?.packId?.trim() ?? "";
    const state = sanitizeRankedState(body.run?.state);
    if (!packId || !state || state.status !== "active") {
      return Response.json({ error: "Active ranked run required" }, { status: 400 });
    }
    const db = getD1();
    const pack = await db
      .prepare("SELECT owner_id FROM packs WHERE id = ? AND deleted_at IS NULL")
      .bind(packId)
      .first<{ owner_id: string }>();
    if (!pack || pack.owner_id !== auth.user.id) {
      return Response.json({ error: "Pack not found" }, { status: 404 });
    }
    if (!rankedStateMatchesPack(state, await packMembership(packId))) {
      return Response.json({ error: "Ranked entries do not match this pack" }, { status: 400 });
    }
    const requestedId = body.run?.id?.trim();
    if (requestedId) {
      const owner = await db
        .prepare("SELECT user_id, pack_id FROM ranked_runs WHERE id = ?")
        .bind(requestedId)
        .first<{ user_id: string; pack_id: string }>();
      if (owner && (owner.user_id !== auth.user.id || owner.pack_id !== packId)) {
        return Response.json({ error: "Ranked run id is unavailable" }, { status: 409 });
      }
    }
    const id = requestedId || uid("ranked-run");
    const now = new Date().toISOString();
    const storedState = { ...state, updatedAt: now };
    await db
      .prepare(
        `INSERT INTO ranked_runs (id, user_id, pack_id, state_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, pack_id) DO UPDATE SET
           id = excluded.id,
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .bind(id, auth.user.id, packId, JSON.stringify(storedState), now)
      .run();
    return Response.json({
      run: { id, packId, state: storedState, updatedAt: now } satisfies RankedRun,
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
    const packId = new URL(request.url).searchParams.get("packId")?.trim() ?? "";
    if (!packId) {
      return Response.json({ error: "Pack id required" }, { status: 400 });
    }
    await getD1()
      .prepare("DELETE FROM ranked_runs WHERE user_id = ? AND pack_id = ?")
      .bind(auth.user.id, packId)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

async function packMembership(packId: string) {
  return new Set(
    (
      await getD1()
        .prepare("SELECT id FROM pack_items WHERE pack_id = ?")
        .bind(packId)
        .all<{ id: string }>()
    ).results.map((item) => item.id),
  );
}
