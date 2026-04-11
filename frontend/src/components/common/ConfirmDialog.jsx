// components/common/ConfirmDialog.jsx
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  danger = true,
  confirmLabel,
  cancelLabel,
}) {
  const { t } = useTranslation();

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const iconBg = danger ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)";
  const iconColor = danger ? "#ef4444" : "#f59e0b";
  const btnBg = danger ? "#ef4444" : "var(--accent)";
  const btnHover = danger ? "#dc2626" : "var(--accent-hover)";

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
          zIndex: 9998,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "confirmFadeIn 0.2s ease-out",
        }}
        onClick={onClose}
      />

      {/* ── Centered Dialog Container ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          pointerEvents: "none",
        }}
      >
        {/* ── Dialog Card ── */}
        <div
          style={{
            pointerEvents: "auto",
            position: "relative",
            width: "100%",
            maxWidth: "340px",
            backgroundColor: "var(--bg-card)",
            borderRadius: "20px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.3)",
            overflow: "hidden",
            animation: "confirmPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              padding: "6px",
              borderRadius: "10px",
              color: "var(--text-muted)",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <X size={16} />
          </button>

          {/* Content */}
          <div
            style={{
              padding: "32px 24px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                backgroundColor: iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <AlertTriangle size={28} style={{ color: iconColor }} />
            </div>

            {/* Title */}
            <h3
              className="font-display font-bold text-lg"
              style={{
                color: "var(--text-primary)",
                margin: "0 0 8px 0",
              }}
            >
              {title}
            </h3>

            {/* Message */}
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "14px",
                lineHeight: "1.5",
                margin: "0 0 24px 0",
                maxWidth: "280px",
              }}
            >
              {message}
            </p>

            {/* Buttons */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                width: "100%",
              }}
            >
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover, var(--bg-secondary))";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {cancelLabel || t("common.cancel", "Cancel")}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#ffffff",
                  backgroundColor: btnBg,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: danger ? "0 4px 12px rgba(239,68,68,0.3)" : "0 4px 12px rgba(99,102,241,0.3)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = btnHover;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = btnBg;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {confirmLabel || t("common.confirm", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes confirmFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes confirmPopIn {
          from {
            opacity: 0;
            transform: scale(0.85) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
}