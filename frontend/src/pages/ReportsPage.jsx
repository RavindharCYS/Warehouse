// pages/ReportsPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3, Package, TrendingUp, TrendingDown,
  ArrowLeftRight, Filter, FileText, FileSpreadsheet,
  Calendar, X, RefreshCw, IndianRupee, User, Truck,
  ChevronDown, ChevronUp, Download, Upload, Trash2, AlertTriangle,
} from "lucide-react";
import {
  format, subDays, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, parseISO,
} from "date-fns";
import toast from "react-hot-toast";
import {
  reportsApi, transactionApi, stockApi, brandApi,
  warehouseApi, millOwnerApi, adminApi, getErrorMessage,
  exportTransactionsCsv,
} from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ──────────────────────────────────────────────────────────
   DATE PRESETS
   ────────────────────────────────────────────────────────── */
const DATE_PRESETS = [
  { key: "today",     label: "Today",   getRange: () => ({ from: new Date(), to: new Date() }) },
  { key: "yesterday", label: "Yest",    getRange: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { key: "7d",        label: "7d",      getRange: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { key: "14d",       label: "14d",     getRange: () => ({ from: subDays(new Date(), 13), to: new Date() }) },
  { key: "30d",       label: "30d",     getRange: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { key: "thisWeek",  label: "Week",    getRange: () => ({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) }) },
  { key: "thisMonth", label: "Month",   getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
];

const fmtDate = (d) => format(d, "yyyy-MM-dd");

/* ══════════════════════════════════════════════════════════
   COLLAPSIBLE SECTION (Mobile-friendly accordion)
   ══════════════════════════════════════════════════════════ */
function CollapsibleSection({ title, subtitle, icon: Icon, iconColor, iconBg, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex items-center justify-between cursor-pointer"
        style={{
          padding: "12px 14px",
          backgroundColor: open ? "transparent" : "var(--bg-secondary)",
          borderBottom: open ? "1px solid var(--border-light)" : "none",
          transition: "background-color 0.15s",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {Icon && (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: iconBg || "var(--accent-soft)" }}
            >
              <Icon size={14} style={{ color: iconColor || "var(--accent)" }} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {badge}
          <ChevronDown
            size={16}
            style={{
              color: "var(--text-muted)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </div>
      </div>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();

  // Master data
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [brands, setBrands] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [millOwners, setMillOwners] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDateRange, setShowDateRange] = useState(false);

  // Admin data management state
  const [backingUp, setBackingUp]     = useState(false);
  const [restoring, setRestoring]     = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(fmtDate(subDays(new Date(), 13)));
  const [dateTo, setDateTo] = useState(fmtDate(new Date()));
  const [activePreset, setActivePreset] = useState("14d");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterMillOwner, setFilterMillOwner] = useState("");
  const [filterVehicle, setFilterVehicle] = useState("");

  /* ── Load masters once ── */
  useEffect(() => {
    brandApi.list().then((r) => setBrands(r.data || [])).catch(() => {});
    warehouseApi.list().then((r) => setWarehouses(r.data || [])).catch(() => {});
    stockApi.list().then((r) => setStocks(r.data || [])).catch(() => {});
    if (isAdmin) {
      millOwnerApi.list().then((r) => setMillOwners(r.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  /* ── Build params ── */
  const params = useMemo(() => {
    const p = { date_from: dateFrom, date_to: dateTo };
    if (filterBrand)     p.brand_id = filterBrand;
    if (filterWarehouse) p.warehouse_id = filterWarehouse;
    if (filterType)      p.type = filterType;
    if (filterMillOwner) p.mill_owner_name = filterMillOwner;
    if (filterVehicle)   p.vehicle_no = filterVehicle;
    return p;
  }, [dateFrom, dateTo, filterBrand, filterWarehouse, filterType, filterMillOwner, filterVehicle]);

  /* ── Load report data ── */
  const loadReport = useCallback(() => {
    setLoading(true);
    reportsApi.get(params)
      .then((r) => setTransactions(r.data?.transactions || r.data || []))
      .catch(() => {
        transactionApi.list({ ...params, limit: 500 })
          .then((r) => setTransactions(r.data || []))
          .catch(() => setTransactions([]));
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { loadReport(); }, [loadReport]);

  /* ── Apply preset ── */
  const applyPreset = (key) => {
    const preset = DATE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const { from, to } = preset.getRange();
    setDateFrom(fmtDate(from));
    setDateTo(fmtDate(to));
    setActivePreset(key);
  };

  /* ── Export handlers ── */
  const handleExport = (formatType) => {
    if (transactions.length === 0) return;
    setExporting(true);
    try {
      const filename = `report_${dateFrom}_to_${dateTo}.${formatType}`;
      if (formatType === "csv") {
        exportTransactionsCsv(transactions, isAdmin, filename);
        toast.success("Exported as CSV");
      } else {
        const headers = [
          "Date", "Type", "Vehicle", "Driver", "Driver Number",
          "Source / Destination",
          ...(isAdmin ? ["Commission Partner"] : []),
          "Total Bags", "Total KG",
          ...(isAdmin ? ["Mill Owner", "Price/Bag", "Sell Price/Bag", "Rent", "Hidden Charges", "P/L per Bag"] : []),
          "Notes",
        ];
        const rows = transactions.map((tx) => {
          const isIn = tx.transaction_type === "inbound";
          const pl = tx.price != null && tx.sell_price != null
            ? (Number(tx.sell_price) - Number(tx.price)).toFixed(2) : "";
          return [
            new Date(tx.transaction_date).toLocaleString(),
            isIn ? "Arrival" : "Send",
            tx.vehicle_number || "",
            tx.driver_name || "",
            tx.driver_number || "",
            (isIn ? tx.source : tx.destination) || "",
            ...(isAdmin ? [tx.commission_partner || ""] : []),
            tx.total_bags ?? 0,
            (tx.total_weight_kg ?? 0).toFixed(1),
            ...(isAdmin ? [
              tx.mill_owner_name || "",
              tx.price != null ? tx.price : "",
              tx.sell_price != null ? tx.sell_price : "",
              tx.rent != null ? tx.rent : "",
              tx.hidden_charges != null ? tx.hidden_charges : "",
              pl,
            ] : []),
            tx.notes || "",
          ];
        });

        const escape = (v) => String(v ?? "")
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const toRow = (cells, bold = false) =>
          `<Row>${cells.map((c) => {
            const isNum = typeof c === "number" || (!isNaN(parseFloat(c)) && c !== "" && !isNaN(c));
            const type = isNum ? "Number" : "String";
            const style = bold ? ` ss:StyleID="header"` : "";
            return `<Cell${style}><Data ss:Type="${type}">${escape(c)}</Data></Cell>`;
          }).join("")}</Row>`;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E8E0F7" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Transactions">
    <Table>
      ${toRow(headers, true)}
      ${rows.map((r) => toRow(r)).join("\n      ")}
    </Table>
  </Worksheet>
</Workbook>`;

        const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Exported as XLSX");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to export ${formatType.toUpperCase()}`));
    } finally {
      setExporting(false);
    }
  };

  /* ── Clear filters ── */
  const clearFilters = () => {
    setFilterBrand(""); setFilterWarehouse(""); setFilterType("");
    setFilterMillOwner(""); setFilterVehicle("");
  };

  /* ── Backup ── */
  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await adminApi.backup();
      const json = JSON.stringify(res.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href     = url;
      link.download = `rice_warehouse_backup_${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Backup downloaded successfully");
    } catch (err) {
      toast.error(getErrorMessage(err, "Backup failed"));
    } finally {
      setBackingUp(false);
    }
  };

  /* ── Restore — file picker → confirm → upload ── */
  const handleRestoreFilePick = () => {
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.version !== 1 || !data.data) {
          toast.error("Invalid backup file format");
          return;
        }
        setPendingRestoreData(data);
        setShowRestoreConfirm(true);
      } catch {
        toast.error("Could not read backup file — make sure it is a valid JSON backup");
      }
    };
    input.click();
  };

  const handleRestoreConfirm = async () => {
    if (!pendingRestoreData) return;
    setRestoring(true);
    setShowRestoreConfirm(false);
    try {
      await adminApi.restore(pendingRestoreData);
      toast.success("Backup restored! Reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(getErrorMessage(err, "Restore failed"));
    } finally {
      setRestoring(false);
      setPendingRestoreData(null);
    }
  };

  /* ── Delete all ── */
  const handleDeleteAll = async () => {
    if (deleteConfirmText !== "DELETE ALL") return;
    setDeletingAll(true);
    setShowDeleteConfirm(false);
    setDeleteConfirmText("");
    try {
      await adminApi.deleteAll();
      toast.success("All data deleted. Reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    } finally {
      setDeletingAll(false);
    }
  };

  const activeFilterCount = [filterBrand, filterWarehouse, filterType, filterMillOwner, filterVehicle].filter(Boolean).length;

  /* ── Helpers ── */
  const stockName = (tx) => {
    if (tx.items?.length) {
      const first = tx.items[0];
      const brand = first.brand?.name || first.brand_name || "—";
      return tx.items.length > 1 ? `${brand} +${tx.items.length - 1}` : brand;
    }
    if (tx.stock) {
      return i18n.language === "ta" && tx.stock.brand_name_ta ? tx.stock.brand_name_ta : tx.stock.brand_name;
    }
    return "—";
  };

  const txBags = (tx) => tx.total_bags ?? tx.quantity_bags ?? 0;
  const txKg = (tx) => tx.total_weight_kg ?? tx.quantity_kg ?? 0;

  /* ── Aggregations ── */
  const chartData = useMemo(() => {
    const dailyMap = {};
    transactions.forEach((tx) => {
      const day = format(new Date(tx.transaction_date), "dd MMM");
      if (!dailyMap[day]) dailyMap[day] = { day, inbound: 0, outbound: 0 };
      if (tx.transaction_type === "inbound") dailyMap[day].inbound += txBags(tx);
      else dailyMap[day].outbound += txBags(tx);
    });
    return Object.values(dailyMap);
  }, [transactions]);

  const stockBreakdown = useMemo(() => {
    const map = {};
    stocks.forEach((s) => {
      const name = i18n.language === "ta" && s.brand_name_ta
        ? s.brand_name_ta : (s.brand_name || s.brand?.name || "—");
      if (!map[name]) map[name] = { name, bags: 0 };
      map[name].bags += s.total_bags ?? s.remaining_bags ?? 0;
    });
    return Object.values(map).filter((s) => s.bags > 0).sort((a, b) => b.bags - a.bags);
  }, [stocks, i18n.language]);

  const totals = useMemo(() => {
    let inbound = 0, outbound = 0, profit = 0, hasPL = false;
    transactions.forEach((tx) => {
      const bags = txBags(tx);
      if (tx.transaction_type === "inbound") inbound += bags;
      else {
        outbound += bags;
        // Prefer per-item prices (modern transactions); fall back to legacy global price fields
        const itemsWithBoth = (tx.items || []).filter(
          it => it.buying_price != null && it.selling_price != null
        );
        if (itemsWithBoth.length > 0) {
          itemsWithBoth.forEach(it => {
            const itBags = it.total_bags || 0;
            // Check per-weight prices first
            const weightsWithBoth = (it.weights || []).filter(
              w => w.buying_price != null && w.selling_price != null
            );
            if (weightsWithBoth.length > 0) {
              weightsWithBoth.forEach(w => {
                profit += (Number(w.selling_price) - Number(w.buying_price)) * (w.quantity || 0);
              });
            } else {
              profit += (Number(it.selling_price) - Number(it.buying_price)) * itBags;
            }
          });
          hasPL = true;
        } else if (tx.price != null && tx.sell_price != null) {
          profit += (Number(tx.sell_price) - Number(tx.price)) * bags;
          hasPL = true;
        }
      }
    });
    const totalBags = stocks.reduce((sum, s) => sum + (s.total_bags ?? s.remaining_bags ?? 0), 0);
    return { inbound, outbound, totalBags, profit, hasPL };
  }, [transactions, stocks]);

  /* ──────────────────────────────────────── RENDER ─────────────── */
  if (loading && transactions.length === 0) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="skeleton h-7" style={{ width: 160 }} />
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
        <div className="skeleton h-48 rounded-xl" />
        <div className="skeleton h-48 rounded-xl" />
      </div>
    );
  }

  const activePresetLabel = DATE_PRESETS.find((p) => p.key === activePreset)?.label || "Custom";

  return (
    <div className="space-y-3 animate-fade-in pb-4">

      {/* ══════════════════════════════════════════════════════
         COMPACT HEADER — title + quick action bar
         ══════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h1
            className="font-display font-extrabold text-[22px] tracking-tight leading-none"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            {t("nav.reports") || "Reports"}
          </h1>
          <button
            onClick={loadReport}
            disabled={loading}
            className="btn-ghost shrink-0"
            style={{ padding: "5px 7px" }}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="text-[11px] font-medium leading-tight" style={{ color: "var(--text-muted)" }}>
          {format(parseISO(dateFrom), "dd MMM")} – {format(parseISO(dateTo), "dd MMM yyyy")}
          <span style={{ color: "var(--text-muted)" }}> · </span>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>
            {transactions.length} {transactions.length === 1 ? "txn" : "txns"}
          </span>
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════
         STICKY ACTION BAR — date pill + filter + exports
         ══════════════════════════════════════════════════════ */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto"
        style={{
          padding: "2px 0",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {/* Date range pill (collapsible) */}
        <button
          onClick={() => setShowDateRange((v) => !v)}
          className="flex items-center gap-1.5 shrink-0"
          style={{
            padding: "7px 11px",
            borderRadius: 10,
            backgroundColor: showDateRange ? "var(--accent)" : "var(--bg-card)",
            color: showDateRange ? "#fff" : "var(--text-primary)",
            border: `1.5px solid ${showDateRange ? "var(--accent)" : "var(--border)"}`,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <Calendar size={13} />
          <span>{activePresetLabel}</span>
          {showDateRange ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* Filters */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 shrink-0 relative"
          style={{
            padding: "7px 11px",
            borderRadius: 10,
            backgroundColor: showFilters ? "var(--accent)" : "var(--bg-card)",
            color: showFilters ? "#fff" : "var(--text-primary)",
            border: `1.5px solid ${activeFilterCount > 0 || showFilters ? "var(--accent)" : "var(--border)"}`,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <Filter size={13} />
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: 8,
                backgroundColor: showFilters ? "rgba(255,255,255,0.25)" : "var(--accent)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Export buttons */}
        <button
          onClick={() => handleExport("csv")}
          disabled={exporting || transactions.length === 0}
          className="flex items-center gap-1 shrink-0"
          style={{
            padding: "7px 10px",
            borderRadius: 10,
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1.5px solid var(--border)",
            fontSize: 11,
            fontWeight: 700,
            cursor: transactions.length === 0 ? "not-allowed" : "pointer",
            opacity: transactions.length === 0 ? 0.5 : 1,
          }}
          title="Export CSV"
        >
          <FileText size={12} />
          CSV
        </button>
        <button
          onClick={() => handleExport("xlsx")}
          disabled={exporting || transactions.length === 0}
          className="flex items-center gap-1 shrink-0"
          style={{
            padding: "7px 10px",
            borderRadius: 10,
            background: "linear-gradient(135deg, var(--accent), var(--accent-hover, #5b21b6))",
            color: "#fff",
            border: "1.5px solid var(--accent)",
            fontSize: 11,
            fontWeight: 700,
            cursor: transactions.length === 0 ? "not-allowed" : "pointer",
            opacity: transactions.length === 0 ? 0.5 : 1,
            boxShadow: "var(--shadow-sm)",
          }}
          title="Export Excel"
        >
          <FileSpreadsheet size={12} />
          XLSX
        </button>

        {/* Admin-only: Backup / Import / Delete */}
        {isAdmin && (
          <>
            <div style={{ width: 1, height: 20, backgroundColor: "var(--border)", margin: "0 2px", alignSelf: "center" }} />

            {/* Backup */}
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="flex items-center gap-1 shrink-0"
              style={{
                padding: "7px 10px", borderRadius: 10,
                backgroundColor: "rgba(16,185,129,0.08)",
                color: "var(--success)",
                border: "1.5px solid rgba(16,185,129,0.3)",
                fontSize: 11, fontWeight: 700,
                cursor: backingUp ? "not-allowed" : "pointer",
                opacity: backingUp ? 0.6 : 1,
              }}
              title="Download full backup as JSON"
            >
              <Download size={12} />
              {backingUp ? "…" : "Backup"}
            </button>

            {/* Import / Restore */}
            <button
              onClick={handleRestoreFilePick}
              disabled={restoring}
              className="flex items-center gap-1 shrink-0"
              style={{
                padding: "7px 10px", borderRadius: 10,
                backgroundColor: "rgba(99,102,241,0.08)",
                color: "var(--accent)",
                border: "1.5px solid rgba(99,102,241,0.3)",
                fontSize: 11, fontWeight: 700,
                cursor: restoring ? "not-allowed" : "pointer",
                opacity: restoring ? 0.6 : 1,
              }}
              title="Restore data from a backup JSON file"
            >
              <Upload size={12} />
              {restoring ? "Restoring…" : "Import"}
            </button>

            {/* Delete All */}
            <button
              onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); }}
              disabled={deletingAll}
              className="flex items-center gap-1 shrink-0"
              style={{
                padding: "7px 10px", borderRadius: 10,
                backgroundColor: "rgba(239,68,68,0.08)",
                color: "var(--danger)",
                border: "1.5px solid rgba(239,68,68,0.3)",
                fontSize: 11, fontWeight: 700,
                cursor: deletingAll ? "not-allowed" : "pointer",
                opacity: deletingAll ? 0.6 : 1,
              }}
              title="Delete ALL data (irreversible)"
            >
              <Trash2 size={12} />
              {deletingAll ? "Deleting…" : "Delete All"}
            </button>
          </>
        )}
      </div>

      {/* ── Restore confirm modal ── */}
      {showRestoreConfirm && pendingRestoreData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-6 max-w-sm w-full space-y-4"
            style={{ backgroundColor: "var(--bg-card)", border: "1.5px solid var(--border)", boxShadow: "var(--shadow-xl)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(99,102,241,0.1)" }}>
                <Upload size={18} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Restore Backup?</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Created {pendingRestoreData.created_at?.slice(0, 10)} by {pendingRestoreData.created_by}
                </p>
              </div>
            </div>
            <div className="rounded-xl p-3 text-xs space-y-1"
              style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <p className="font-bold flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
                <AlertTriangle size={12} /> This will overwrite ALL current data
              </p>
              <p style={{ color: "var(--text-secondary)" }}>
                All existing transactions, stocks, brands, and users will be replaced with the backup data.
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => { setShowRestoreConfirm(false); setPendingRestoreData(null); }}>
                Cancel
              </button>
              <button className="btn-primary flex-1" onClick={handleRestoreConfirm}
                style={{ backgroundColor: "var(--accent)", border: "none" }}>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete All confirm modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-6 max-w-sm w-full space-y-4"
            style={{ backgroundColor: "var(--bg-card)", border: "1.5px solid rgba(239,68,68,0.4)", boxShadow: "var(--shadow-xl)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                <Trash2 size={18} style={{ color: "var(--danger)" }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>Delete All Data</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>This cannot be undone</p>
              </div>
            </div>
            <div className="rounded-xl p-3 text-xs space-y-1.5"
              style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="font-bold" style={{ color: "var(--danger)" }}>What will be deleted:</p>
              <p style={{ color: "var(--text-secondary)" }}>
                All transactions, stocks, brands, rice types, mill owners, and quality grades.
              </p>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                ✓ Users and warehouses will be kept.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Type <span className="font-bold" style={{ color: "var(--danger)" }}>DELETE ALL</span> to confirm:
              </p>
              <input
                className="input-field"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE ALL"
                style={{ borderColor: deleteConfirmText === "DELETE ALL" ? "var(--danger)" : undefined }}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}>
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deleteConfirmText !== "DELETE ALL"}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  backgroundColor: deleteConfirmText === "DELETE ALL" ? "var(--danger)" : "rgba(239,68,68,0.2)",
                  color: deleteConfirmText === "DELETE ALL" ? "#fff" : "var(--danger)",
                  border: "none",
                  cursor: deleteConfirmText !== "DELETE ALL" ? "not-allowed" : "pointer",
                }}
              >
                Delete All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         DATE RANGE PANEL — only when expanded
         ══════════════════════════════════════════════════════ */}
      {showDateRange && (
        <div
          className="card animate-scale-in"
          style={{ padding: 12 }}
        >
          {/* Preset chips — horizontally scrollable */}
          <div
            className="flex gap-1.5 overflow-x-auto pb-1 mb-3"
            style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
          >
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className="shrink-0"
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  backgroundColor: activePreset === p.key ? "var(--accent)" : "var(--bg-secondary)",
                  color: activePreset === p.key ? "#fff" : "var(--text-secondary)",
                  border: `1px solid ${activePreset === p.key ? "var(--accent)" : "var(--border)"}`,
                  whiteSpace: "nowrap",
                  transition: "all 0.12s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs — compact */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" style={{ fontSize: 9, marginBottom: 3 }}>From</label>
              <input
                type="date"
                className="input-field"
                style={{ fontSize: 12, padding: "6px 8px", height: 34 }}
                value={dateFrom}
                max={dateTo}
                onChange={(e) => { setDateFrom(e.target.value); setActivePreset(""); }}
              />
            </div>
            <div>
              <label className="label" style={{ fontSize: 9, marginBottom: 3 }}>To</label>
              <input
                type="date"
                className="input-field"
                style={{ fontSize: 12, padding: "6px 8px", height: 34 }}
                value={dateTo}
                min={dateFrom}
                max={fmtDate(new Date())}
                onChange={(e) => { setDateTo(e.target.value); setActivePreset(""); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         FILTERS PANEL
         ══════════════════════════════════════════════════════ */}
      {showFilters && (
        <div className="card animate-scale-in" style={{ padding: 12 }}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Filters
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-[11px] font-bold"
                style={{
                  color: "var(--danger)", background: "none", border: "none",
                  cursor: "pointer", padding: 0,
                }}
              >
                <X size={11} /> Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" style={{ fontSize: 9, marginBottom: 3 }}>Type</label>
              <select
                className="input-field"
                style={{ fontSize: 12, padding: "6px 8px", height: 34 }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="inbound">Arrival</option>
                <option value="outbound">Send</option>
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 9, marginBottom: 3 }}>Brand</label>
              <select
                className="input-field"
                style={{ fontSize: 12, padding: "6px 8px", height: 34 }}
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
            <div className="col-span-2">
              <label className="label" style={{ fontSize: 9, marginBottom: 3 }}>Warehouse</label>
              <select
                className="input-field"
                style={{ fontSize: 12, padding: "6px 8px", height: 34 }}
                value={filterWarehouse}
                onChange={(e) => setFilterWarehouse(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <>
                <div className="col-span-2">
                  <label className="label flex items-center gap-1" style={{ fontSize: 9, marginBottom: 3 }}>
                    <User size={9} /> Mill Owner
                  </label>
                  <select
                    className="input-field"
                    style={{ fontSize: 12, padding: "6px 8px", height: 34 }}
                    value={filterMillOwner}
                    onChange={(e) => setFilterMillOwner(e.target.value)}
                  >
                    <option value="">All Mill Owners</option>
                    {millOwners.map((m) => (<option key={m.id} value={m.name}>{m.name}</option>))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label flex items-center gap-1" style={{ fontSize: 9, marginBottom: 3 }}>
                    <Truck size={9} /> Vehicle
                  </label>
                  <input
                    type="text"
                    className="input-field uppercase"
                    placeholder="TN 01 AB 1234"
                    value={filterVehicle}
                    onChange={(e) => setFilterVehicle(e.target.value.toUpperCase())}
                    style={{
                      fontSize: 12, padding: "6px 8px", height: 34,
                      letterSpacing: "0.08em", fontFamily: "ui-monospace, monospace",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         SUMMARY GRID — compact 2x2 (or 2x2 + P/L on admin)
         ══════════════════════════════════════════════════════ */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: isAdmin && totals.hasPL ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
        }}
      >
        {/* Total Stock */}
        <div
          className="rounded-xl"
          style={{
            padding: "12px 10px",
            backgroundColor: "var(--accent-soft)",
            border: "1.5px solid var(--accent-muted, var(--accent))",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Package size={11} style={{ color: "var(--accent)" }} />
            <span
              className="text-[8px] font-extrabold uppercase tracking-wider leading-none"
              style={{ color: "var(--accent)" }}
            >
              {i18n.language === "ta" ? "மொத்தம்" : "Stock"}
            </span>
          </div>
          <div
            className="font-extrabold tabular-nums leading-none"
            style={{ color: "var(--accent)", fontSize: 22, letterSpacing: "-0.02em" }}
          >
            {totals.totalBags.toLocaleString()}
          </div>
          <div className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
            bags
          </div>
        </div>

        {/* Inbound */}
        <div
          className="rounded-xl"
          style={{
            padding: "12px 10px",
            backgroundColor: "var(--success-soft)",
            border: "1.5px solid var(--success)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp size={11} style={{ color: "var(--success)" }} />
            <span
              className="text-[8px] font-extrabold uppercase tracking-wider leading-none"
              style={{ color: "var(--success-text, var(--success))" }}
            >
              {i18n.language === "ta" ? "வரவு" : "In"}
            </span>
          </div>
          <div
            className="font-extrabold tabular-nums leading-none"
            style={{ color: "var(--success-text, var(--success))", fontSize: 22, letterSpacing: "-0.02em" }}
          >
            {totals.inbound.toLocaleString()}
          </div>
          <div className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
            bags in
          </div>
        </div>

        {/* Outbound */}
        <div
          className="rounded-xl"
          style={{
            padding: "12px 10px",
            backgroundColor: "var(--danger-soft)",
            border: "1.5px solid var(--danger)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown size={11} style={{ color: "var(--danger)" }} />
            <span
              className="text-[8px] font-extrabold uppercase tracking-wider leading-none"
              style={{ color: "var(--danger-text, var(--danger))" }}
            >
              {i18n.language === "ta" ? "செலவு" : "Out"}
            </span>
          </div>
          <div
            className="font-extrabold tabular-nums leading-none"
            style={{ color: "var(--danger-text, var(--danger))", fontSize: 22, letterSpacing: "-0.02em" }}
          >
            {totals.outbound.toLocaleString()}
          </div>
          <div className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
            bags out
          </div>
        </div>

        {/* Profit/Loss (admin only) */}
        {isAdmin && totals.hasPL && (
          <div
            className="rounded-xl"
            style={{
              padding: "12px 10px",
              backgroundColor: totals.profit > 0 ? "var(--success-soft)"
                : totals.profit < 0 ? "var(--danger-soft)" : "var(--bg-secondary)",
              border: `1.5px solid ${totals.profit > 0 ? "var(--success)"
                : totals.profit < 0 ? "var(--danger)" : "var(--border)"}`,
            }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <IndianRupee
                size={11}
                style={{
                  color: totals.profit > 0 ? "var(--success)"
                    : totals.profit < 0 ? "var(--danger)" : "var(--text-primary)",
                }}
              />
              <span
                className="text-[8px] font-extrabold uppercase tracking-wider leading-none"
                style={{
                  color: totals.profit > 0 ? "var(--success-text, var(--success))"
                    : totals.profit < 0 ? "var(--danger-text, var(--danger))" : "var(--text-primary)",
                }}
              >
                P/L
              </span>
            </div>
            <div
              className="font-extrabold tabular-nums leading-none"
              style={{
                color: totals.profit > 0 ? "var(--success-text, var(--success))"
                  : totals.profit < 0 ? "var(--danger-text, var(--danger))" : "var(--text-primary)",
                fontSize: 18,
                letterSpacing: "-0.02em",
              }}
            >
              {totals.profit >= 0 ? "+" : "−"}₹{Math.abs(totals.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
              net total
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
         DAILY MOVEMENT CHART
         ══════════════════════════════════════════════════════ */}
      <CollapsibleSection
        title={i18n.language === "ta" ? "தினசரி இயக்கம்" : "Daily Movement"}
        subtitle={`${chartData.length} day${chartData.length !== 1 ? "s" : ""}`}
        icon={BarChart3}
        iconColor="var(--accent)"
        iconBg="var(--accent-soft)"
        defaultOpen={chartData.length > 0}
      >
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={2} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 11,
                    boxShadow: "var(--shadow-md)",
                    padding: "6px 10px",
                  }}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                />
                <Bar
                  dataKey="inbound"
                  name={i18n.language === "ta" ? "வரவு" : "In"}
                  fill="var(--success)"
                  radius={[3, 3, 0, 0]}
                  barSize={10}
                />
                <Bar
                  dataKey="outbound"
                  name={i18n.language === "ta" ? "செலவு" : "Out"}
                  fill="var(--danger)"
                  radius={[3, 3, 0, 0]}
                  barSize={10}
                />
              </BarChart>
            </ResponsiveContainer>

            <div
              className="flex items-center justify-center gap-5 mt-2 pt-2"
              style={{ borderTop: "1px solid var(--border-light)" }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--success)" }} />
                <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "வரவு" : "Inbound"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--danger)" }} />
                <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "செலவு" : "Outbound"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: "24px 12px" }}>
            <div className="empty-state-icon"><BarChart3 size={18} /></div>
            <p className="empty-state-text" style={{ fontSize: 12 }}>
              {i18n.language === "ta" ? "தரவு இல்லை" : "No data in selected range"}
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* ══════════════════════════════════════════════════════
         STOCK BY BRAND
         ══════════════════════════════════════════════════════ */}
      <CollapsibleSection
        title={i18n.language === "ta" ? "பிராண்ட் வாரியான கையிருப்பு" : "Stock by Brand"}
        subtitle={`${stockBreakdown.length} brand${stockBreakdown.length !== 1 ? "s" : ""}`}
        icon={Package}
        iconColor="var(--warning)"
        iconBg="var(--warning-soft)"
        defaultOpen={stockBreakdown.length > 0}
      >
        {stockBreakdown.length > 0 ? (
          <div className="space-y-1.5">
            {stockBreakdown.map((item, i) => {
              const maxBags = Math.max(...stockBreakdown.map((s) => s.bags));
              const percentage = (item.bags / maxBags) * 100;
              return (
                <div
                  key={i}
                  className="rounded-lg"
                  style={{
                    padding: "8px 10px",
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[12px] font-bold truncate flex-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.name}
                    </span>
                    <span
                      className="text-[14px] font-extrabold tabular-nums shrink-0 ml-2"
                      style={{ color: "var(--accent)", letterSpacing: "-0.02em" }}
                    >
                      {item.bags.toLocaleString()}
                      <span className="text-[9px] font-medium ml-1" style={{ color: "var(--text-muted)" }}>
                        bags
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      backgroundColor: "var(--bg-card)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, var(--accent), #8b5cf6)",
                        borderRadius: 999,
                        transition: "width 0.4s",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "24px 12px" }}>
            <div className="empty-state-icon"><Package size={18} /></div>
            <p className="empty-state-text" style={{ fontSize: 12 }}>
              {i18n.language === "ta" ? "கையிருப்பு இல்லை" : "No stock yet"}
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* ══════════════════════════════════════════════════════
         RECENT TRANSACTIONS
         ══════════════════════════════════════════════════════ */}
      <CollapsibleSection
        title={i18n.language === "ta" ? "பரிவர்த்தனைகள்" : "Transactions"}
        subtitle={`${transactions.length} record${transactions.length !== 1 ? "s" : ""}`}
        icon={ArrowLeftRight}
        iconColor="#8b5cf6"
        iconBg="rgba(139,92,246,0.1)"
        defaultOpen={true}
      >
        {transactions.length > 0 ? (
          <>
            {/* Mobile compact list */}
            <div className="md:hidden space-y-1.5">
              {transactions.slice(0, 50).map((tx) => {
                const isInbound = tx.transaction_type === "inbound";
                const diff = (tx.price != null && tx.sell_price != null)
                  ? Number(tx.sell_price) - Number(tx.price) : null;
                return (
                  <div
                    key={tx.id}
                    className="rounded-lg overflow-hidden"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-light)",
                      borderLeftWidth: 3,
                      borderLeftColor: isInbound ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    <div className="flex items-center gap-2.5" style={{ padding: "9px 10px" }}>
                      {/* Icon */}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: isInbound ? "var(--success-soft)" : "var(--danger-soft)" }}
                      >
                        {isInbound
                          ? <TrendingUp size={13} style={{ color: "var(--success)" }} />
                          : <TrendingDown size={13} style={{ color: "var(--danger)" }} />}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[12px] font-extrabold truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {stockName(tx)}
                          </span>
                          {isAdmin && diff != null && (
                            <span
                              className="text-[9px] font-extrabold tabular-nums px-1 rounded"
                              style={{
                                color: diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--text-muted)",
                                backgroundColor: diff > 0 ? "var(--success-soft)"
                                  : diff < 0 ? "var(--danger-soft)" : "var(--bg-card)",
                                padding: "1px 5px",
                              }}
                            >
                              {diff > 0 ? "+" : ""}{diff.toFixed(0)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-[10px] font-mono font-bold"
                            style={{ color: "var(--text-secondary)", letterSpacing: "0.05em" }}
                          >
                            {tx.vehicle_number || "—"}
                          </span>
                          <span style={{ color: "var(--border)" }}>·</span>
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {format(new Date(tx.transaction_date), "dd MMM, HH:mm")}
                          </span>
                        </div>
                      </div>

                      {/* Bags */}
                      <div className="text-right shrink-0">
                        <div
                          className="font-extrabold tabular-nums leading-none"
                          style={{
                            color: isInbound ? "var(--success)" : "var(--danger)",
                            fontSize: 15,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {isInbound ? "+" : "−"}{txBags(tx)}
                        </div>
                        <div className="text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {txKg(tx).toFixed(0)} kg
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {transactions.length > 50 && (
                <p
                  className="text-center text-[10px] font-medium pt-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Showing 50 of {transactions.length} · Export to see all
                </p>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Vehicle / Driver</th>
                    <th>Brand</th>
                    <th className="text-right">Bags</th>
                    <th className="text-right">KG</th>
                    {isAdmin && <th className="text-right">Buy</th>}
                    {isAdmin && <th className="text-right">Sell</th>}
                    {isAdmin && <th className="text-right">P/L</th>}
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 100).map((tx) => {
                    const isInbound = tx.transaction_type === "inbound";
                    const diff = (tx.price != null && tx.sell_price != null)
                      ? Number(tx.sell_price) - Number(tx.price) : null;
                    return (
                      <tr key={tx.id}>
                        <td className="text-xs tabular-nums">
                          {format(new Date(tx.transaction_date), "dd MMM, HH:mm")}
                        </td>
                        <td>
                          <span className={`badge ${isInbound ? "badge-success" : "badge-danger"}`}>
                            {isInbound ? "Arrival" : "Send"}
                          </span>
                        </td>
                        <td>
                          <div className="text-xs font-bold">{tx.vehicle_number || "—"}</div>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {tx.driver_name || "—"}
                          </div>
                        </td>
                        <td className="font-medium">{stockName(tx)}</td>
                        <td className="text-right font-bold tabular-nums">{txBags(tx)}</td>
                        <td className="text-right tabular-nums text-xs">{txKg(tx).toFixed(1)}</td>
                        {isAdmin && (
                          <td className="text-right tabular-nums text-xs">
                            {tx.price != null ? `₹${tx.price}` : "—"}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="text-right tabular-nums text-xs">
                            {tx.sell_price != null ? `₹${tx.sell_price}` : "—"}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="text-right">
                            {diff != null ? (
                              <span
                                className="font-bold tabular-nums"
                                style={{
                                  color: diff > 0 ? "var(--success)"
                                    : diff < 0 ? "var(--danger)" : "var(--text-primary)",
                                }}
                              >
                                {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {transactions.length > 100 && (
                <p
                  className="text-center text-[11px] font-medium pt-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Showing 100 of {transactions.length} · Export to see all
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: "24px 12px" }}>
            <div className="empty-state-icon"><ArrowLeftRight size={18} /></div>
            <p className="empty-state-title" style={{ fontSize: 13 }}>No transactions</p>
            <p className="empty-state-text" style={{ fontSize: 11 }}>
              No records match your filters
            </p>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}