import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function place() {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      // panelRef has no size on the very first call (not mounted yet), so
      // fall back to its known max dimensions -- the follow-up rAF call
      // re-measures against the real, now-mounted panel.
      const panelWidth = panelRef.current?.offsetWidth ?? 208;
      const panelHeight = panelRef.current?.offsetHeight ?? 260;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let top = r.bottom + 6;
      if (top + panelHeight > vh - 8) {
        top = Math.max(8, r.top - panelHeight - 6);
      }

      let left = r.left;
      if (left + panelWidth > vw - 8) {
        left = Math.max(8, vw - panelWidth - 8);
      }

      setPos({ top, left });
    }
    place();
    const raf = requestAnimationFrame(place);

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const current = moderators.find((m) => m.id === value);
  const filtered = moderators.filter((m) =>
    m.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-[6px] bg-surface text-[12.5px] whitespace-nowrap cursor-pointer"
      >
        {current?.full_name ?? "Unassigned"}
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth={2.5}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            // Fixed + portaled to <body> so it always renders above the
            // page, regardless of any scrollable/clipped ancestor (like the
            // candidates table's horizontal-scroll wrapper).
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000, maxHeight: 260 }}
            className="w-52 bg-surface border border-border rounded-[10px] shadow-lg p-2 flex flex-col overflow-hidden"
          >
            <input
              autoFocus
              placeholder="Search moderators..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-border rounded-[6px] bg-surface-2 text-[12.5px] mb-1.5 shrink-0"
            />
            <div className="overflow-y-auto">
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
          </div>,
          document.body,
        )}
    </>
  );
}
