import { Logo } from "../components/Logo";

export default function Home() {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-6">
      <div className="max-w-[520px] text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Logo size={24} />
          <span className="font-bold text-[19px]">Load Testing Tracker</span>
        </div>
        <p className="text-text-2 text-sm leading-relaxed">
          Candidates reach their self-report form at a link like{" "}
          <code className="font-mono-tabular text-text">/t/&lt;test-slug&gt;</code>, shared by an
          admin from the Candidates tab. Admin and Moderator consoles are under{" "}
          <code className="font-mono-tabular text-text">/admin</code> and{" "}
          <code className="font-mono-tabular text-text">/moderator</code>.
        </p>
      </div>
    </div>
  );
}
