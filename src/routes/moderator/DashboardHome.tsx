import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTestsForCurrentModerator } from "../../lib/staffApi";
import type { Test } from "../../types";
import { TopNav } from "../staff/TopNav";

export default function ModeratorDashboardHome() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<Test[] | null>(null);

  useEffect(() => {
    listTestsForCurrentModerator().then(setTests);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav brandTo="/moderator" suffix="Moderator" />
      <div className="max-w-[1240px] mx-auto px-8 py-7">
        <h1 className="text-[22px] font-bold m-0 mb-1">Your Tests</h1>
        <div className="text-[12.5px] text-text-3 mb-5">Tests where you have assigned candidates</div>

        {tests === null && <div className="text-text-3 text-sm">Loading…</div>}
        {tests !== null && tests.length === 0 && (
          <div className="text-text-3 text-sm">
            You don't have any assigned candidates yet — check back once an admin assigns you some.
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          {(tests ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/moderator/tests/${t.id}/dashboard`)}
              className="text-left bg-surface border border-border rounded-[10px] p-5 cursor-pointer hover:bg-surface-2"
            >
              <div className="font-semibold text-[14px]">{t.name}</div>
              <div className="text-[12px] text-accent font-semibold mt-3">Open Dashboard →</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
