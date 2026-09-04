import { Outlet, Route, Routes } from "react-router-dom";
import { CandidateSessionProvider } from "./routes/candidate/CandidateSessionContext";
import EmailGate from "./routes/candidate/EmailGate";
import StepForm from "./routes/candidate/StepForm";
import ComingSoon from "./routes/ComingSoon";
import Home from "./routes/Home";

function CandidateLayout() {
  return (
    <CandidateSessionProvider>
      <Outlet />
    </CandidateSessionProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/t/:testSlug" element={<CandidateLayout />}>
        <Route index element={<EmailGate />} />
        <Route path="form" element={<StepForm />} />
      </Route>

      <Route path="/admin/*" element={<ComingSoon role="Admin" />} />
      <Route path="/moderator/*" element={<ComingSoon role="Moderator" />} />
    </Routes>
  );
}
