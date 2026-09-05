import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTests } from "../../lib/staffApi";
import type { Test } from "../../types";
import { Button, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

export default function TestList() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<Test[] | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { status, error, slow, retry } = useAsyncLoad(async () => {
    setTests(await listTests());
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      setTests(await listTests());
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = (tests ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav brandTo="/admin" />
      <PageHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold m-0">Tests</h1>
            <div className="text-[12.5px] text-text-3 mt-1">
              Each test tracks candidate self-reports for a separate Talview test session
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <RefreshButton onClick={handleRefresh} loading={refreshing} />
            <Button variant="secondary" onClick={() => navigate("/moderator")} className="flex items-center gap-2">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              Moderator View
            </Button>
            <Button onClick={() => navigate("/admin/tests/new")} className="flex items-center gap-2">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create New Test
            </Button>
          </div>
        </div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
        <input
          className="w-full max-w-[340px] px-3 py-2.5 border border-border rounded-[7px] bg-surface text-[13.5px] mb-4.5"
          placeholder="Search tests by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Test Name
                </th>
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {status === "loading" && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-text-3">
                    Loading…
                    {slow && (
                      <div className="text-[12px] mt-1">
                        This is taking longer than expected. Check your connection.
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {status === "error" && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center">
                    <div className="text-danger text-[13px] font-semibold mb-2">Couldn't load tests</div>
                    <div className="text-text-2 text-[12.5px] mb-3">{error}</div>
                    <Button onClick={retry}>Retry</Button>
                  </td>
                </tr>
              )}
              {status === "ready" && tests !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-text-3">
                    No tests yet — create one to get started.
                  </td>
                </tr>
              )}
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/admin/tests/${t.id}/candidates`)}
                  className="cursor-pointer hover:bg-surface-2 border-b border-border-soft last:border-0"
                >
                  <td className="px-4 py-2.5 font-semibold">{t.name}</td>
                  <td className="px-4 py-2.5 font-mono-tabular text-text-2">
                    {new Date(t.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
