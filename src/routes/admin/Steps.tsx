import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { addStep, getTest, listSteps } from "../../lib/staffApi";
import type { Step, Test } from "../../types";
import { Badge, Button } from "../../components/ui";
import { TopNav } from "../staff/TopNav";

export default function Steps() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function load() {
    if (!testId) return;
    const [t, s] = await Promise.all([getTest(testId), listSteps(testId)]);
    setTest(t);
    setSteps(s);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !testId) return;
    await addStep(testId, name.trim(), steps.length + 1);
    setName("");
    setAdding(false);
    await load();
  }

  if (!test || !testId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav
        brandTo="/admin"
        tabs={[
          { label: "Candidates", to: `/admin/tests/${testId}/candidates` },
          { label: "Steps", to: `/admin/tests/${testId}/steps` },
          { label: "Moderators", to: `/admin/tests/${testId}/moderators` },
          { label: "Report", to: `/admin/tests/${testId}/report` },
        ]}
      />
      <div className="max-w-[1240px] mx-auto px-8 py-7">
        <h1 className="text-[22px] font-bold m-0 mb-5">{test.name} — Steps</h1>

        <div className="bg-surface border border-border rounded-[10px] divide-y divide-border-soft mb-4">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth={2}>
                <circle cx="9" cy="6" r="1.2" />
                <circle cx="9" cy="12" r="1.2" />
                <circle cx="9" cy="18" r="1.2" />
                <circle cx="15" cy="6" r="1.2" />
                <circle cx="15" cy="12" r="1.2" />
                <circle cx="15" cy="18" r="1.2" />
              </svg>
              <span className="font-mono-tabular text-text-3 text-[12.5px] w-5">{i + 1}</span>
              <span className="font-semibold text-[13.5px] flex-1">{s.name}</span>
              <Badge variant={s.required ? "neutral" : "accent"}>{s.required ? "Required" : "Optional"}</Badge>
            </div>
          ))}
          {steps.length === 0 && <div className="px-4 py-6 text-center text-text-3">No steps configured yet.</div>}
        </div>

        {adding ? (
          <form onSubmit={handleAdd} className="flex items-center gap-2 max-w-md">
            <input
              autoFocus
              required
              placeholder="Step name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded-[7px] bg-surface text-[13px]"
            />
            <Button type="submit">Add</Button>
            <button type="button" onClick={() => setAdding(false)} className="text-text-3 px-1 cursor-pointer">
              ×
            </button>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)} className="flex items-center gap-1.5">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Step
          </Button>
        )}
      </div>
    </div>
  );
}
