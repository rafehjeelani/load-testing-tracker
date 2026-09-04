import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { updatePassword, StaffApiError } from "../../lib/staffApi";
import { Button, Card, FieldLabel, Input } from "../../components/ui";
import { Logo } from "../../components/Logo";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The recovery link puts a temporary session in the URL, which
    // supabase-js picks up automatically on load and fires this event for.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Couldn't update your password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <Card className="w-full max-w-[380px] p-8">
        <div className="flex flex-col items-center gap-2.5 mb-6">
          <Logo size={30} />
          <span className="font-semibold text-[15px] text-center">Load Testing Tracker</span>
        </div>

        {done ? (
          <div className="text-center">
            <h1 className="text-[17px] font-bold mb-2">Password updated</h1>
            <p className="text-[13px] text-text-2 mb-6 leading-relaxed">You can now sign in with your new password.</p>
            <Button onClick={() => navigate("/admin/login")} className="w-full">
              Go to Sign In
            </Button>
          </div>
        ) : !ready ? (
          <div className="text-[13px] text-text-2 text-center leading-relaxed">
            This reset link is invalid or has expired. Request a new one from the sign-in page.
          </div>
        ) : (
          <>
            <h1 className="text-[17px] font-bold text-center mb-6">Set a new password</h1>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <FieldLabel>New Password</FieldLabel>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Confirm Password</FieldLabel>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <div className="text-[12.5px] text-danger">{error}</div>}
              <Button type="submit" disabled={loading} className="w-full mt-1">
                {loading ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
