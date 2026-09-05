import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCandidateState, CandidateApiError } from "../../lib/candidateApi";
import { useCandidateSession } from "./CandidateSessionContext";
import { Button, Card, FieldLabel, Input } from "../../components/ui";
import { Logo } from "../../components/Logo";

export default function EmailGate() {
  const { testSlug } = useParams<{ testSlug: string }>();
  const navigate = useNavigate();
  const { setSession } = useCandidateSession();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!testSlug || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const state = await getCandidateState(testSlug, email.trim());
      setSession({ testSlug, email: email.trim(), state });
      navigate(`/t/${testSlug}/form`);
    } catch (err) {
      if (err instanceof CandidateApiError && err.message === "email_not_registered") {
        setError(
          "We couldn't find that email on the candidate list for this test. Enter your registered email id.",
        );
      } else if (err instanceof CandidateApiError && err.message === "test_not_found") {
        setError("This test link doesn't look right. Check the URL your admin shared with you.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="border-b border-border bg-surface">
        <div className="max-w-[760px] mx-auto px-6 h-[52px] flex items-center gap-2">
          <Logo />
          <span className="font-semibold text-sm">Load Testing Tracker</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <Card className="w-full max-w-[420px] p-8">
          <h1 className="text-[17px] font-bold mb-1.5">Enter your email to continue</h1>
          <p className="text-[13px] text-text-2 mb-5 leading-relaxed">
            We'll match it against the candidate list for this test.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <FieldLabel required>Email</FieldLabel>
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={error ? "border-danger" : ""}
              />
              {error && (
                <div className="flex items-start gap-1.5 mt-2 text-[12.5px] text-danger">
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="mt-0.5 shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5" />
                    <path d="M12 16h.01" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Checking…" : "Continue"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
