import { Navigate, Route, Routes } from "react-router-dom";

import Shell from "./components/Shell";
import ToastProvider from "./components/ui/ToastProvider";
import { getToken } from "./lib/api";
import CaseWorkspace from "./pages/CaseWorkspace";
import CasesList from "./pages/CasesList";
import Calendar from "./pages/Calendar";
import Clients from "./pages/Clients";
import Documents from "./pages/Documents";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Settings from "./pages/Settings";

function RequireAuth({ children }: { children: React.ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function withShell(children: React.ReactElement) {
  return (
    <RequireAuth>
      <Shell>{children}</Shell>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={withShell(<Overview />)} />
        <Route path="/cases" element={withShell(<CasesList />)} />
        <Route path="/cases/:caseId" element={withShell(<CaseWorkspace />)} />
        <Route path="/clients" element={withShell(<Clients />)} />
        <Route path="/documents" element={withShell(<Documents />)} />
        <Route path="/calendar" element={withShell(<Calendar />)} />
        <Route path="/settings" element={withShell(<Settings />)} />
      </Routes>
    </ToastProvider>
  );
}
