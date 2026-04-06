import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import "./i18n";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";

import Layout from "./components/common/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import WarehousesPage from "./pages/WarehousesPage";
import StocksPage from "./pages/StocksPage";
import TransactionsPage from "./pages/TransactionsPage";
import UsersPage from "./pages/UsersPage";
import ReportsPage from "./pages/ReportsPage";

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-brand-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="stocks" element={<StocksPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const { i18n } = useTranslation();
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className={i18n.language === "ta" ? "lang-ta" : ""}>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: { borderRadius: "12px", fontSize: "14px" },
              }}
            />
            <AppRoutes />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
