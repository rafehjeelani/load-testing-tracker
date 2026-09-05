import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTestsForCurrentModerator } from "../../lib/staffApi";
import type { Test } from "../../types";
import { TopNav } from "../staff/TopNav";
import { useAuth } from "../staff/AuthContext";
import { Button, PageHeader } from "../../components/ui";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

export default function ModeratorDashboardHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [tests, setTests] = useState<Test[] | null>(null);

  const { status, error, slow, retry } = useAsyncLoad(async () => {
    setTests(await listTestsForCurrentModerator());
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav brandTo="/moderator" suffix="Moderator" />
      <PageHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-[22px] font-bold m-0">Your Tests</h1>
          {profile?.role === "admin" && (
            <button
              onClick={() => navigate("/admin")}
              className="text-[13px] text-accent font-semibold cursor-pointer"
            >
              ← Back to Admin Console
            </button>
          )}
        </div>
        <div className="text-[12.5px] text-text-3 mt-1">Tests where you have assigned candidates</div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
        {status === "loading" && (
          <div className="text-text-3 text-sm">
            Loading…
            {slow && (
              <div className="text-[12.5px] mt-1">This is taking longer than expected. Check your connection.</div>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="max-w-[360px]">
            <div className="text-danger text-sm font-semibold mb-1.5">Couldn't load your tests</div>
            <div className="text-text-2 text-[13px] mb-3 leading-relaxed">{error}</div>
            <Button onClick={retry}>Retry</Button>
          </div>
        )}
        {status === "ready" && tests !== null && tests.length === 0 && (
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
