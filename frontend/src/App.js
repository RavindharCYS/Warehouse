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

/* ══════════════════════════════════════════════
   LOADING SCREEN — 6‑DOT UP & DOWN ANIMATION
   ══════════════════════════════════════════════ */
function AppLoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background:
          "linear-gradient(165deg, #f0eeff 0%, #e8e5fa 40%, #ffffff 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 99999,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Logo — transparent background */}
      <div
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "20px",
          background: "transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: "28px",
          overflow: "hidden",
        }}
      >
        <img
          src="/logo.png"
          alt="Rice Warehouse"
          style={{
            width: "72px",
            height: "72px",
            objectFit: "contain",
            filter: "drop-shadow(0 2px 8px rgba(107, 92, 205, 0.25))",
          }}
          onError={(e) => {
            e.target.style.display = "none";
          }}
        />
      </div>

      {/* Title */}
      <div
        style={{
          color: "#1a1a2e",
          fontSize: "22px",
          fontWeight: "700",
          marginBottom: "4px",
        }}
      >
        Rice Warehouse
      </div>

      {/* Tamil subtitle */}
      <div
        style={{
          fontFamily: "'Noto Sans Tamil', sans-serif",
          color: "#6b5ccd",
          fontSize: "14px",
          fontWeight: "600",
          marginBottom: "40px",
        }}
      >
        அரிசி கிடங்கு மேலாண்மை
      </div>

      {/* 6‑dot up & down loader */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          height: "30px",
          marginBottom: "18px",
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#6b5ccd",
              animation: `dotUpDown 1.4s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Styled Loading text */}
      <div
        style={{
          color: "#7c6db8",
          fontSize: "11px",
          fontWeight: "600",
          letterSpacing: "4px",
          textTransform: "uppercase",
          opacity: 0.6,
        }}
      >
        Loading
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes dotUpDown {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.3;
          }
          30% {
            transform: translateY(-12px);
            opacity: 1;
          }
          60% {
            transform: translateY(4px);
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="stocks" element={<StocksPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="users"
          element={
            <ProtectedRoute adminOnly>
              <UsersPage />
            </ProtectedRoute>
          }
        />
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