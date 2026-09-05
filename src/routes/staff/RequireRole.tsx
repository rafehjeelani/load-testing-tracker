import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { StaffRole } from "../../types";

/** Gates a subtree to a signed-in profile with the given role. */
export default function RequireRole({ role }: { role: StaffRole }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }
  if (!profile) {
    return <Navigate to={`/${role}/login`} replace />;
  }
  // Admins are moderators by default -- they can reach the moderator
  // console (to work candidates assigned to them) in addition to /admin.
  const isModeratorByDefault = role === "moderator" && profile.role === "admin";
  if (profile.role !== role && !isModeratorByDefault) {
    // Signed in, but as the other role -- send them to their own console.
    return <Navigate to={`/${profile.role}`} replace />;
  }
  return <Outlet />;
}
