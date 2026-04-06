import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, TrendingUp, TrendingDown, Filter, Trash2, X,
  ArrowLeftRight, Truck, MapPin, Calendar, ChevronDown,
  Wheat, Package, Building2, FileText, Hash, Star
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { transactionApi, stockApi, warehouseApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";

const BASE_QUALITY_GRADES = ["premium", "A", "B", "C", "standard", "other"];

/* ═══════════════════════════════════════════════════════
   TRANSACTION FORM
   ═══════════════════════════════════════════════════════ */
function TransactionForm({ onSubmit, onClose, stocks, warehouses, initialType, customGrades, onGradeAdded }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState({
    transaction_type: initialType || "inbound",
    stock_id: "",
    warehouse_id: "",
    quantity_bags: "",
    quality_grade: "standard",
    quality_note: "",
    source: "",
    sub_source: "",
    destination: "",
    sub_destination: "",
    vehicle_number: "",
    notes: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });
  const [loading, setLoading] = useState(false);

  const isInbound = form.transaction_type === "inbound";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        stock_id: parseInt(form.stock_id),
        warehouse_id: parseInt(form.warehouse_id),
        quantity_bags: parseInt(form.quantity_bags),
        transaction_date: new Date(form.transaction_date).toISOString(),
        quality_note: form.quality_grade === "other" ? form.quality_note : null,
      };
      await onSubmit(payload);

      if (form.quality_grade === "other" && form.quality_note.trim()) {
        try {
          await transactionApi.addCustomGrade(form.quality_note.trim());
          onGradeAdded && onGradeAdded(form.quality_note.trim());
        } catch {}
      }
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
  };

  const stockName = (s) =>
    i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name;
  const wName = (w) =>
    i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div
        className="flex overflow-hidden"
        style={{
          border: "1.5px solid var(--border)",
          borderRadius: "var(--radius-md, 12px)",
        }}
      >
        {["inbound", "outbound"].map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm((f) => ({ ...f, transaction_type: type }))}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all"
            style={
              form.transaction_type === type
                ? {
                    backgroundColor: type === "inbound" ? "#10b981" : "#ef4444",
                    color: "white",
                  }
                : {
                    color: "var(--text-muted)",
                    backgroundColor: "var(--bg-secondary)",
                  }
            }
          >
            {type === "inbound" ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            {type === "inbound"
              ? i18n.language === "ta" ? "வரவு (இறக்கு)" : t("transaction.unload")
              : i18n.language === "ta" ? "செலவு (அனுப்பு)" : t("transaction.dispatch")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="label">{t("transaction.selectStock")} *</label>
          <select
            className="input-field"
            value={form.stock_id}
            onChange={(e) => setForm((f) => ({ ...f, stock_id: e.target.value }))}
            required
          >
            <option value="">— {t("transaction.selectStock")} —</option>
            {stocks.map((s) => (
              <option key={s.id} value={s.id}>
                {stockName(s)} ({s.rice_type}) — {s.remaining_bags} bags
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label">{t("transaction.selectWarehouse")} *</label>
          <select
            className="input-field"
            value={form.warehouse_id}
            onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
            required
          >
            <option value="">— {t("transaction.selectWarehouse")} —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{wName(w)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">{t("transaction.quantity")} *</label>
          <input
            type="number"
            min="1"
            className="input-field"
            value={form.quantity_bags}
            onChange={(e) => setForm((f) => ({ ...f, quantity_bags: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="label">{t("transaction.quality")}</label>
          <select
            className="input-field"
            value={form.quality_grade}
            onChange={(e) =>
              setForm((f) => ({ ...f, quality_grade: e.target.value, quality_note: "" }))
            }
          >
            {BASE_QUALITY_GRADES.map((g) => (
              <option key={g} value={g}>
                {g === "other" ? "Other (Custom)..." : t(`quality.${g}`, { defaultValue: g })}
              </option>
            ))}
            {customGrades.length > 0 && (
              <>
                <option disabled>── Custom Grades ──</option>
                {customGrades.map((g) => (
                  <option key={`custom_${g}`} value={g}>{g}</option>
                ))}
              </>
            )}
          </select>
          {form.quality_grade === "other" && (
            <input
              className="input-field mt-2"
              value={form.quality_note}
              onChange={(e) => setForm((f) => ({ ...f, quality_note: e.target.value }))}
              placeholder={i18n.language === "ta" ? "தரம் பெயர்..." : "Enter custom quality grade..."}
              maxLength={100}
              required
              autoFocus
            />
          )}
        </div>

        {isInbound ? (
          <>
            <div>
              <label className="label">{t("transaction.source")}</label>
              <input
                className="input-field"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder={i18n.language === "ta" ? "எங்கிருந்து..." : "From where..."}
              />
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "துணை மூலம்" : "Sub Source"}
              </label>
              <input
                className="input-field"
                value={form.sub_source}
                onChange={(e) => setForm((f) => ({ ...f, sub_source: e.target.value }))}
                placeholder={i18n.language === "ta" ? "முகவர்..." : "Sub-location / Agent..."}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">{t("transaction.destination")}</label>
              <input
                className="input-field"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                placeholder={i18n.language === "ta" ? "யாருக்கு..." : "To whom..."}
              />
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "துணை இடம்" : "Sub Destination"}
              </label>
              <input
                className="input-field"
                value={form.sub_destination}
                onChange={(e) => setForm((f) => ({ ...f, sub_destination: e.target.value }))}
                placeholder={i18n.language === "ta" ? "முகவர்..." : "Sub-location / Agent..."}
              />
            </div>
          </>
        )}

        <div>
          <label className="label">{t("transaction.vehicle")}</label>
          <input
            className="input-field"
            value={form.vehicle_number}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))}
            placeholder="TN 01 AB 1234"
          />
        </div>
        <div>
          <label className="label">{t("transaction.date")}</label>
          <input
            type="datetime-local"
            className="input-field"
            value={form.transaction_date}
            onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label">{t("transaction.notes")}</label>
          <textarea
            className="input-field resize-none h-16"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={loading}
          className={`flex-1 justify-center ${isInbound ? "btn-primary" : "btn-danger"}`}
        >
          {loading
            ? t("common.loading")
            : isInbound
            ? i18n.language === "ta" ? "இறக்கு" : t("transaction.unload")
            : i18n.language === "ta" ? "அனுப்பு" : t("transaction.dispatch")}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════
   TRANSACTION ACCORDION CARD — Elder-friendly
   ═══════════════════════════════════════════════════════ */
function TransactionAccordion({ tx, isOpen, onToggle, isAdmin, onDelete, stockName, wName, t, i18n }) {
  const isInbound = tx.transaction_type === "inbound";
  const typeColor = isInbound ? "#10b981" : "#ef4444";
  const typeBg = isInbound ? "rgba(16,185,129," : "rgba(239,68,68,";
  const directionLabel = isInbound
    ? (tx.source || (i18n.language === "ta" ? "மூலம் இல்லை" : "Unknown Source"))
    : (tx.destination || (i18n.language === "ta" ? "இடம் இல்லை" : "Unknown Dest"));
  const riceType = tx.stock?.rice_type || "—";
  const qualityDisplay =
    tx.quality_grade === "other" && tx.quality_note ? tx.quality_note : tx.quality_grade;

  return (
    <div
      className="overflow-hidden transition-all"
      style={{
        backgroundColor: "var(--bg-card)",
        border: `1.5px solid ${isOpen ? typeColor : "var(--border)"}`,
        borderRadius: "var(--radius-xl, 16px)",
        boxShadow: isOpen ? "var(--shadow-md)" : "var(--shadow-xs)",
        borderLeftWidth: "4px",
        borderLeftColor: typeColor,
      }}
    >
      {/* ── Summary Row (Always Visible) ─────────── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
        style={{ backgroundColor: isOpen ? `${typeBg}0.04)` : "transparent" }}
      >
        {/* Type Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${typeBg}0.1)` }}
        >
          {isInbound ? (
            <TrendingUp size={18} style={{ color: typeColor }} />
          ) : (
            <TrendingDown size={18} style={{ color: typeColor }} />
          )}
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: typeColor }}
            >
              {isInbound
                ? i18n.language === "ta" ? "வரவு" : "From"
                : i18n.language === "ta" ? "செலவு" : "To"}
            </span>
            <span
              className="text-sm font-extrabold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {directionLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              {riceType}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: typeColor }}
            >
              {tx.quantity_bags} {i18n.language === "ta" ? "மூட்டை" : "bags"}
            </span>
          </div>
        </div>

        {/* Bags Count (Big) */}
        <div className="text-right shrink-0">
          <span
            className="text-xl font-extrabold tabular-nums"
            style={{ color: typeColor, letterSpacing: "-0.02em" }}
          >
            {tx.quantity_bags}
          </span>
        </div>

        {/* Chevron */}
        <ChevronDown
          size={18}
          className="shrink-0 transition-transform duration-300"
          style={{
            color: "var(--text-muted)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* ── Expanded Details ─────────────────────── */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isOpen ? "700px" : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div
          className="px-4 pb-4 pt-1"
          style={{ borderTop: "1px solid var(--border-light)" }}
        >
          {/* ── Stock Details ──────────────────────── */}
          <div className="mb-4 mt-3">
            <h3
              className="text-lg font-extrabold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {stockName(tx.stock)}
            </h3>
            {tx.stock?.brand_name_ta && i18n.language !== "ta" && (
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                {tx.stock.brand_name_ta}
              </p>
            )}
          </div>

          {/* ── Info Rows ──────────────────────────── */}
          <div
            className="space-y-3 py-3 mb-4"
            style={{
              borderTop: "1px solid var(--border-light)",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            {/* Type */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${typeBg}0.08)` }}
                >
                  {isInbound ? (
                    <TrendingUp size={15} style={{ color: typeColor }} />
                  ) : (
                    <TrendingDown size={15} style={{ color: typeColor }} />
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "வகை" : "Type"}
                </span>
              </div>
              <span
                className="text-sm font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: `${typeBg}0.1)`, color: typeColor }}
              >
                {isInbound
                  ? i18n.language === "ta" ? "வரவு (இறக்கு)" : "Inbound"
                  : i18n.language === "ta" ? "செலவு (அனுப்பு)" : "Outbound"}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <Calendar size={15} style={{ color: "var(--text-muted)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "தேதி" : "Date"}
                </span>
              </div>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: "var(--text-secondary)" }}
              >
                {format(new Date(tx.transaction_date), "dd MMM yyyy, HH:mm")}
              </span>
            </div>

            {/* Rice Type */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--accent-soft)" }}
                >
                  <Wheat size={15} style={{ color: "var(--accent)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "அரிசி வகை" : "Rice Type"}
                </span>
              </div>
              <span
                className="text-sm font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {riceType}
              </span>
            </div>

            {/* Warehouse */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <Building2 size={15} style={{ color: "var(--text-muted)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "கிடங்கு" : "Warehouse"}
                </span>
              </div>
              <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
                {wName(tx.warehouse)}
              </span>
            </div>

            {/* Source / Destination */}
            {(tx.source || tx.destination) && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <MapPin size={15} style={{ color: "var(--text-muted)" }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                    {isInbound
                      ? i18n.language === "ta" ? "மூலம்" : "Source"
                      : i18n.language === "ta" ? "சேருமிடம்" : "Destination"}
                  </span>
                </div>
                <span
                  className="text-sm font-bold text-right max-w-[50%] truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {tx.source || tx.destination}
                </span>
              </div>
            )}

            {/* Sub Source / Sub Destination */}
            {(tx.sub_source || tx.sub_destination) && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <MapPin size={13} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                    {isInbound
                      ? i18n.language === "ta" ? "துணை மூலம்" : "Sub Source"
                      : i18n.language === "ta" ? "துணை இடம்" : "Sub Dest"}
                  </span>
                </div>
                <span
                  className="text-sm font-bold text-right max-w-[50%] truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {tx.sub_source || tx.sub_destination}
                </span>
              </div>
            )}

            {/* Vehicle */}
            {tx.vehicle_number && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <Truck size={15} style={{ color: "var(--text-muted)" }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                    {i18n.language === "ta" ? "வாகனம்" : "Vehicle"}
                  </span>
                </div>
                <span
                  className="text-sm font-bold tracking-wide"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {tx.vehicle_number}
                </span>
              </div>
            )}

            {/* Quality */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "rgba(139,92,246,0.08)" }}
                >
                  <Star size={15} style={{ color: "#8b5cf6" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "தரம்" : "Quality"}
                </span>
              </div>
              <span
                className="text-sm font-bold px-3 py-1 rounded-full capitalize"
                style={{ backgroundColor: "rgba(139,92,246,0.08)", color: "#8b5cf6" }}
              >
                {qualityDisplay}
              </span>
            </div>

            {/* Quantity */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${typeBg}0.08)` }}
                >
                  <Hash size={15} style={{ color: typeColor }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "மூட்டைகள்" : "Quantity"}
                </span>
              </div>
              <span
                className="text-lg font-extrabold tabular-nums"
                style={{ color: typeColor }}
              >
                {tx.quantity_bags} {i18n.language === "ta" ? "மூட்டை" : "bags"}
              </span>
            </div>
          </div>

          {/* ── Notes ──────────────────────────────── */}
          {tx.notes && (
            <div
              className="mb-4 p-3 rounded-xl"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText size={13} style={{ color: "var(--text-muted)" }} />
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "குறிப்புகள்" : "Notes"}
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {tx.notes}
              </p>
            </div>
          )}

          {/* ── Admin Delete ───────────────────────── */}
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(tx);
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: "rgba(239,68,68,0.06)",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)";
              }}
            >
              <Trash2 size={15} />
              {i18n.language === "ta" ? "பரிவர்த்தனையை நீக்கு" : "Delete Transaction"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [filters, setFilters] = useState({
    transaction_type: "", warehouse_id: "", stock_id: "",
    date_from: "", date_to: "", quality_grade: "", vehicle_number: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [customGrades, setCustomGrades] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    transactionApi.list(params)
      .then((r) => setTransactions(r.data))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    stockApi.list().then((r) => setStocks(r.data));
    warehouseApi.list().then((r) => setWarehouses(r.data));
    transactionApi.getCustomGrades()
      .then((r) => setCustomGrades(r.data.map((g) => g.grade_name)))
      .catch(() => {});
  }, []);

  const handleCreate = async (data) => {
    await transactionApi.create(data);
    toast.success(
      i18n.language === "ta" ? "பரிவர்த்தனை பதிவு செய்யப்பட்டது" : "Transaction recorded"
    );
    load();
  };

  const handleDelete = async () => {
    await transactionApi.delete(deleteTarget.id);
    toast.success(
      i18n.language === "ta" ? "பரிவர்த்தனை நீக்கப்பட்டது" : "Transaction deleted"
    );
    setDeleteTarget(null);
    load();
  };

  const handleGradeAdded = (gradeName) => {
    if (!customGrades.includes(gradeName)) {
      setCustomGrades((prev) => [...prev, gradeName].sort());
    }
  };

  const stockName = (s) =>
    s ? (i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name) : "—";
  const wName = (w) =>
    w ? (i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name) : "—";

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters = () =>
    setFilters({
      transaction_type: "", warehouse_id: "", stock_id: "",
      date_from: "", date_to: "", quality_grade: "", vehicle_number: "",
    });

  const allGrades = [
    ...BASE_QUALITY_GRADES,
    ...customGrades.filter((g) => !BASE_QUALITY_GRADES.includes(g)),
  ];

  const toggleCard = (id) => {
    setOpenCardId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-display font-extrabold text-2xl tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            {t("transaction.title")}
          </h1>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {transactions.length}{" "}
            {i18n.language === "ta" ? "பரிவர்த்தனைகள்" : "transactions"}
            {activeFilters > 0 &&
              ` (${i18n.language === "ta" ? "வடிகட்டிய" : "filtered"})`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="btn-secondary relative"
            style={
              showFilters
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : {}
            }
          >
            <Filter size={16} />
            <span className="hidden sm:inline">{t("common.filter")}</span>
            {activeFilters > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {activeFilters}
              </span>
            )}
          </button>
          <button
            onClick={() => setModal({ initialType: "inbound" })}
            className="btn-primary"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{t("transaction.add")}</span>
            <span className="sm:hidden">
              {i18n.language === "ta" ? "புதிய" : "New"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Highlighted Unload / Dispatch Cards ─────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Unload (Inbound) */}
        <button
          onClick={() => setModal({ initialType: "inbound" })}
          className="group relative overflow-hidden transition-all"
          style={{
            background:
              "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)",
            border: "2px solid rgba(16,185,129,0.2)",
            borderRadius: "var(--radius-xl, 16px)",
            padding: "20px 16px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#10b981";
            e.currentTarget.style.boxShadow =
              "0 8px 24px rgba(16,185,129,0.15)";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(16,185,129,0.2)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
            >
              <TrendingUp size={24} style={{ color: "#10b981" }} />
            </div>
            <span
              className="text-base font-extrabold"
              style={{ color: "#10b981" }}
            >
              {i18n.language === "ta" ? "இறக்கு" : "Unload"}
            </span>
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta" ? "வரவு" : "Arrival"}
            </span>
          </div>
        </button>

        {/* Dispatch (Outbound) */}
        <button
          onClick={() => setModal({ initialType: "outbound" })}
          className="group relative overflow-hidden transition-all"
          style={{
            background:
              "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)",
            border: "2px solid rgba(239,68,68,0.2)",
            borderRadius: "var(--radius-xl, 16px)",
            padding: "20px 16px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#ef4444";
            e.currentTarget.style.boxShadow =
              "0 8px 24px rgba(239,68,68,0.15)";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
            >
              <TrendingDown size={24} style={{ color: "#ef4444" }} />
            </div>
            <span
              className="text-base font-extrabold"
              style={{ color: "#ef4444" }}
            >
              {i18n.language === "ta" ? "அனுப்பு" : "Dispatch"}
            </span>
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta" ? "செலவு" : "Send"}
            </span>
          </div>
        </button>
      </div>

      {/* ── Filters Panel ───────────────────────────── */}
      {showFilters && (
        <div className="card animate-scale-in space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">
                {i18n.language === "ta" ? "வகை" : "Type"}
              </label>
              <select
                className="input-field"
                value={filters.transaction_type}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, transaction_type: e.target.value }))
                }
              >
                <option value="">{t("common.all")}</option>
                <option value="inbound">
                  {i18n.language === "ta" ? "வரவு" : t("transaction.inbound")}
                </option>
                <option value="outbound">
                  {i18n.language === "ta" ? "செலவு" : t("transaction.outbound")}
                </option>
              </select>
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "கிடங்கு" : "Warehouse"}
              </label>
              <select
                className="input-field"
                value={filters.warehouse_id}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, warehouse_id: e.target.value }))
                }
              >
                <option value="">{t("common.all")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{wName(w)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "பொருள்" : "Stock"}
              </label>
              <select
                className="input-field"
                value={filters.stock_id}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, stock_id: e.target.value }))
                }
              >
                <option value="">{t("common.all")}</option>
                {stocks.map((s) => (
                  <option key={s.id} value={s.id}>{stockName(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "தரம்" : "Quality"}
              </label>
              <select
                className="input-field"
                value={filters.quality_grade}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, quality_grade: e.target.value }))
                }
              >
                <option value="">{t("common.all")}</option>
                {allGrades
                  .filter((g) => g !== "other")
                  .map((g) => (
                    <option key={g} value={g}>
                      {t(`quality.${g}`, { defaultValue: g })}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "தொடக்க தேதி" : "Date From"}
              </label>
              <input
                type="date"
                className="input-field"
                value={filters.date_from}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, date_from: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "முடிவு தேதி" : "Date To"}
              </label>
              <input
                type="date"
                className="input-field"
                value={filters.date_to}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, date_to: e.target.value }))
                }
              />
            </div>
            <div className="col-span-2">
              <label className="label">
                {i18n.language === "ta" ? "வாகன எண்" : "Vehicle Number"}
              </label>
              <input
                className="input-field"
                value={filters.vehicle_number}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, vehicle_number: e.target.value }))
                }
                placeholder="TN 01..."
              />
            </div>
          </div>
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="btn-ghost"
              style={{ color: "#ef4444" }}
            >
              <X size={12} />
              {i18n.language === "ta"
                ? "அனைத்தையும் நீக்கு"
                : "Clear all filters"}
            </button>
          )}
        </div>
      )}

      {/* ── Desktop Table ───────────────────────────── */}
      <div className="hidden md:block card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th className="text-center">{t("common.status")}</th>
                <th>{t("stock.title")}</th>
                <th>{t("warehouse.title")}</th>
                <th>
                  {i18n.language === "ta"
                    ? "மூலம் / சேருமிடம்"
                    : "Source / Dest"}
                </th>
                <th>{i18n.language === "ta" ? "துணை" : "Sub"}</th>
                <th>{i18n.language === "ta" ? "வாகனம்" : "Vehicle"}</th>
                <th className="text-right">
                  {i18n.language === "ta" ? "மூட்டை" : "Bags"}
                </th>
                <th className="text-center">
                  {i18n.language === "ta" ? "தரம்" : "Quality"}
                </th>
                {isAdmin && (
                  <th className="text-center">{t("common.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="text-center py-12"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                        style={{
                          borderColor: "var(--border)",
                          borderTopColor: "transparent",
                        }}
                      />
                      <span className="text-sm">{t("common.loading")}</span>
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <ArrowLeftRight
                          size={22}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {t("common.noData")}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="text-xs tabular-nums">
                      {format(
                        new Date(tx.transaction_date),
                        "dd MMM yyyy, HH:mm"
                      )}
                    </td>
                    <td className="text-center">
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor:
                            tx.transaction_type === "inbound"
                              ? "rgba(16,185,129,0.1)"
                              : "rgba(239,68,68,0.1)",
                          color:
                            tx.transaction_type === "inbound"
                              ? "#10b981"
                              : "#ef4444",
                        }}
                      >
                        {tx.transaction_type === "inbound" ? (
                          <TrendingUp size={11} />
                        ) : (
                          <TrendingDown size={11} />
                        )}
                        {tx.transaction_type === "inbound"
                          ? i18n.language === "ta"
                            ? "வரவு"
                            : t("transaction.inbound")
                          : i18n.language === "ta"
                          ? "செலவு"
                          : t("transaction.outbound")}
                      </span>
                    </td>
                    <td>
                      <div className="font-semibold text-sm">
                        {stockName(tx.stock)}
                      </div>
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {tx.stock?.rice_type}
                      </div>
                    </td>
                    <td>{wName(tx.warehouse)}</td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {tx.source || tx.destination || "—"}
                    </td>
                    <td
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {tx.sub_source || tx.sub_destination || "—"}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {tx.vehicle_number || "—"}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {tx.quantity_bags}
                    </td>
                    <td className="text-center">
                      <span
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full capitalize"
                        style={{
                          backgroundColor: "rgba(139,92,246,0.08)",
                          color: "#8b5cf6",
                        }}
                      >
                        {tx.quality_grade === "other" && tx.quality_note
                          ? tx.quality_note
                          : tx.quality_grade}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="text-center">
                        <button
                          onClick={() => setDeleteTarget(tx)}
                          className="p-2 rounded-xl transition-colors"
                          style={{ color: "#ef4444" }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "rgba(239,68,68,0.06)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "transparent")
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile Accordion List ───────────────────── */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "transparent",
              }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {t("common.loading")}
            </span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <ArrowLeftRight
                size={28}
                style={{ color: "var(--text-muted)" }}
              />
            </div>
            <div className="text-center">
              <p
                className="text-base font-bold"
                style={{ color: "var(--text-secondary)" }}
              >
                {i18n.language === "ta"
                  ? "பரிவர்த்தனைகள் இல்லை"
                  : "No transactions yet"}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {i18n.language === "ta"
                  ? "முதல் வரவு அல்லது செலவு பதிவு செய்யவும்"
                  : "Record your first inbound or outbound transaction"}
              </p>
            </div>
          </div>
        ) : (
          transactions.map((tx) => (
            <TransactionAccordion
              key={tx.id}
              tx={tx}
              isOpen={openCardId === tx.id}
              onToggle={() => toggleCard(tx.id)}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              stockName={stockName}
              wName={wName}
              t={t}
              i18n={i18n}
            />
          ))
        )}
      </div>

      {/* ── Modals ──────────────────────────────────── */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={t("transaction.add")}
        size="lg"
      >
        {modal && (
          <TransactionForm
            onSubmit={handleCreate}
            onClose={() => setModal(null)}
            stocks={stocks}
            warehouses={warehouses}
            initialType={modal.initialType}
            customGrades={customGrades}
            onGradeAdded={handleGradeAdded}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={
          i18n.language === "ta" ? "பரிவர்த்தனை நீக்கம்" : "Delete Transaction"
        }
        message={
          i18n.language === "ta"
            ? "இந்த பரிவர்த்தனை நிரந்தரமாக நீக்கப்படும்."
            : "This will permanently delete this transaction record."
        }
      />
    </div>
  );
}