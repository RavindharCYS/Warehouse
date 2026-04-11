// components/common/Modal.jsx
import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, size = "md" }) {
  const contentRef = useRef(null);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      if (contentRef.current) contentRef.current.scrollTop = 0;

      const measure = () => {
        const mobile = window.innerWidth < 640;
        setIsMobile(mobile);

        if (!mobile) {
          setBottomOffset(0);
          return;
        }

        const selectors = [
          'nav[class*="bottom"]',
          'div[class*="bottom-nav"]',
          '[class*="fixed"][class*="bottom-0"]',
          'nav.fixed',
          '#bottom-nav',
          '.bottom-navigation',
        ];

        let navHeight = 0;
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const rect = el.getBoundingClientRect();
              if (rect.bottom >= window.innerHeight - 10 && rect.height > 30) {
                navHeight = rect.height;
                break;
              }
            }
          } catch (e) {}
        }

        // Improved fallback: check computed styles instead of class names
        if (navHeight === 0) {
          const allEls = document.querySelectorAll("nav, div");
          for (const el of allEls) {
            const style = window.getComputedStyle(el);
            if (style.position === "fixed" || style.position === "sticky") {
              const rect = el.getBoundingClientRect();
              if (
                rect.bottom >= window.innerHeight - 5 &&
                rect.top > window.innerHeight * 0.7 &&
                rect.height > 40 &&
                rect.height < 120 &&
                rect.width > window.innerWidth * 0.8
              ) {
                navHeight = rect.height;
                break;
              }
            }
          }
        }

        // Final safety fallback
        if (navHeight === 0) {
          navHeight = 64;
        }

        setBottomOffset(navHeight);
      };

      const raf = requestAnimationFrame(() => {
        setTimeout(measure, 50);
      });

      window.addEventListener("resize", measure);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", measure);
      };
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

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
          zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "modalFadeIn 0.2s ease-out",
        }}
        onClick={onClose}
      />

      {/* ── Modal Container ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: isMobile ? `${bottomOffset}px` : 0,
          zIndex: 51,
          display: "flex",
          alignItems: isMobile ? "flex-end" : "center",
          justifyContent: "center",
          padding: isMobile ? 0 : "16px",
          pointerEvents: "none",
        }}
      >
        {/* ── Modal Card ── */}
        <div
          className={`${sizeClass}`}
          style={{
            pointerEvents: "auto",
            position: "relative",
            width: "100%",
            /* ✅ FIX 1: constrain card height so it can't overflow */
            maxHeight: isMobile ? "85%" : "85vh",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "var(--bg-card)",
            borderRadius: isMobile ? "20px 20px 0 0" : "16px",
            boxShadow: isMobile
              ? "0 -4px 30px rgba(0,0,0,0.15)"
              : "0 25px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
            animation: "modalSlideUp 0.3s ease-out",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle — mobile */}
          {isMobile && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: "8px",
                paddingBottom: "2px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "4px",
                  borderRadius: "99px",
                  backgroundColor: "var(--border)",
                }}
              />
            </div>
          )}

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isMobile ? "10px 20px 12px" : "16px 24px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <h2
              className="font-display font-bold text-lg"
              style={{ color: "var(--text-primary)", margin: 0 }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              style={{
                padding: "8px",
                borderRadius: "12px",
                color: "var(--text-muted)",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable content */}
          <div
            ref={contentRef}
            style={{
              flex: 1,
              /* ✅ FIX 2: allows flex child to shrink & enables scroll */
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div
              style={{
                padding: isMobile ? "16px 20px 20px" : "20px 24px 24px",
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(60px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}