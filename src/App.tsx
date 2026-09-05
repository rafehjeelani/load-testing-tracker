import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { CandidateSessionProvider } from "./routes/candidate/CandidateSessionContext";
import EmailGate from "./routes/candidate/EmailGate";
import StepForm from "./routes/candidate/StepForm";
import Home from "./routes/Home";
import { AuthProvider } from "./routes/staff/AuthContext";
import RequireRole from "./routes/staff/RequireRole";
import Login from "./routes/staff/Login";
import ResetPassword from "./routes/staff/ResetPassword";
import CandidateForm from "./routes/staff/CandidateForm";
import TestList from "./routes/admin/TestList";
import Users from "./routes/admin/Users";
import CreateTest from "./routes/admin/CreateTest";
import Candidates from "./routes/admin/Candidates";
import Steps from "./routes/admin/Steps";
import Moderators from "./routes/admin/Moderators";
import Report from "./routes/admin/Report";
import ModeratorDashboardHome from "./routes/moderator/DashboardHome";
import ModeratorDashboard from "./routes/moderator/Dashboard";
import LiveMonitoring from "./routes/moderator/LiveMonitoring";

function CandidateLayout() {
  return (
    <CandidateSessionProvider>
      <Outlet />
    </CandidateSessionProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/t/:testSlug" element={<CandidateLayout />}>
          <Route index element={<EmailGate />} />
          <Route path="form" element={<StepForm />} />
        </Route>

        <Route path="/admin/login" element={<Login role="admin" />} />
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin" element={<TestList />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/tests/new" element={<CreateTest />} />
          <Route path="/admin/tests/:testId" element={<Navigate to="candidates" replace />} />
          <Route path="/admin/tests/:testId/candidates" element={<Candidates />} />
          <Route path="/admin/tests/:testId/candidates/:candidateId" element={<CandidateForm />} />
          <Route path="/admin/tests/:testId/steps" element={<Steps />} />
          <Route path="/admin/tests/:testId/moderators" element={<Moderators />} />
          <Route path="/admin/tests/:testId/report" element={<Report />} />
        </Route>

        <Route path="/moderator/login" element={<Login role="moderator" />} />
        <Route element={<RequireRole role="moderator" />}>
          <Route path="/moderator" element={<ModeratorDashboardHome />} />
          <Route path="/moderator/tests/:testId/dashboard" element={<ModeratorDashboard />} />
          <Route path="/moderator/tests/:testId/candidates/:candidateId" element={<CandidateForm />} />
          <Route path="/moderator/tests/:testId/live" element={<LiveMonitoring />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
