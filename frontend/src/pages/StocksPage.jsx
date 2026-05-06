// pages/StocksPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isToday, parseISO,
} from "date-fns";
import {
  Package, Search, Filter, Calendar as CalendarIcon, Info,
  ChevronLeft, ChevronRight, ChevronDown,
  ArrowDownToLine, ArrowUpFromLine, Truck, User, X,
  Layers, Warehouse as WarehouseIcon, Box, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  stockApi, brandApi, warehouseApi, millOwnerApi, transactionApi,
  getErrorMessage, groupStocksForDisplay,
} from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";

/* ══════════════════════════════════════════════════════════
   TRANSACTION DETAIL CARD — inside calendar day panel
   ══════════════════════════════════════════════════════════ */
function TransactionDetailCard({ tx }) {
  const isArrival = tx.transaction_type === "inbound";
  const typeColor = isArrival ? "#10b981" : "#ef4444";
  const typeBg    = isArrival ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)";
  const totalBags = tx.total_bags ?? tx.quantity_bags ?? 0;
  const txItems   = tx.items || [];
  const dirLabel  = isArrival
    ? (tx.source || "Unknown Source")
    : (tx.destination || "Unknown Dest");

  return (
    <div
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1.5px solid var(--border)",
        borderLeftWidth: 4,
        borderLeftColor: typeColor,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ backgroundColor: typeBg, borderBottom: "1px solid var(--border-light)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: isArrival
                ? "rgba(16,185,129,0.15)"
                : "rgba(239,68,68,0.15)",
            }}
          >
            {isArrival
              ? <ArrowDownToLine size={13} style={{ color: typeColor }} />
              : <ArrowUpFromLine size={13} style={{ color: typeColor }} />}
          </div>
          <div className="min-w-0">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: typeColor }}
            >
              {isArrival ? "From" : "To"}
            </span>
            <span
              className="text-xs font-bold ml-2 truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {dirLabel}
            </span>
          </div>
        </div>
        <div className="shrink-0 ml-3 text-right">
          <span
            className="text-lg font-extrabold tabular-nums"
            style={{ color: typeColor }}
          >
            {totalBags}
          </span>
          <span className="text-[10px] ml-1" style={{ color: "var(--text-muted)" }}>
            bags
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Vehicle + Driver + Time */}
        <div className="flex items-center gap-3 flex-wrap">
          {tx.vehicle_number && (
            <div className="flex items-center gap-1.5">
              <Truck size={11} style={{ color: "var(--text-muted)" }} />
              <span
                className="text-xs font-mono font-bold"
                style={{ color: "var(--text-primary)", letterSpacing: "0.07em" }}
              >
                {tx.vehicle_number}
              </span>
            </div>
          )}
          {tx.driver_name && (
            <div className="flex items-center gap-1.5">
              <User size={11} style={{ color: "var(--text-muted)" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {tx.driver_name}
              </span>
            </div>
          )}
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {format(parseISO(tx.transaction_date), "hh:mm a")}
          </span>
        </div>

        {/* Item chips */}
        {txItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {txItems.map((it, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                }}
              >
                {it.brand?.name || it.brand_name || "—"}
                {it.total_bags ? ` · ${it.total_bags} bags` : ""}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        {tx.notes && (
          <div className="flex items-start gap-1.5">
            <FileText size={10} style={{ color: "var(--text-muted)", marginTop: 1 }} />
            <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
              {tx.notes}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CALENDAR MODAL — FIXED
   ══════════════════════════════════════════════════════════ */
function CalendarModal({ open, onClose }) {
  const [cursor, setCursor]           = useState(new Date());
  const [calData, setCalData]         = useState({});
  const [calLoading, setCalLoading]   = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayLoading, setDayLoading]   = useState(false);

  const monthStart   = startOfMonth(cursor);
  const monthEnd     = endOfMonth(cursor);
  const days         = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startWeekday = getDay(monthStart);

  // ── Load month summary (already includes embedded transactions) ──
  const loadMonth = useCallback(() => {
    setCalLoading(true);
    stockApi
      .getCalendar({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 })
      .then((r) => {
        console.log("[Calendar] Month data loaded:", r.data);
        setCalData(r.data || {});
      })
      .catch((err) => {
        console.error("[Calendar] Failed to load month:", err);
        toast.error(getErrorMessage(err, "Failed to load calendar"));
        setCalData({});
      })
      .finally(() => setCalLoading(false));
  }, [cursor]);

  useEffect(() => {
    if (open) loadMonth();
  }, [open, loadMonth]);

  // Reset selection when month changes or modal closes
  useEffect(() => {
    setSelectedDay(null);
  }, [cursor, open]);

  // ── Compute day's transactions directly from calData ──
  // Backend already embeds them, so no extra API call needed.
  const dayTxs = useMemo(() => {
    if (!selectedDay) return [];
    const dayKey = format(selectedDay, "yyyy-MM-dd");
    const entry = calData[dayKey];
    return entry?.transactions || [];
  }, [selectedDay, calData]);

  // ── Fallback: if calData doesn't have transactions for some reason,
  //    fetch them on-demand from transactions endpoint ──
  const [fallbackTxs, setFallbackTxs] = useState([]);
  useEffect(() => {
    if (!selectedDay) {
      setFallbackTxs([]);
      return;
    }

    const dayKey = format(selectedDay, "yyyy-MM-dd");
    const entry = calData[dayKey];

    // If backend already gave us transactions, no need to fetch
    if (entry?.transactions && entry.transactions.length >= 0) {
      setFallbackTxs([]);
      return;
    }

    // Only hit the API if calendar didn't include transactions
    setDayLoading(true);
    transactionApi
      .listByDate(dayKey)
      .then((r) => {
        console.log("[Calendar] Fallback txs for", dayKey, r.data);
        setFallbackTxs(Array.isArray(r.data) ? r.data : []);
      })
      .catch((err) => {
        console.error("[Calendar] listByDate failed:", err.response?.status, err.response?.data, err.message);
        toast.error(getErrorMessage(err, "Failed to load transactions for this day"));
        setFallbackTxs([]);
      })
      .finally(() => setDayLoading(false));
  }, [selectedDay, calData]);

  // Use embedded transactions first, then fallback
  const finalTxs = dayTxs.length > 0 ? dayTxs : fallbackTxs;

  const weekdays    = ["S", "M", "T", "W", "T", "F", "S"];
  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selEntry    = selectedKey
    ? (calData[selectedKey] || { inbound: 0, outbound: 0 })
    : null;

  return (
    <Modal open={open} onClose={onClose} title="Calendar View" size="lg">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className="btn-ghost"
          style={{ padding: "7px 9px" }}
        >
          <ChevronLeft size={17} />
        </button>
        <div className="text-center">
          <p className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>
            {format(cursor, "MMMM yyyy")}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Tap a day to view transactions
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCursor(new Date())}
            style={{
              padding: "5px 10px", fontSize: 11, fontWeight: 700,
              color: "var(--accent)", background: "none", border: "none", cursor: "pointer",
            }}
          >
            Today
          </button>
          <button
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="btn-ghost"
            style={{ padding: "7px 9px" }}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <ArrowDownToLine size={11} style={{ color: "#10b981" }} />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Inbound</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpFromLine size={11} style={{ color: "#ef4444" }} />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Outbound</span>
        </div>
        {calLoading && (
          <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
            Loading…
          </span>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-bold py-1"
            style={{ color: "var(--text-muted)" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const key    = format(day, "yyyy-MM-dd");
          const entry  = calData[key] || { inbound: 0, outbound: 0 };
          const hasAct = entry.inbound > 0 || entry.outbound > 0;
          const todayF = isToday(day);
          const sel    = selectedDay && isSameDay(selectedDay, day);

          return (
            <button
              key={key}
              onClick={() => setSelectedDay(sel ? null : day)}
              style={{
                minHeight: 52,
                padding: "5px 3px",
                borderRadius: 10,
                cursor: "pointer",
                backgroundColor: sel
                  ? "var(--accent)"
                  : hasAct
                  ? "var(--bg-secondary)"
                  : "transparent",
                border: `1.5px solid ${
                  sel
                    ? "var(--accent)"
                    : todayF
                    ? "var(--accent-muted)"
                    : hasAct
                    ? "var(--border)"
                    : "var(--border-light)"
                }`,
                transition: "all 0.12s",
              }}
            >
              <span
                className="block text-center text-xs font-bold mb-1"
                style={{
                  color: sel ? "white" : todayF ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {format(day, "d")}
              </span>
              {hasAct && (
                <div className="space-y-0.5 px-0.5">
                  {entry.inbound > 0 && (
                    <div
                      className="flex items-center justify-center gap-0.5 text-[8px] font-bold tabular-nums rounded-sm py-0.5"
                      style={{
                        color: sel ? "rgba(255,255,255,0.9)" : "#10b981",
                        backgroundColor: sel
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(16,185,129,0.12)",
                      }}
                    >
                      <ArrowDownToLine size={7} />{entry.inbound}
                    </div>
                  )}
                  {entry.outbound > 0 && (
                    <div
                      className="flex items-center justify-center gap-0.5 text-[8px] font-bold tabular-nums rounded-sm py-0.5"
                      style={{
                        color: sel ? "rgba(255,255,255,0.9)" : "#ef4444",
                        backgroundColor: sel
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(239,68,68,0.12)",
                      }}
                    >
                      <ArrowUpFromLine size={7} />{entry.outbound}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Selected day panel ── */}
      {selectedDay && (
        <div
          className="mt-4 rounded-2xl overflow-hidden"
          style={{ border: "1.5px solid var(--border)" }}
        >
          {/* Day header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <div>
              <p className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>
                {format(selectedDay, "EEE, dd MMM yyyy")}
              </p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {selEntry?.inbound > 0 && (
                  <span
                    className="text-[11px] font-bold flex items-center gap-1"
                    style={{ color: "#10b981" }}
                  >
                    <ArrowDownToLine size={10} /> {selEntry.inbound} bags in
                  </span>
                )}
                {selEntry?.outbound > 0 && (
                  <span
                    className="text-[11px] font-bold flex items-center gap-1"
                    style={{ color: "#ef4444" }}
                  >
                    <ArrowUpFromLine size={10} /> {selEntry.outbound} bags out
                  </span>
                )}
                {dayLoading && (
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Loading…
                  </span>
                )}
                {!dayLoading && !selEntry?.inbound && !selEntry?.outbound && finalTxs.length === 0 && (
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    No recorded activity
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="btn-ghost"
              style={{ padding: 6 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Transactions */}
          <div className="p-3">
            {dayLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="skeleton h-20 rounded-xl" />
                ))}
              </div>
            ) : finalTxs.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-8 rounded-xl"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px dashed var(--border)",
                }}
              >
                <CalendarIcon
                  size={18}
                  style={{ color: "var(--text-muted)", marginBottom: 6 }}
                />
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                  No transactions on this day
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {finalTxs.map((tx) => (
                  <TransactionDetailCard key={tx.id} tx={tx} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════
   BRAND HISTORY MODAL
   ══════════════════════════════════════════════════════════ */
function BrandHistoryModal({ open, onClose, brandId, brandName }) {
  const { isAdmin } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !brandId) return;
    setLoading(true);
    stockApi
      .list({ brand_id: brandId })
      .then(async (r) => {
        const stockEntries = r.data || [];
        const allHistories = await Promise.all(
          stockEntries.map((s) =>
            stockApi.getHistory(s.id).then((hr) => hr.data || []).catch(() => [])
          )
        );
        const seen   = new Set();
        const merged = [];
        for (const txList of allHistories) {
          for (const tx of txList) {
            if (!seen.has(tx.id)) { seen.add(tx.id); merged.push(tx); }
          }
        }
        merged.sort(
          (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)
        );
        setHistory(merged);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [open, brandId]);

  return (
    <Modal open={open} onClose={onClose} title={`History · ${brandName || ""}`} size="lg">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Layers size={20} /></div>
          <p className="empty-state-title">No history yet</p>
          <p className="empty-state-text">No transactions recorded for this brand.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((tx) => {
            const isArrival = tx.transaction_type === "inbound";
            const typeColor = isArrival ? "var(--success)" : "var(--danger)";
            return (
              <div
                key={tx.id}
                className="card"
                style={{ padding: 14, borderLeftWidth: 4, borderLeftColor: typeColor }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${isArrival ? "badge-success" : "badge-danger"}`}>
                        {isArrival ? "Arrival" : "Send"}
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {tx.vehicle_number || "—"}
                      </span>
                      {tx.admin_pending && (
                        <span className="badge badge-warning text-[10px]">Pending</span>
                      )}
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {format(parseISO(tx.transaction_date), "dd MMM yyyy, HH:mm")}
                      {tx.driver_name ? ` · ${tx.driver_name}` : ""}
                    </p>
                    {(tx.source || tx.destination) && (
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {tx.source ? `From: ${tx.source}` : `To: ${tx.destination}`}
                      </p>
                    )}
                    {isAdmin && (tx.price != null || tx.sell_price != null) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {tx.price != null && (
                          <span className="badge badge-muted text-[10px]">
                            Buy: ₹{tx.price}
                          </span>
                        )}
                        {tx.sell_price != null && (
                          <span className="badge badge-muted text-[10px]">
                            Sell: ₹{tx.sell_price}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold tabular-nums" style={{ color: typeColor }}>
                      {isArrival ? "+" : "−"}{tx.total_bags ?? tx.quantity_bags}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>bags</p>
                  </div>
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
   STOCK CARD
   Overview  : brand name · warehouse list · consolidated count
   Expanded  : per-warehouse breakdown — bags section + pieces section
   ══════════════════════════════════════════════════════════ */
function StockCard({ group, onInfoClick }) {
  const [expanded, setExpanded] = useState(false);

  const totalBags       = group.totalBags;
  const totalLeftoverKg = group.totalLeftoverKg;
  const hasLeftover     = totalLeftoverKg > 0;
  const hasPieces       = group.warehouses.some((w) => w.pieceBreakdown.length > 0);

  const bagColor =
    totalBags === 0 ? "#ef4444" :
    totalBags < 50  ? "#f59e0b" :
    "#10b981";

  // Warehouse list for overview: "Warehouse A, B, C"
  const warehouseNames = group.warehouses
    .map((w) => w.warehouseName)
    .filter(Boolean)
    .join(", ");

  return (
    <div
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1.5px solid var(--border)",
        borderLeftWidth: 4,
        borderLeftColor: "var(--text-primary)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: expanded ? "var(--shadow-md)" : "var(--shadow-xs)",
      }}
    >
      {/* ── Overview row (always visible) ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left"
      >
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <Package size={17} style={{ color: "var(--text-secondary)" }} />
        </div>

        {/* Brand name + warehouses */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>
              {group.brandName}
            </span>
            {totalBags === 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
              >
                Out of stock
              </span>
            )}
          </div>
          {warehouseNames && (
            <div className="flex items-center gap-1 mt-0.5">
              <WarehouseIcon size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span
                className="text-xs truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {warehouseNames}
              </span>
            </div>
          )}
          {hasPieces && (
            <div className="flex items-center gap-1 mt-0.5">
              <Layers size={10} style={{ color: "#f59e0b", flexShrink: 0 }} />
              <span className="text-[11px] font-medium" style={{ color: "#f59e0b" }}>
                includes pieces
              </span>
            </div>
          )}
        </div>

        {/* Consolidated bag count */}
        <div className="text-right shrink-0">
          <span
            className="text-xl font-extrabold tabular-nums"
            style={{ color: bagColor, letterSpacing: "-0.02em" }}
          >
            {totalBags}
          </span>
          <div className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>
            bags
          </div>
        </div>

        {/* Info button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Info size={14} />
        </button>

        {/* Chevron */}
        <ChevronDown
          size={16}
          className="shrink-0 transition-transform duration-300"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div
          className="px-3 pb-4 pt-2"
          style={{
            borderTop: "1px solid var(--border-light)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <div className="space-y-2">
            {group.warehouses.map((wh) => (
              <div
                key={wh.warehouseId}
                className="rounded-xl overflow-hidden"
                style={{ border: "1.5px solid var(--border)", backgroundColor: "var(--bg-card)" }}
              >
                {/* Warehouse header */}
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: "1px solid var(--border-light)" }}
                >
                  <div className="flex items-center gap-2">
                    <WarehouseIcon size={12} style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                      {wh.warehouseName}
                    </span>
                  </div>
                  <span
                    className="text-sm font-extrabold tabular-nums"
                    style={{ color: "var(--accent)" }}
                  >
                    {wh.displayTotalBags} bags
                  </span>
                </div>

                <div className="p-2 space-y-1">
                  {/* ── Bags section ── */}
                  {wh.bagBreakdown.length > 0 && (
                    <>
                      <p
                        className="text-[9px] font-bold uppercase tracking-widest px-1 pb-0.5"
                        style={{ color: "#10b981" }}
                      >
                        Bags
                      </p>
                      {wh.bagBreakdown
                        .slice()
                        .sort((a, b) => b.weight - a.weight)
                        .map((b, i) => (
                          <div
                            key={`bag-${i}`}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div className="flex items-center gap-2">
                              <Box size={11} style={{ color: "#10b981" }} />
                              <span className="text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
                                {b.weight} KG
                              </span>
                            </div>
                            <span
                              className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-md"
                              style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#10b981" }}
                            >
                              × {b.qty} bag{b.qty !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))}
                    </>
                  )}

                  {/* ── Pieces section ── */}
                  {wh.pieceBreakdown.length > 0 && (
                    <>
                      <p
                        className="text-[9px] font-bold uppercase tracking-widest px-1 pb-0.5 pt-1"
                        style={{ color: "#f59e0b" }}
                      >
                        Pieces
                      </p>
                      {wh.pieceBreakdown
                        .slice()
                        .sort((a, b) => b.weight - a.weight)
                        .map((p, i) => (
                          <div
                            key={`pc-${i}`}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div className="flex items-center gap-2">
                              <Layers size={11} style={{ color: "#f59e0b" }} />
                              <span className="text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
                                {p.weight} KG
                              </span>
                            </div>
                            <span
                              className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-md"
                              style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#f59e0b" }}
                            >
                              × {p.qty} pc{p.qty !== 1 ? "s" : ""}
                              <span className="text-[10px] font-normal opacity-60 ml-1">
                                ({p.kg.toFixed(0)} kg)
                              </span>
                            </span>
                          </div>
                        ))}
                      {/* Consolidation note */}
                      <div
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                        style={{
                          backgroundColor: "rgba(245,158,11,0.06)",
                          border: "1px dashed rgba(245,158,11,0.3)",
                        }}
                      >
                        <span className="text-[11px]" style={{ color: "#f59e0b" }}>
                          {wh.pieceTotalKg.toFixed(0)} kg ÷ {wh.bagSize} kg/bag
                        </span>
                        <span className="text-[11px] font-bold" style={{ color: "#f59e0b" }}>
                          = {wh.piecesAsBags} bag{wh.piecesAsBags !== 1 ? "s" : ""}
                          {wh.leftoverKg > 0 && (
                            <span className="opacity-60"> + {wh.leftoverKg.toFixed(1)} kg</span>
                          )}
                        </span>
                      </div>
                    </>
                  )}

                  {wh.bagBreakdown.length === 0 && wh.pieceBreakdown.length === 0 && (
                    <p className="text-xs text-center py-2" style={{ color: "var(--text-muted)" }}>
                      No stock
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Brand total footer */}
          <div
            className="mt-2 flex items-center justify-between px-4 py-2 rounded-xl"
            style={{ backgroundColor: "var(--bg-card)", border: "1.5px solid var(--border)" }}
          >
            <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
              Total
            </span>
            <div className="flex items-center gap-2">
              {hasLeftover && (
                <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>
                  +{totalLeftoverKg.toFixed(1)} kg loose
                </span>
              )}
              <span className="text-base font-extrabold tabular-nums" style={{ color: bagColor }}>
                {totalBags} bags
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN STOCKS PAGE
   ══════════════════════════════════════════════════════════ */
export default function StocksPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();

  const [stocks, setStocks]         = useState([]);
  const [brands, setBrands]         = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [millOwners, setMillOwners] = useState([]);
  const [loading, setLoading]       = useState(true);

  const [search, setSearch]                       = useState("");
  const [filterBrand, setFilterBrand]             = useState("");
  const [filterWarehouse, setFilterWarehouse]     = useState("");
  const [filterMillOwner, setFilterMillOwner]     = useState("");
  const [filterVehicle, setFilterVehicle]         = useState("");
  const [showFilters, setShowFilters]             = useState(false);
  const [calendarOpen, setCalendarOpen]           = useState(false);
  const [brandHistoryModal, setBrandHistoryModal] = useState(null);

  const loadStocks = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filterBrand)     params.brand_id        = filterBrand;
    if (filterWarehouse) params.warehouse_id    = filterWarehouse;
    if (filterMillOwner) params.mill_owner_name = filterMillOwner;
    if (filterVehicle)   params.vehicle_no      = filterVehicle;
    stockApi
      .list(params)
      .then((r) => setStocks(r.data || []))
      .catch((err) => toast.error(getErrorMessage(err, "Failed to load stocks")))
      .finally(() => setLoading(false));
  }, [filterBrand, filterWarehouse, filterMillOwner, filterVehicle]);

  useEffect(() => { loadStocks(); }, [loadStocks]);

  useEffect(() => {
    brandApi.list().then((r) => setBrands(r.data || [])).catch(() => {});
    warehouseApi.list().then((r) => setWarehouses(r.data || [])).catch(() => {});
    if (isAdmin) {
      millOwnerApi.list().then((r) => setMillOwners(r.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  // ── Build warehouseId → name map from the warehouses list ─────────────
  const warehouseMap = useMemo(() => {
    const m = new Map();
    for (const w of warehouses) {
      const name =
        i18n.language === "ta" && w.location_name_ta
          ? w.location_name_ta
          : w.location_name;
      m.set(String(w.id), name);
    }
    return m;
  }, [warehouses, i18n.language]);

  // ── Enrich stock rows: inject warehouse name from warehouseMap ─────────
  const enrichedStocks = useMemo(() => {
    if (warehouseMap.size === 0) return stocks;
    return stocks.map((s) => {
      const wId          = String(s.warehouse_id ?? s.warehouse?.id ?? "");
      const resolvedName = warehouseMap.get(wId);
      if (!resolvedName) return s;
      return {
        ...s,
        warehouse: {
          ...(s.warehouse || {}),
          id:               s.warehouse_id ?? s.warehouse?.id,
          location_name:    resolvedName,
          location_name_ta: resolvedName,
        },
      };
    });
  }, [stocks, warehouseMap]);

  const groupedBrands = useMemo(() => {
    let filtered = enrichedStocks;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = enrichedStocks.filter(
        (s) =>
          (s.brand_name || s.brand?.name || "").toLowerCase().includes(q) ||
          (s.warehouse?.location_name || "").toLowerCase().includes(q)
      );
    }
    return groupStocksForDisplay(filtered, { lang: i18n.language, bagSize: 25 });
  }, [enrichedStocks, search, i18n.language]);

  const totalBags      = groupedBrands.reduce((s, g) => s + g.totalBags, 0);
  const totalActualBags = groupedBrands.reduce(
    (s, g) => s + g.warehouses.reduce((ws, w) => ws + w.bagCount, 0), 0
  );
  const totalPiecesAsBags = totalBags - totalActualBags;
  const totalKg   = stocks
    .filter((s) => (s.total_bags ?? s.remaining_bags ?? 0) > 0 ||
      (Array.isArray(s.weight_breakdowns) && s.weight_breakdowns.length > 0))
    .reduce((s, x) => s + (x.total_weight_kg ?? 0), 0);

  const clearFilters = () => {
    setFilterBrand(""); setFilterWarehouse("");
    setFilterMillOwner(""); setFilterVehicle(""); setSearch("");
  };
  const activeFilterCount = [
    filterBrand, filterWarehouse, filterMillOwner, filterVehicle,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-display font-extrabold text-2xl tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            {t("stock.title") || "Stocks"}
          </h1>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {groupedBrands.length} brand{groupedBrands.length !== 1 ? "s" : ""}
            {" · "}
            <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {totalBags.toLocaleString()} bags
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {" · "}{(totalKg / 1000).toFixed(2)} T
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setCalendarOpen(true)} className="btn-secondary">
            <CalendarIcon size={15} />
            <span className="hidden sm:inline">Calendar</span>
          </button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="btn-secondary relative"
            style={
              activeFilterCount > 0
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : {}
            }
          >
            <Filter size={15} />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div
        className="flex items-center gap-2.5 px-3.5"
        style={{
          height: 44,
          backgroundColor: "var(--bg-card)",
          border: "1.5px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <Search size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder={
            i18n.language === "ta" ? "தேடல்..." : "Search brand or warehouse..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, border: "none", background: "transparent",
            outline: "none", fontSize: 14, color: "var(--text-primary)",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              padding: 4, color: "var(--text-muted)",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <div
          className="rounded-2xl p-3 animate-scale-in"
          style={{ backgroundColor: "var(--bg-card)", border: "1.5px solid var(--border)" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>Brand</label>
              <select
                className="input-field"
                style={{ fontSize: 12, padding: "5px 8px", height: 34 }}
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
              >
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {i18n.language === "ta" && b.name_ta ? b.name_ta : b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>Warehouse</label>
              <select
                className="input-field"
                style={{ fontSize: 12, padding: "5px 8px", height: 34 }}
                value={filterWarehouse}
                onChange={(e) => setFilterWarehouse(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {i18n.language === "ta" && w.location_name_ta
                      ? w.location_name_ta
                      : w.location_name}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <>
                <div>
                  <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>
                    Mill Owner
                  </label>
                  <select
                    className="input-field"
                    style={{ fontSize: 12, padding: "5px 8px", height: 34 }}
                    value={filterMillOwner}
                    onChange={(e) => setFilterMillOwner(e.target.value)}
                  >
                    <option value="">All Owners</option>
                    {millOwners.map((m) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>
                    Vehicle No.
                  </label>
                  <input
                    type="text"
                    className="input-field uppercase"
                    placeholder="TN 01 AB 1234"
                    value={filterVehicle}
                    onChange={(e) => setFilterVehicle(e.target.value.toUpperCase())}
                    style={{
                      fontSize: 12, padding: "5px 8px", height: 34,
                      letterSpacing: "0.08em", fontFamily: "ui-monospace, monospace",
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 mt-2.5 text-xs font-bold"
              style={{
                color: "var(--danger)", background: "none",
                border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <X size={11} /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Stock list ── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : groupedBrands.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-2xl"
          style={{ backgroundColor: "var(--bg-card)", border: "1.5px solid var(--border)" }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <Package size={24} style={{ color: "var(--text-muted)" }} />
          </div>
          <p className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
            No stocks found
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Adjust filters or record a new arrival.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {groupedBrands.map((g) => (
            <StockCard
              key={g.brandId}
              group={g}
              onInfoClick={() =>
                setBrandHistoryModal({ id: g.brandId, name: g.brandName })
              }
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      <CalendarModal open={calendarOpen} onClose={() => setCalendarOpen(false)} />
      <BrandHistoryModal
        open={!!brandHistoryModal}
        onClose={() => setBrandHistoryModal(null)}
        brandId={brandHistoryModal?.id}
        brandName={brandHistoryModal?.name}
      />
    </div>
  );
}