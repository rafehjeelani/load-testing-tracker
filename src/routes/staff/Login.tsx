import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { requestPasswordReset, signIn, StaffApiError } from "../../lib/staffApi";
import { useAuth } from "./AuthContext";
import { Button, Card, FieldLabel, Input } from "../../components/ui";
import { Logo } from "../../components/Logo";
import type { StaffRole } from "../../types";

export default function Login({ role }: { role: StaffRole }) {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (profile) {
    return <Navigate to={`/${profile.role}`} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      const p = await refresh();
      if (!p) {
        setError(
          "Signed in, but this account doesn't have an admin or moderator profile set up yet. Contact whoever manages this app.",
        );
        return;
      }
      if (p.role !== role) {
        setError(`This account is set up as a ${p.role}, not ${role === "admin" ? "an" : "a"} ${role}. Try the ${p.role} login instead.`);
        return;
      }
      navigate(`/${role}`);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Sign in failed. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Couldn't send the reset email. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: "sign-in" | "reset") {
    setMode(next);
    setError(null);
    setResetSent(false);
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

        {mode === "sign-in" ? (
          <>
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
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="text-[13px] text-text-2 cursor-pointer text-center"
              >
                Forgot password?
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-[17px] font-bold text-center mb-1.5">Reset your password</h1>
            <p className="text-[13px] text-text-2 text-center mb-6 leading-relaxed">
              Enter your email and we'll send you a link to set a new password.
            </p>
            {resetSent ? (
              <div className="text-[13px] text-text-2 text-center leading-relaxed">
                Check <span className="font-semibold text-text">{email}</span> for a reset link. It may take a
                minute to arrive.
                <button
                  type="button"
                  onClick={() => switchMode("sign-in")}
                  className="block w-full text-[13px] text-accent font-semibold cursor-pointer mt-5"
                >
                  ← Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetRequest} className="flex flex-col gap-3.5">
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
                {error && <div className="text-[12.5px] text-danger">{error}</div>}
                <Button type="submit" disabled={loading} className="w-full mt-1">
                  {loading ? "Sending…" : "Send Reset Link"}
                </Button>
                <button
                  type="button"
                  onClick={() => switchMode("sign-in")}
                  className="text-[13px] text-text-2 cursor-pointer text-center"
                >
                  ← Back to Sign In
                </button>
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
