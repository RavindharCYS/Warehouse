import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { authApi } from "../utils/api";

const AuthContext = createContext(null);

/**
 * Field-level visibility rules.
 * Used by Arrival/Send/Stocks/Reports pages to hide admin-only fields from regular users.
 */
export const ADMIN_ONLY_FIELDS = {
  arrival: ["mill_owner_name", "price", "rent", "hidden_charges"],
  send:    ["location", "sell_price"],
  stocks:  ["price", "rent", "hidden_charges", "mill_owner_name", "sell_price"],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("auth_user")); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      authApi.me()
        .then(res => {
          setUser(res.data);
          // refresh cached user (role may have changed server-side)
          localStorage.setItem("auth_user", JSON.stringify(res.data));
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setUser(null);
  }, []);

  const isAdmin = user?.role === "admin";
  const isUser  = user?.role === "user";

  /**
   * Returns true if the current user can see the given field on the given page.
   *   canSeeField("arrival", "price")  -> false for normal users, true for admin
   */
  const canSeeField = useCallback((page, fieldName) => {
    if (isAdmin) return true;
    const hidden = ADMIN_ONLY_FIELDS[page] || [];
    return !hidden.includes(fieldName);
  }, [isAdmin]);

  /**
   * Returns true if the current user can edit the given field.
   * Admin-only fields are read-only / hidden for users.
   */
  const canEditField = useCallback((page, fieldName) => {
    return canSeeField(page, fieldName);
  }, [canSeeField]);

  /**
   * Strip admin-only fields from a payload before submitting (extra safety for users).
   */
  const sanitizePayload = useCallback((page, payload) => {
    if (isAdmin) return payload;
    const hidden = ADMIN_ONLY_FIELDS[page] || [];
    const clean = { ...payload };
    hidden.forEach(f => { delete clean[f]; });
    return clean;
  }, [isAdmin]);

  const value = useMemo(() => ({
    user,
    login,
    logout,
    isAdmin,
    isUser,
    loading,
    canSeeField,
    canEditField,
    sanitizePayload,
    ADMIN_ONLY_FIELDS,
  }), [user, login, logout, isAdmin, isUser, loading, canSeeField, canEditField, sanitizePayload]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};