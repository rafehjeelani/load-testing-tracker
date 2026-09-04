import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTest, StaffApiError } from "../../lib/staffApi";
import { Button, Card, FieldLabel, Input } from "../../components/ui";
import { TopNav } from "../staff/TopNav";

export default function CreateTest() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const test = await createTest(name.trim());
      navigate(`/admin/tests/${test.id}/candidates`);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav brandTo="/admin" />
      <div className="flex items-center justify-center px-6 py-16">
        <Card className="w-full max-w-[440px] p-8">
          <h1 className="text-[17px] font-bold mb-1.5">Create New Test</h1>
          <p className="text-[13px] text-text-2 mb-5 leading-relaxed">
            You can add candidates, steps, and moderators after creating the test.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <FieldLabel>Test Name</FieldLabel>
              <Input
                required
                placeholder="e.g. September Load Test"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {error && <div className="text-[12.5px] text-danger">{error}</div>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : "Create Test"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
