// pages/StocksPage.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Pencil, Trash2, Package, Search, X,
  Scale, ChevronDown,
  ArrowDownToLine, ArrowUpFromLine
} from "lucide-react";
import toast from "react-hot-toast";
import { stockApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { transliterateToTamil } from "../utils/transliterate";

/* ═══════════════════════════════════════════════════════
   STOCK FORM (Brand Name only)
   ═══════════════════════════════════════════════════════ */
function StockForm({ initial, onSubmit, onClose }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(
    initial || { brand_name: "", brand_name_ta: "" }
  );
  const [loading, setLoading] = useState(false);
  const [autoBrandTa, setAutoBrandTa] = useState(!initial?.brand_name_ta);

  const handleBrandChange = (val) => {
    const updated = { ...form, brand_name: val };
    if (autoBrandTa) updated.brand_name_ta = transliterateToTamil(val);
    setForm(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ ...form });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">{t("stock.brandName")} *</label>
        <input
          className="input-field"
          value={form.brand_name}
          onChange={(e) => handleBrandChange(e.target.value)}
          required
          placeholder={i18n.language === "ta" ? "பிராண்ட் பெயர்..." : "Brand name..."}
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
   BRAND ACCORDION — Two-row summary
   ═══════════════════════════════════════════════════════ */
function BrandAccordion({
  brandName, brandNameTa, stocks,
  isOpen, onToggle, isAdmin, onEdit, onDelete, t, i18n,
}) {
  const totalRemaining = stocks.reduce((sum, s) => sum + s.remaining_bags, 0);
  const sorted = [...stocks].sort((a, b) => a.bag_weight_kg - b.bag_weight_kg);

  const statusConfig =
    totalRemaining === 0
      ? { color: "#dc2626", label: "Out of Stock", labelTa: "இல்லை", dot: "#dc2626" }
      : totalRemaining < 50
      ? { color: "#d97706", label: "Low Stock", labelTa: "குறைவு", dot: "#f59e0b" }
      : { color: "#16a34a", label: "In Stock", labelTa: "உள்ளது", dot: "#22c55e" };

  const displayName = i18n.language === "ta" && brandNameTa ? brandNameTa : brandName;

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
      {/* ── Collapsed Summary (two rows) ── */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 transition-colors"
        style={{ backgroundColor: isOpen ? "var(--accent-soft)" : "transparent" }}
      >
        {/* Row 1: Brand name + Status + Total */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: statusConfig.dot,
              boxShadow: `0 0 6px ${statusConfig.dot}40`,
            }}
          />
          <span
            className="flex-1 text-[15px] font-extrabold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{
              backgroundColor: `${statusConfig.color}12`,
              color: statusConfig.color,
            }}
          >
            {i18n.language === "ta" ? statusConfig.labelTa : statusConfig.label}
          </span>
          <span
            className="text-base font-extrabold tabular-nums shrink-0"
            style={{ color: "var(--text-primary)" }}
          >
            {totalRemaining}
          </span>
        </div>

        {/* Row 2: Weight varieties + chevron */}
        <div className="flex items-center mt-1.5 ml-5">
          <div className="flex-1 flex items-center gap-0 overflow-x-auto no-scrollbar">
            {sorted.map((s, idx) => {
              const bagColor =
                s.remaining_bags === 0
                  ? "#dc2626"
                  : s.remaining_bags < 50
                  ? "#d97706"
                  : "var(--text-muted)";
              return (
                <span key={s.id} className="flex items-center shrink-0">
                  {idx > 0 && (
                    <span
                      className="mx-1.5 text-[10px]"
                      style={{ color: "var(--border)", userSelect: "none" }}
                    >
                      ·
                    </span>
                  )}
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: bagColor }}
                  >
                    {s.bag_weight_kg}
                    <span className="text-[10px] font-semibold">KG</span>
                    <span className="font-normal">:</span>
                    {s.remaining_bags}
                  </span>
                </span>
              );
            })}
          </div>
          <ChevronDown
            size={16}
            className="shrink-0 ml-2 transition-transform duration-300"
            style={{
              color: "var(--text-muted)",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </button>

      {/* ── Expanded Details ── */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isOpen ? "2000px" : "0px", opacity: isOpen ? 1 : 0 }}
      >
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--border-light)" }}>
          {/* Brand info */}
          <div className="mb-3 mt-3">
            <h3
              className="text-lg font-extrabold leading-tight"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              {displayName}
            </h3>
            {brandNameTa && i18n.language !== "ta" && (
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                {brandNameTa}
              </p>
            )}
            {brandName && i18n.language === "ta" && (
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                {brandName}
              </p>
            )}
          </div>

          {/* Weight-wise detail cards */}
          <div className="mb-3" style={{ borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
            <label
              className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              <Scale size={11} />
              {i18n.language === "ta" ? "எடை வாரியாக" : "Weight-wise Breakdown"}
            </label>
            <div className="space-y-2">
              {sorted.map((stock) => {
                const remaining = stock.remaining_bags;
                const sc =
                  remaining === 0
                    ? { color: "#dc2626", label: "Out", labelTa: "இல்லை" }
                    : remaining < 50
                    ? { color: "#d97706", label: "Low", labelTa: "குறைவு" }
                    : { color: "#16a34a", label: "OK", labelTa: "உள்ளது" };

                return (
                  <div
                    key={stock.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                        style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
                      >
                        <span>{stock.bag_weight_kg}</span>
                        <span className="text-[8px] ml-0.5">kg</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: sc.color }}
                          >
                            {remaining} {t("dashboard.bags")}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${sc.color}15`, color: sc.color }}
                          >
                            {i18n.language === "ta" ? sc.labelTa : sc.label}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-[10px] font-medium" style={{ color: "#10b981" }}>
                            ▲ {stock.total_inbound_bags} {i18n.language === "ta" ? "வரவு" : "in"}
                          </span>
                          <span className="text-[10px] font-medium" style={{ color: "#ef4444" }}>
                            ▼ {stock.total_outbound_bags} {i18n.language === "ta" ? "செலவு" : "out"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(stock); }}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--accent-soft)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(stock); }}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: "#ef4444" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div
            className="grid grid-cols-2 gap-3"
            style={{ borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}
          >
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
              >
                <ArrowDownToLine size={18} style={{ color: "#10b981" }} />
              </div>
              <div>
                <div className="text-lg font-extrabold tabular-nums leading-none" style={{ color: "#10b981" }}>
                  {stocks.reduce((s, st) => s + st.total_inbound_bags, 0)}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "#10b981", opacity: 0.7 }}>
                  {i18n.language === "ta" ? "வரவு" : "Inbound"}
                </div>
              </div>
            </div>
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
              >
                <ArrowUpFromLine size={18} style={{ color: "#ef4444" }} />
              </div>
              <div>
                <div className="text-lg font-extrabold tabular-nums leading-none" style={{ color: "#ef4444" }}>
                  {stocks.reduce((s, st) => s + st.total_outbound_bags, 0)}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "#ef4444", opacity: 0.7 }}>
                  {i18n.language === "ta" ? "செலவு" : "Outbound"}
                </div>
              </div>
            </div>
          </div>
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
  const [openBrand, setOpenBrand] = useState(null);
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterWeight, setFilterWeight] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    stockApi.list().then((r) => setStocks(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const name = (s) =>
    i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name;

  const uniqueBrands = useMemo(
    () => [...new Set(stocks.map((s) => s.brand_name))].sort(),
    [stocks]
  );

  const uniqueWeights = useMemo(
    () => [...new Set(stocks.map((s) => s.bag_weight_kg))].sort((a, b) => a - b),
    [stocks]
  );

  const filtered = useMemo(
    () =>
      stocks.filter((s) => {
        const q = search.toLowerCase();
        if (q && !(
          s.brand_name.toLowerCase().includes(q) ||
          (s.brand_name_ta || "").toLowerCase().includes(q)
        )) return false;
        if (filterBrand && s.brand_name !== filterBrand) return false;
        if (filterWeight && s.bag_weight_kg !== Number(filterWeight)) return false;
        return true;
      }),
    [stocks, search, filterBrand, filterWeight]
  );

  const groupedByBrand = useMemo(() => {
    const brandMap = {};
    filtered.forEach((s) => {
      const bn = s.brand_name;
      if (!brandMap[bn]) {
        brandMap[bn] = { brand_name: bn, brand_name_ta: s.brand_name_ta, stocks: [] };
      }
      brandMap[bn].stocks.push(s);
    });
    return Object.values(brandMap).sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [filtered]);

  const hasActiveFilters = !!(search || filterBrand || filterWeight);
  const clearAllFilters = () => { setSearch(""); setFilterBrand(""); setFilterWeight(""); };

  const totalBags = useMemo(
    () => filtered.reduce((sum, s) => sum + s.remaining_bags, 0),
    [filtered]
  );

  const handleCreate = async (data) => {
    await stockApi.create({
      ...data,
      rice_type: data.rice_type || "",
      rice_type_ta: data.rice_type_ta || "",
      bag_weight_kg: data.bag_weight_kg || 25,
    });
    toast.success(i18n.language === "ta" ? "பிராண்ட் சேர்க்கப்பட்டது" : "Brand created");
    load();
  };

  const handleUpdate = async (data) => {
    await stockApi.update(modal.data.id, {
      ...data,
      rice_type: data.rice_type || modal.data.rice_type || "",
      rice_type_ta: data.rice_type_ta || modal.data.rice_type_ta || "",
      bag_weight_kg: data.bag_weight_kg || modal.data.bag_weight_kg || 25,
    });
    toast.success(i18n.language === "ta" ? "பிராண்ட் புதுப்பிக்கப்பட்டது" : "Brand updated");
    load();
  };

  const handleDelete = async () => {
    await stockApi.delete(deleteTarget.id);
    toast.success(i18n.language === "ta" ? "பிராண்ட் நீக்கப்பட்டது" : "Brand removed");
    setDeleteTarget(null);
    load();
  };

  const toggleBrand = (bn) => setOpenBrand((prev) => (prev === bn ? null : bn));

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-display font-extrabold text-2xl tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            {t("stock.title")}
          </h1>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {groupedByBrand.length} {i18n.language === "ta" ? "பிராண்ட்கள்" : "brands"}
            {" · "}
            {filtered.length} {i18n.language === "ta" ? "பொருட்கள்" : "stocks"}
            {hasActiveFilters && ` of ${stocks.length}`}
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

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
        <input
          className="input-field pl-10"
          placeholder={i18n.language === "ta" ? "பிராண்ட் தேடு..." : "Search brand..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="flex-1">
          <select
            className="input-field w-full text-sm"
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            style={{
              borderColor: filterBrand ? "var(--accent)" : undefined,
              color: filterBrand ? "var(--accent)" : undefined,
              fontWeight: filterBrand ? 700 : undefined,
            }}
          >
            <option value="">{i18n.language === "ta" ? "🏷️ அனைத்து பிராண்ட்" : "🏷️ All Brands"}</option>
            {uniqueBrands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <select
            className="input-field w-full text-sm"
            value={filterWeight}
            onChange={(e) => setFilterWeight(e.target.value)}
            style={{
              borderColor: filterWeight ? "var(--accent)" : undefined,
              color: filterWeight ? "var(--accent)" : undefined,
              fontWeight: filterWeight ? 700 : undefined,
            }}
          >
            <option value="">{i18n.language === "ta" ? "⚖️ அனைத்து எடை" : "⚖️ All Weights"}</option>
            {uniqueWeights.map((w) => <option key={w} value={w}>{w} KG</option>)}
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="shrink-0 px-3 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filterBrand && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
              🏷️ {filterBrand}
              <button onClick={() => setFilterBrand("")} className="ml-0.5 opacity-60 hover:opacity-100"><X size={11} /></button>
            </span>
          )}
          {filterWeight && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
              ⚖️ {filterWeight} KG
              <button onClick={() => setFilterWeight("")} className="ml-0.5 opacity-60 hover:opacity-100"><X size={11} /></button>
            </span>
          )}
          {search && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
              🔍 "{search}"
              <button onClick={() => setSearch("")} className="ml-0.5 opacity-60 hover:opacity-100"><X size={11} /></button>
            </span>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>{t("stock.brandName")}</th>
                <th className="text-right">{t("stock.bagWeight")}</th>
                <th className="text-right">{t("stock.remaining")}</th>
                <th className="text-right">{i18n.language === "ta" ? "வரவு" : "Inbound"}</th>
                <th className="text-right">{i18n.language === "ta" ? "செலவு" : "Outbound"}</th>
                {isAdmin && <th className="text-center">{t("common.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: "var(--border)", borderTopColor: "transparent" }} />
                      <span className="text-sm">{t("common.loading")}</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-secondary)" }}>
                        <Package size={22} style={{ color: "var(--text-muted)" }} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                        {t("common.noData")}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                groupedByBrand.map((brand) =>
                  brand.stocks
                    .sort((a, b) => a.bag_weight_kg - b.bag_weight_kg)
                    .map((s, idx) => (
                      <tr key={s.id}>
                        {idx === 0 && (
                          <td rowSpan={brand.stocks.length}>
                            <div className="font-semibold">{name(s)}</div>
                            {i18n.language !== "ta" && s.brand_name_ta && (
                              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {s.brand_name_ta}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="text-right tabular-nums font-semibold">{s.bag_weight_kg} kg</td>
                        <td className="text-right">
                          <span className={`badge ${
                            s.remaining_bags === 0 ? "badge-danger"
                              : s.remaining_bags < 50 ? "badge-warning" : "badge-success"
                          }`}>
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
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Accordion */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "transparent" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {t("common.loading")}
            </span>
          </div>
        ) : groupedByBrand.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}>
              <Package size={28} style={{ color: "var(--text-muted)" }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold" style={{ color: "var(--text-secondary)" }}>
                {i18n.language === "ta" ? "பிராண்ட்கள் இல்லை" : "No brands found"}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {hasActiveFilters
                  ? i18n.language === "ta" ? "வடிகட்டியை மாற்றவும்" : "Try adjusting your filters"
                  : i18n.language === "ta" ? "முதல் பிராண்டைச் சேர்க்கவும்" : "Add your first brand to get started"}
              </p>
            </div>
          </div>
        ) : (
          groupedByBrand.map((brand) => (
            <BrandAccordion
              key={brand.brand_name}
              brandName={brand.brand_name}
              brandNameTa={brand.brand_name_ta}
              stocks={brand.stocks}
              isOpen={openBrand === brand.brand_name}
              onToggle={() => toggleBrand(brand.brand_name)}
              isAdmin={isAdmin}
              onEdit={(stock) => setModal({ mode: "edit", data: stock })}
              onDelete={(stock) => setDeleteTarget(stock)}
              t={t}
              i18n={i18n}
            />
          ))
        )}
      </div>

      {/* Modals */}
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
        title={i18n.language === "ta" ? "பிராண்ட் நீக்கம்" : "Delete Brand"}
        message={
          i18n.language === "ta"
            ? `"${deleteTarget?.brand_name}" பிராண்டை நீக்க விரும்புகிறீர்களா?`
            : `Remove "${deleteTarget?.brand_name}" from stocks?`
        }
      />
    </div>
  );
}