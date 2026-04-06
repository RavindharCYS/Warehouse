import React from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center gap-4 py-2">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${danger ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
          <AlertTriangle size={28} className={danger ? "text-red-500" : "text-amber-500"} />
        </div>
        <p className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>{message}</p>
        <div className="flex gap-3 w-full mt-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className={`flex-1 justify-center ${danger ? "btn-danger" : "btn-primary"}`}>
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}
