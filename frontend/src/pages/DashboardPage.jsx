import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Warehouse, Package, TrendingUp, TrendingDown,
  AlertTriangle, ArrowRight, Activity
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { dashboardApi } from "../utils/api";
import StatCard from "../components/common/StatCard";
import StockLevelBar from "../components/common/StockLevelBar";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getSummary()
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "transparent" }}
          />
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            {t("common.loading")}
          </span>
        </div>
      </div>
    );

  const txTypeColor = (type) =>
    type === "inbound" ? "badge-success" : "badge-danger";
  const txTypeLabel = (type) =>
    type === "inbound" ? t("transaction.inbound") : t("transaction.outbound");

  const chartData =
    data?.warehouse_summary?.map((w) => ({
      name:
        i18n.language === "ta" && w.location_name_ta
          ? w.location_name_ta
          : w.location_name,
      bags: w.total_bags,
      pct: w.stock_percentage,
    })) || [];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Page Header ──────────────────────────────── */}
      <div>
        <h1
          className="font-display font-extrabold text-2xl tracking-tight"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          {t("dashboard.title")}
        </h1>
        <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
          {format(new Date(), "EEEE, dd MMMM yyyy")}
        </p>
      </div>

      {/* ── Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Warehouse}
          label={t("dashboard.totalWarehouses")}
          value={data?.total_warehouses ?? 0}
          color="brand"
        />
        <StatCard
          icon={Package}
          label={t("dashboard.totalStockTypes")}
          value={data?.total_stock_types ?? 0}
          color="blue"
        />
        <StatCard
          icon={TrendingUp}
          label={t("dashboard.inboundToday")}
          value={`${data?.total_inbound_today ?? 0} ${t("dashboard.bags")}`}
          color="green"
        />
        <StatCard
          icon={TrendingDown}
          label={t("dashboard.outboundToday")}
          value={`${data?.total_outbound_today ?? 0} ${t("dashboard.bags")}`}
          color="amber"
        />
      </div>

      {/* ── Total Stock Banner ───────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))",
          borderRadius: "var(--radius-xl, 16px)",
          padding: "20px 24px",
          boxShadow: "var(--shadow-accent-lg, 0 8px 32px rgba(99,102,241,0.3))",
        }}
      >
        {/* Decorative elements */}
        <div
          style={{
            position: "absolute",
            top: "-30%",
            right: "-5%",
            width: "200px",
            height: "200px",
            background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)",
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-40%",
            left: "10%",
            width: "150px",
            height: "150px",
            background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)",
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />

        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              {t("dashboard.totalStock")}
            </p>
            <p className="text-3xl font-display font-extrabold text-white mt-1.5 tracking-tight">
              {data?.total_bags?.toLocaleString() ?? 0}
              <span className="text-base font-medium ml-2 text-white/70">
                {t("dashboard.bags")}
              </span>
            </p>
            <p className="text-xs text-white/50 mt-1 font-medium">
              {((data?.total_stock_kg ?? 0) / 1000).toFixed(2)} {t("dashboard.tonnes")}
            </p>
          </div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            <Activity size={26} className="text-white/60" />
          </div>
        </div>
      </div>

      {/* ── Charts & Alerts Grid ─────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Warehouse Summary */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="font-semibold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {t("dashboard.warehouseSummary")}
              </h2>
              <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Current Stock by Brand
              </p>
            </div>
            <Link
              to="/warehouses"
              className="text-[11px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: "var(--accent)",
                backgroundColor: "var(--accent-soft)",
              }}
            >
              {t("common.view")} <ArrowRight size={11} />
            </Link>
          </div>

          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={24} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 11,
                      boxShadow: "var(--shadow-md)",
                    }}
                    formatter={(v) => [`${v} bags`, "Stock"]}
                  />
                  <Bar dataKey="bags" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.pct < 20
                            ? "#ef4444"
                            : entry.pct < 50
                            ? "#f59e0b"
                            : "var(--accent)"
                        }
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Progress bars */}
              <div className="space-y-3 mt-5 pt-4" style={{ borderTop: "1px solid var(--border-light)" }}>
                {data?.warehouse_summary?.map((w) => (
                  <div key={w.id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {i18n.language === "ta" && w.location_name_ta
                          ? w.location_name_ta
                          : w.location_name}
                      </span>
                      <span
                        className="text-[10px] font-semibold tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {w.total_bags} bags
                      </span>
                    </div>
                    <StockLevelBar percentage={w.stock_percentage} showLabel={false} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div
              className="h-40 flex flex-col items-center justify-center gap-2"
              style={{ color: "var(--text-muted)" }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <Warehouse size={20} style={{ color: "var(--text-muted)" }} />
              </div>
              <span className="text-xs font-medium">{t("common.noData")}</span>
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(239,68,68,0.08)" }}
            >
              <AlertTriangle size={14} style={{ color: "#ef4444" }} />
            </div>
            <div>
              <h2
                className="font-semibold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {t("dashboard.lowStock")}
              </h2>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Items below threshold
              </p>
            </div>
          </div>

          {data?.low_stock_items?.length > 0 ? (
            <div className="space-y-1">
              {data.low_stock_items.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors"
                  style={{
                    borderBottom: "none",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {i18n.language === "ta" && s.brand_name_ta
                        ? s.brand_name_ta
                        : s.brand_name}
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {i18n.language === "ta" && s.rice_type_ta
                        ? s.rice_type_ta
                        : s.rice_type}
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor:
                        s.remaining_bags === 0
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(245,158,11,0.1)",
                      color: s.remaining_bags === 0 ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    {s.remaining_bags} {t("dashboard.bags")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(16,185,129,0.08)" }}
              >
                <Package size={20} style={{ color: "#10b981" }} />
              </div>
              <div className="text-center">
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  All stocks healthy!
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  No items below threshold
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Transactions ──────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {t("dashboard.recentTransactions")}
            </h2>
            <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Latest activity
            </p>
          </div>
          <Link
            to="/transactions"
            className="text-[11px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: "var(--accent)",
              backgroundColor: "var(--accent-soft)",
            }}
          >
            {t("common.view")} all <ArrowRight size={11} />
          </Link>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("stock.title")}</th>
                <th>{t("warehouse.title")}</th>
                <th className="text-right">{t("transaction.quantity")}</th>
                <th className="text-center">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.recent_transactions?.length > 0 ? (
                data.recent_transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="text-xs tabular-nums">
                      {format(new Date(tx.transaction_date), "dd MMM, HH:mm")}
                    </td>
                    <td className="font-medium">
                      {i18n.language === "ta" && tx.stock?.brand_name_ta
                        ? tx.stock.brand_name_ta
                        : tx.stock?.brand_name}
                    </td>
                    <td>
                      {i18n.language === "ta" && tx.warehouse?.location_name_ta
                        ? tx.warehouse.location_name_ta
                        : tx.warehouse?.location_name}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {tx.quantity_bags}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${txTypeColor(tx.transaction_type)}`}>
                        {txTypeLabel(tx.transaction_type)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("common.noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {data?.recent_transactions?.length > 0 ? (
            data.recent_transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {i18n.language === "ta" && tx.stock?.brand_name_ta
                      ? tx.stock.brand_name_ta
                      : tx.stock?.brand_name}
                  </div>
                  <div
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {i18n.language === "ta" && tx.warehouse?.location_name_ta
                      ? tx.warehouse.location_name_ta
                      : tx.warehouse?.location_name}{" "}
                    · {format(new Date(tx.transaction_date), "dd MMM")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {tx.quantity_bags}
                  </span>
                  <span
                    className={`badge text-[10px] ${txTypeColor(tx.transaction_type)}`}
                  >
                    {txTypeLabel(tx.transaction_type)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div
              className="flex flex-col items-center justify-center py-8 gap-2"
              style={{ color: "var(--text-muted)" }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <ArrowRight size={20} style={{ color: "var(--text-muted)" }} />
              </div>
              <span className="text-xs font-medium">{t("common.noData")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}