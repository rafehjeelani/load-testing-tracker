export default function ComingSoon({ role }: { role: string }) {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-6">
      <div className="max-w-[420px] text-center">
        <div className="font-bold text-[17px] mb-2">{role} console — coming next</div>
        <p className="text-text-2 text-sm leading-relaxed">
          The candidate self-report flow is wired up first. {role} screens (auth, candidates
          table, steps, moderators, report) are the next slice.
        </p>
      </div>
    </div>
  );
}
