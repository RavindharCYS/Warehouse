import React from "react";

export default function StockLevelBar({ percentage, showLabel = true, color }) {
  const pct = Math.min(100, Math.max(0, percentage));

  const getColor = () => {
    if (color) return color;
    if (pct < 20) return "#ef4444";
    if (pct < 50) return "#f59e0b";
    if (pct < 80) return "#10b981";
    return "var(--accent)";
  };

  const barColor = getColor();

  return (
    <div className="w-full">
      <div
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "var(--radius-full, 9999px)",
          backgroundColor: "var(--bg-secondary)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Background pattern for empty area */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.3,
            background: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 4px,
              var(--border-light) 4px,
              var(--border-light) 5px
            )`,
          }}
        />

        {/* Fill bar */}
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: "var(--radius-full, 9999px)",
            background: `linear-gradient(90deg, ${barColor}, ${barColor}dd)`,
            transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
            position: "relative",
            minWidth: pct > 0 ? "4px" : "0px",
          }}
        >
          {/* Shine effect */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)",
            }}
          />
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1.5">
            {/* Color dot */}
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                backgroundColor: barColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              className="text-[10px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {pct < 20
                ? "Critical"
                : pct < 50
                ? "Low"
                : pct < 80
                ? "Good"
                : "Optimal"}
            </span>
          </div>
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: barColor }}
          >
            {pct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}