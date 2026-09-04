import { createContext, useContext, useState, type ReactNode } from "react";
import type { CandidateState } from "../../types";

export interface CandidateSession {
  testSlug: string;
  email: string;
  state: CandidateState;
}

interface Ctx {
  session: CandidateSession | null;
  setSession: (s: CandidateSession | null) => void;
}

const CandidateSessionCtx = createContext<Ctx | null>(null);

export function CandidateSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CandidateSession | null>(null);
  return (
    <CandidateSessionCtx.Provider value={{ session, setSession }}>
      {children}
    </CandidateSessionCtx.Provider>
  );
}

export function useCandidateSession() {
  const ctx = useContext(CandidateSessionCtx);
  if (!ctx) {
    throw new Error("useCandidateSession must be used within CandidateSessionProvider");
  }
  return ctx;
}
