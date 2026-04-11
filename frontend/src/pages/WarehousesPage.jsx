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
} from "lucide-react";
import toast from "react-hot-toast";
import { warehouseApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import StockLevelBar from "../components/common/StockLevelBar";
import { transliterateToTamil } from "../utils/transliterate";

// ── Icon & color cycles ──
const WAREHOUSE_ICONS = [
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
];
const WAREHOUSE_COLORS = [
  "#e4a230",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
];
const getWarehouseIcon = (idx) => WAREHOUSE_ICONS[idx % WAREHOUSE_ICONS.length];
const getWarehouseColor = (idx) =>
  WAREHOUSE_COLORS[idx % WAREHOUSE_COLORS.length];

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
    } catch (e) {
      /* ignore */
    }
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
          rect.height > 40 &&
          rect.height < 120 &&
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

// ══════════════════════════════════════════
// WarehouseForm
// ══════════════════════════════════════════
function WarehouseForm({ initial, onSubmit, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    initial || {
      location_name: "",
      location_name_ta: "",
      address: "",
      capacity: "",
    }
  );
  const [loading, setLoading] = useState(false);
  const [autoTa, setAutoTa] = useState(!initial?.location_name_ta);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ ...form, capacity: parseFloat(form.capacity) || 0 });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
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
        <input
          className="input-field"
          value={form.location_name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label flex items-center justify-between">
          <span>{t("warehouse.nameTa")}</span>
          <button
            type="button"
            onClick={() => setAutoTa((a) => !a)}
            className="text-xs font-normal lowercase"
            style={{ color: autoTa ? "var(--accent)" : "var(--text-muted)" }}
          >
            {autoTa ? "⚡ auto" : "manual"}
          </button>
        </label>
        <input
          className="input-field"
          value={form.location_name_ta}
          onChange={(e) => {
            setAutoTa(false);
            setForm((f) => ({ ...f, location_name_ta: e.target.value }));
          }}
          placeholder="தமிழ் பெயர்"
        />
      </div>
      <div>
        <label className="label">{t("warehouse.address")}</label>
        <textarea
          className="input-field resize-none h-20"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
      </div>
      <div>
        <label className="label">{t("warehouse.capacity")}</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="input-field"
          value={form.capacity}
          onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary flex-1 justify-center"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 justify-center"
        >
          {loading ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════
// WarehouseStockPanel (FIXED)
// ══════════════════════════════════════════
function WarehouseStockPanel({ warehouse, onClose }) {
  const { i18n } = useTranslation();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // ── Lock body scroll & measure bottom nav ──
  useEffect(() => {
    document.body.style.overflow = "hidden";

    const measure = () => {
      const result = measureBottomNav();
      setIsMobile(result.isMobile);
      setBottomOffset(result.navHeight);
    };

    const raf = requestAnimationFrame(() => {
      setTimeout(measure, 50);
    });

    window.addEventListener("resize", measure);

    return () => {
      document.body.style.overflow = "";
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ── Fetch stocks ──
  useEffect(() => {
    warehouseApi
      .getStocks(warehouse.id)
      .then((r) => setStocks(r.data))
      .catch(() => setStocks([]))
      .finally(() => setLoading(false));
  }, [warehouse.id]);

  const wName =
    i18n.language === "ta" && warehouse.location_name_ta
      ? warehouse.location_name_ta
      : warehouse.location_name;

  const sName = (s) =>
    i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name;
  const rType = (s) =>
    i18n.language === "ta" && s.rice_type_ta ? s.rice_type_ta : s.rice_type;

  const totalBags = stocks.reduce((a, s) => a + s.remaining_bags, 0);

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.55)",
          animation: "modalFadeIn 0.2s ease-out",
        }}
        onClick={onClose}
      />

      {/* ── Panel Container — sits above bottom nav ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
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
            borderRadius: isMobile ? "20px 20px 0 0" : "16px",
            boxShadow: isMobile
              ? "0 -4px 30px rgba(0,0,0,0.15)"
              : "0 25px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
            animation: "modalSlideUp 0.3s ease-out",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle — mobile */}
          {isMobile && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: "8px",
                paddingBottom: "2px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "4px",
                  borderRadius: "99px",
                  backgroundColor: "var(--border)",
                }}
              />
            </div>
          )}

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-card)",
              flexShrink: 0,
            }}
          >
            <div>
              <h2
                className="font-display font-bold text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                {wName}
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {totalBags.toLocaleString()} bags ·{" "}
                {(warehouse.total_stock_kg / 1000).toFixed(2)} T
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-black/10 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Capacity bar — pinned, not scrollable */}
          <div
            className="px-5 py-3 border-b"
            style={{ borderColor: "var(--border)", flexShrink: 0 }}
          >
            <div
              className="flex justify-between text-xs mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              <span>Capacity Used</span>
              <span
                className="font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {warehouse.stock_percentage.toFixed(1)}%
              </span>
            </div>
            <StockLevelBar percentage={warehouse.stock_percentage} />
            <div
              className="flex justify-between text-xs mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              <span>
                {(warehouse.total_stock_kg / 1000).toFixed(2)} T used
              </span>
              <span>{warehouse.capacity} T total</span>
            </div>
          </div>

          {/* ── Scrollable stock list ── */}
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
                  <div
                    key={i}
                    className="h-16 rounded-xl animate-pulse-soft"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  />
                ))}
              </div>
            ) : stocks.length === 0 ? (
              <div
                className="py-16 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                <Package size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No stock in this warehouse yet</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {stocks.map((s) => {
                  const pct =
                    s.total_inbound_bags > 0
                      ? Math.round(
                          (s.remaining_bags / s.total_inbound_bags) * 100
                        )
                      : 0;
                  return (
                    <div
                      key={s.stock_id}
                      className="rounded-xl p-4 border transition-all duration-200"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <div
                            className="font-semibold text-sm truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {sName(s)}
                          </div>
                          <div
                            className="text-xs mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {rType(s)} · {s.bag_weight_kg}kg/bag
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className="font-bold text-lg font-display leading-none"
                            style={{
                              color:
                                s.remaining_bags > 0
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                            }}
                          >
                            {s.remaining_bags.toLocaleString()}
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            bags
                          </div>
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
                              s.remaining_bags > 100
                                ? "#10b981"
                                : s.remaining_bags > 20
                                ? "#f59e0b"
                                : "#ef4444",
                          }}
                        />
                      </div>
                      <div
                        className="flex justify-between text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <span className="flex items-center gap-1">
                          <TrendingUp size={10} className="text-emerald-500" />{" "}
                          {s.total_inbound_bags} in
                        </span>
                        <span>{(s.remaining_kg / 1000).toFixed(2)} T</span>
                        <span className="flex items-center gap-1">
                          <TrendingDown size={10} className="text-red-400" />{" "}
                          {s.total_outbound_bags} out
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keyframes */}
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

