import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface border border-border rounded-[10px] ${className}`}
      {...props}
    />
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const base = "rounded-[7px] font-semibold text-[13.5px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-accent text-on-accent px-4 py-2 hover:bg-accent-2",
    secondary: "bg-surface border border-border text-text px-4 py-2 hover:bg-surface-2",
    ghost: "bg-transparent text-text-2 px-1 py-1 hover:text-text",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full px-3 py-2.5 border border-border rounded-[7px] bg-surface text-text text-[13.5px] font-sans focus:outline-2 focus:outline-accent ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full px-3 py-2.5 border border-border rounded-[7px] bg-surface text-text text-[13.5px] font-sans resize-y focus:outline-2 focus:outline-accent ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <div className="text-[12.5px] font-semibold text-text-2 mb-1.5">
      {children}
      {required && (
        <span className="text-danger" title="Required">
          {" "}
          *
        </span>
      )}
    </div>
  );
}

/** Full-page loading state, with a "taking longer than expected" hint if it
 *  drags on -- used with useAsyncLoad so a page never looks frozen forever. */
export function LoadingState({ slow }: { slow?: boolean }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-text-2 text-sm">Loading…</div>
        {slow && (
          <div className="text-text-3 text-[12.5px] mt-2 max-w-[280px]">
            This is taking longer than expected. Check your connection, or it should resolve shortly.
          </div>
        )}
      </div>
    </div>
  );
}

/** Full-page error state with a retry action -- used with useAsyncLoad so a
 *  failed fetch shows something actionable instead of an endless spinner. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="text-center max-w-[360px]">
        <div className="text-danger text-sm font-semibold mb-1.5">Couldn't load this page</div>
        <div className="text-text-2 text-[13px] mb-4 leading-relaxed">{message}</div>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </div>
  );
}

/** Sticks a page's title block (name, description, header actions) to the
 *  top of the viewport, just below the 52px TopNav, so it stays visible
 *  while the page's table/list scrolls underneath it. */
export function PageHeader({
  children,
  maxWidthClassName = "max-w-[1240px]",
  paddingClassName = "px-8 py-5",
}: {
  children: ReactNode;
  maxWidthClassName?: string;
  paddingClassName?: string;
}) {
  return (
    <div className="sticky top-[52px] z-20 bg-bg border-b border-border-soft">
      <div className={`${maxWidthClassName} mx-auto ${paddingClassName}`}>{children}</div>
    </div>
  );
}

/** Centered modal dialog with a backdrop. Closes on backdrop click. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border border-border rounded-[12px] shadow-lg w-full max-w-lg mt-10 mb-10"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="font-bold text-[15px]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-3 hover:text-text cursor-pointer text-[20px] leading-none"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Small icon button for re-fetching a page/table's data on demand, spinning while `loading`. */
export function RefreshButton({
  onClick,
  loading,
  title = "Refresh",
}: {
  onClick: () => void;
  loading?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded-[6px] text-text-3 hover:text-accent hover:bg-surface-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={loading ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 11-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}

const badgeVariants = {
  neutral: "bg-surface-2 text-text-2",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: keyof typeof badgeVariants;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${badgeVariants[variant]}`}
    >
      {children}
    </span>
  );
}
