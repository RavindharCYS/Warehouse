import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

// ── Dev-time warning so missing env is obvious immediately ──
if (!process.env.REACT_APP_API_URL && process.env.NODE_ENV === "production") {
  console.error(
    "[CONFIG ERROR] REACT_APP_API_URL is not set. " +
    "All API calls will fail. Set it in Vercel → Settings → Environment Variables."
  );
}

/**
 * Safely extract a human-readable string from any FastAPI/Pydantic error.
 */
export function getErrorMessage(err, fallback = "Something went wrong") {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const loc = Array.isArray(d.loc)
          ? d.loc.filter((l) => l !== "body").join(" → ")
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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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

/* ============================================================
 * BAG CALCULATION HELPERS
 *
 * CORE RULES:
 *  - weight >= 25kg  → 1 bag per qty (always, regardless of bag_size selection)
 *      • 25, 26 → standard bag
 *      • 27+ (30, 50, 75…) → big single bag
 *  - weight < 25kg  → "piece" — only counted as bags via consolidation
 *      • At ARRIVAL: stored as exact pieces (weight + qty) — NO consolidation
 *      • At STOCK DISPLAY: pooled per (brand + warehouse), then
 *          floor(totalPieceKg / bag_size) = "bags from pieces"
 *          remainder = "leftover pieces (kg)"
 *
 * BAG_SIZES is the reference target for piece pooling. Default 25kg.
 * ============================================================ */
export const BAG_SIZES = [25, 26];
export const PIECE_THRESHOLD_KG = 25; // anything < this is a "piece"

export function calcTotalWeight(rows = []) {
  return rows.reduce(
    (sum, r) => sum + (Number(r.weight) || 0) * (Number(r.quantity) || 0),
    0
  );
}

/**
 * Classify a single weight value.
 *  - "bag"   : weight >= 25 (one bag per unit)
 *  - "piece" : weight < 25 (loose piece, needs pooling for display)
 *  - "none"  : invalid/zero
 */
export function classifyWeight(weight) {
  const wt = Number(weight) || 0;
  if (wt <= 0) return "none";
  if (wt >= PIECE_THRESHOLD_KG) return "bag";
  return "piece";
}

/**
 * ARRIVAL-TIME calculation: compute totals from raw entries.
 * Each entry is treated EXACTLY as entered — no piece pooling.
 *
 * @param {Array<{weight, quantity}>} rows
 * @returns {{
 *   totalBagUnits: number,    // count of weight>=25 units (each = 1 bag)
 *   totalPieceUnits: number,  // count of weight<25 units (loose pieces)
 *   totalKg: number,          // grand total kg
 *   bagRows: Array,           // rows with weight >= 25
 *   pieceRows: Array          // rows with weight < 25
 * }}
 */
export function calcArrivalEntries(rows = []) {
  let totalBagUnits = 0;
  let totalPieceUnits = 0;
  let totalKg = 0;
  const bagRows = [];
  const pieceRows = [];

  for (const r of rows) {
    const wt = Number(r.weight) || 0;
    const qty = Number(r.quantity) || 0;
    if (wt <= 0 || qty <= 0) continue;

    totalKg += wt * qty;
    if (wt >= PIECE_THRESHOLD_KG) {
      totalBagUnits += qty;
      bagRows.push(r);
    } else {
      totalPieceUnits += qty;
      pieceRows.push(r);
    }
  }

  return { totalBagUnits, totalPieceUnits, totalKg, bagRows, pieceRows };
}

/**
 * STOCK-DISPLAY consolidation for a list of stock rows belonging to the
 * SAME (brand + warehouse) group.
 *
 * Each input row: { bag_weight_kg, total_bags (or remaining_bags) }
 *
 * @returns {{
 *   bagCount: number,         // sum of bags from weight>=25 rows
 *   pieceTotalKg: number,     // sum of kg from weight<25 rows
 *   piecesAsBags: number,     // floor(pieceTotalKg / bagSize)
 *   leftoverKg: number,       // remainder kg that doesn't form a full bag
 *   leftoverPieceCount: number, // sum of qty from weight<25 rows (display)
 *   displayTotalBags: number, // bagCount + piecesAsBags
 *   pieceBreakdown: Array,    // [{weight, qty, kg}]
 *   bagBreakdown: Array       // [{weight, qty}]
 * }}
 */
export function calcStockDisplay(rows = [], bagSize = 25) {
  if (!BAG_SIZES.includes(bagSize)) bagSize = 25;

  let bagCount = 0;
  let pieceTotalKg = 0;
  let leftoverPieceCount = 0;
  // Use Maps to merge duplicate weights across multiple stock rows
  const bagBreakdownMap   = new Map(); // weight → qty
  const pieceBreakdownMap = new Map(); // weight → qty

  for (const r of rows) {
    // ── Prefer weight_breakdowns array sent by backend (has per-weight detail) ──
    const breakdowns =
      Array.isArray(r.weight_breakdowns) && r.weight_breakdowns.length > 0
        ? r.weight_breakdowns
        : null;

    if (breakdowns) {
      for (const b of breakdowns) {
        const wt  = Number(b.weight_kg ?? b.weight) || 0;
        const qty = Number(b.quantity  ?? b.qty)    || 0;
        if (wt <= 0 || qty <= 0) continue;

        if (wt >= PIECE_THRESHOLD_KG) {
          bagCount += qty;
          bagBreakdownMap.set(wt, (bagBreakdownMap.get(wt) || 0) + qty);
        } else {
          pieceTotalKg += wt * qty;
          leftoverPieceCount += qty;
          pieceBreakdownMap.set(wt, (pieceBreakdownMap.get(wt) || 0) + qty);
        }
      }
    } else {
      // ── Legacy fallback: single weight per stock row ──
      const wt  = Number(r.bag_weight_kg ?? r.weight) || 0;
      const qty = Number(r.total_bags ?? r.remaining_bags ?? r.quantity) || 0;
      if (wt <= 0 || qty <= 0) continue;

      if (wt >= PIECE_THRESHOLD_KG) {
        bagCount += qty;
        bagBreakdownMap.set(wt, (bagBreakdownMap.get(wt) || 0) + qty);
      } else {
        pieceTotalKg += wt * qty;
        leftoverPieceCount += qty;
        pieceBreakdownMap.set(wt, (pieceBreakdownMap.get(wt) || 0) + qty);
      }
    }
  }

  const bagBreakdown   = Array.from(bagBreakdownMap.entries())
    .map(([weight, qty]) => ({ weight, qty }));
  const pieceBreakdown = Array.from(pieceBreakdownMap.entries())
    .map(([weight, qty]) => ({ weight, qty, kg: weight * qty }));

  const piecesAsBags     = Math.floor(pieceTotalKg / bagSize);
  const leftoverKg       = Math.round((pieceTotalKg - piecesAsBags * bagSize) * 10000) / 10000;
  const displayTotalBags = bagCount + piecesAsBags;

  return {
    bagCount,
    pieceTotalKg,
    piecesAsBags,
    leftoverKg,
    leftoverPieceCount,
    displayTotalBags,
    pieceBreakdown,
    bagBreakdown,
    bagSize,
  };
}

/**
 * Group raw stock rows by Brand → then by Warehouse, with display totals.
 * Used by Stocks page.
 *
 * @param {Array} stocks - raw stock rows from API
 * @param {object} opts  - { lang, bagSize }
 */
export function groupStocksForDisplay(stocks = [], opts = {}) {
  const { lang = "en", bagSize = 25 } = opts;
  const byBrand = new Map();

  for (const s of stocks) {
    // A stock row is relevant if it has bags OR has piece weight_breakdowns
    const qty = Number(s.total_bags ?? s.remaining_bags ?? 0);
    const hasBreakdowns =
      Array.isArray(s.weight_breakdowns) && s.weight_breakdowns.length > 0;
    if (qty <= 0 && !hasBreakdowns) continue;

    const bId = s.brand_id ?? s.brand?.id;
    if (bId == null) continue;

    const bName =
      lang === "ta" && (s.brand_name_ta || s.brand?.name_ta)
        ? (s.brand_name_ta || s.brand?.name_ta)
        : (s.brand_name || s.brand?.name || "Unknown");

    if (!byBrand.has(bId)) {
      byBrand.set(bId, {
        brandId: bId,
        brandName: bName,
        warehouses: new Map(),
      });
    }
    const brandGroup = byBrand.get(bId);

    const wId = s.warehouse_id ?? s.warehouse?.id ?? "—";
    const wName =
      lang === "ta" && (s.warehouse?.location_name_ta)
        ? s.warehouse.location_name_ta
        : (s.warehouse?.location_name || `W${wId}`);

    if (!brandGroup.warehouses.has(wId)) {
      brandGroup.warehouses.set(wId, {
        warehouseId: wId,
        warehouseName: wName,
        rows: [],
      });
    }
    brandGroup.warehouses.get(wId).rows.push(s);
  }

  // Compute display totals
  const result = [];
  for (const brand of byBrand.values()) {
    const warehouseList = [];
    let brandTotalBags = 0;
    let brandLeftoverKg = 0;
    let brandLeftoverPieceCount = 0;

    for (const wh of brand.warehouses.values()) {
      const calc = calcStockDisplay(wh.rows, bagSize);
      warehouseList.push({
        warehouseId: wh.warehouseId,
        warehouseName: wh.warehouseName,
        ...calc,
      });
      brandTotalBags += calc.displayTotalBags;
      brandLeftoverKg += calc.leftoverKg;
      brandLeftoverPieceCount += calc.leftoverPieceCount;
    }

    // Sort warehouses by bag count desc
    warehouseList.sort((a, b) => b.displayTotalBags - a.displayTotalBags);

    result.push({
      brandId: brand.brandId,
      brandName: brand.brandName,
      warehouses: warehouseList,
      totalBags: brandTotalBags,
      totalLeftoverKg: brandLeftoverKg,
      totalLeftoverPieceCount: brandLeftoverPieceCount,
      // Short summary like "W A×5, W B×3"
      warehouseSummary: warehouseList
        .map((w) => `${w.warehouseName}×${w.displayTotalBags}`)
        .join(", "),
      // Weight summary like "25KG×5, 5KG×10"
      weightSummary: (() => {
        const m = new Map();
        for (const wh of warehouseList) {
          for (const b of wh.bagBreakdown) {
            m.set(b.weight, (m.get(b.weight) || 0) + b.qty);
          }
          for (const p of wh.pieceBreakdown) {
            m.set(p.weight, (m.get(p.weight) || 0) + p.qty);
          }
        }
        return Array.from(m.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([wt, q]) => `${wt}KG×${q}`)
          .join(", ");
      })(),
    });
  }

  // Sort brands by total bags desc
  result.sort((a, b) => b.totalBags - a.totalBags);
  return result;
}

/* ─── Legacy helpers — kept for backward compatibility ─── */

/**
 * @deprecated — kept for backward compatibility.
 * For ARRIVAL: use calcArrivalEntries() which returns exact bag/piece units.
 * For STOCK DISPLAY: use calcStockDisplay() which pools pieces.
 */
export function calcBagsFromRows(rows = [], bagSize = 25) {
  if (!BAG_SIZES.includes(bagSize)) bagSize = 25;
  // Simple arrival-style count: each weight>=25 → qty bags; pieces pooled within this single rowset
  const arrival = calcArrivalEntries(rows);
  const pieceTotalKg = arrival.pieceRows.reduce((s, r) => s + Number(r.weight) * Number(r.quantity), 0);
  const piecesAsBags = Math.floor(pieceTotalKg / bagSize);
  const remainderKg = Math.round((pieceTotalKg - piecesAsBags * bagSize) * 10000) / 10000;
  return {
    bags: arrival.totalBagUnits + piecesAsBags,
    standardBags: arrival.totalBagUnits,
    smallBags: piecesAsBags,
    bigBags: 0,
    remainderKg,
    bagSize,
    error: null,
  };
}

export function calcBags(totalKg, bagSize = 25) {
  if (!BAG_SIZES.includes(bagSize)) bagSize = 25;
  const bags = Math.floor(totalKg / bagSize);
  const remainderKg = Math.round((totalKg - bags * bagSize) * 10000) / 10000;
  return { bags, remainderKg, bagSize };
}

export function validateWarehouseSplit(splits = [], totalBags = 0) {
  const sum = splits.reduce((s, x) => s + (Number(x.bags) || 0), 0);
  return { ok: sum === totalBags, sum, totalBags, diff: totalBags - sum };
}

/* ============================================================
 * TRANSACTION TYPE MAPPING
 * ============================================================ */
export function txTypeToBackend(displayType) {
  if (displayType === "arrival") return "inbound";
  if (displayType === "send") return "outbound";
  return displayType;
}

export function txTypeToDisplay(backendType) {
  if (backendType === "inbound") return "arrival";
  if (backendType === "outbound") return "send";
  return backendType;
}

// -- Auth ---------------------------------------------------------------
export const authApi = {
  login:     (data)         => api.post("/auth/login", data),
  verifyOtp: (data)         => api.post("/auth/verify-otp", data),
  resendOtp: (sessionToken) =>
    api.post(`/auth/resend-otp?session_token=${encodeURIComponent(sessionToken)}`),
  me:        ()             => api.get("/auth/me"),
  seedAdmin: ()             => api.post("/auth/seed-admin"),
};

// -- Dashboard ----------------------------------------------------------
export const dashboardApi = {
  getSummary:          (params) => api.get("/dashboard/summary",          { params }),
  getDailyInbound:     (params) => api.get("/dashboard/inbound/daily",    { params }),
  getDailyOutbound:    (params) => api.get("/dashboard/outbound/daily",   { params }),
  getTotalStock:       ()       => api.get("/dashboard/total-stock"),
  getPendingApprovals: ()       => api.get("/dashboard/pending-approvals"),
};

// -- Warehouses ---------------------------------------------------------
export const warehouseApi = {
  list:               ()                     => api.get("/warehouses"),
  get:                (id)                   => api.get(`/warehouses/${id}`),
  create:             (data)                 => api.post("/warehouses", data),
  update:             (id, data)             => api.put(`/warehouses/${id}`, data),
  delete:             (id)                   => api.delete(`/warehouses/${id}`),
  getStocks:          (id)                   => api.get(`/warehouses/${id}/stocks`),
  getBrandInfo:       (warehouseId, brandId) =>
    api.get(`/warehouses/${warehouseId}/brands/${brandId}`),
  getWeightBreakdown: (id)                   => api.get(`/warehouses/${id}/weight-breakdown`),
  getAvailableBags:   (id)                   => api.get(`/warehouses/${id}/available-bags`),
};

// -- Brands -------------------------------------------------------------
export const brandApi = {
  list:   ()         => api.get("/brands"),
  get:    (id)       => api.get(`/brands/${id}`),
  create: (data)     => api.post("/brands", data),
  update: (id, data) => api.put(`/brands/${id}`, data),
  delete: (id)       => api.delete(`/brands/${id}`),
};

// -- Rice Types ---------------------------------------------------------
export const riceTypeApi = {
  list:   (params)   => api.get("/rice-types", { params }),
  create: (data)     => api.post("/rice-types", data),
  update: (id, data) => api.put(`/rice-types/${id}`, data),
  delete: (id)       => api.delete(`/rice-types/${id}`),
};

// -- Stocks -------------------------------------------------------------
export const stockApi = {
  list:        (params)   => api.get("/stocks", { params }),
  get:         (id)       => api.get(`/stocks/${id}`),
  create:      (data)     => api.post("/stocks", data),
  update:      (id, data) => api.put(`/stocks/${id}`, data),
  delete:      (id)       => api.delete(`/stocks/${id}`),
  getHistory:  (id)       => api.get(`/stocks/${id}/history`),
  getCalendar: (params)   => api.get("/stocks/calendar", { params }),
};

/* ============================================================
 * TRANSACTIONS
 *
 * NEW Arrival payload (per-entry warehouse, no separate splits):
 * {
 *   vehicle_no, driver_name, driver_number,        ← REQUIRED
 *   source, commission_partner, transaction_date, notes,
 *   items: [
 *     {
 *       brand_id, rice_type_id, bag_size: 25,
 *       entries: [
 *         { weight, quantity, warehouse_id }    ← per-row warehouse
 *       ]
 *     }
 *   ],
 *   mill_owner_name, price, rent, hidden_charges  ← admin only
 * }
 *
 * ⚠ BACKEND must be updated to accept the new `entries` array.
 *   For backward compatibility this client also generates legacy
 *   `weights` + `warehouse_splits` arrays inside each item.
 *
 * Send payload (unchanged):
 * {
 *   vehicle_no, driver_name, driver_number,        ← REQUIRED
 *   destination, commission_partner, transaction_date, notes,
 *   items: [{ brand_id, warehouse_id, bag_weight_kg, bags }],
 *   location, sell_price                           ← admin only
 * }
 * ============================================================ */
export const transactionApi = {
  list: (params = {}) => {
    const mapped = { ...params };
    if (mapped.type) {
      mapped.transaction_type = txTypeToBackend(mapped.type);
      delete mapped.type;
    }
    if (mapped.transaction_type) {
      mapped.transaction_type = txTypeToBackend(mapped.transaction_type);
    }
    return api.get("/transactions", { params: mapped });
  },

  get:             (id)     => api.get(`/transactions/${id}`),
  create:          (data)   => api.post("/transactions", data),
  createArrival:   (data)   => api.post("/transactions/arrival", data),
  createSend:      (data)   => api.post("/transactions/send", data),

  getLedger:       (params) => api.get("/transactions/ledger", { params }),

  delete:          (id)     => api.delete(`/transactions/${id}`),
  getCustomGrades: ()       => api.get("/transactions/quality-grades"),
  addCustomGrade:  (grade_name) =>
    api.post("/transactions/quality-grades", { grade_name }),

  completeAdminFields: (id, data) =>
    api.patch(`/transactions/${id}/admin-fields`, data),

  getProfitLoss: (id) => api.get(`/transactions/${id}/profit-loss`),

  // List transactions on a specific date (used by Stocks calendar)
  listByDate: (dateStr) =>
    api.get("/transactions", {
      params: { date_from: dateStr, date_to: dateStr, limit: 200 },
    }),
};

// -- Reports ------------------------------------------------------------
export const reportsApi = {
  get: (params = {}) => {
    const mapped = { ...params, limit: 500 };
    if (mapped.type) {
      mapped.transaction_type = txTypeToBackend(mapped.type);
      delete mapped.type;
    }
    return api.get("/transactions", { params: mapped });
  },
  exportCsv: null,
  exportXlsx: null,
};

export function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function exportTransactionsCsv(transactions, isAdmin, filename) {
  const headers = [
    "Date", "Type", "Vehicle", "Driver", "Driver Number",
    "Source / Destination", "Commission Partner",
    "Total Bags", "Total KG",
    ...(isAdmin ? ["Mill Owner", "Price/Bag", "Sell Price/Bag", "Rent", "Hidden Charges", "P/L per Bag"] : []),
    "Notes",
  ];

  const rows = transactions.map((tx) => {
    const isIn = tx.transaction_type === "inbound";
    const pl =
      tx.price != null && tx.sell_price != null
        ? (Number(tx.sell_price) - Number(tx.price)).toFixed(2)
        : "";
    return [
      new Date(tx.transaction_date).toLocaleString(),
      isIn ? "Arrival" : "Send",
      tx.vehicle_number || "",
      tx.driver_name || "",
      tx.driver_number || "",
      (isIn ? tx.source : tx.destination) || "",
      tx.commission_partner || "",
      tx.total_bags ?? 0,
      (tx.total_weight_kg ?? 0).toFixed(1),
      ...(isAdmin
        ? [
            tx.mill_owner_name || "",
            tx.price != null ? tx.price : "",
            tx.sell_price != null ? tx.sell_price : "",
            tx.rent != null ? tx.rent : "",
            tx.hidden_charges != null ? tx.hidden_charges : "",
            pl,
          ]
        : []),
      (tx.notes || "").replace(/,/g, ";"),
    ];
  });

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// -- Users --------------------------------------------------------------
export const userApi = {
  list:   ()         => api.get("/users"),
  get:    (id)       => api.get(`/users/${id}`),
  create: (data)     => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id)       => api.delete(`/users/${id}`),
};

// -- Mill Owners (admin only) ------------------------------------------
export const millOwnerApi = {
  list:   (params)   => api.get("/mill-owners", { params }),
  get:    (id)       => api.get(`/mill-owners/${id}`),
  create: (data)     => api.post("/mill-owners", data),
  update: (id, data) => api.put(`/mill-owners/${id}`, data),
  delete: (id)       => api.delete(`/mill-owners/${id}`),
};

export default api;