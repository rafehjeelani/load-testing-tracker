import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { signIn, StaffApiError } from "../../lib/staffApi";
import { useAuth } from "./AuthContext";
import { Button, Card, FieldLabel, Input } from "../../components/ui";
import { Logo } from "../../components/Logo";
import type { StaffRole } from "../../types";

export default function Login({ role }: { role: StaffRole }) {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (profile) {
    return <Navigate to={`/${profile.role}`} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      await refresh();
      navigate(`/${role}`);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Sign in failed. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  const title = role === "admin" ? "Admin Sign In" : "Moderator Sign In";
  const wordmark = role === "admin" ? "Load Testing Tracker" : "Load Testing Tracker · Moderator";

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <Card className="w-full max-w-[380px] p-8">
        <div className="flex flex-col items-center gap-2.5 mb-6">
          <Logo size={30} />
          <span className="font-semibold text-[15px] text-center">{wordmark}</span>
        </div>
        <h1 className="text-[17px] font-bold text-center mb-6">{title}</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              required
              placeholder="you@talview.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="text-[12.5px] text-danger">{error}</div>}
          <Button type="submit" disabled={loading} className="w-full mt-1">
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
