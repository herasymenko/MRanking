"use client";

import type { Pack, RankedResult } from "../../../lib/types";
import type { useRankedRun } from "../hooks/useRankedRun";
import { RankedFlow } from "./RankedFlow";

type RankedController = ReturnType<typeof useRankedRun>;

export function RankedAppSection({
  packs,
  ranked,
  viewedResult,
  onViewedResult,
  onBackToModes,
  onUpload,
  onStart,
  onScrollTop,
}: {
  packs: Pack[];
  ranked: RankedController;
  viewedResult: RankedResult | null;
  onViewedResult: (result: RankedResult | null) => void;
  onBackToModes: () => void;
  onUpload: () => void;
  onStart: (pack: Pack, resume?: boolean) => void;
  onScrollTop: () => void;
}) {
  return (
    <RankedFlow
      packs={packs}
      runs={ranked.runs}
      results={ranked.results}
      activeRun={ranked.activeRun}
      selectedPack={ranked.selectedPack}
      viewedResult={viewedResult}
      onViewedResult={(result) => {
        onViewedResult(result);
        onScrollTop();
      }}
      onBackToModes={() => {
        onBackToModes();
        onScrollTop();
      }}
      onUpload={onUpload}
      onStart={onStart}
      onChange={ranked.changeRun}
      onLeave={() => {
        ranked.leaveRun();
        onScrollTop();
      }}
      onCancel={(pack) => void ranked.cancelRun(pack)}
      onDeleteResult={(result) => {
        void ranked.deleteResult(result).then((deleted) => {
          if (deleted && viewedResult?.id === result.id) {
            onViewedResult(null);
          }
        });
      }}
      onAdjustResult={(result, state) => {
        void ranked.updateResult(result, state).then((stored) => {
          if (viewedResult?.id === stored.id) {
            onViewedResult(stored);
          }
        });
      }}
    />
  );
}
