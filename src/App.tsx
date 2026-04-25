import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import AppShell from "@/components/layout/AppShell";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ComponentsPage from "./pages/Components";
import DevicesPage from "./pages/Devices";
import ScanPage from "./pages/Scan";
import LogsPage from "./pages/Logs";
import NotFound from "./pages/NotFound.tsx";
import UsersPage from "./pages/Users";
import PlannerPage from "./pages/Planner";
import DefectivePage from "./pages/Defective";
import HistoryPage from "./pages/History";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              element={
                <AuthGuard>
                  <AppShell />
                </AuthGuard>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/components" element={<ComponentsPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/scan" element={<ScanPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/planner" element={<PlannerPage />} />
            </Route>
            <Route path="/index" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
