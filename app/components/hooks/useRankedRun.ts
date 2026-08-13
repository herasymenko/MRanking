"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Pack,
  RankedResult,
  RankedRun,
  RankedSessionState,
  User,
} from "../../../lib/types";
import { createRankedRun } from "../../domain/ranked";
import type { Translate } from "../../i18n/I18nContext";
import { api } from "../../lib/api";

export function useRankedRun({
  user,
  onToast,
  t,
}: {
  user: User | null;
  onToast: (message: string) => void;
  t: Translate;
}) {
  const [runs, setRuns] = useState<Record<string, RankedRun>>({});
  const [results, setResults] = useState<RankedResult[]>([]);
  const [activeRun, setActiveRun] = useState<RankedRun | null>(null);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const saveTimer = useRef<number | null>(null);
  const savedResults = useRef(new Set<string>());
  const savingResults = useRef(new Set<string>());
  const queues = useRef(new Map<string, Promise<void>>());

  const queue = useCallback((packId: string, task: () => Promise<void>) => {
    const previous = queues.current.get(packId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    const tracked = next.finally(() => {
      if (queues.current.get(packId) === tracked) {
        queues.current.delete(packId);
      }
    });
    queues.current.set(packId, tracked);
    return tracked;
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    let current = true;
    void Promise.all([
      api<{ runs: RankedRun[] }>("/api/ranked-runs"),
      api<{ results: RankedResult[] }>("/api/ranked-results"),
    ])
      .then(([runData, resultData]) => {
        if (!current) {
          return;
        }
        setRuns(Object.fromEntries(runData.runs.map((run) => [run.packId, run])));
        setResults(resultData.results);
        savedResults.current = new Set(resultData.results.map((result) => result.id));
      })
      .catch((error: Error) => {
        if (current) {
          onToast(error.message || t("Something went wrong"));
        }
      });
    return () => {
      current = false;
    };
  }, [onToast, t, user]);

  const persistRun = useCallback(
    (run: RankedRun) => {
      setRuns((current) => ({ ...current, [run.packId]: run }));
      return queue(run.packId, async () => {
        const { run: stored } = await api<{ run: RankedRun }>("/api/ranked-runs", {
          method: "PUT",
          body: JSON.stringify({ run }),
        });
        setRuns((current) => ({ ...current, [stored.packId]: stored }));
      });
    },
    [queue],
  );

  const persistResult = useCallback(
    (run: RankedRun) => {
      if (
        run.state.status !== "complete" ||
        savedResults.current.has(run.id) ||
        savingResults.current.has(run.id)
      ) {
        return;
      }
      savingResults.current.add(run.id);
      void queue(run.packId, async () => {
        const { result } = await api<{ result: RankedResult }>(
          "/api/ranked-results",
          {
            method: "POST",
            body: JSON.stringify({
              result: { id: run.id, packId: run.packId, state: run.state },
            }),
          },
        );
        savedResults.current.add(run.id);
        setResults((current) => [
          result,
          ...current.filter((candidate) => candidate.id !== result.id),
        ]);
        setRuns((current) => {
          const next = { ...current };
          delete next[run.packId];
          return next;
        });
        onToast(t("Ranked result saved"));
      })
        .catch((error) =>
          onToast(error instanceof Error ? error.message : t("Something went wrong")),
        )
        .finally(() => savingResults.current.delete(run.id));
    },
    [onToast, queue, t],
  );

  useEffect(() => {
    if (!activeRun || !user) {
      return;
    }
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (activeRun.state.status === "complete") {
      persistResult(activeRun);
      return;
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void persistRun(activeRun).catch(() => undefined);
    }, 550);
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [activeRun, persistResult, persistRun, user]);

  function startPack(pack: Pack, resume = false) {
    const saved = runs[pack.id];
    const legacyQualification =
      saved?.state.phase === "qualification" && saved.state.targetRounds !== 1;
    const run = resume && saved && !legacyQualification
      ? structuredClone(saved)
      : createRankedRun(pack);
    setSelectedPack(pack);
    setActiveRun(run);
    return run;
  }

  function changeRun(run: RankedRun) {
    setActiveRun(run);
  }

  function leaveRun() {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (activeRun?.state.status === "active") {
      void persistRun(activeRun).catch(() => undefined);
    } else if (activeRun?.state.status === "complete") {
      persistResult(activeRun);
    }
    setActiveRun(null);
    setSelectedPack(null);
  }

  async function cancelRun(pack: Pack) {
    if (!window.confirm(t("Cancel current ranking for “{name}”?", { name: pack.name }))) {
      return false;
    }
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setActiveRun(null);
    setSelectedPack(null);
    await queue(pack.id, () =>
      api(`/api/ranked-runs?packId=${encodeURIComponent(pack.id)}`, {
        method: "DELETE",
      }),
    );
    setRuns((current) => {
      const next = { ...current };
      delete next[pack.id];
      return next;
    });
    onToast(t("Ranking cancelled"));
    return true;
  }

  async function deleteResult(result: RankedResult) {
    if (!window.confirm(t("Delete saved ranking “{name}”?", { name: result.pack.name }))) {
      return false;
    }
    await api(`/api/ranked-results?id=${encodeURIComponent(result.id)}`, {
      method: "DELETE",
    });
    savedResults.current.delete(result.id);
    setResults((current) => current.filter((candidate) => candidate.id !== result.id));
    onToast(t("Ranking history deleted"));
    return true;
  }

  async function updateResult(result: RankedResult, state: RankedSessionState) {
    setResults((current) =>
      current.map((candidate) =>
        candidate.id === result.id ? { ...candidate, state } : candidate,
      ),
    );
    const { result: stored } = await api<{ result: RankedResult }>(
      "/api/ranked-results",
      { method: "PUT", body: JSON.stringify({ id: result.id, state }) },
    );
    setResults((current) =>
      current.map((candidate) => (candidate.id === stored.id ? stored : candidate)),
    );
    return stored;
  }

  function clear() {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setRuns({});
    setResults([]);
    setActiveRun(null);
    setSelectedPack(null);
    savedResults.current.clear();
    savingResults.current.clear();
  }

  return {
    runs,
    results,
    activeRun,
    selectedPack,
    startPack,
    changeRun,
    leaveRun,
    cancelRun,
    deleteResult,
    updateResult,
    clear,
  };
}
