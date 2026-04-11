// pages/DashboardPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Warehouse,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { dashboardApi, transactionApi, stockApi, warehouseApi, getErrorMessage } from "../utils/api";
import StatCard from "../components/common/StatCard";
import StockLevelBar from "../components/common/StockLevelBar";
import Modal from "../components/common/Modal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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
      <select className="input-field" value={isCustom ? "other" : value} onChange={handleSelect}>
        <option value="">— {i18n.language === "ta" ? "எடை தேர்வு" : "Select Weight"} —</option>
        {DEFAULT_WEIGHTS.map((w) => {
          const exists = existingWeights.includes(w);
          return (<option key={w} value={w}>{w} KG {exists ? "✓" : ""}</option>);
        })}
        <option value="other">{i18n.language === "ta" ? "மற்றவை (கஸ்டம்)" : "Others (Custom)"}</option>
      </select>
      {isCustom && (
        <input type="number" min="1" step="0.5" className="input-field" value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={i18n.language === "ta" ? "KG எண்ணை உள்ளிடு..." : "Enter weight in KG..."} autoFocus />
      )}
    </div>
  );
}

function DashboardTransactionForm({ onSubmit, onClose, stocks, warehouses, initialType, onStocksRefresh }) {
  const { t, i18n } = useTranslation();

  const brandOptions = React.useMemo(() => {
    const map = {};
    stocks.forEach((s) => {
      const bn = s.brand_name;
      if (!map[bn]) map[bn] = { brand_name: bn, brand_name_ta: s.brand_name_ta, stocks: [], weights: [] };
      map[bn].stocks.push(s);
      if (!map[bn].weights.includes(s.bag_weight_kg)) map[bn].weights.push(s.bag_weight_kg);
    });
    return Object.values(map).sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [stocks]);

  const [form, setForm] = useState({
    transaction_type: initialType || "inbound",
    brand_name: "", bag_weight_kg: "", rice_type: "", rice_type_ta: "",
    warehouse_id: "", quantity_bags: "", source: "", sub_source: "",
    destination: "", sub_destination: "", vehicle_number: "", notes: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });
  const [loading, setLoading] = useState(false);

  const isInbound = form.transaction_type === "inbound";
  const selectedBrand = brandOptions.find((b) => b.brand_name === form.brand_name);
  const matchedStock = React.useMemo(() => {
    if (!selectedBrand || !form.bag_weight_kg) return null;
    return selectedBrand.stocks.find((s) => s.bag_weight_kg === Number(form.bag_weight_kg));
  }, [selectedBrand, form.bag_weight_kg]);

  const brandLabel = (b) => i18n.language === "ta" && b.brand_name_ta ? b.brand_name_ta : b.brand_name;
  const wName = (w) => i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name;
  const handleRiceTypeChange = (val) => setForm((f) => ({ ...f, rice_type: val, rice_type_ta: RICE_TYPE_TAMIL[val] || "" }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand_name) { toast.error(i18n.language === "ta" ? "பிராண்ட் தேர்வு செய்க" : "Please select a brand"); return; }
    if (!form.bag_weight_kg) { toast.error(i18n.language === "ta" ? "மூட்டை எடையை உள்ளிடவும்" : "Please select bag weight"); return; }
    setLoading(true);
    try {
      let stockId;
      if (matchedStock) { stockId = matchedStock.id; }
      else if (selectedBrand) {
        const templateStock = selectedBrand.stocks[0];
        const newStockData = { brand_name: templateStock.brand_name, brand_name_ta: templateStock.brand_name_ta || "", rice_type: form.rice_type || templateStock.rice_type || "", rice_type_ta: form.rice_type_ta || templateStock.rice_type_ta || "", bag_weight_kg: parseFloat(form.bag_weight_kg) };
        toast.loading(i18n.language === "ta" ? `${form.bag_weight_kg}KG புதிய stock உருவாக்கப்படுகிறது...` : `Creating new ${form.bag_weight_kg}KG stock entry...`, { id: "auto-stock" });
        const newStockRes = await stockApi.create(newStockData);
        stockId = newStockRes.data.id;
        toast.success(i18n.language === "ta" ? `${form.brand_name} - ${form.bag_weight_kg}KG stock உருவாக்கப்பட்டது` : `Auto-created ${form.brand_name} - ${form.bag_weight_kg}KG stock`, { id: "auto-stock" });
        if (onStocksRefresh) onStocksRefresh();
      }
      const payload = { transaction_type: form.transaction_type, stock_id: stockId, warehouse_id: parseInt(form.warehouse_id), quantity_bags: parseInt(form.quantity_bags), bag_weight_kg: parseFloat(form.bag_weight_kg), rice_type: form.rice_type || null, rice_type_ta: form.rice_type_ta || null, transaction_date: new Date(form.transaction_date).toISOString(), source: form.source || null, sub_source: form.sub_source || null, destination: form.destination || null, sub_destination: form.sub_destination || null, vehicle_number: form.vehicle_number || null, notes: form.notes || null };
      await onSubmit(payload);
      onClose();
    } catch (err) { toast.error(getErrorMessage(err, t("common.error"))); }
    finally { setLoading(false); }
  };

  const totalKg = form.quantity_bags && form.bag_weight_kg ? (parseInt(form.quantity_bags) * parseFloat(form.bag_weight_kg)).toFixed(1) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex overflow-hidden" style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius-md, 12px)" }}>
        {["inbound", "outbound"].map((type) => (
          <button key={type} type="button" onClick={() => setForm((f) => ({ ...f, transaction_type: type }))}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all"
            style={form.transaction_type === type ? { backgroundColor: type === "inbound" ? "#10b981" : "#ef4444", color: "white" } : { color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}>
            {type === "inbound" ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
            {type === "inbound" ? (i18n.language === "ta" ? "வரவு (Arrival)" : "Arrival") : (i18n.language === "ta" ? "செலவு (Send)" : "Send")}
          </button>
        ))}
      </div>
      <div>
        <label className="label">{i18n.language === "ta" ? "பிராண்ட்" : "Brand"} *</label>
        <select className="input-field" value={form.brand_name} onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value, bag_weight_kg: "" }))} required>
          <option value="">— {i18n.language === "ta" ? "பிராண்ட் தேர்வு" : "Select Brand"} —</option>
          {brandOptions.map((b) => (<option key={b.brand_name} value={b.brand_name}>{brandLabel(b)}</option>))}
        </select>
      </div>
      <div>
        <label className="label">{i18n.language === "ta" ? "அரிசி வகை" : "Rice Type"}<span className="text-[10px] font-normal ml-1.5" style={{ color: "var(--text-muted)" }}>({i18n.language === "ta" ? "விருப்பம்" : "Optional"})</span></label>
        <select className="input-field" value={form.rice_type} onChange={(e) => handleRiceTypeChange(e.target.value)}>
          <option value="">— {i18n.language === "ta" ? "அரிசி வகை தேர்வு" : "Select Rice Type"} —</option>
          {RICE_TYPES.map((rt) => (<option key={rt} value={rt}>{i18n.language === "ta" ? (RICE_TYPE_TAMIL[rt] || rt) : rt}</option>))}
        </select>
      </div>
      {form.rice_type === "Other" && (
        <div>
          <label className="label">{i18n.language === "ta" ? "அரிசி வகை (தமிழ்)" : "Rice Type (Tamil)"}</label>
          <input className="input-field" value={form.rice_type_ta} onChange={(e) => setForm((f) => ({ ...f, rice_type_ta: e.target.value }))} placeholder="அரிசி வகை" />
        </div>
      )}
      {form.brand_name && (
        <div>
          <label className="label">{i18n.language === "ta" ? "மூட்டை எடை (KG)" : "Bag Weight (KG)"} *</label>
          {selectedBrand && selectedBrand.weights.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "இருக்கும் எடைகள்" : "Existing weights"}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedBrand.weights.sort((a, b) => a - b).map((w) => {
                  const stock = selectedBrand.stocks.find((s) => s.bag_weight_kg === w);
                  const isActive = form.bag_weight_kg === String(w);
                  return (
                    <button key={w} type="button" onClick={() => setForm((f) => ({ ...f, bag_weight_kg: String(w) }))}
                      className="px-3 py-2 rounded-lg text-xs font-bold transition-all"
                      style={{ backgroundColor: isActive ? "var(--accent)" : "var(--bg-secondary)", color: isActive ? "#fff" : "var(--text-secondary)", border: `1.5px solid ${isActive ? "var(--accent)" : "var(--border)"}` }}>
                      {w} KG {stock && (<span className="ml-1 opacity-60">({stock.remaining_bags} {i18n.language === "ta" ? "மீதம்" : "left"})</span>)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "வேறு எடை தேர்வு" : "Or select different weight"}</p>
            <WeightSelector value={selectedBrand?.weights.includes(Number(form.bag_weight_kg)) ? "" : form.bag_weight_kg}
              onChange={(v) => { if (v) setForm((f) => ({ ...f, bag_weight_kg: v })); }} i18n={i18n} existingWeights={selectedBrand?.weights || []} />
          </div>
        </div>
      )}
      {selectedBrand && form.bag_weight_kg && (
        matchedStock ? (
          <div className="p-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: "var(--accent-soft)", border: "1.5px solid var(--accent)" }}>
            <Package size={18} style={{ color: "var(--accent)" }} />
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>{i18n.language === "ta" && matchedStock.brand_name_ta ? matchedStock.brand_name_ta : matchedStock.brand_name}<span className="ml-1.5">· {matchedStock.bag_weight_kg} KG</span></div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>✅ {matchedStock.remaining_bags} {i18n.language === "ta" ? "மூட்டை மீதம்" : "bags remaining"}</div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: "rgba(245,158,11,0.06)", border: "1.5px solid rgba(245,158,11,0.3)" }}>
            <Package size={18} style={{ color: "#f59e0b" }} />
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: "#f59e0b" }}>{i18n.language === "ta" ? `புதிய ${form.bag_weight_kg}KG stock தானாக உருவாக்கப்படும்` : `New ${form.bag_weight_kg}KG stock will be auto-created`}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? `"${form.brand_name}" பிராண்டுக்கு ${form.bag_weight_kg}KG entry இல்லை` : `No ${form.bag_weight_kg}KG entry for "${form.brand_name}"`}</div>
            </div>
          </div>
        )
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">{i18n.language === "ta" ? "மூட்டை எண்ணிக்கை" : "Quantity (Bags)"} *</label>
          <input type="number" min="1" className="input-field" value={form.quantity_bags} onChange={(e) => setForm((f) => ({ ...f, quantity_bags: e.target.value }))} required placeholder={i18n.language === "ta" ? "எண்ணிக்கை..." : "Number of bags..."} />
        </div>
        <div>
          <label className="label">{i18n.language === "ta" ? "கிடங்கு" : "Warehouse"} *</label>
          <select className="input-field" value={form.warehouse_id} onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))} required>
            <option value="">— {i18n.language === "ta" ? "கிடங்கு தேர்வு" : "Select Warehouse"} —</option>
            {warehouses.map((w) => (<option key={w.id} value={w.id}>{wName(w)}</option>))}
          </select>
        </div>
        {totalKg && (
          <div className="sm:col-span-2 p-3 rounded-xl flex items-center justify-between"
            style={{ backgroundColor: isInbound ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", border: `1.5px solid ${isInbound ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "மொத்த எடை" : "Total Weight"}</span>
            <span className="text-lg font-extrabold tabular-nums" style={{ color: isInbound ? "#10b981" : "#ef4444" }}>
              {totalKg} KG<span className="text-xs font-medium ml-1.5 opacity-60">({(totalKg / 1000).toFixed(2)} T)</span>
            </span>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">{i18n.language === "ta" ? "வாகன எண்" : "Vehicle Number"}</label>
          <VehicleNumberInput value={form.vehicle_number} onChange={(v) => setForm((f) => ({ ...f, vehicle_number: v }))} placeholder="TN 01 AB 1234" />
          <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "வடிவம்: CC NN CC NNNN" : "Format: CC NN CC NNNN"}</p>
        </div>
        {isInbound ? (
          <>
            <div>
              <label className="label">{i18n.language === "ta" ? "எங்கிருந்து (Source)" : "Source / From"}</label>
              <input className="input-field" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder={i18n.language === "ta" ? "எங்கிருந்து..." : "From where..."} />
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "துணை மூலம்" : "Sub Source"}</label>
              <input className="input-field" value={form.sub_source} onChange={(e) => setForm((f) => ({ ...f, sub_source: e.target.value }))} placeholder={i18n.language === "ta" ? "முகவர் / இடம்..." : "Agent / Sub-location..."} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">{i18n.language === "ta" ? "யாருக்கு (Destination)" : "Destination / To"}</label>
              <input className="input-field" value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} placeholder={i18n.language === "ta" ? "யாருக்கு..." : "To whom..."} />
            </div>
            <div>
              <label className="label">{i18n.language === "ta" ? "துணை இடம்" : "Sub Destination"}</label>
              <input className="input-field" value={form.sub_destination} onChange={(e) => setForm((f) => ({ ...f, sub_destination: e.target.value }))} placeholder={i18n.language === "ta" ? "முகவர் / இடம்..." : "Agent / Sub-location..."} />
            </div>
          </>
        )}
        <div>
          <label className="label">{i18n.language === "ta" ? "தேதி & நேரம்" : "Date & Time"}</label>
          <input type="datetime-local" className="input-field" value={form.transaction_date} onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{i18n.language === "ta" ? "குறிப்புகள்" : "Notes"}</label>
          <textarea className="input-field resize-none h-16" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={i18n.language === "ta" ? "கூடுதல் குறிப்புகள்..." : "Additional notes..."} />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{t("common.cancel")}</button>
        <button type="submit" disabled={loading || !form.brand_name || !form.bag_weight_kg}
          className={`flex-1 justify-center ${isInbound ? "btn-primary" : "btn-danger"}`}
          style={!form.brand_name || !form.bag_weight_kg ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
          {loading ? t("common.loading") : isInbound ? (i18n.language === "ta" ? "வரவு பதிவு" : "Record Arrival") : (i18n.language === "ta" ? "அனுப்பு பதிவு" : "Record Send")}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════
   SKELETON LOADING COMPONENT
   ═══════════════════════════════════════════════════════ */
function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <div className="h-7 rounded-lg animate-pulse" style={{ width: "160px", backgroundColor: "var(--bg-secondary)" }} />
        <div className="h-3.5 rounded-md mt-2 animate-pulse" style={{ width: "130px", backgroundColor: "var(--bg-secondary)" }} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
            <div className="w-10 h-10 rounded-xl mb-3 animate-pulse" style={{ backgroundColor: "var(--bg-secondary)" }} />
            <div className="h-6 rounded-md mb-2 animate-pulse" style={{ width: "50px", backgroundColor: "var(--bg-secondary)" }} />
            <div className="h-3 rounded-md animate-pulse" style={{ width: "80px", backgroundColor: "var(--bg-secondary)" }} />
          </div>
        ))}
      </div>

      {/* Quick action buttons */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center justify-center py-6 rounded-2xl"
            style={{ height: "130px", backgroundColor: "var(--bg-card)", border: "2px solid var(--border-light)" }}>
            <div className="w-14 h-14 rounded-2xl mb-3 animate-pulse" style={{ backgroundColor: "var(--bg-secondary)" }} />
            <div className="h-4 rounded-md mb-1.5 animate-pulse" style={{ width: "60px", backgroundColor: "var(--bg-secondary)" }} />
            <div className="h-3 rounded-md animate-pulse" style={{ width: "80px", backgroundColor: "var(--bg-secondary)" }} />
          </div>
        ))}
      </div>

      {/* Total stock banner */}
      <div className="rounded-2xl p-5" style={{ height: "110px", background: "linear-gradient(135deg, rgba(107,92,205,0.12), rgba(139,92,246,0.08))" }}>
        <div className="h-3 rounded-md mb-3 animate-pulse" style={{ width: "90px", backgroundColor: "rgba(107,92,205,0.15)" }} />
        <div className="h-8 rounded-md mb-2 animate-pulse" style={{ width: "120px", backgroundColor: "rgba(107,92,205,0.15)" }} />
        <div className="h-3 rounded-md animate-pulse" style={{ width: "70px", backgroundColor: "rgba(107,92,205,0.1)" }} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="p-5 rounded-2xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="h-4 rounded-md mb-1.5 animate-pulse" style={{ width: "120px", backgroundColor: "var(--bg-secondary)" }} />
                <div className="h-2.5 rounded-md animate-pulse" style={{ width: "90px", backgroundColor: "var(--bg-secondary)" }} />
              </div>
              <div className="h-7 rounded-lg animate-pulse" style={{ width: "55px", backgroundColor: "var(--bg-secondary)" }} />
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((j) => (
                <div key={j}>
                  <div className="flex justify-between mb-1.5">
                    <div className="h-3 rounded-md animate-pulse" style={{ width: `${60 + j * 15}px`, backgroundColor: "var(--bg-secondary)" }} />
                    <div className="h-3 rounded-md animate-pulse" style={{ width: "40px", backgroundColor: "var(--bg-secondary)" }} />
                  </div>
                  <div className="h-2 rounded-full animate-pulse" style={{ width: `${90 - j * 20}%`, backgroundColor: "rgba(107,92,205,0.1)" }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent transactions */}
      <div className="p-5 rounded-2xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="h-4 rounded-md mb-1.5 animate-pulse" style={{ width: "140px", backgroundColor: "var(--bg-secondary)" }} />
            <div className="h-2.5 rounded-md animate-pulse" style={{ width: "80px", backgroundColor: "var(--bg-secondary)" }} />
          </div>
          <div className="h-7 rounded-lg animate-pulse" style={{ width: "60px", backgroundColor: "var(--bg-secondary)" }} />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "var(--bg-secondary)" }}>
              <div className="flex-1">
                <div className="h-3.5 rounded-md mb-1.5 animate-pulse" style={{ width: `${80 + i * 10}px`, backgroundColor: "var(--border)" }} />
                <div className="h-2.5 rounded-md animate-pulse" style={{ width: `${100 + i * 15}px`, backgroundColor: "var(--border-light)" }} />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 rounded-md animate-pulse" style={{ width: "25px", backgroundColor: "var(--border)" }} />
                <div className="h-5 rounded-full animate-pulse" style={{ width: "50px", backgroundColor: "var(--border-light)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD PAGE
   ═══════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [txModal, setTxModal] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const loadDashboard = useCallback(() => {
    dashboardApi.getSummary().then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const refreshStocks = useCallback(() => {
    stockApi.list().then((r) => setStocks(r.data));
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { refreshStocks(); warehouseApi.list().then((r) => setWarehouses(r.data)); }, [refreshStocks]);

  const handleCreateTransaction = async (payload) => {
    await transactionApi.create(payload);
    toast.success(i18n.language === "ta" ? "பரிவர்த்தனை பதிவு செய்யப்பட்டது" : "Transaction recorded");
    loadDashboard();
    refreshStocks();
  };

  if (loading) return <DashboardSkeleton />;

  const txTypeColor = (type) => type === "inbound" ? "badge-success" : "badge-danger";
  const txTypeLabel = (type) => type === "inbound" ? t("transaction.inbound") : t("transaction.outbound");
  const chartData = data?.warehouse_summary?.map((w) => ({
    name: i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name,
    bags: w.total_bags, pct: w.stock_percentage,
  })) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{t("dashboard.title")}</h1>
        <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-muted)" }}>{format(new Date(), "EEEE, dd MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={TrendingUp} label={t("dashboard.inboundToday")} value={`${data?.total_inbound_today ?? 0} ${t("dashboard.bags")}`} color="green" />
        <StatCard icon={TrendingDown} label={t("dashboard.outboundToday")} value={`${data?.total_outbound_today ?? 0} ${t("dashboard.bags")}`} color="amber" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setTxModal({ initialType: "inbound" })} className="group relative overflow-hidden transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)", border: "2px solid rgba(16,185,129,0.18)", borderRadius: "var(--radius-xl, 16px)", padding: "20px 16px" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(16,185,129,0.15)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(16,185,129,0.18)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}>
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
              <ArrowDownToLine size={26} style={{ color: "#10b981" }} />
            </div>
            <span className="text-base font-extrabold" style={{ color: "#10b981" }}>{i18n.language === "ta" ? "வரவு" : "Arrival"}</span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "இறக்கு" : "Unload Stock"}</span>
          </div>
        </button>

        <button onClick={() => setTxModal({ initialType: "outbound" })} className="group relative overflow-hidden transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.01) 100%)", border: "2px solid rgba(239,68,68,0.18)", borderRadius: "var(--radius-xl, 16px)", padding: "20px 16px" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(239,68,68,0.15)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.18)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}>
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
              <ArrowUpFromLine size={26} style={{ color: "#ef4444" }} />
            </div>
            <span className="text-base font-extrabold" style={{ color: "#ef4444" }}>{i18n.language === "ta" ? "அனுப்பு" : "Send"}</span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "செலவு" : "Dispatch Stock"}</span>
          </div>
        </button>
      </div>

      <div className="relative overflow-hidden" style={{ background: "var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))", borderRadius: "var(--radius-xl, 16px)", padding: "20px 24px", boxShadow: "var(--shadow-accent-lg, 0 8px 32px rgba(99,102,241,0.3))" }}>
        <div style={{ position: "absolute", top: "-30%", right: "-5%", width: "200px", height: "200px", background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-40%", left: "10%", width: "150px", height: "150px", background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t("dashboard.totalStock")}</p>
            <p className="text-3xl font-display font-extrabold text-white mt-1.5 tracking-tight">
              {data?.total_bags?.toLocaleString() ?? 0}<span className="text-base font-medium ml-2 text-white/70">{t("dashboard.bags")}</span>
            </p>
            <p className="text-xs text-white/50 mt-1 font-medium">{((data?.total_stock_kg ?? 0) / 1000).toFixed(2)} {t("dashboard.tonnes")}</p>
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <Activity size={26} className="text-white/60" />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{t("dashboard.warehouseSummary")}</h2>
              <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Current Stock by Brand</p>
            </div>
            <Link to="/warehouses" className="text-[11px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors" style={{ color: "var(--accent)", backgroundColor: "var(--accent-soft)" }}>
              {t("common.view")} <ArrowRight size={11} />
            </Link>
          </div>
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={24} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 11, boxShadow: "var(--shadow-md)" }} formatter={(v) => [`${v} bags`, "Stock"]} />
                  <Bar dataKey="bags" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, i) => (<Cell key={i} fill={entry.pct < 20 ? "#ef4444" : entry.pct < 50 ? "#f59e0b" : "var(--accent)"} fillOpacity={0.85} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3 mt-5 pt-4" style={{ borderTop: "1px solid var(--border-light)" }}>
                {data?.warehouse_summary?.map((w) => (
                  <div key={w.id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name}</span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>{w.total_bags} bags</span>
                    </div>
                    <StockLevelBar percentage={w.stock_percentage} showLabel={false} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2" style={{ color: "var(--text-muted)" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--bg-secondary)" }}><Warehouse size={20} style={{ color: "var(--text-muted)" }} /></div>
              <span className="text-xs font-medium">{t("common.noData")}</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(239,68,68,0.08)" }}><AlertTriangle size={14} style={{ color: "#ef4444" }} /></div>
            <div>
              <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{t("dashboard.lowStock")}</h2>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Items below threshold</p>
            </div>
          </div>
          {data?.low_stock_items?.length > 0 ? (
            <div className="space-y-1">
              {data.low_stock_items.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors" style={{ backgroundColor: "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" && s.rice_type_ta ? s.rice_type_ta : s.rice_type}</div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: s.remaining_bags === 0 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)", color: s.remaining_bags === 0 ? "#ef4444" : "#f59e0b" }}>
                    {s.remaining_bags} {t("dashboard.bags")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(16,185,129,0.08)" }}><Package size={20} style={{ color: "#10b981" }} /></div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>All stocks healthy!</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>No items below threshold</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{t("dashboard.recentTransactions")}</h2>
            <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Latest activity</p>
          </div>
          <Link to="/transactions" className="text-[11px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors" style={{ color: "var(--accent)", backgroundColor: "var(--accent-soft)" }}>
            {t("common.view")} all <ArrowRight size={11} />
          </Link>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead><tr><th>{t("common.date")}</th><th>{t("stock.title")}</th><th>{t("warehouse.title")}</th><th className="text-right">{t("transaction.quantity")}</th><th className="text-center">{t("common.status")}</th></tr></thead>
            <tbody>
              {data?.recent_transactions?.length > 0 ? (
                data.recent_transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="text-xs tabular-nums">{format(new Date(tx.transaction_date), "dd MMM, HH:mm")}</td>
                    <td className="font-medium">{i18n.language === "ta" && tx.stock?.brand_name_ta ? tx.stock.brand_name_ta : tx.stock?.brand_name}</td>
                    <td>{i18n.language === "ta" && tx.warehouse?.location_name_ta ? tx.warehouse.location_name_ta : tx.warehouse?.location_name}</td>
                    <td className="text-right font-semibold tabular-nums">{tx.quantity_bags}</td>
                    <td className="text-center"><span className={`badge ${txTypeColor(tx.transaction_type)}`}>{txTypeLabel(tx.transaction_type)}</span></td>
                  </tr>
                ))
              ) : (<tr><td colSpan={5} className="text-center py-8" style={{ color: "var(--text-muted)" }}>{t("common.noData")}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-2">
          {data?.recent_transactions?.length > 0 ? (
            data.recent_transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{i18n.language === "ta" && tx.stock?.brand_name_ta ? tx.stock.brand_name_ta : tx.stock?.brand_name}</div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" && tx.warehouse?.location_name_ta ? tx.warehouse.location_name_ta : tx.warehouse?.location_name} · {format(new Date(tx.transaction_date), "dd MMM")}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{tx.quantity_bags}</span>
                  <span className={`badge text-[10px] ${txTypeColor(tx.transaction_type)}`}>{txTypeLabel(tx.transaction_type)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: "var(--text-muted)" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--bg-secondary)" }}><ArrowRight size={20} style={{ color: "var(--text-muted)" }} /></div>
              <span className="text-xs font-medium">{t("common.noData")}</span>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!txModal} onClose={() => setTxModal(null)} title={i18n.language === "ta" ? "புதிய பரிவர்த்தனை" : "New Transaction"} size="lg">
        {txModal && (
          <DashboardTransactionForm onSubmit={handleCreateTransaction} onClose={() => setTxModal(null)}
            stocks={stocks} warehouses={warehouses} initialType={txModal.initialType} onStocksRefresh={refreshStocks} />
        )}
      </Modal>
    </div>
  );
}