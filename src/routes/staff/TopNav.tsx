import { NavLink, useNavigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { signOut } from "../../lib/staffApi";

export interface NavTab {
  label: string;
  to: string;
  /** Pass when `to` is a prefix of another tab's path (e.g. "/admin" vs
   *  "/admin/users") so NavLink doesn't mark both active at once. */
  end?: boolean;
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
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    // brandTo is always the role's home route ("/admin" or "/moderator"),
    // which doubles as the login path's prefix.
    navigate(`${brandTo}/login`, { replace: true });
  }

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
                end={tab.end}
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
        <button
          type="button"
          onClick={handleLogout}
          className="ml-auto shrink-0 flex items-center gap-1.5 text-[13px] text-text-2 hover:text-danger cursor-pointer"
          title="Log out"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  );
}
