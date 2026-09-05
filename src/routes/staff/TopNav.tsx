import { NavLink } from "react-router-dom";
import { Logo } from "../../components/Logo";

export interface NavTab {
  label: string;
  to: string;
}

export function TopNav({
  brandTo,
  suffix,
  tabs,
}: {
  brandTo: string;
  suffix?: string;
  tabs?: NavTab[];
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="max-w-[1240px] mx-auto px-8 h-[52px] flex items-center gap-2">
        <NavLink to={brandTo} className="flex items-center gap-2 mr-7 shrink-0">
          <Logo size={20} />
          <span className="font-semibold text-sm">
            Load Testing Tracker
            {suffix && <span className="text-text-3 font-normal"> · {suffix}</span>}
          </span>
        </NavLink>
        {tabs && (
          <nav className="flex items-center gap-0.5 h-full">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `px-3.5 h-full flex items-center text-[13.5px] ${
                    isActive
                      ? "font-semibold text-accent border-b-2 border-accent"
                      : "text-text-2"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
