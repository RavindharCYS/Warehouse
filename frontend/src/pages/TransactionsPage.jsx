// pages/TransactionsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Trash2, Filter, X,
  ArrowLeftRight, Truck, MapPin, Calendar, ChevronDown,
  Wheat, Package, Building2, FileText, Hash,
  PackagePlus, PackageMinus, ArrowDownToLine, ArrowUpFromLine
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { transactionApi, stockApi, warehouseApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";

const DEFAULT_WEIGHTS = [5, 10, 15, 20, 25, 26, 30, 50];
const RICE_TYPES = ["Ponni", "Basmati", "Sona Masoori", "Raw Rice", "Boiled Rice", "IR 64", "Other"];

const RICE_TYPE_TAMIL = {
  "Ponni": "பொன்னி",
  "Basmati": "பாஸ்மதி",
  "Sona Masoori": "சோனா மசூரி",
  "Raw Rice": "பச்சரிசி",
  "Boiled Rice": "வேக வைத்த அரிசி",
  "IR 64": "ஐஆர் 64",
  "Other": "மற்றவை",
};

/* ═══════════════════════════════════════════════════════
   VEHICLE NUMBER INPUT
   ═══════════════════════════════════════════════════════ */
function VehicleNumberInput({ value, onChange, placeholder }) {
  const formatVehicle = (raw) => {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    let result = "";
    const part1 = clean.slice(0, 2).replace(/[^A-Z]/g, "");
    result += part1;
    if (clean.length > 2) {
      const part2 = clean.slice(2, 4).replace(/[^0-9]/g, "");
      result += " " + part2;
      if (clean.length > 4) {
        const part3 = clean.slice(4, 6).replace(/[^A-Z]/g, "");
        result += " " + part3;
        if (clean.length > 6) {
          const part4 = clean.slice(6, 10).replace(/[^0-9]/g, "");
          result += " " + part4;
        }
      }
    }
    return result.trim();
  };

  return (
    <input
      className="input-field uppercase tracking-widest"
      value={value}
      onChange={(e) => onChange(formatVehicle(e.target.value))}
      placeholder={placeholder || "TN 01 AB 1234"}
      maxLength={13}
      style={{ letterSpacing: "0.12em", fontFamily: "monospace" }}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   WEIGHT SELECTOR
   ═══════════════════════════════════════════════════════ */
function WeightSelector({ value, onChange, i18n, existingWeights = [] }) {
  const [isCustom, setIsCustom] = useState(
    value && !DEFAULT_WEIGHTS.includes(Number(value))
  );

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === "other") {
      setIsCustom(true);
      onChange("");
    } else {
      setIsCustom(false);
      onChange(v);
    }
  };

  return (
    <div className="space-y-2">
      <select
        className="input-field"
        value={isCustom ? "other" : value}
        onChange={handleSelect}
      >
        <option value="">
          — {i18n.language === "ta" ? "எடை தேர்வு" : "Select Weight"} —
        </option>
        {DEFAULT_WEIGHTS.map((w) => {
          const exists = existingWeights.includes(w);
          return (
            <option key={w} value={w}>
              {w} KG {exists ? "✓" : ""}
            </option>
          );
        })}
        <option value="other">
          {i18n.language === "ta" ? "மற்றவை (கஸ்டம்)" : "Others (Custom)"}
        </option>
      </select>
      {isCustom && (
        <input
          type="number"
          min="1"
          step="0.5"
          className="input-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={i18n.language === "ta" ? "KG எண்ணை உள்ளிடு..." : "Enter weight in KG..."}
          autoFocus
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TRANSACTION FORM
   ═══════════════════════════════════════════════════════ */
function TransactionForm({ onSubmit, onClose, stocks, warehouses, initialType, onStocksRefresh }) {
  const { t, i18n } = useTranslation();

  const brandOptions = React.useMemo(() => {
    const map = {};
    stocks.forEach((s) => {
      const bn = s.brand_name;
      if (!map[bn]) {
        map[bn] = {
          brand_name: bn,
          brand_name_ta: s.brand_name_ta,
          stocks: [],
          weights: [],
        };
      }
      map[bn].stocks.push(s);
      if (!map[bn].weights.includes(s.bag_weight_kg)) {
        map[bn].weights.push(s.bag_weight_kg);
      }
    });
    return Object.values(map).sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [stocks]);

  const [form, setForm] = useState({
    transaction_type: initialType || "inbound",
    brand_name: "",
    bag_weight_kg: "",
    rice_type: "",
    rice_type_ta: "",
    warehouse_id: "",
    quantity_bags: "",
    source: "",
    sub_source: "",
    destination: "",
    sub_destination: "",
    vehicle_number: "",
    notes: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });
  const [loading, setLoading] = useState(false);

  const isInbound = form.transaction_type === "inbound";
  const selectedBrand = brandOptions.find((b) => b.brand_name === form.brand_name);

  const matchedStock = React.useMemo(() => {
    if (!selectedBrand || !form.bag_weight_kg) return null;
    return selectedBrand.stocks.find(
      (s) => s.bag_weight_kg === Number(form.bag_weight_kg)
    );
  }, [selectedBrand, form.bag_weight_kg]);

  const brandLabel = (b) => {
    const name = i18n.language === "ta" && b.brand_name_ta ? b.brand_name_ta : b.brand_name;
    return name;
  };

  const wName = (w) =>
    i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name;

  const handleRiceTypeChange = (val) => {
    setForm((f) => ({
      ...f,
      rice_type: val,
      rice_type_ta: RICE_TYPE_TAMIL[val] || "",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.brand_name) {
      toast.error(i18n.language === "ta" ? "பிராண்ட் தேர்வு செய்க" : "Please select a brand");
      return;
    }
    if (!form.bag_weight_kg) {
      toast.error(i18n.language === "ta" ? "மூட்டை எடையை உள்ளிடவும்" : "Please select bag weight");
      return;
    }

    setLoading(true);
    try {
      let stockId;

      if (matchedStock) {
        stockId = matchedStock.id;
      } else if (selectedBrand) {
        const templateStock = selectedBrand.stocks[0];
        const newStockData = {
          brand_name: templateStock.brand_name,
          brand_name_ta: templateStock.brand_name_ta || "",
          rice_type: form.rice_type || templateStock.rice_type || "",
          rice_type_ta: form.rice_type_ta || templateStock.rice_type_ta || "",
          bag_weight_kg: parseFloat(form.bag_weight_kg),
        };

        toast.loading(
          i18n.language === "ta"
            ? `${form.bag_weight_kg}KG புதிய stock உருவாக்கப்படுகிறது...`
            : `Creating new ${form.bag_weight_kg}KG stock entry...`,
          { id: "auto-stock" }
        );

        const newStockRes = await stockApi.create(newStockData);
        stockId = newStockRes.data.id;

        toast.success(
          i18n.language === "ta"
            ? `${form.brand_name} - ${form.bag_weight_kg}KG stock உருவாக்கப்பட்டது`
            : `Auto-created ${form.brand_name} - ${form.bag_weight_kg}KG stock`,
          { id: "auto-stock" }
        );

        if (onStocksRefresh) onStocksRefresh();
      }

      const payload = {
        transaction_type: form.transaction_type,
        stock_id: stockId,
        warehouse_id: parseInt(form.warehouse_id),
        quantity_bags: parseInt(form.quantity_bags),
        bag_weight_kg: parseFloat(form.bag_weight_kg),
        rice_type: form.rice_type || null,
        rice_type_ta: form.rice_type_ta || null,
        transaction_date: new Date(form.transaction_date).toISOString(),
        source: form.source || null,
        sub_source: form.sub_source || null,
        destination: form.destination || null,
        sub_destination: form.sub_destination || null,
        vehicle_number: form.vehicle_number || null,
        notes: form.notes || null,
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
  };

  const totalKg =
    form.quantity_bags && form.bag_weight_kg
      ? (parseInt(form.quantity_bags) * parseFloat(form.bag_weight_kg)).toFixed(1)
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div
        className="flex overflow-hidden"
        style={{
          border: "1.5px solid var(--border)",
          borderRadius: "var(--radius-md, 12px)",
        }}
      >
        {["inbound", "outbound"].map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm((f) => ({ ...f, transaction_type: type }))}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all"
            style={
              form.transaction_type === type
                ? {
                    backgroundColor: type === "inbound" ? "#10b981" : "#ef4444",
                    color: "white",
                  }
                : {
                    color: "var(--text-muted)",
                    backgroundColor: "var(--bg-secondary)",
                  }
            }
          >
            {type === "inbound" ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
            {type === "inbound"
              ? i18n.language === "ta" ? "வரவு (Arrival)" : "Arrival"
              : i18n.language === "ta" ? "செலவு (Send)" : "Send"}
          </button>
        ))}
      </div>

      {/* Brand Selector */}
      <div>
        <label className="label">
          {i18n.language === "ta" ? "பிராண்ட்" : "Brand"} *
        </label>
        <select
          className="input-field"
          value={form.brand_name}
          onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value, bag_weight_kg: "" }))}
          required
        >
          <option value="">
            — {i18n.language === "ta" ? "பிராண்ட் தேர்வு" : "Select Brand"} —
          </option>
          {brandOptions.map((b) => (
            <option key={b.brand_name} value={b.brand_name}>
              {brandLabel(b)}
            </option>
          ))}
        </select>
      </div>

      {/* Rice Type (optional) */}
      <div>
        <label className="label">
          {i18n.language === "ta" ? "அரிசி வகை" : "Rice Type"}
          <span className="text-[10px] font-normal ml-1.5" style={{ color: "var(--text-muted)" }}>
            ({i18n.language === "ta" ? "விருப்பம்" : "Optional"})
          </span>
        </label>
        <select
          className="input-field"
          value={form.rice_type}
          onChange={(e) => handleRiceTypeChange(e.target.value)}
        >
          <option value="">
            — {i18n.language === "ta" ? "அரிசி வகை தேர்வு" : "Select Rice Type"} —
          </option>
          {RICE_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {i18n.language === "ta" ? (RICE_TYPE_TAMIL[rt] || rt) : rt}
            </option>
          ))}
        </select>
      </div>

      {/* Rice Type Tamil (if rice type selected and not in map) */}
      {form.rice_type === "Other" && (
        <div>
          <label className="label">
            {i18n.language === "ta" ? "அரிசி வகை (தமிழ்)" : "Rice Type (Tamil)"}
          </label>
          <input
            className="input-field"
            value={form.rice_type_ta}
            onChange={(e) => setForm((f) => ({ ...f, rice_type_ta: e.target.value }))}
            placeholder="அரிசி வகை"
          />
        </div>
      )}

      {/* Rice type preview */}
      {form.rice_type && form.rice_type !== "Other" && (
        <div className="flex items-center gap-2 px-1">
          <Wheat size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
            {form.rice_type}
          </span>
          {RICE_TYPE_TAMIL[form.rice_type] && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              ({RICE_TYPE_TAMIL[form.rice_type]})
            </span>
          )}
        </div>
      )}

      {/* Bag Weight */}
      {form.brand_name && (
        <div>
          <label className="label">
            {i18n.language === "ta" ? "மூட்டை எடை (KG)" : "Bag Weight (KG)"} *
          </label>

          {selectedBrand && selectedBrand.weights.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-muted)" }}>
                {i18n.language === "ta" ? "இருக்கும் எடைகள்" : "Existing weights"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedBrand.weights.sort((a, b) => a - b).map((w) => {
                  const stock = selectedBrand.stocks.find((s) => s.bag_weight_kg === w);
                  const isActive = form.bag_weight_kg === String(w);
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, bag_weight_kg: String(w) }))}
                      className="px-3 py-2 rounded-lg text-xs font-bold transition-all"
                      style={{
                        backgroundColor: isActive ? "var(--accent)" : "var(--bg-secondary)",
                        color: isActive ? "#fff" : "var(--text-secondary)",
                        border: `1.5px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      {w} KG
                      {stock && (
                        <span className="ml-1 opacity-60">
                          ({stock.remaining_bags} {i18n.language === "ta" ? "மீதம்" : "left"})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "வேறு எடை தேர்வு" : "Or select different weight"}
            </p>
            <WeightSelector
              value={
                selectedBrand?.weights.includes(Number(form.bag_weight_kg))
                  ? ""
                  : form.bag_weight_kg
              }
              onChange={(v) => {
                if (v) setForm((f) => ({ ...f, bag_weight_kg: v }));
              }}
              i18n={i18n}
              existingWeights={selectedBrand?.weights || []}
            />
          </div>
        </div>
      )}

      {/* Stock Match Info */}
      {selectedBrand && form.bag_weight_kg && (
        matchedStock ? (
          <div
            className="p-3 rounded-xl flex items-center gap-3"
            style={{
              backgroundColor: "var(--accent-soft)",
              border: "1.5px solid var(--accent)",
            }}
          >
            <Package size={18} style={{ color: "var(--accent)" }} />
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                {i18n.language === "ta" && matchedStock.brand_name_ta
                  ? matchedStock.brand_name_ta
                  : matchedStock.brand_name}
                <span className="ml-1.5">· {matchedStock.bag_weight_kg} KG</span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                ✅ {matchedStock.remaining_bags} {i18n.language === "ta" ? "மூட்டை மீதம்" : "bags remaining"}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="p-3 rounded-xl flex items-center gap-3"
            style={{
              backgroundColor: "rgba(245,158,11,0.06)",
              border: "1.5px solid rgba(245,158,11,0.3)",
            }}
          >
            <PackagePlus size={18} style={{ color: "#f59e0b" }} />
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: "#f59e0b" }}>
                {i18n.language === "ta"
                  ? `புதிய ${form.bag_weight_kg}KG stock தானாக உருவாக்கப்படும்`
                  : `New ${form.bag_weight_kg}KG stock will be auto-created`}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {i18n.language === "ta"
                  ? `"${form.brand_name}" பிராண்டுக்கு ${form.bag_weight_kg}KG entry இல்லை — தானாக சேர்க்கப்படும்`
                  : `No ${form.bag_weight_kg}KG entry for "${form.brand_name}" — will be created automatically`}
              </div>
            </div>
          </div>
        )
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Quantity */}
        <div>
          <label className="label">
            {i18n.language === "ta" ? "மூட்டை எண்ணிக்கை" : "Quantity (Bags)"} *
          </label>
          <input
            type="number"
            min="1"
            className="input-field"
            value={form.quantity_bags}
            onChange={(e) => setForm((f) => ({ ...f, quantity_bags: e.target.value }))}
            required
            placeholder={i18n.language === "ta" ? "எண்ணிக்கை..." : "Number of bags..."}
          />
        </div>

        {/* Warehouse */}
        <div>
          <label className="label">
            {i18n.language === "ta" ? "கிடங்கு" : "Warehouse"} *
          </label>
          <select
            className="input-field"
            value={form.warehouse_id}
            onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
            required
          >
            <option value="">
              — {i18n.language === "ta" ? "கிடங்கு தேர்வு" : "Select Warehouse"} —
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{wName(w)}</option>
            ))}
          </select>
        </div>

        {/* Total Weight Preview */}
        {totalKg && (
          <div
            className="sm:col-span-2 p-3 rounded-xl flex items-center justify-between"
            style={{
              backgroundColor: isInbound ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
              border: `1.5px solid ${isInbound ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "மொத்த எடை" : "Total Weight"}
            </span>
            <span
              className="text-lg font-extrabold tabular-nums"
              style={{ color: isInbound ? "#10b981" : "#ef4444" }}
            >
              {totalKg} KG
              <span className="text-xs font-medium ml-1.5 opacity-60">
                ({(totalKg / 1000).toFixed(2)} T)
              </span>
            </span>
          </div>
        )}

        {/* Vehicle Number */}
        <div className="sm:col-span-2">
          <label className="label">
            {i18n.language === "ta" ? "வாகன எண்" : "Vehicle Number"}
          </label>
          <VehicleNumberInput
            value={form.vehicle_number}
            onChange={(v) => setForm((f) => ({ ...f, vehicle_number: v }))}
            placeholder="TN 01 AB 1234"
          />
          <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
            {i18n.language === "ta" ? "வடிவம்: CC NN CC NNNN" : "Format: CC NN CC NNNN"}
          </p>
        </div>

        {/* Source / Destination */}
        {isInbound ? (
          <>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "எங்கிருந்து (Source)" : "Source / From"}
              </label>
              <input
                className="input-field"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder={i18n.language === "ta" ? "எங்கிருந்து..." : "From where..."}
              />
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "துணை மூலம்" : "Sub Source"}
              </label>
              <input
                className="input-field"
                value={form.sub_source}
                onChange={(e) => setForm((f) => ({ ...f, sub_source: e.target.value }))}
                placeholder={i18n.language === "ta" ? "முகவர் / இடம்..." : "Agent / Sub-location..."}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "யாருக்கு (Destination)" : "Destination / To"}
              </label>
              <input
                className="input-field"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                placeholder={i18n.language === "ta" ? "யாருக்கு..." : "To whom..."}
              />
            </div>
            <div>
              <label className="label">
                {i18n.language === "ta" ? "துணை இடம்" : "Sub Destination"}
              </label>
              <input
                className="input-field"
                value={form.sub_destination}
                onChange={(e) => setForm((f) => ({ ...f, sub_destination: e.target.value }))}
                placeholder={i18n.language === "ta" ? "முகவர் / இடம்..." : "Agent / Sub-location..."}
              />
            </div>
          </>
        )}

        {/* Date */}
        <div>
          <label className="label">
            {i18n.language === "ta" ? "தேதி & நேரம்" : "Date & Time"}
          </label>
          <input
            type="datetime-local"
            className="input-field"
            value={form.transaction_date}
            onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="label">
            {i18n.language === "ta" ? "குறிப்புகள்" : "Notes"}
          </label>
          <textarea
            className="input-field resize-none h-16"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder={i18n.language === "ta" ? "கூடுதல் குறிப்புகள்..." : "Additional notes..."}
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={loading || !form.brand_name || !form.bag_weight_kg}
          className={`flex-1 justify-center ${isInbound ? "btn-primary" : "btn-danger"}`}
          style={!form.brand_name || !form.bag_weight_kg ? { opacity: 0.5, cursor: "not-allowed" } : {}}
        >
          {loading
            ? t("common.loading")
            : isInbound
            ? i18n.language === "ta" ? "வரவு பதிவு" : "Record Arrival"
            : i18n.language === "ta" ? "அனுப்பு பதிவு" : "Record Send"}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════
   TRANSACTION ACCORDION CARD
   ═══════════════════════════════════════════════════════ */
