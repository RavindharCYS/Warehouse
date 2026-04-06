import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Pencil, Trash2, Package, Search, Filter, X,
  TrendingUp, TrendingDown, Scale, Wheat, ChevronDown,
  Building2
} from "lucide-react";
import toast from "react-hot-toast";
import { stockApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { transliterateToTamil } from "../utils/transliterate";

const RICE_TYPES = ["Ponni", "Basmati", "Sona Masoori", "Raw Rice", "Boiled Rice", "IR 64", "Other"];

const RICE_TYPE_TAMIL = {
  "Ponni": "பொன்னி",
  "Basmati": "பாஸ்மதி",
  "Sona Masoori": "சோனா மசூரி",
  "Raw Rice": "பச்சரிசி",
  "Boiled Rice": "வேக வைத்த அரிசி",
  "IR 64": "ஐஆர் 64",
  "Other": "மற்றவை",
};

/* ═══════════════════════════════════════════════════════
   STOCK FORM
   ═══════════════════════════════════════════════════════ */
function StockForm({ initial, onSubmit, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    initial || {
      brand_name: "", brand_name_ta: "",
      rice_type: "Ponni", rice_type_ta: "",
      production_company: "", production_company_ta: "",
      bag_weight_kg: 25,
    }
  );
  const [loading, setLoading] = useState(false);
  const [autoBrandTa, setAutoBrandTa] = useState(!initial?.brand_name_ta);
  const [autoCompanyTa, setAutoCompanyTa] = useState(!initial?.production_company_ta);

  const handleBrandChange = (val) => {
    const updated = { ...form, brand_name: val };
    if (autoBrandTa) updated.brand_name_ta = transliterateToTamil(val);
    setForm(updated);
  };

  const handleCompanyChange = (val) => {
    const updated = { ...form, production_company: val };
    if (autoCompanyTa) updated.production_company_ta = transliterateToTamil(val);
    setForm(updated);
  };

  const handleRiceTypeChange = (val) => {
    setForm((f) => ({
      ...f,
      rice_type: val,
      rice_type_ta: RICE_TYPE_TAMIL[val] || transliterateToTamil(val),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ ...form, bag_weight_kg: parseFloat(form.bag_weight_kg) });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">{t("stock.brandName")} *</label>
          <input
            className="input-field"
            value={form.brand_name}
            onChange={(e) => handleBrandChange(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label flex items-center justify-between">
            <span>{t("stock.brandNameTa")}</span>
            <button
              type="button"
              onClick={() => setAutoBrandTa((a) => !a)}
              className="text-xs font-normal lowercase"
              style={{ color: autoBrandTa ? "var(--accent)" : "var(--text-muted)" }}
            >
              {autoBrandTa ? "⚡ auto" : "manual"}
            </button>
          </label>
          <input
            className="input-field"
            value={form.brand_name_ta}
            onChange={(e) => {
              setAutoBrandTa(false);
              setForm((f) => ({ ...f, brand_name_ta: e.target.value }));
            }}
            placeholder="பிராண்ட்"
          />
        </div>
        <div>
          <label className="label">{t("stock.riceType")} *</label>
          <select
            className="input-field"
            value={form.rice_type}
            onChange={(e) => handleRiceTypeChange(e.target.value)}
          >
            {RICE_TYPES.map((rt) => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("stock.riceTypeTa")}</label>
          <input
            className="input-field"
            value={form.rice_type_ta}
            onChange={(e) => setForm((f) => ({ ...f, rice_type_ta: e.target.value }))}
            placeholder="அரிசி வகை"
          />
        </div>
        <div>
          <label className="label">{t("stock.productionCompany")}</label>
          <input
            className="input-field"
            value={form.production_company}
            onChange={(e) => handleCompanyChange(e.target.value)}
          />
        </div>
        <div>
          <label className="label flex items-center justify-between">
            <span>{t("stock.productionCompany")} (தமிழ்)</span>
            <button
              type="button"
              onClick={() => setAutoCompanyTa((a) => !a)}
              className="text-xs font-normal lowercase"
              style={{ color: autoCompanyTa ? "var(--accent)" : "var(--text-muted)" }}
            >
              {autoCompanyTa ? "⚡ auto" : "manual"}
            </button>
          </label>
          <input
            className="input-field"
            value={form.production_company_ta}
            onChange={(e) => {
              setAutoCompanyTa(false);
              setForm((f) => ({ ...f, production_company_ta: e.target.value }));
            }}
            placeholder="தயாரிப்பு நிறுவனம்"
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">{t("stock.bagWeight")}</label>
          <input
            type="number"
            step="0.5"
            min="1"
            className="input-field"
            value={form.bag_weight_kg}
            onChange={(e) => setForm((f) => ({ ...f, bag_weight_kg: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
          {t("common.cancel")}
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
          {loading ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════
   ACCORDION STOCK CARD — Collapsible, Elder-friendly
   ═══════════════════════════════════════════════════════ */
function StockAccordion({ stock, isOpen, onToggle, isAdmin, onEdit, onDelete, name, typeName, companyName, t, i18n }) {
  const remaining = stock.remaining_bags;

  const statusConfig =
    remaining === 0
      ? { color: "#dc2626", label: "Out of Stock", labelTa: "இல்லை", dot: "#dc2626" }
      : remaining < 50
      ? { color: "#d97706", label: "Low Stock", labelTa: "குறைவு", dot: "#f59e0b" }
      : { color: "#16a34a", label: "In Stock", labelTa: "உள்ளது", dot: "#22c55e" };

  return (
    <div
      className="overflow-hidden transition-all"
      style={{
        backgroundColor: "var(--bg-card)",
        border: `1.5px solid ${isOpen ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius-xl, 16px)",
        boxShadow: isOpen ? "var(--shadow-md)" : "var(--shadow-xs)",
      }}
    >
      {/* ── Summary Row (Always Visible) ─────────── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
        style={{ backgroundColor: isOpen ? "var(--accent-soft)" : "transparent" }}
      >
        {/* Status Dot */}
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: statusConfig.dot, boxShadow: `0 0 8px ${statusConfig.dot}40` }}
        />

        {/* Rice Type + Brand */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className="text-base font-extrabold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {typeName(stock)}
            </span>
            <span
              className="text-xs font-medium truncate"
              style={{ color: "var(--text-muted)" }}
            >
              · {name(stock)}
            </span>
          </div>
        </div>

        {/* Status + Bags */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${statusConfig.color}12`,
              color: statusConfig.color,
            }}
          >
            {i18n.language === "ta" ? statusConfig.labelTa : statusConfig.label}
          </span>
          <span
            className="text-base font-extrabold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {remaining}
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

      {/* ── Expanded Details (Visible on click) ──── */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isOpen ? "600px" : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div
          className="px-4 pb-4 pt-1"
          style={{ borderTop: "1px solid var(--border-light)" }}
        >
          {/* ── Brand Names ────────────────────────── */}
          <div className="mb-4 mt-3">
            <h3
              className="text-lg font-extrabold leading-tight"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              {name(stock)}
            </h3>
            {stock.brand_name_ta && i18n.language !== "ta" && (
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                {stock.brand_name_ta}
              </p>
            )}
            {stock.brand_name && i18n.language === "ta" && (
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                {stock.brand_name}
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
            {/* Rice Type */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--accent-soft)" }}
                >
                  <Wheat size={15} style={{ color: "var(--accent)" }} />
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "அரிசி வகை" : "Rice Type"}
                </span>
              </div>
              <span
                className="text-sm font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {typeName(stock)}
              </span>
            </div>

            {/* Company */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <Building2 size={15} style={{ color: "var(--text-muted)" }} />
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "நிறுவனம்" : "Company"}
                </span>
              </div>
              <span
                className="text-sm font-bold"
                style={{ color: "var(--text-secondary)" }}
              >
                {companyName(stock)}
              </span>
            </div>

            {/* Bag Weight */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <Scale size={15} style={{ color: "var(--text-muted)" }} />
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "மூட்டை எடை" : "Bag Weight"}
                </span>
              </div>
              <span
                className="text-sm font-bold"
                style={{ color: "var(--text-secondary)" }}
              >
                {stock.bag_weight_kg} kg
              </span>
            </div>

            {/* Remaining */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${statusConfig.color}10` }}
                >
                  <Package size={15} style={{ color: statusConfig.color }} />
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "மீதம்" : "Remaining"}
                </span>
              </div>
              <span
                className="text-base font-extrabold tabular-nums"
                style={{ color: statusConfig.color }}
              >
                {remaining} {t("dashboard.bags")}
              </span>
            </div>
          </div>

          {/* ── Inbound / Outbound ─────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              className="flex items-center gap-3 p-3.5 rounded-xl"
              style={{
                backgroundColor: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
              >
                <TrendingUp size={20} style={{ color: "#10b981" }} />
              </div>
              <div>
                <div
                  className="text-xl font-extrabold tabular-nums leading-none"
                  style={{ color: "#10b981" }}
                >
                  {stock.total_inbound_bags}
                </div>
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mt-1"
                  style={{ color: "#10b981", opacity: 0.7 }}
                >
                  {i18n.language === "ta" ? "வரவு" : "Inbound"}
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-3 p-3.5 rounded-xl"
              style={{
                backgroundColor: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
              >
                <TrendingDown size={20} style={{ color: "#ef4444" }} />
              </div>
              <div>
                <div
                  className="text-xl font-extrabold tabular-nums leading-none"
                  style={{ color: "#ef4444" }}
                >
                  {stock.total_outbound_bags}
                </div>
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mt-1"
                  style={{ color: "#ef4444", opacity: 0.7 }}
                >
                  {i18n.language === "ta" ? "செலவு" : "Outbound"}
                </div>
              </div>
            </div>
          </div>

          {/* ── Admin Actions ──────────────────────── */}
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(stock);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--accent-soft)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <Pencil size={15} />
                {i18n.language === "ta" ? "திருத்து" : "Edit"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(stock);
                }}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all"
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
                {i18n.language === "ta" ? "நீக்கு" : "Delete"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function StocksPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);

  const [filters, setFilters] = useState({
    search: "",
    rice_type: "",
    production_company: "",
    stock_status: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    stockApi.list().then((r) => setStocks(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const name = (s) =>
    i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name;
  const typeName = (s) =>
    i18n.language === "ta" && s.rice_type_ta ? s.rice_type_ta : s.rice_type;
  const companyName = (s) =>
    i18n.language === "ta" && s.production_company_ta
      ? s.production_company_ta
      : s.production_company || "—";

  const uniqueRiceTypes = useMemo(
    () => [...new Set(stocks.map((s) => s.rice_type))].sort(),
    [stocks]
  );
  const uniqueCompanies = useMemo(
    () => [...new Set(stocks.map((s) => s.production_company).filter(Boolean))].sort(),
    [stocks]
  );

  const filtered = useMemo(
    () =>
      stocks.filter((s) => {
        const q = filters.search.toLowerCase();
        if (
          q &&
          !(
            s.brand_name.toLowerCase().includes(q) ||
            (s.brand_name_ta || "").toLowerCase().includes(q) ||
            s.rice_type.toLowerCase().includes(q) ||
            (s.production_company || "").toLowerCase().includes(q)
          )
        )
          return false;
        if (filters.rice_type && s.rice_type !== filters.rice_type) return false;
        if (filters.production_company && s.production_company !== filters.production_company)
          return false;
        if (filters.stock_status === "out_of_stock" && s.remaining_bags > 0) return false;
        if (
          filters.stock_status === "low_stock" &&
          (s.remaining_bags === 0 || s.remaining_bags >= 50)
        )
          return false;
        if (filters.stock_status === "in_stock" && s.remaining_bags < 50) return false;
        return true;
      }),
    [stocks, filters]
  );

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters = () =>
    setFilters({ search: "", rice_type: "", production_company: "", stock_status: "" });

  const handleCreate = async (data) => {
    await stockApi.create(data);
    toast.success(i18n.language === "ta" ? "பொருள் சேர்க்கப்பட்டது" : "Stock created");
    load();
  };
  const handleUpdate = async (data) => {
    await stockApi.update(modal.data.id, data);
    toast.success(i18n.language === "ta" ? "பொருள் புதுப்பிக்கப்பட்டது" : "Stock updated");
    load();
  };
  const handleDelete = async () => {
    await stockApi.delete(deleteTarget.id);
    toast.success(i18n.language === "ta" ? "பொருள் நீக்கப்பட்டது" : "Stock removed");
    setDeleteTarget(null);
    load();
  };

  const stockStatusColor = (bags) =>
    bags === 0 ? "badge-danger" : bags < 50 ? "badge-warning" : "badge-success";

  const totalBags = useMemo(
    () => filtered.reduce((sum, s) => sum + s.remaining_bags, 0),
    [filtered]
  );

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
            {t("stock.title")}
          </h1>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {filtered.length} {i18n.language === "ta" ? "பொருட்கள்" : "stocks"}
            {activeFilters > 0 && ` of ${stocks.length}`}
            {totalBags > 0 && ` · ${totalBags.toLocaleString()} ${t("dashboard.bags")}`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setModal({ mode: "create" })} className="btn-primary">
            <Plus size={16} />
            <span className="hidden sm:inline">{t("stock.add")}</span>
            <span className="sm:hidden">{i18n.language === "ta" ? "சேர்" : "Add"}</span>
          </button>
        )}
      </div>

      {/* ── Search + Filter Bar ─────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            className="input-field pl-10"
            placeholder={i18n.language === "ta" ? "தேடு..." : t("common.search")}
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="btn-secondary relative"
          style={showFilters ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
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
        {activeFilters > 0 && (
          <button onClick={clearFilters} className="btn-ghost" style={{ color: "#ef4444" }}>
            <X size={14} />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      {/* ── Filter Panel ────────────────────────────── */}
      {showFilters && (
        <div className="card animate-scale-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">{t("stock.riceType")}</label>
              <select
                className="input-field"
                value={filters.rice_type}
                onChange={(e) => setFilters((f) => ({ ...f, rice_type: e.target.value }))}
              >
                <option value="">— {t("common.all")} —</option>
                {uniqueRiceTypes.map((rt) => (
                  <option key={rt} value={rt}>{rt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("stock.productionCompany")}</label>
              <select
                className="input-field"
                value={filters.production_company}
                onChange={(e) => setFilters((f) => ({ ...f, production_company: e.target.value }))}
              >
                <option value="">— {t("common.all")} —</option>
                {uniqueCompanies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "கையிருப்பு நிலை" : "Stock Status"}
              </label>
              <select
                className="input-field"
                value={filters.stock_status}
                onChange={(e) => setFilters((f) => ({ ...f, stock_status: e.target.value }))}
              >
                <option value="">— {t("common.all")} —</option>
                <option value="in_stock">
                  {i18n.language === "ta" ? "கையிருப்பு (50+)" : "In Stock (50+)"}
                </option>
                <option value="low_stock">
                  {i18n.language === "ta" ? "குறைவு (1–49)" : "Low Stock (1–49)"}
                </option>
                <option value="out_of_stock">
                  {i18n.language === "ta" ? "கையிருப்பு இல்லை" : "Out of Stock"}
                </option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop Table ───────────────────────────── */}
      <div className="hidden md:block card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>{t("stock.brandName")}</th>
                <th>{t("stock.riceType")}</th>
                <th>{t("stock.productionCompany")}</th>
                <th className="text-right">{t("stock.bagWeight")}</th>
                <th className="text-right">{t("stock.remaining")}</th>
                <th className="text-right">{t("stock.inbound")}</th>
                <th className="text-right">{t("stock.outbound")}</th>
                {isAdmin && <th className="text-center">{t("common.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: "var(--border)", borderTopColor: "transparent" }}
                      />
                      <span className="text-sm">{t("common.loading")}</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <Package size={22} style={{ color: "var(--text-muted)" }} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                        {t("common.noData")}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="font-semibold">{name(s)}</div>
                      {i18n.language !== "ta" && s.brand_name_ta && (
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {s.brand_name_ta}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-accent">{typeName(s)}</span>
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>{companyName(s)}</td>
                    <td className="text-right tabular-nums">{s.bag_weight_kg} kg</td>
                    <td className="text-right">
                      <span className={`badge ${stockStatusColor(s.remaining_bags)}`}>
                        {s.remaining_bags} {t("dashboard.bags")}
                      </span>
                    </td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: "#10b981" }}>
                      {s.total_inbound_bags}
                    </td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: "#ef4444" }}>
                      {s.total_outbound_bags}
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setModal({ mode: "edit", data: s })}
                            className="p-2 rounded-xl transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="p-2 rounded-xl transition-colors"
                            style={{ color: "#ef4444" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
              style={{ borderColor: "var(--border)", borderTopColor: "transparent" }}
            />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {t("common.loading")}
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <Package size={28} style={{ color: "var(--text-muted)" }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold" style={{ color: "var(--text-secondary)" }}>
                {i18n.language === "ta" ? "பொருட்கள் இல்லை" : "No stocks found"}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {activeFilters > 0
                  ? i18n.language === "ta"
                    ? "வடிகட்டியை மாற்றவும்"
                    : "Try adjusting your filters"
                  : i18n.language === "ta"
                  ? "முதல் பொருளைச் சேர்க்கவும்"
                  : "Add your first stock to get started"}
              </p>
            </div>
          </div>
        ) : (
          filtered.map((s) => (
            <StockAccordion
              key={s.id}
              stock={s}
              isOpen={openCardId === s.id}
              onToggle={() => toggleCard(s.id)}
              isAdmin={isAdmin}
              onEdit={(stock) => setModal({ mode: "edit", data: stock })}
              onDelete={(stock) => setDeleteTarget(stock)}
              name={name}
              typeName={typeName}
              companyName={companyName}
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
        title={modal?.mode === "create" ? t("stock.add") : t("stock.edit")}
      >
        {modal && (
          <StockForm
            initial={modal.data}
            onSubmit={modal.mode === "create" ? handleCreate : handleUpdate}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={i18n.language === "ta" ? "பொருள் நீக்கம்" : "Delete Stock"}
        message={
          i18n.language === "ta"
            ? `"${deleteTarget?.brand_name}" பொருளை நீக்க விரும்புகிறீர்களா?`
            : `Remove "${deleteTarget?.brand_name}" from stocks?`
        }
      />
    </div>
  );
}