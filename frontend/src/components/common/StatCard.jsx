import React from "react";

export default function StatCard({ icon: Icon, label, value, sub, color = "brand", trend, onClick }) {
  const styles = {
    brand:  { bg: "var(--accent-soft)",      icon: "var(--accent)",  border: "var(--accent)" },
    green:  { bg: "rgba(16,185,129,0.08)",   icon: "#10b981",       border: "#10b981" },
    blue:   { bg: "rgba(59,130,246,0.08)",   icon: "#3b82f6",       border: "#3b82f6" },
    red:    { bg: "rgba(239,68,68,0.08)",    icon: "#ef4444",       border: "#ef4444" },
    purple: { bg: "rgba(139,92,246,0.08)",   icon: "#8b5cf6",       border: "#8b5cf6" },
    amber:  { bg: "rgba(245,158,11,0.08)",   icon: "#f59e0b",       border: "#f59e0b" },
  };
  const c = styles[color] || styles.brand;

  return (
    <div
      className={`group relative overflow-hidden ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl, 16px)",
        padding: "16px",
        transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = "var(--shadow-md)";
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.borderColor = c.border;
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "16px",
          right: "16px",
          height: "2px",
          background: c.icon,
          borderRadius: "0 0 2px 2px",
          opacity: 0.6,
        }}
      />

      {/* Header row: icon + trend */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: c.bg }}
        >
          <Icon size={18} style={{ color: c.icon }} />
        </div>
        {trend !== undefined && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: trend >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              color: trend >= 0 ? "#10b981" : "#ef4444",
            }}
          >
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>

      {/* Value */}
      <div
        className="text-xl font-extrabold font-display leading-none tracking-tight"
        style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>

      {/* Label */}
      <div
        className="text-[11px] font-medium mt-1.5 uppercase tracking-wider"
        style={{ color: "var(--text-muted)", letterSpacing: "0.04em" }}
      >
        {label}
      </div>

      {/* Sub text */}
      {sub && (
        <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
          {sub}
        </div>
      )}
    </div>
  );
}