// pages/WarehousesPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Package,
  TrendingUp,
  TrendingDown,
  X,
  Warehouse,
  Building2,
  Store,
  Factory,
  Layers,
  Box,
  Archive,
  Container,
  Database,
  LayoutGrid,
  Info,
  Truck,
  User,
  Calendar,
  Scale,
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine
} from "lucide-react";
import { format, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { warehouseApi, stockApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import StockLevelBar from "../components/common/StockLevelBar";
import { transliterateToTamil } from "../utils/transliterate";

// ── Icon & color cycles ──
const WAREHOUSE_ICONS = [
  Warehouse, Building2, Store, Factory, Layers,
  Box, Archive, Container, Database, LayoutGrid,
];
const WAREHOUSE_COLORS = [
  "#e4a230", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444",
  "#f59e0b", "#06b6d4", "#ec4899", "#84cc16", "#f97316",
];
const getWarehouseIcon = (idx) => WAREHOUSE_ICONS[idx % WAREHOUSE_ICONS.length];
const getWarehouseColor = (idx) => WAREHOUSE_COLORS[idx % WAREHOUSE_COLORS.length];

// ── Helper: measure bottom nav height ──
function measureBottomNav() {
  const isMobile = window.innerWidth < 640;
  if (!isMobile) return { isMobile: false, navHeight: 0 };

  const selectors = [
    'nav[class*="bottom"]',
    'div[class*="bottom-nav"]',
    '[class*="fixed"][class*="bottom-0"]',
    'nav.fixed',
    '#bottom-nav',
    '.bottom-navigation',
  ];

  let navHeight = 0;
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom >= window.innerHeight - 10 && rect.height > 30) {
          navHeight = rect.height;
          break;
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (navHeight === 0) {
    const allEls = document.querySelectorAll("nav, div");
    for (const el of allEls) {
      const style = window.getComputedStyle(el);
      if (style.position === "fixed" || style.position === "sticky") {
        const rect = el.getBoundingClientRect();
        if (
          rect.bottom >= window.innerHeight - 5 &&
          rect.top > window.innerHeight * 0.7 &&
          rect.height > 40 && rect.height < 120 &&
          rect.width > window.innerWidth * 0.8
        ) {
          navHeight = rect.height;
          break;
        }
      }
    }
  }
  if (navHeight === 0) navHeight = 64;
  return { isMobile: true, navHeight };
}

/* ══════════════════════════════════════════════════════════
   WarehouseForm (unchanged)
   ══════════════════════════════════════════════════════════ */
function WarehouseForm({ initial, onSubmit, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    initial || { location_name: "", location_name_ta: "", address: "", capacity: "" }
  );
  const [loading, setLoading] = useState(false);
  const [autoTa, setAutoTa] = useState(!initial?.location_name_ta);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ ...form, capacity: parseFloat(form.capacity) || 0 });
      onClose();
    } catch (err) { toast.error(getErrorMessage(err, t("common.error"))); }
    finally { setLoading(false); }
  };

  const handleNameChange = (val) => {
    const updated = { ...form, location_name: val };
    if (autoTa) updated.location_name_ta = transliterateToTamil(val);
    setForm(updated);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">{t("warehouse.name")} *</label>
        <input className="input-field" value={form.location_name} onChange={(e) => handleNameChange(e.target.value)} required />
      </div>
      <div>
        <label className="label flex items-center justify-between">
          <span>{t("warehouse.nameTa")}</span>
          <button type="button" onClick={() => setAutoTa((a) => !a)} className="text-xs font-normal lowercase"
            style={{ color: autoTa ? "var(--accent)" : "var(--text-muted)" }}>
            {autoTa ? "⚡ auto" : "manual"}
          </button>
        </label>
        <input className="input-field" value={form.location_name_ta}
          onChange={(e) => { setAutoTa(false); setForm((f) => ({ ...f, location_name_ta: e.target.value })); }}
          placeholder="தமிழ் பெயர்" />
      </div>
      <div>
        <label className="label">{t("warehouse.address")}</label>
        <textarea className="input-field" style={{ minHeight: 80 }} value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      </div>
      <div>
        <label className="label">{t("warehouse.capacity")}</label>
        <input type="number" step="0.01" min="0" className="input-field" value={form.capacity}
          onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">{t("common.cancel")}</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════
   BRAND INFO POPUP
   Shows arrival details + weight breakdown when a brand row clicked
   ══════════════════════════════════════════════════════════ */
function BrandInfoModal({ open, onClose, warehouseId, brandId, brandLabel }) {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && warehouseId && brandId) {
      setLoading(true);
      warehouseApi
        .getBrandInfo(warehouseId, brandId)
        .then((r) => setInfo(r.data))
        .catch(() => setInfo(null))
        .finally(() => setLoading(false));
    }
  }, [open, warehouseId, brandId]);

  return (
    <Modal open={open} onClose={onClose} title={brandLabel || "Brand Details"} size="lg">
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-32 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
        </div>
      ) : !info ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Info size={20} /></div>
          <p className="empty-state-title">No information available</p>
          <p className="empty-state-text">Could not load brand details for this warehouse.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Total stock summary ── */}
          <div className="card-accent" style={{ padding: 16 }}>
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Total Stocks</p>
                <p className="text-3xl font-extrabold text-white tracking-tight mt-1">
                  {info.total_bags?.toLocaleString() ?? 0}
                  <span className="text-sm font-medium ml-2 text-white/70">bags</span>
                </p>
                <p className="text-xs text-white/60 mt-0.5">
                  {((info.total_weight_kg ?? 0) / 1000).toFixed(2)} T total
                </p>
              </div>
              <Package size={32} className="text-white/70" />
            </div>
          </div>

          {/* ── Weight breakdown: "10KG in X bags, 5KG in Y bags" ── */}
          {info.weight_breakdown?.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <Scale size={14} style={{ color: "var(--accent)" }} />
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  Weight Breakdown
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {info.weight_breakdown.map((b, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl text-center"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      {b.weight_kg} KG
                    </p>
                    <p className="text-lg font-extrabold tabular-nums mt-1" style={{ color: "var(--accent)" }}>
                      {b.quantity?.toLocaleString() ?? 0}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {b.label || (b.bags ? `${b.bags} bags` : "units")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent arrivals (where it came from) ── */}
          {info.recent_arrivals?.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <Truck size={14} style={{ color: "var(--success)" }} />
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  Recent Arrivals
                </h3>
              </div>
              <div className="space-y-2">
                {info.recent_arrivals.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-light)",
                      borderLeftWidth: 4,
                      borderLeftColor: "var(--success)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="badge badge-success text-[10px]">Arrival</span>
                          <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                            {a.vehicle_number || "—"}
                          </span>
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                          {format(parseISO(a.transaction_date), "dd MMM yyyy, HH:mm")}
                        </p>

                        <div className="mt-2 space-y-1">
                          {a.source && (
                            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              <MapPin size={10} style={{ color: "var(--text-muted)" }} />
                              <span><strong>From:</strong> {a.source}</span>
                            </div>
                          )}
                          {a.driver_name && (
                            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              <User size={10} style={{ color: "var(--text-muted)" }} />
                              <span>{a.driver_name}{a.driver_number ? ` · ${a.driver_number}` : ""}</span>
                            </div>
                          )}
                          {a.commission_partner && (
                            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              <Info size={10} style={{ color: "var(--text-muted)" }} />
                              <span><strong>Partner:</strong> {a.commission_partner}</span>
                            </div>
                          )}
                          {/* Admin-only fields */}
                          {isAdmin && a.mill_owner_name && (
                            <span className="badge badge-muted text-[10px] mt-1.5">
                              Mill: {a.mill_owner_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-extrabold tabular-nums" style={{ color: "var(--success)" }}>
                          +{a.bags ?? a.total_bags ?? 0}
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>bags</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Rice types in this brand ── */}
          {info.rice_types?.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <Layers size={14} style={{ color: "var(--accent)" }} />
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  Rice Types
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {info.rice_types.map((rt, i) => (
                  <span key={i} className="badge badge-accent">
                    {rt.name} · {rt.bags ?? 0} bags
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════
   STOCK ROW INFO MODAL  (small popup for individual stock row)
   ══════════════════════════════════════════════════════════ */
function StockRowInfoModal({ open, onClose, stock }) {
  const { isAdmin } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !stock?.stock_id) return;
    setLoading(true);
    stockApi
      .getHistory(stock.stock_id)
      .then((r) => setHistory(r.data || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [open, stock]);

  if (!stock) return null;

  return (
    <Modal open={open} onClose={onClose} title={`${stock.brand_name} · Recent Transactions`} size="lg">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card" style={{ padding: 12, textAlign: "center" }}>
          <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Remaining</p>
          <p className="text-xl font-extrabold tabular-nums mt-1" style={{ color: "var(--accent)" }}>
            {stock.remaining_bags?.toLocaleString() ?? 0}
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>bags</p>
        </div>
        <div className="card" style={{ padding: 12, textAlign: "center" }}>
          <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>In</p>
          <p className="text-xl font-extrabold tabular-nums mt-1" style={{ color: "var(--success)" }}>
            {stock.total_inbound_bags ?? 0}
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>bags</p>
        </div>
        <div className="card" style={{ padding: 12, textAlign: "center" }}>
          <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Out</p>
          <p className="text-xl font-extrabold tabular-nums mt-1" style={{ color: "var(--danger)" }}>
            {stock.total_outbound_bags ?? 0}
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>bags</p>
        </div>
      </div>

      {/* Transaction history */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={18} /></div>
          <p className="empty-state-title">No transactions yet</p>
          <p className="empty-state-text">No arrivals or sends recorded for this stock.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((tx) => {
            const isArrival = tx.transaction_type === "inbound";
            const typeColor = isArrival ? "var(--success)" : "var(--danger)";
            const typeBg = isArrival ? "var(--success-soft)" : "var(--danger-soft)";
            const bags = tx.total_bags ?? tx.quantity_bags ?? 0;
            return (
              <div
                key={tx.id}
                className="rounded-xl overflow-hidden"
                style={{ border: "1.5px solid var(--border)", borderLeftWidth: 4, borderLeftColor: typeColor }}
              >
                <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: typeBg }}>
                  <div className="flex items-center gap-2">
                    {isArrival
                      ? <ArrowDownToLine size={12} style={{ color: typeColor }} />
                      : <ArrowUpFromLine size={12} style={{ color: typeColor }} />}
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: typeColor }}>
                      {isArrival ? "Arrival" : "Send"}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                      {tx.vehicle_number || "—"}
                    </span>
                    {tx.admin_pending && (
                      <span className="badge badge-warning text-[9px]">Pending</span>
                    )}
                  </div>
                  <span className="text-base font-extrabold tabular-nums" style={{ color: typeColor }}>
                    {isArrival ? "+" : "−"}{bags}
                    <span className="text-[10px] font-normal ml-1" style={{ color: "var(--text-muted)" }}>bags</span>
                  </span>
                </div>
                <div className="px-3 py-2 space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    {tx.driver_name && (
                      <div className="flex items-center gap-1">
                        <User size={10} style={{ color: "var(--text-muted)" }} />
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{tx.driver_name}</span>
                      </div>
                    )}
                    <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {format(parseISO(tx.transaction_date), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  {(tx.source || tx.destination) && (
                    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <MapPin size={10} style={{ color: "var(--text-muted)" }} />
                      <span>{isArrival ? `From: ${tx.source}` : `To: ${tx.destination}`}</span>
                    </div>
                  )}
                  {isAdmin && (tx.price != null || tx.sell_price != null) && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {tx.price != null && (
                        <span className="badge badge-muted text-[10px]">Buy: ₹{tx.price}</span>
                      )}
                      {tx.sell_price != null && (
                        <span className="badge badge-muted text-[10px]">Sell: ₹{tx.sell_price}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════
   WarehouseStockPanel  (with brand-click info popup)
   ══════════════════════════════════════════════════════════ */
function WarehouseStockPanel({ warehouse, onClose }) {
  const { i18n } = useTranslation();
  const [stocks, setStocks] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const [brandInfoModal, setBrandInfoModal] = useState(null);
  const [stockInfoModal, setStockInfoModal] = useState(null);

  // ── Lock body scroll & measure bottom nav ──
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const measure = () => {
      const result = measureBottomNav();
      setIsMobile(result.isMobile);
      setBottomOffset(result.navHeight);
    };
    const raf = requestAnimationFrame(() => { setTimeout(measure, 50); });
    window.addEventListener("resize", measure);
    return () => {
      document.body.style.overflow = "";
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ── Fetch stocks + weight breakdown ──
  useEffect(() => {
    Promise.all([
      warehouseApi.getStocks(warehouse.id).then((r) => r.data).catch(() => []),
      warehouseApi.getWeightBreakdown(warehouse.id).then((r) => r.data).catch(() => null),
    ]).then(([stockData, breakdownData]) => {
      // FIX: Filter out 0-stock brands from warehouse panel
      const nonZeroStocks = stockData.filter((s) => (s.remaining_bags ?? 0) > 0);
      setStocks(nonZeroStocks);
      setBreakdown(breakdownData);
      setLoading(false);
    });
  }, [warehouse.id]);

  const wName = i18n.language === "ta" && warehouse.location_name_ta
    ? warehouse.location_name_ta : warehouse.location_name;

  const sName = (s) => i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name;
  const rType = (s) => i18n.language === "ta" && s.rice_type_ta ? s.rice_type_ta : s.rice_type;

  // Compute display bags for a stock row.
  // ROOT CAUSE FIX: Now that the backend /stocks endpoint reads from Stock.total_bags
  // (the same authoritative source as the /stocks page), remaining_bags is already
  // the correct net figure.  We still need to convert pieces (weight < 25kg) into
  // equivalent 25kg bag units for a meaningful "bags" count.
  const getDisplayBags = (s) => {
    const wbs = s.weight_breakdowns;
    if (!wbs || wbs.length === 0) return s.remaining_bags || 0;
    let bagCount = 0;
    let pieceKg = 0;
    for (const wb of wbs) {
      const qty = wb.quantity || 0;
      if (qty <= 0) continue;
      if (wb.weight_kg >= 25) bagCount += qty;
      else pieceKg += qty * wb.weight_kg;
    }
    // If weight_breakdowns sum to 0 but remaining_bags > 0, fall back
    const fromBreakdown = bagCount + Math.floor(pieceKg / 25);
    return fromBreakdown > 0 ? fromBreakdown : (s.remaining_bags || 0);
  };

  const totalBags = stocks.reduce((a, s) => a + getDisplayBags(s), 0);
  const totalKg = stocks.reduce((a, s) => a + (s.remaining_kg || 0), 0);

  // Group by brand for brand-click handler
  const handleBrandClick = (s) => {
    if (s.brand_id) {
      setBrandInfoModal({
        warehouseId: warehouse.id,
        brandId: s.brand_id,
        label: `${sName(s)} · ${wName}`,
      });
    }
  };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
          backgroundColor: "rgba(8, 12, 26, 0.6)",
          backdropFilter: "blur(8px) saturate(150%)",
          WebkitBackdropFilter: "blur(8px) saturate(150%)",
          animation: "modalFadeIn 0.2s ease-out",
        }}
        onClick={onClose}
      />

      {/* ── Panel ── */}
      <div
        style={{
          position: "fixed", top: 0, left: 0, right: 0,
          bottom: isMobile ? `${bottomOffset}px` : 0,
          zIndex: 51,
          display: "flex",
          alignItems: isMobile ? "flex-end" : "center",
          justifyContent: "center",
          padding: isMobile ? 0 : "16px",
          pointerEvents: "none",
        }}
      >
        <div
          className="w-full sm:max-w-lg"
          style={{
            pointerEvents: "auto",
            maxHeight: isMobile ? "85%" : "85vh",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "var(--bg-card)",
            borderRadius: isMobile ? "20px 20px 0 0" : "var(--radius-2xl)",
            boxShadow: "var(--shadow-xl)",
            overflow: "hidden",
            animation: "modalSlideUp 0.3s ease-out",
            border: "1px solid var(--border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 2, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: "var(--border)" }} />
            </div>
          )}

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--border-light)", flexShrink: 0 }}
          >
            <div>
              <h2 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {wName}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                <span className="font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                  {totalBags.toLocaleString()}
                </span>
                {" "}total bags · {(totalKg / 1000).toFixed(2)} T
              </p>
            </div>
            <button onClick={onClose} className="btn-ghost" style={{ padding: 8 }}>
              <X size={18} />
            </button>
          </div>

          {/* Capacity */}
          <div
            className="px-5 py-3"
            style={{ borderBottom: "1px solid var(--border-light)", flexShrink: 0 }}
          >
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              <span>Capacity Used</span>
              <span className="font-bold" style={{ color: "var(--accent)" }}>
                {warehouse.stock_percentage?.toFixed(1)}%
              </span>
            </div>
            <StockLevelBar percentage={warehouse.stock_percentage} />
            <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              <span>{((warehouse.total_stock_kg ?? 0) / 1000).toFixed(2)} T used</span>
              <span>{warehouse.capacity} T total</span>
            </div>
          </div>

          {/* Aggregated weight breakdown banner */}
          {breakdown?.summary?.length > 0 && (
            <div
              className="px-5 py-3"
              style={{ borderBottom: "1px solid var(--border-light)", flexShrink: 0, backgroundColor: "var(--bg-secondary)" }}
            >
              <p className="label" style={{ marginBottom: 6 }}>Weight Distribution</p>
              <div className="flex flex-wrap gap-1.5">
                {breakdown.summary.map((b, i) => (
                  <span key={i} className="badge badge-muted text-[10px]">
                    <Scale size={9} /> {b.weight_kg}KG × {b.quantity?.toLocaleString() ?? 0}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stock list */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {loading ? (
              <div className="space-y-3 p-5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-20 rounded-xl" />
                ))}
              </div>
            ) : stocks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Package size={20} /></div>
                <p className="empty-state-title">No stock yet</p>
                <p className="empty-state-text">No items have been added to this warehouse.</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {stocks.map((s) => {
                  const displayBags = getDisplayBags(s);
                  const pct = s.total_inbound_bags > 0
                    ? Math.round((s.remaining_bags / s.total_inbound_bags) * 100) : 0;
                  const hasPieces = (s.weight_breakdowns || []).some(wb => wb.weight_kg < 25 && wb.quantity > 0);
                  return (
                    <div
                      key={s.stock_id}
                      className="card"
                      style={{
                        padding: 14,
                        cursor: "pointer",
                        transition: "all var(--transition-fast)",
                      }}
                      onClick={() => handleBrandClick(s)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent-muted)";
                        e.currentTarget.style.boxShadow = "var(--shadow-md)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                            {sName(s)}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {rType(s)} · {s.bag_weight_kg}KG/bag
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div
                              className="font-extrabold text-lg leading-none tabular-nums"
                              style={{ color: displayBags > 0 ? "var(--accent)" : "var(--text-muted)" }}
                            >
                              {displayBags.toLocaleString()}
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>bags</div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStockInfoModal(s);
                            }}
                            className="btn-ghost tooltip"
                            data-tooltip="View details"
                            style={{ padding: 6 }}
                          >
                            <Info size={16} style={{ color: "var(--accent)" }} />
                          </button>

                          <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                        </div>
                      </div>

                      {/* Mini progress bar */}
                      <div
                        className="h-1.5 rounded-full overflow-hidden mb-2"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              s.remaining_bags > 100 ? "var(--success)"
                                : s.remaining_bags > 20 ? "var(--warning)"
                                  : "var(--danger)",
                          }}
                        />
                      </div>

                      <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                        <span className="flex items-center gap-1">
                          <TrendingUp size={10} style={{ color: "var(--success)" }} /> {s.total_inbound_bags ?? 0} in
                        </span>
                        <span className="tabular-nums">{((s.remaining_kg ?? 0) / 1000).toFixed(2)} T</span>
                        <span className="flex items-center gap-1">
                          <TrendingDown size={10} style={{ color: "var(--danger)" }} /> {s.total_outbound_bags ?? 0} out
                        </span>
                      </div>

                      <p className="text-[10px] mt-2 text-center" style={{ color: "var(--accent)" }}>
                        Tap card for arrival info →
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Brand info popup */}
      <BrandInfoModal
        open={!!brandInfoModal}
        onClose={() => setBrandInfoModal(null)}
        warehouseId={brandInfoModal?.warehouseId}
        brandId={brandInfoModal?.brandId}
        brandLabel={brandInfoModal?.label}
      />

      {/* Stock row info popup */}
      <StockRowInfoModal
        open={!!stockInfoModal}
        onClose={() => setStockInfoModal(null)}
        stock={stockInfoModal}
      />

      <style>{`
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(60px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
export default function WarehousesPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailWarehouse, setDetailWarehouse] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    warehouseApi.list().then((r) => setWarehouses(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    await warehouseApi.create(data);
    toast.success("Warehouse created"); load();
  };
  const handleUpdate = async (data) => {
    await warehouseApi.update(modal.data.id, data);
    toast.success("Warehouse updated"); load();
  };
  const handleDelete = async () => {
    await warehouseApi.delete(deleteTarget.id);
    toast.success("Warehouse removed"); setDeleteTarget(null); load();
  };

  const name = (w) => i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name;

  // Aggregate totals across all warehouses for top banner
  const grandTotalBags = warehouses.reduce((s, w) => s + (w.total_bags || 0), 0);
  const grandTotalKg = warehouses.reduce((s, w) => s + (w.total_stock_kg || 0), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("warehouse.title")}</h1>
          <p className="page-subtitle">
            {warehouses.length} {warehouses.length === 1 ? "warehouse" : "warehouses"}
            {" · "}
            <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {grandTotalBags.toLocaleString()} total bags
            </span>
            <span style={{ color: "var(--text-muted)" }}> ({(grandTotalKg / 1000).toFixed(2)} T)</span>
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setModal({ mode: "create" })} className="btn-primary">
            <Plus size={16} /> {t("warehouse.add")}
          </button>
        )}
      </div>

      {/* ── Warehouse grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="card skeleton h-52" />)}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><MapPin size={20} /></div>
            <p className="empty-state-title">{t("common.noData")}</p>
            <p className="empty-state-text">Add your first warehouse to start tracking stock.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((w, idx) => {
            const IconComponent = getWarehouseIcon(idx);
            const iconColor = getWarehouseColor(idx);
            return (
              <div
                key={w.id}
                className={`card-hover stagger-${(idx % 5) + 1} animate-slide-up group`}
                onClick={() => setDetailWarehouse(w)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: iconColor + "22", border: `1.5px solid ${iconColor}44` }}
                      >
                        <IconComponent size={18} style={{ color: iconColor }} />
                      </div>
                      <h3 className="font-bold truncate" style={{ color: "var(--text-primary)" }}>{name(w)}</h3>
                    </div>
                    {w.address && (
                      <p className="text-xs mt-1.5 ml-11 truncate" style={{ color: "var(--text-muted)" }}>{w.address}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div
                      className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => setModal({ mode: "edit", data: w })} className="btn-ghost" style={{ padding: 6 }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget(w)} className="btn-ghost" style={{ padding: 6, color: "var(--danger)" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--bg-secondary)" }}>
                      <div className="font-extrabold text-lg leading-none tabular-nums" style={{ color: iconColor }}>
                        {(w.total_bags ?? 0).toLocaleString()}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>bags</div>
                    </div>
                    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--bg-secondary)" }}>
                      <div className="font-extrabold text-lg leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {((w.total_stock_kg ?? 0) / 1000).toFixed(1)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>tonnes</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                      <span>{t("warehouse.stockLevel")}</span>
                      <span className="font-bold" style={{ color: iconColor }}>
                        {(w.stock_percentage ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <StockLevelBar percentage={w.stock_percentage} color={iconColor} />
                    <div className="text-right text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      cap: {w.capacity} T
                    </div>
                  </div>
                </div>

                <div
                  className="mt-3 pt-3 flex items-center justify-center gap-1.5 text-xs font-medium"
                  style={{ borderTop: "1px solid var(--border-light)", color: iconColor }}
                >
                  <Package size={12} /> View Rice Stocks
                  <ChevronRight size={12} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {detailWarehouse && (
        <WarehouseStockPanel warehouse={detailWarehouse} onClose={() => setDetailWarehouse(null)} />
      )}

      {/* Add/Edit modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "create" ? t("warehouse.add") : t("warehouse.edit")}
      >
        {modal && (
          <WarehouseForm
            initial={modal.data}
            onSubmit={modal.mode === "create" ? handleCreate : handleUpdate}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t("warehouse.delete")}
        message={`Are you sure you want to deactivate "${deleteTarget?.location_name}"?`}
      />
    </div>
  );
}