import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

/**
 * Safely extract a human-readable string from any FastAPI/Pydantic error.
 * FastAPI can return:
 *   - detail: "some string"
 *   - detail: [{type, loc, msg, input, ctx}, ...]  ← Pydantic v2 validation array
 *   - detail: {msg: "..."}
 */
export function getErrorMessage(err, fallback = "Something went wrong") {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map(d => {
        const loc = Array.isArray(d.loc)
          ? d.loc.filter(l => l !== "body").join(" → ")
          : "";
        const msg = d.msg || JSON.stringify(d);
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join(" | ");
  }
  if (typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return String(detail);
}

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// -- Auth ---------------------------------------------------------------
export const authApi = {
  login:     (data)         => api.post("/auth/login", data),
  verifyOtp: (data)         => api.post("/auth/verify-otp", data),
  resendOtp: (sessionToken) => api.post(`/auth/resend-otp?session_token=${encodeURIComponent(sessionToken)}`),
  me:        ()             => api.get("/auth/me"),
  seedAdmin: ()             => api.post("/auth/seed-admin"),
};

// -- Dashboard ----------------------------------------------------------
export const dashboardApi = {
  getSummary: () => api.get("/dashboard/summary"),
};

// -- Warehouses ---------------------------------------------------------
export const warehouseApi = {
  list:      ()         => api.get("/warehouses"),
  get:       (id)       => api.get(`/warehouses/${id}`),
  create:    (data)     => api.post("/warehouses", data),
  update:    (id, data) => api.put(`/warehouses/${id}`, data),
  delete:    (id)       => api.delete(`/warehouses/${id}`),
  getStocks: (id)       => api.get(`/warehouses/${id}/stocks`),
};

// -- Stocks -------------------------------------------------------------
export const stockApi = {
  list:   ()         => api.get("/stocks"),
  get:    (id)       => api.get(`/stocks/${id}`),
  create: (data)     => api.post("/stocks", data),
  update: (id, data) => api.put(`/stocks/${id}`, data),
  delete: (id)       => api.delete(`/stocks/${id}`),
};

// -- Transactions -------------------------------------------------------
export const transactionApi = {
  list:           (params)      => api.get("/transactions", { params }),
  create:         (data)        => api.post("/transactions", data),
  getLedger:      (params)      => api.get("/transactions/ledger", { params }),
  delete:         (id)          => api.delete(`/transactions/${id}`),
  getCustomGrades: ()           => api.get("/transactions/quality-grades"),
  addCustomGrade:  (grade_name) => api.post("/transactions/quality-grades", { grade_name }),
};

// -- Users --------------------------------------------------------------
export const userApi = {
  list:   ()         => api.get("/users"),
  get:    (id)       => api.get(`/users/${id}`),
  create: (data)     => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id)       => api.delete(`/users/${id}`),
};

export default api;