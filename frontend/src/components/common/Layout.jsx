// components/common/Layout.jsx
import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Warehouse, Package, ArrowLeftRight,
  Users, BarChart3, LogOut, Moon, Sun,
  Globe, ChevronRight
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import ConfirmDialog from "./ConfirmDialog";
import toast from "react-hot-toast";

function LogoIcon() {
  const [err, setErr] = React.useState(false);
  if (!err) {
    return (
      <img src="/logo.png" alt="Logo" onError={() => setErr(true)}
        className="w-10 h-10 rounded-2xl object-cover shrink-0"
        style={{ boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }} />
    );
  }
  return (
    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0"
      style={{
        background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
        boxShadow: "0 4px 12px rgba(37,99,235,0.3)"
      }}>
      🌾
    </div>
  );
}

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Confirmation dialog states
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLangConfirm, setShowLangConfirm] = useState(false);
  const [showThemeConfirm, setShowThemeConfirm] = useState(false);

  const navItems = [
    { to: "/",             icon: LayoutDashboard, label: t("nav.dashboard"),    end: true },
    { to: "/warehouses",   icon: Warehouse,       label: t("nav.warehouses") },
    { to: "/stocks",       icon: Package,         label: t("nav.stocks") },
    { to: "/transactions", icon: ArrowLeftRight,  label: t("nav.transactions") },
    { to: "/reports",      icon: BarChart3,       label: t("nav.reports") },
    ...(isAdmin ? [{ to: "/users", icon: Users, label: t("nav.users") }] : []),
  ];

  // ── Logout ──
  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    logout();
    toast.success(i18n.language === "ta" ? "வெளியேறினீர்கள்" : "Logged out");
    navigate("/login");
  };

  // ── Language ──
  const handleLangClick = () => {
    setShowLangConfirm(true);
  };

  const handleLangConfirm = () => {
    setShowLangConfirm(false);
    const next = i18n.language === "en" ? "ta" : "en";
    i18n.changeLanguage(next);
    toast.success(next === "ta" ? "மொழி தமிழுக்கு மாற்றப்பட்டது" : "Language changed to English");
  };

  // ── Theme ──
  const handleThemeClick = () => {
    setShowThemeConfirm(true);
  };

  const handleThemeConfirm = () => {
    setShowThemeConfirm(false);
    toggle();
    toast.success(
      dark
        ? (i18n.language === "ta" ? "ஒளி பயன்முறைக்கு மாற்றப்பட்டது" : "Switched to Light Mode")
        : (i18n.language === "ta" ? "இருள் பயன்முறைக்கு மாற்றப்பட்டது" : "Switched to Dark Mode")
    );
  };

  const currentNav = navItems.find(n => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to));

  // Helper text for confirmations
  const nextLang = i18n.language === "en" ? "ta" : "en";
  const langConfirmTitle = i18n.language === "ta" ? "மொழி மாற்றம்" : "Change Language";
  const langConfirmMessage = i18n.language === "ta"
    ? "மொழியை English-க்கு மாற்ற விரும்புகிறீர்களா?"
    : "Do you want to switch the language to தமிழ் (Tamil)?";

  const themeConfirmTitle = i18n.language === "ta" ? "தீம் மாற்றம்" : "Change Theme";
  const themeConfirmMessage = dark
    ? (i18n.language === "ta"
        ? "ஒளி பயன்முறைக்கு மாற்ற விரும்புகிறீர்களா?"
        : "Do you want to switch to Light Mode?")
    : (i18n.language === "ta"
        ? "இருள் பயன்முறைக்கு மாற்ற விரும்புகிறீர்களா?"
        : "Do you want to switch to Dark Mode?");

  const logoutConfirmTitle = i18n.language === "ta" ? "வெளியேறு" : "Logout";
  const logoutConfirmMessage = i18n.language === "ta"
    ? "நீங்கள் வெளியேற விரும்புகிறீர்களா? மீண்டும் உள்நுழைய வேண்டும்."
    : "Are you sure you want to logout? You will need to sign in again.";

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>

      {/* ── Desktop Sidebar ─────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex flex-col h-full">

          {/* Logo */}
          <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3">
              <LogoIcon />
              <div>
                <div className="font-display font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>
                  {t("appName")}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "மேலாண்மை தளம்" : "Management System"}
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                <ChevronRight size={13} className="opacity-20" />
              </NavLink>
            ))}
          </nav>

          {/* Bottom controls */}
          <div className="px-3 py-3 border-t space-y-0.5" style={{ borderColor: "var(--border)" }}>
            <button onClick={handleLangClick} className="sidebar-link w-full">
              <Globe size={18} />
              <span className="flex-1">
                {i18n.language === "en" ? "தமிழ் / Tamil" : "English"}
              </span>
            </button>
            <button onClick={handleThemeClick} className="sidebar-link w-full">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
              <span className="flex-1">{dark ? t("common.lightMode") : t("common.darkMode")}</span>
            </button>
            <button onClick={handleLogoutClick} className="sidebar-link w-full" style={{ color: "var(--danger)" }}>
              <LogOut size={18} />
              <span className="flex-1">{t("nav.logout")}</span>
            </button>
          </div>

          {/* User info */}
          <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}>
                {user?.full_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {user?.full_name}
                </div>
                <div className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
                  {user?.role === "admin"
                    ? (i18n.language === "ta" ? "நிர்வாகி" : "Admin")
                    : (i18n.language === "ta" ? "பயனர்" : "User")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Area ───────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Mobile Topbar ─────────────────────────── */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 z-40"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>

          {/* Page Title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <LogoIcon />
            <div className="min-w-0">
              <span className="font-display font-bold text-base block truncate" style={{ color: "var(--text-primary)" }}>
                {currentNav?.label || t("appName")}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleLangClick}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border"
              style={{ color: "var(--accent)", borderColor: "var(--accent)", backgroundColor: "var(--accent-soft)" }}>
              {i18n.language === "en" ? "த" : "EN"}
            </button>
            <button onClick={handleThemeClick} className="p-2 rounded-xl"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button onClick={handleLogoutClick} className="p-2 rounded-xl"
              style={{ color: "var(--danger)", backgroundColor: "var(--bg-secondary)" }}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 animate-fade-in">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Nav ── */}
        <nav
          className="md:hidden flex"
          style={{
            backgroundColor: "var(--bg-card)",
            borderTop: "1px solid var(--border)",
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {navItems.slice(0, 5).map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors duration-150 ${
                  isActive ? "font-bold" : ""
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? "var(--accent)" : "var(--text-muted)",
              })}
            >
              <Icon size={20} />
              <span className="truncate text-[10px] leading-tight max-w-[56px] text-center">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ── Confirmation Dialogs ── */}

      {/* Language Change */}
      <ConfirmDialog
        open={showLangConfirm}
        onClose={() => setShowLangConfirm(false)}
        onConfirm={handleLangConfirm}
        title={langConfirmTitle}
        message={langConfirmMessage}
        danger={false}
        confirmLabel={nextLang === "ta" ? "தமிழ்" : "English"}
      />

      {/* Theme Change */}
      <ConfirmDialog
        open={showThemeConfirm}
        onClose={() => setShowThemeConfirm(false)}
        onConfirm={handleThemeConfirm}
        title={themeConfirmTitle}
        message={themeConfirmMessage}
        danger={false}
        confirmLabel={
          dark
            ? (i18n.language === "ta" ? "ஒளி பயன்முறை" : "Light Mode")
            : (i18n.language === "ta" ? "இருள் பயன்முறை" : "Dark Mode")
        }
      />

      {/* Logout */}
      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogoutConfirm}
        title={logoutConfirmTitle}
        message={logoutConfirmMessage}
        danger={true}
      />
    </div>
  );
}