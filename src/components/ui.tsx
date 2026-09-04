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

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-[12.5px] font-semibold text-text-2 mb-1.5">{children}</div>;
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