// ══════════════════════════════════════════
// WarehousesPage (main export)
// ══════════════════════════════════════════
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
    warehouseApi
      .list()
      .then((r) => setWarehouses(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    await warehouseApi.create(data);
    toast.success("Warehouse created");
    load();
  };

  const handleUpdate = async (data) => {
    await warehouseApi.update(modal.data.id, data);
    toast.success("Warehouse updated");
    load();
  };

  const handleDelete = async () => {
    await warehouseApi.delete(deleteTarget.id);
    toast.success("Warehouse removed");
    setDeleteTarget(null);
    load();
  };

  const name = (w) =>
    i18n.language === "ta" && w.location_name_ta
      ? w.location_name_ta
      : w.location_name;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-display font-bold text-2xl"
            style={{ color: "var(--text-primary)" }}
          >
            {t("warehouse.title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {warehouses.length} active{" "}
            {warehouses.length === 1 ? "warehouse" : "warehouses"}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setModal({ mode: "create" })}
            className="btn-primary"
          >
            <Plus size={16} /> {t("warehouse.add")}
          </button>
        )}
      </div>

      {/* ── Warehouse grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-52 animate-pulse-soft" />
          ))}
        </div>
      ) : warehouses.length === 0 ? (
        <div
          className="card text-center py-16"
          style={{ color: "var(--text-muted)" }}
        >
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t("common.noData")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((w, idx) => {
            const IconComponent = getWarehouseIcon(idx);
            const iconColor = getWarehouseColor(idx);
            return (
              <div
                key={w.id}
                className="card hover:shadow-lg cursor-pointer group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                onClick={() => setDetailWarehouse(w)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: iconColor + "22",
                          border: `1.5px solid ${iconColor}44`,
                        }}
                      >
                        <IconComponent size={18} style={{ color: iconColor }} />
                      </div>
                      <h3
                        className="font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {name(w)}
                      </h3>
                    </div>
                    {w.address && (
                      <p
                        className="text-xs mt-1.5 ml-11 truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {w.address}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div
                      className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setModal({ mode: "edit", data: w })}
                        className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(w)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="rounded-xl p-3 text-center"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <div
                        className="font-bold text-lg font-display leading-none"
                        style={{ color: iconColor }}
                      >
                        {w.total_bags.toLocaleString()}
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        bags
                      </div>
                    </div>
                    <div
                      className="rounded-xl p-3 text-center"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <div
                        className="font-bold text-lg font-display leading-none"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {(w.total_stock_kg / 1000).toFixed(1)}
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        tonnes
                      </div>
                    </div>
                  </div>

                  {/* Stock level bar */}
                  <div>
                    <div
                      className="flex justify-between text-xs mb-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span>{t("warehouse.stockLevel")}</span>
                      <span
                        className="font-semibold"
                        style={{ color: iconColor }}
                      >
                        {w.stock_percentage.toFixed(1)}%
                      </span>
                    </div>
                    <StockLevelBar
                      percentage={w.stock_percentage}
                      color={iconColor}
                    />
                    <div
                      className="text-right text-xs mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      cap: {w.capacity} T
                    </div>
                  </div>
                </div>

                {/* Tap hint */}
                <div
                  className="mt-3 pt-3 border-t flex items-center justify-center gap-1.5 text-xs font-medium"
                  style={{ borderColor: "var(--border)", color: iconColor }}
                >
                  <Package size={12} /> View Rice Stocks
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Warehouse stock detail panel ── */}
      {detailWarehouse && (
        <WarehouseStockPanel
          warehouse={detailWarehouse}
          onClose={() => setDetailWarehouse(null)}
        />
      )}

      {/* ── Add / Edit modal ── */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal?.mode === "create" ? t("warehouse.add") : t("warehouse.edit")
        }
      >
        {modal && (
          <WarehouseForm
            initial={modal.data}
            onSubmit={modal.mode === "create" ? handleCreate : handleUpdate}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>

      {/* ── Delete confirm ── */}
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