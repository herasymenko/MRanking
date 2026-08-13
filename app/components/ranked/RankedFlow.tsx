"use client";

import type { Pack, RankedResult, RankedRun, RankedSessionState } from "../../../lib/types";
import { RankedLibraryView } from "../modes/RankedLibraryView";
import { RankedGameView } from "./RankedGameView";
import { RankedResultView } from "./RankedResultView";

export function RankedFlow({
  packs,
  runs,
  results,
  activeRun,
  selectedPack,
  viewedResult,
  onViewedResult,
  onBackToModes,
  onUpload,
  onStart,
  onChange,
  onLeave,
  onCancel,
  onDeleteResult,
  onAdjustResult,
}: {
  packs: Pack[];
  runs: Record<string, RankedRun>;
  results: RankedResult[];
  activeRun: RankedRun | null;
  selectedPack: Pack | null;
  viewedResult: RankedResult | null;
  onViewedResult: (result: RankedResult | null) => void;
  onBackToModes: () => void;
  onUpload: () => void;
  onStart: (pack: Pack, resume?: boolean) => void;
  onChange: (run: RankedRun) => void;
  onLeave: () => void;
  onCancel: (pack: Pack) => void;
  onDeleteResult: (result: RankedResult) => void;
  onAdjustResult: (result: RankedResult, state: RankedSessionState) => void;
}) {
  if (activeRun && selectedPack) {
    if (activeRun.state.status === "complete") {
      const saved = results.find((result) => result.id === activeRun.id) ?? null;
      return (
        <RankedResultView
          key={activeRun.id}
          pack={selectedPack}
          state={saved?.state ?? activeRun.state}
          completedAt={saved?.completedAt}
          saving={!saved}
          onBack={onLeave}
          onAgain={() => onStart(selectedPack)}
          onAdjust={saved ? (state) => onAdjustResult(saved, state) : undefined}
        />
      );
    }
    return (
      <RankedGameView
        pack={selectedPack}
        run={activeRun}
        onChange={onChange}
        onBack={onLeave}
        onCancel={() => onCancel(selectedPack)}
      />
    );
  }

  if (viewedResult) {
    return (
      <RankedResultView
        key={viewedResult.id}
        pack={viewedResult.pack}
        state={viewedResult.state}
        completedAt={viewedResult.completedAt}
        onBack={() => onViewedResult(null)}
        onAgain={() => onStart(viewedResult.pack)}
        onDelete={() => onDeleteResult(viewedResult)}
        onAdjust={(state) => onAdjustResult(viewedResult, state)}
      />
    );
  }

  return (
    <RankedLibraryView
      packs={packs}
      runs={runs}
      results={results}
      onBack={onBackToModes}
      onUpload={onUpload}
      onStart={(pack) => onStart(pack)}
      onContinue={(pack) => onStart(pack, true)}
      onCancelRun={onCancel}
      onOpenResult={onViewedResult}
      onDeleteResult={onDeleteResult}
    />
  );
}
