import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTest, listCandidates, listSteps } from "../../lib/staffApi";
import type { CandidateListItem, Step, Test } from "../../types";
import { TopNav } from "../staff/TopNav";

interface Activity {
  candidate: CandidateListItem;
  lastEdited: Date | null;
  lastStepName: string | null;
  minutesAgo: number | null;
}

function computeActivity(candidates: CandidateListItem[], steps: Step[]): Activity[] {
  return candidates.map((c) => {
    let lastEdited: Date | null = null;
    let lastStepId: string | null = null;
    for (const [stepId, r] of Object.entries(c.step_outcomes)) {
      if (!r.updated_at) continue;
      const d = new Date(r.updated_at);
      if (!lastEdited || d > lastEdited) {
        lastEdited = d;
        lastStepId = stepId;
      }
    }
    const lastStepName = lastStepId ? steps.find((s) => s.id === lastStepId)?.name ?? null : null;
    const minutesAgo = lastEdited ? Math.round((Date.now() - lastEdited.getTime()) / 60000) : null;
    return { candidate: c, lastEdited, lastStepName, minutesAgo };
  });
}

function staleness(minutesAgo: number | null): "fresh" | "warning" | "danger" {
  if (minutesAgo === null) return "danger";
  if (minutesAgo < 5) return "fresh";
  if (minutesAgo < 15) return "warning";
  return "danger";
}

const TILE_CLASS = {
  fresh: "bg-surface border-border",
  warning: "bg-warning-soft border-warning-border",
  danger: "bg-danger-soft border-danger-border",
};
const TEXT_CLASS = { fresh: "text-text-2", warning: "text-warning", danger: "text-danger" };

export default function LiveMonitoring() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);

  useEffect(() => {
    if (!testId) return;
    Promise.all([getTest(testId), listSteps(testId), listCandidates(testId)]).then(([t, steps, candidates]) => {
      setTest(t);
      setActivity(computeActivity(candidates, steps));
    });
  }, [testId]);

  if (!test || !activity || !testId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav
        brandTo="/moderator"
        suffix="Moderator"
        tabs={[
          { label: "Dashboard", to: `/moderator/tests/${testId}/dashboard` },
          { label: "Live Monitoring", to: `/moderator/tests/${testId}/live` },
        ]}
      />
      <div className="max-w-[1240px] mx-auto px-8 py-7">
        <h1 className="text-[22px] font-bold m-0 mb-1">{test.name}</h1>
        <div className="text-[12.5px] text-text-3 mb-5">
          {activity.length} candidate{activity.length === 1 ? "" : "s"} assigned &middot; live status
        </div>

        <div className="grid grid-cols-3 gap-3">
          {activity.map((a) => {
            const s = staleness(a.minutesAgo);
            return (
              <button
                key={a.candidate.id}
                onClick={() => navigate(`/moderator/tests/${testId}/candidates/${a.candidate.id}`)}
                className={`text-left border rounded-[10px] p-3.5 cursor-pointer ${TILE_CLASS[s]}`}
              >
                <div className="font-semibold text-[13px] truncate">{a.candidate.email}</div>
                <div className={`font-mono-tabular text-[12px] mt-1.5 ${TEXT_CLASS[s]}`}>
                  {a.minutesAgo === null ? "No activity yet" : `Last edited ${a.minutesAgo}m ago`}
                </div>
                {a.lastStepName && <div className="text-[11.5px] text-text-3 mt-0.5">Last on: {a.lastStepName}</div>}
              </button>
            );
          })}
          {activity.length === 0 && (
            <div className="col-span-3 text-center text-text-3 py-6">No candidates assigned to you yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
