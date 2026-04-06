import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3, Package, TrendingUp, TrendingDown,
  ArrowLeftRight
} from "lucide-react";
import { format } from "date-fns";
import { transactionApi, stockApi, warehouseApi } from "../utils/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid
} from "recharts";

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      stockApi.list().then((r) => setStocks(r.data)),
      transactionApi.list({ limit: 200 }).then((r) => setTransactions(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const stockName = (s) =>
    s
      ? i18n.language === "ta" && s.brand_name_ta
        ? s.brand_name_ta
        : s.brand_name
      : "—";

  // Build daily chart data
  const dailyMap = {};
  transactions.forEach((tx) => {
    const day = format(new Date(tx.transaction_date), "dd MMM");
    if (!dailyMap[day]) dailyMap[day] = { day, inbound: 0, outbound: 0 };
    if (tx.transaction_type === "inbound") dailyMap[day].inbound += tx.quantity_bags;
    else dailyMap[day].outbound += tx.quantity_bags;
  });
  const chartData = Object.values(dailyMap).slice(-14);

  // Stock breakdown
  const stockBreakdown = stocks
    .map((s) => ({
      name: stockName(s),
      bags: s.remaining_bags,
    }))
    .filter((s) => s.bags > 0);

  // Summary stats
  const totalInbound = transactions
    .filter((tx) => tx.transaction_type === "inbound")
    .reduce((sum, tx) => sum + tx.quantity_bags, 0);
  const totalOutbound = transactions
    .filter((tx) => tx.transaction_type === "outbound")
    .reduce((sum, tx) => sum + tx.quantity_bags, 0);
  const totalBags = stocks.reduce((sum, s) => sum + s.remaining_bags, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "transparent" }}
        />
        <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          {t("common.loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────── */}
      <div>
        <h1
          className="font-display font-extrabold text-2xl tracking-tight"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          {t("nav.reports")}
        </h1>
        <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
          {i18n.language === "ta"
            ? "பகுப்பாய்வு மற்றும் அறிக்கைகள்"
            : "Analytics & Reports"}
        </p>
      </div>

      {/* ── Overview Summary Cards ────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className="text-center p-4 rounded-xl"
          style={{
            backgroundColor: "var(--accent-soft)",
            border: "1px solid var(--accent)20",
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2"
            style={{ backgroundColor: "var(--accent)15" }}
          >
            <Package size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div
            className="text-xl font-extrabold tabular-nums"
            style={{ color: "var(--accent)", letterSpacing: "-0.02em" }}
          >
            {totalBags.toLocaleString()}
          </div>
          <div
            className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {i18n.language === "ta" ? "மொத்த கையிருப்பு" : "Total Stock"}
          </div>
        </div>

        <div
          className="text-center p-4 rounded-xl"
          style={{
            backgroundColor: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.15)",
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2"
            style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
          >
            <TrendingUp size={18} style={{ color: "#10b981" }} />
          </div>
          <div
            className="text-xl font-extrabold tabular-nums"
            style={{ color: "#10b981", letterSpacing: "-0.02em" }}
          >
            {totalInbound.toLocaleString()}
          </div>
          <div
            className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {i18n.language === "ta" ? "மொத்த வரவு" : "Total In"}
          </div>
        </div>

        <div
          className="text-center p-4 rounded-xl"
          style={{
            backgroundColor: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2"
            style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
          >
            <TrendingDown size={18} style={{ color: "#ef4444" }} />
          </div>
          <div
            className="text-xl font-extrabold tabular-nums"
            style={{ color: "#ef4444", letterSpacing: "-0.02em" }}
          >
            {totalOutbound.toLocaleString()}
          </div>
          <div
            className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {i18n.language === "ta" ? "மொத்த செலவு" : "Total Out"}
          </div>
        </div>
      </div>

      {/* ── Daily Movement Chart ─────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--accent-soft)" }}
            >
              <BarChart3 size={16} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h2
                className="font-bold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {i18n.language === "ta"
                  ? "தினசரி கையிருப்பு இயக்கம்"
                  : "Daily Stock Movement"}
              </h2>
              <p
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {i18n.language === "ta" ? "கடந்த 14 நாட்கள்" : "Last 14 Days"}
              </p>
            </div>
          </div>
        </div>

        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-light)"
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: "var(--shadow-md)",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="inbound"
                  name={i18n.language === "ta" ? "வரவு" : "Inbound"}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={14}
                />
                <Bar
                  dataKey="outbound"
                  name={i18n.language === "ta" ? "செலவு" : "Outbound"}
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  barSize={14}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Mobile legend */}
            <div
              className="md:hidden flex items-center justify-center gap-6 mt-3 pt-3"
              style={{ borderTop: "1px solid var(--border-light)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#10b981" }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "வரவு" : "Inbound"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#ef4444" }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i18n.language === "ta" ? "செலவு" : "Outbound"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <BarChart3 size={20} style={{ color: "var(--text-muted)" }} />
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta"
                ? "தரவு இல்லை"
                : t("common.noData")}
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta"
                ? "பரிவர்த்தனைகள் சேர்க்கப்பட்டவுடன் விளக்கப்படம் தோன்றும்"
                : "Chart will appear once transactions are recorded"}
            </span>
          </div>
        )}
      </div>

      {/* ── Stock Breakdown ──────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(245,158,11,0.1)" }}
          >
            <Package size={16} style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h2
              className="font-bold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {i18n.language === "ta"
                ? "பிராண்ட் வாரியான கையிருப்பு"
                : "Current Stock by Brand"}
            </h2>
            <p
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta" ? "மூட்டைகள் மீதம்" : "Bags remaining"}
            </p>
          </div>
        </div>

        {stockBreakdown.length > 0 ? (
          <>
            {/* Desktop chart */}
            <div className="hidden sm:block">
              <ResponsiveContainer
                width="100%"
                height={Math.max(120, stockBreakdown.length * 45)}
              >
                <BarChart data={stockBreakdown} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    width={100}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "var(--shadow-md)",
                    }}
                  />
                  <Bar
                    dataKey="bags"
                    name={i18n.language === "ta" ? "மூட்டை" : "Bags"}
                    fill="var(--accent)"
                    radius={[0, 6, 6, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Mobile stock list */}
            <div className="sm:hidden space-y-2">
              {stockBreakdown
                .sort((a, b) => b.bags - a.bags)
                .map((item, i) => {
                  const maxBags = Math.max(
                    ...stockBreakdown.map((s) => s.bags)
                  );
                  const percentage = (item.bags / maxBags) * 100;

                  return (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-sm font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {item.name}
                        </span>
                        <span
                          className="text-base font-extrabold tabular-nums"
                          style={{ color: "var(--accent)" }}
                        >
                          {item.bags.toLocaleString()}
                          <span
                            className="text-[10px] font-medium ml-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {i18n.language === "ta" ? "மூட்டை" : "bags"}
                          </span>
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div
                        className="w-full h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--border-light)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            background:
                              "linear-gradient(90deg, var(--accent), var(--accent-hover))",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <Package size={20} style={{ color: "var(--text-muted)" }} />
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta"
                ? "கையிருப்பு தரவு இல்லை"
                : "No stock data available"}
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {i18n.language === "ta"
                ? "பொருட்கள் சேர்க்கப்பட்டவுடன் தோன்றும்"
                : "Will appear once stocks are added"}
            </span>
          </div>
        )}
      </div>

      {/* ── Recent Activity Summary ──────────────────── */}
      {transactions.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(139,92,246,0.08)" }}
            >
              <ArrowLeftRight size={16} style={{ color: "#8b5cf6" }} />
            </div>
            <div>
              <h2
                className="font-bold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {i18n.language === "ta"
                  ? "சமீபத்திய செயல்பாடு"
                  : "Recent Activity"}
              </h2>
              <p
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {i18n.language === "ta"
                  ? "கடைசி 10 பரிவர்த்தனைகள்"
                  : "Last 10 transactions"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {transactions.slice(0, 10).map((tx) => {
              const isInbound = tx.transaction_type === "inbound";
              const typeColor = isInbound ? "#10b981" : "#ef4444";
              const typeBg = isInbound
                ? "rgba(16,185,129,"
                : "rgba(239,68,68,";

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  {/* Type icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${typeBg}0.1)` }}
                  >
                    {isInbound ? (
                      <TrendingUp size={15} style={{ color: typeColor }} />
                    ) : (
                      <TrendingDown size={15} style={{ color: typeColor }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm font-bold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {stockName(tx.stock)}
                      </span>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: `${typeBg}0.1)`,
                          color: typeColor,
                        }}
                      >
                        {isInbound
                          ? i18n.language === "ta"
                            ? "வரவு"
                            : "IN"
                          : i18n.language === "ta"
                          ? "செலவு"
                          : "OUT"}
                      </span>
                    </div>
                    <div
                      className="text-[11px] mt-0.5 truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {format(
                        new Date(tx.transaction_date),
                        "dd MMM yyyy, HH:mm"
                      )}
                      {(tx.source || tx.destination) &&
                        ` · ${tx.source || tx.destination}`}
                    </div>
                  </div>

                  {/* Bags */}
                  <span
                    className="text-base font-extrabold tabular-nums shrink-0"
                    style={{ color: typeColor }}
                  >
                    {tx.quantity_bags}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}