function TransactionAccordion({ tx, isOpen, onToggle, isAdmin, onDelete, stockName, wName, t, i18n }) {
  const isInbound = tx.transaction_type === "inbound";
  const typeColor = isInbound ? "#10b981" : "#ef4444";
  const typeBg = isInbound ? "rgba(16,185,129," : "rgba(239,68,68,";
  const directionLabel = isInbound
    ? (tx.source || (i18n.language === "ta" ? "மூலம் இல்லை" : "Unknown Source"))
    : (tx.destination || (i18n.language === "ta" ? "இடம் இல்லை" : "Unknown Dest"));
  const riceType = tx.rice_type || "—";
  const riceTypeTa = tx.rice_type_ta || RICE_TYPE_TAMIL[tx.rice_type] || "";
  const weight = tx.bag_weight_kg || tx.stock?.bag_weight_kg;

  return (
    <div
      className="overflow-hidden transition-all"
      style={{
        backgroundColor: "var(--bg-card)",
        border: `1.5px solid ${isOpen ? typeColor : "var(--border)"}`,
        borderRadius: "var(--radius-xl, 16px)",
        boxShadow: isOpen ? "var(--shadow-md)" : "var(--shadow-xs)",
        borderLeftWidth: "4px",
        borderLeftColor: typeColor,
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
        style={{ backgroundColor: isOpen ? `${typeBg}0.04)` : "transparent" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${typeBg}0.1)` }}
        >
          {isInbound ? (
            <ArrowDownToLine size={18} style={{ color: typeColor }} />
          ) : (
            <ArrowUpFromLine size={18} style={{ color: typeColor }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: typeColor }}>
              {isInbound
                ? i18n.language === "ta" ? "வரவு" : "From"
                : i18n.language === "ta" ? "செலவு" : "To"}
            </span>
            <span className="text-sm font-extrabold truncate" style={{ color: "var(--text-primary)" }}>
              {directionLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              {stockName(tx.stock)}
            </span>
            {riceType !== "—" && (
              <>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
                <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                  {i18n.language === "ta" ? (riceTypeTa || riceType) : riceType}
                </span>
              </>
            )}
            {weight && (
              <>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {weight}KG
                </span>
              </>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-xl font-extrabold tabular-nums" style={{ color: typeColor, letterSpacing: "-0.02em" }}>
            {tx.quantity_bags}
          </span>
          <div className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>
            {i18n.language === "ta" ? "மூட்டை" : "bags"}
          </div>
        </div>

        <ChevronDown
          size={18}
          className="shrink-0 transition-transform duration-300"
          style={{ color: "var(--text-muted)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isOpen ? "700px" : "0px", opacity: isOpen ? 1 : 0 }}
      >
        <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid var(--border-light)" }}>
          <div className="mb-4 mt-3">
            <h3 className="text-lg font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>
              {stockName(tx.stock)}
            </h3>
            {tx.stock?.brand_name_ta && i18n.language !== "ta" && (
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                {tx.stock.brand_name_ta}
              </p>
            )}
          </div>

          <div
            className="space-y-3 py-3 mb-4"
            style={{ borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}
          >
            <InfoRow
              icon={isInbound ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
              iconBg={`${typeBg}0.08)`}
              iconColor={typeColor}
              label={i18n.language === "ta" ? "வகை" : "Type"}
              value={isInbound
                ? i18n.language === "ta" ? "வரவு (Arrival)" : "Arrival"
                : i18n.language === "ta" ? "செலவு (Send)" : "Send"}
              valueBg={`${typeBg}0.1)`}
              valueColor={typeColor}
              pill
            />
            <InfoRow
              icon={<Calendar size={15} />}
              label={i18n.language === "ta" ? "தேதி" : "Date"}
              value={format(new Date(tx.transaction_date), "dd MMM yyyy, HH:mm")}
            />
            {riceType !== "—" && (
              <InfoRow
                icon={<Wheat size={15} />}
                iconBg="var(--accent-soft)"
                iconColor="var(--accent)"
                label={i18n.language === "ta" ? "அரிசி வகை" : "Rice Type"}
                value={i18n.language === "ta" ? (riceTypeTa || riceType) : riceType}
                valueBg="var(--accent-soft)"
                valueColor="var(--accent)"
                pill
              />
            )}
            {weight && (
              <InfoRow
                icon={<Package size={15} />}
                label={i18n.language === "ta" ? "மூட்டை எடை" : "Bag Weight"}
                value={`${weight} KG`}
              />
            )}
            <InfoRow
              icon={<Building2 size={15} />}
              label={i18n.language === "ta" ? "கிடங்கு" : "Warehouse"}
              value={wName(tx.warehouse)}
            />
            {(tx.source || tx.destination) && (
              <InfoRow
                icon={<MapPin size={15} />}
                label={isInbound
                  ? i18n.language === "ta" ? "மூலம்" : "Source"
                  : i18n.language === "ta" ? "சேருமிடம்" : "Destination"}
                value={tx.source || tx.destination}
              />
            )}
            {(tx.sub_source || tx.sub_destination) && (
              <InfoRow
                icon={<MapPin size={13} style={{ opacity: 0.6 }} />}
                label={isInbound
                  ? i18n.language === "ta" ? "துணை மூலம்" : "Sub Source"
                  : i18n.language === "ta" ? "துணை இடம்" : "Sub Dest"}
                value={tx.sub_source || tx.sub_destination}
              />
            )}
            {tx.vehicle_number && (
              <InfoRow
                icon={<Truck size={15} />}
                label={i18n.language === "ta" ? "வாகனம்" : "Vehicle"}
                value={tx.vehicle_number}
                mono
              />
            )}
            <InfoRow
              icon={<Hash size={15} />}
              iconBg={`${typeBg}0.08)`}
              iconColor={typeColor}
              label={i18n.language === "ta" ? "மூட்டைகள்" : "Quantity"}
              value={`${tx.quantity_bags} ${i18n.language === "ta" ? "மூட்டை" : "bags"}`}
              valueColor={typeColor}
              large
            />
            {weight && tx.quantity_bags && (
              <InfoRow
                icon={<Package size={15} />}
                label={i18n.language === "ta" ? "மொத்த எடை" : "Total Weight"}
                value={`${(tx.quantity_bags * weight).toFixed(1)} KG`}
                large
              />
            )}
          </div>

          {tx.notes && (
            <div className="mb-4 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-secondary)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <FileText size={13} style={{ color: "var(--text-muted)" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  {i18n.language === "ta" ? "குறிப்புகள்" : "Notes"}
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{tx.notes}</p>
            </div>
          )}

          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(tx); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: "rgba(239,68,68,0.06)",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)"; }}
            >
              <Trash2 size={15} />
              {i18n.language === "ta" ? "பரிவர்த்தனையை நீக்கு" : "Delete Transaction"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   INFO ROW
   ═══════════════════════════════════════════════════════ */
function InfoRow({ icon, iconBg, iconColor, label, value, valueBg, valueColor, pill, mono, large }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: iconBg || "var(--bg-secondary)",
            color: iconColor || "var(--text-muted)",
          }}
        >
          {React.cloneElement(icon, { style: { color: iconColor || "var(--text-muted)" } })}
        </div>
        <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
      <span
        className={`text-right max-w-[50%] truncate ${pill ? "px-3 py-1 rounded-full" : ""} ${
          large ? "text-lg font-extrabold" : "text-sm font-bold"
        } ${mono ? "tracking-wide font-mono" : ""} tabular-nums`}
        style={{
          backgroundColor: pill ? (valueBg || "var(--bg-secondary)") : undefined,
          color: valueColor || "var(--text-secondary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [filters, setFilters] = useState({
    transaction_type: "", warehouse_id: "", stock_id: "",
    date_from: "", date_to: "", vehicle_number: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    transactionApi.list(params)
      .then((r) => setTransactions(r.data))
      .finally(() => setLoading(false));
  }, [filters]);

  const refreshStocks = useCallback(() => {
    stockApi.list().then((r) => setStocks(r.data));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    refreshStocks();
    warehouseApi.list().then((r) => setWarehouses(r.data));
  }, [refreshStocks]);

  const handleCreate = async (data) => {
    await transactionApi.create(data);
    toast.success(
      i18n.language === "ta" ? "பரிவர்த்தனை பதிவு செய்யப்பட்டது" : "Transaction recorded"
    );
    load();
    refreshStocks();
  };

  const handleDelete = async () => {
    await transactionApi.delete(deleteTarget.id);
    toast.success(
      i18n.language === "ta" ? "பரிவர்த்தனை நீக்கப்பட்டது" : "Transaction deleted"
    );
    setDeleteTarget(null);
    load();
    refreshStocks();
  };

  const stockName = (s) =>
    s ? (i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name) : "—";
  const wName = (w) =>
    w ? (i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name) : "—";

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters = () =>
    setFilters({ transaction_type: "", warehouse_id: "", stock_id: "", date_from: "", date_to: "", vehicle_number: "" });

  const toggleCard = (id) => setOpenCardId((prev) => (prev === id ? null : id));

  const totalInbound = transactions
    .filter((tx) => tx.transaction_type === "inbound")
    .reduce((sum, tx) => sum + tx.quantity_bags, 0);
  const totalOutbound = transactions
    .filter((tx) => tx.transaction_type === "outbound")
    .reduce((sum, tx) => sum + tx.quantity_bags, 0);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-display font-extrabold text-2xl tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            {t("transaction.title")}
          </h1>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {transactions.length} {i18n.language === "ta" ? "பரிவர்த்தனைகள்" : "transactions"}
            {totalInbound > 0 && <span style={{ color: "#10b981" }}> · ▲{totalInbound}</span>}
            {totalOutbound > 0 && <span style={{ color: "#ef4444" }}> · ▼{totalOutbound}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="btn-secondary relative"
            style={showFilters ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
          >
            <Filter size={16} />
            <span className="hidden sm:inline">{t("common.filter")}</span>
            {activeFilters > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {activeFilters}
              </span>
            )}
          </button>
          <button onClick={() => setModal({ initialType: "inbound" })} className="btn-primary">
            <Plus size={16} />
            <span className="hidden sm:inline">
              {i18n.language === "ta" ? "புதிய பரிவர்த்தனை" : "New Transaction"}
            </span>
            <span className="sm:hidden">{i18n.language === "ta" ? "புதிய" : "New"}</span>
          </button>
        </div>
      </div>

      {/* Arrival / Send Cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setModal({ initialType: "inbound" })}
          className="group relative overflow-hidden transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)",
            border: "2px solid rgba(16,185,129,0.18)",
            borderRadius: "var(--radius-xl, 16px)",
            padding: "20px 16px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#10b981";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(16,185,129,0.15)";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(16,185,129,0.18)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
              <ArrowDownToLine size={26} style={{ color: "#10b981" }} />
            </div>
            <span className="text-base font-extrabold" style={{ color: "#10b981" }}>
              {i18n.language === "ta" ? "வரவு" : "Arrival"}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "இறக்கு" : "Unload Stock"}
            </span>
          </div>
        </button>

        <button
          onClick={() => setModal({ initialType: "outbound" })}
          className="group relative overflow-hidden transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.01) 100%)",
            border: "2px solid rgba(239,68,68,0.18)",
            borderRadius: "var(--radius-xl, 16px)",
            padding: "20px 16px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#ef4444";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(239,68,68,0.15)";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.18)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
              <ArrowUpFromLine size={26} style={{ color: "#ef4444" }} />
            </div>
            <span className="text-base font-extrabold" style={{ color: "#ef4444" }}>
              {i18n.language === "ta" ? "அனுப்பு" : "Send"}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "செலவு" : "Dispatch Stock"}
            </span>
          </div>
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card animate-scale-in space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">{i18n.language === "ta" ? "வகை" : "Type"}</label>
              <select className="input-field" value={filters.transaction_type}
                onChange={(e) => setFilters((f) => ({ ...f, transaction_type: e.target.value }))}>
                <option value="">{t("common.all")}</option>
                <option value="inbound">{i18n.language === "ta" ? "வரவு" : "Arrival"}</option>
                <option value="outbound">{i18n.language === "ta" ? "செலவு" : "Send"}</option>
              </select>
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "கிடங்கு" : "Warehouse"}</label>
              <select className="input-field" value={filters.warehouse_id}
                onChange={(e) => setFilters((f) => ({ ...f, warehouse_id: e.target.value }))}>
                <option value="">{t("common.all")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{wName(w)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "பிராண்ட்" : "Brand"}</label>
              <select className="input-field" value={filters.stock_id}
                onChange={(e) => setFilters((f) => ({ ...f, stock_id: e.target.value }))}>
                <option value="">{t("common.all")}</option>
                {stocks.map((s) => (
                  <option key={s.id} value={s.id}>{stockName(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "தொடக்க தேதி" : "Date From"}</label>
              <input type="date" className="input-field" value={filters.date_from}
                onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "முடிவு தேதி" : "Date To"}</label>
              <input type="date" className="input-field" value={filters.date_to}
                onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "வாகன எண்" : "Vehicle"}</label>
              <input className="input-field" value={filters.vehicle_number}
                onChange={(e) => setFilters((f) => ({ ...f, vehicle_number: e.target.value }))}
                placeholder="TN 01..." />
            </div>
          </div>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="btn-ghost" style={{ color: "#ef4444" }}>
              <X size={12} />
              {i18n.language === "ta" ? "அனைத்தையும் நீக்கு" : "Clear all filters"}
            </button>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th className="text-center">{i18n.language === "ta" ? "வகை" : "Type"}</th>
                <th>{i18n.language === "ta" ? "பிராண்ட்" : "Brand"}</th>
                <th>{i18n.language === "ta" ? "அரிசி வகை" : "Rice Type"}</th>
                <th>{i18n.language === "ta" ? "எடை" : "Weight"}</th>
                <th>{i18n.language === "ta" ? "கிடங்கு" : "Warehouse"}</th>
                <th>{i18n.language === "ta" ? "மூலம் / இடம்" : "Source / Dest"}</th>
                <th>{i18n.language === "ta" ? "வாகனம்" : "Vehicle"}</th>
                <th className="text-right">{i18n.language === "ta" ? "மூட்டை" : "Bags"}</th>
                {isAdmin && <th className="text-center">{t("common.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: "var(--border)", borderTopColor: "transparent" }} />
                      <span className="text-sm">{t("common.loading")}</span>
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-secondary)" }}>
                        <ArrowLeftRight size={22} style={{ color: "var(--text-muted)" }} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                        {t("common.noData")}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isIn = tx.transaction_type === "inbound";
                  const weight = tx.bag_weight_kg || tx.stock?.bag_weight_kg;
                  const riceType = tx.rice_type || "";
                  const riceTypeTa = tx.rice_type_ta || RICE_TYPE_TAMIL[tx.rice_type] || "";
                  return (
                    <tr key={tx.id}>
                      <td className="text-xs tabular-nums">
                        {format(new Date(tx.transaction_date), "dd MMM yyyy, HH:mm")}
                      </td>
                      <td className="text-center">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                          style={{
                            backgroundColor: isIn ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                            color: isIn ? "#10b981" : "#ef4444",
                          }}>
                          {isIn ? <ArrowDownToLine size={11} /> : <ArrowUpFromLine size={11} />}
                          {isIn
                            ? i18n.language === "ta" ? "வரவு" : "Arrival"
                            : i18n.language === "ta" ? "செலவு" : "Send"}
                        </span>
                      </td>
                      <td>
                        <div className="font-semibold text-sm">{stockName(tx.stock)}</div>
                      </td>
                      <td>
                        {riceType ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
                          >
                            <Wheat size={10} />
                            {i18n.language === "ta" ? (riceTypeTa || riceType) : riceType}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="tabular-nums">
                        {weight ? `${weight} KG` : "—"}
                      </td>
                      <td>{wName(tx.warehouse)}</td>
                      <td style={{ color: "var(--text-muted)" }}>
                        <div>{tx.source || tx.destination || "—"}</div>
                        {(tx.sub_source || tx.sub_destination) && (
                          <div className="text-[10px] opacity-70">
                            {tx.sub_source || tx.sub_destination}
                          </div>
                        )}
                      </td>
                      <td className="font-mono text-xs tracking-wide" style={{ color: "var(--text-muted)" }}>
                        {tx.vehicle_number || "—"}
                      </td>
                      <td className="text-right font-bold tabular-nums"
                        style={{ color: isIn ? "#10b981" : "#ef4444" }}>
                        {isIn ? "+" : "−"}{tx.quantity_bags}
                      </td>
                      {isAdmin && (
                        <td className="text-center">
                          <button
                            onClick={() => setDeleteTarget(tx)}                            className="p-2 rounded-xl transition-colors"
                            style={{ color: "#ef4444" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Accordion List */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "transparent" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {t("common.loading")}
            </span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}>
              <ArrowLeftRight size={28} style={{ color: "var(--text-muted)" }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold" style={{ color: "var(--text-secondary)" }}>
                {i18n.language === "ta" ? "பரிவர்த்தனைகள் இல்லை" : "No transactions yet"}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {i18n.language === "ta"
                  ? "முதல் வரவு அல்லது செலவு பதிவு செய்யவும்"
                  : "Record your first arrival or send transaction"}
              </p>
            </div>
          </div>
        ) : (
          transactions.map((tx) => (
            <TransactionAccordion
              key={tx.id}
              tx={tx}
              isOpen={openCardId === tx.id}
              onToggle={() => toggleCard(tx.id)}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              stockName={stockName}
              wName={wName}
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
        title={i18n.language === "ta" ? "புதிய பரிவர்த்தனை" : "New Transaction"}
        size="lg"
      >
        {modal && (
          <TransactionForm
            onSubmit={handleCreate}
            onClose={() => setModal(null)}
            stocks={stocks}
            warehouses={warehouses}
            initialType={modal.initialType}
            onStocksRefresh={refreshStocks}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={i18n.language === "ta" ? "பரிவர்த்தனை நீக்கம்" : "Delete Transaction"}
        message={
          i18n.language === "ta"
            ? "இந்த பரிவர்த்தனை நிரந்தரமாக நீக்கப்படும்."
            : "This will permanently delete this transaction record."
        }
      />
    </div>
  );
}