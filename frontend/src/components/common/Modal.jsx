import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, size = "md" }) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const sizeClass = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 w-full ${sizeClass} rounded-2xl shadow-2xl animate-slide-up`}
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-black/10" style={{ color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
