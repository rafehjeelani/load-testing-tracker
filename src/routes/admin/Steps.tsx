import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { addStep, deleteStep, getTest, listSteps, reorderSteps, updateStep } from "../../lib/staffApi";
import type { Step, Test } from "../../types";
import { Button, ErrorState, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

interface RowProps {
  step: Step;
  index: number;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  onSaved: () => void;
  onDelete: (step: Step) => void;
}

function StepRow({
  step,
  index,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSaved,
  onDelete,
}: RowProps) {
  const [name, setName] = useState(step.name);

  async function saveName() {
    if (name.trim() === step.name || !name.trim()) {
      setName(step.name);
      return;
    }
    await updateStep(step.id, { name: name.trim() });
    onSaved();
  }

  async function toggleRequired() {
    await updateStep(step.id, { required: !step.required });
    onSaved();
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${dragging ? "opacity-40" : ""} ${
        dropTarget && !dragging ? "bg-accent-soft" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
    >
      <span
        draggable
        onDragStart={() => onDragStart(index)}
        onDragEnd={onDragEnd}
        className="cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth={2}>
          <circle cx="9" cy="6" r="1.2" />
          <circle cx="9" cy="12" r="1.2" />
          <circle cx="9" cy="18" r="1.2" />
          <circle cx="15" cy="6" r="1.2" />
          <circle cx="15" cy="12" r="1.2" />
          <circle cx="15" cy="18" r="1.2" />
        </svg>
      </span>
      <span className="font-mono-tabular text-text-3 text-[12.5px] w-5">{index + 1}</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        className="font-semibold text-[13.5px] flex-1 bg-transparent border border-transparent rounded-[6px] px-2 py-1 -mx-2 hover:border-border focus:border-accent focus:bg-surface-2 outline-none"
      />
      <button
        type="button"
        onClick={toggleRequired}
        className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold cursor-pointer ${
          step.required ? "bg-surface-2 text-text-2" : "bg-accent-soft text-accent"
        }`}
        title="Click to toggle"
      >
        {step.required ? "Required" : "Optional"}
      </button>
      <button
        type="button"
        onClick={() => onDelete(step)}
        className="text-text-3 hover:text-danger cursor-pointer"
        title="Delete step"
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  );
}

export default function Steps() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!testId) return;
    const [t, s] = await Promise.all([getTest(testId), listSteps(testId)]);
    setTest(t);
    setSteps(s);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const { status, error, slow, retry } = useAsyncLoad(load, [testId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !testId) return;
    await addStep(testId, name.trim(), steps.length + 1);
    setName("");
    setAdding(false);
    await load();
  }

  async function handleDelete(step: Step) {
    const ok = window.confirm(
      `Delete "${step.name}"? This also permanently deletes any candidate reports already logged against this step.`,
    );
    if (!ok) return;
    await deleteStep(step.id);
    await load();
  }

  async function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...steps];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setSteps(next);
    setDragIndex(null);
    setOverIndex(null);
    await reorderSteps(next.map((s, i) => ({ id: s.id, order_index: i + 1 })));
    await load();
  }

  if (status === "loading") return <LoadingState slow={slow} />;
  if (status === "error") return <ErrorState message={error!} onRetry={retry} />;
  if (!test || !testId) return null;

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
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold m-0">{test.name} — Steps</h1>
          <RefreshButton onClick={handleRefresh} loading={refreshing} />
        </div>
        <div className="text-[12.5px] text-text-3 mt-1">
          Drag the handle to reorder. Click a step's name or Required/Optional to edit it.
        </div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
        <div className="bg-surface border border-border rounded-[10px] divide-y divide-border-soft mb-4">
          {steps.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              index={i}
              dragging={dragIndex === i}
              dropTarget={overIndex === i}
              onDragStart={setDragIndex}
              onDragOver={setOverIndex}
              onDrop={handleDrop}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onSaved={load}
              onDelete={handleDelete}
            />
          ))}
          {steps.length === 0 && <div className="px-4 py-6 text-center text-text-3">No steps configured yet.</div>}
        </div>

        {adding ? (
          <form onSubmit={handleAdd} className="flex items-center gap-2 max-w-md">
            <span className="text-danger text-[13px] shrink-0" title="Required">
              *
            </span>
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
