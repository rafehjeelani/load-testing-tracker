import { useEffect, useRef, useState } from "react";
import type { Moderator } from "../../types";

export default function ModeratorSelect({
  moderators,
  value,
  onChange,
}: {
  moderators: Moderator[];
  value: string | null;
  onChange: (moderatorId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = moderators.find((m) => m.id === value);
  const filtered = moderators.filter((m) =>
    m.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-[6px] bg-surface text-[12.5px] whitespace-nowrap cursor-pointer"
      >
        {current?.full_name ?? "Unassigned"}
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth={2.5}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 top-full left-0 mt-1.5 w-52 bg-surface border border-border rounded-[10px] shadow-lg p-2">
          <input
            autoFocus
            placeholder="Search moderators..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-border rounded-[6px] bg-surface-2 text-[12.5px] mb-1.5"
          />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-[6px] text-[12.5px] text-text-3 hover:bg-surface-2 cursor-pointer"
          >
            Unassigned
          </button>
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-[6px] text-[12.5px] cursor-pointer ${
                m.id === value ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
              }`}
            >
              {m.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
