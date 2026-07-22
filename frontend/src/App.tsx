import { Navigate, Route, Routes } from "react-router-dom";

import { getToken } from "./lib/api";
import CaseWorkspace from "./pages/CaseWorkspace";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

function RequireAuth({ children }: { children: React.ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/cases/:caseId"
        element={
          <RequireAuth>
            <CaseWorkspace />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
