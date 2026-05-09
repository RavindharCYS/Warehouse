// pages/TransactionsPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Trash2, Filter, X, ArrowLeftRight, Truck, MapPin, Calendar,
  ChevronDown, Package, Building2, FileText, Hash,
  ArrowDownToLine, ArrowUpFromLine, UserCheck, Phone, DollarSign,
  Factory, Bell, AlertCircle, CheckCircle2, User as UserIcon,
  Warehouse, Box, Layers, IndianRupee,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  transactionApi, stockApi, warehouseApi, brandApi, riceTypeApi,
  getErrorMessage, calcTotalWeight, calcArrivalEntries, classifyWeight,
  BAG_SIZES, PIECE_THRESHOLD_KG,
} from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { transliterateToTamil } from "../utils/transliterate";

const FALLBACK_RICE_TYPES = [
  { id: "Ponni", name: "Ponni", name_ta: "பொன்னி" },
  { id: "Basmati", name: "Basmati", name_ta: "பாஸ்மதி" },
  { id: "Sona Masoori", name: "Sona Masoori", name_ta: "சோனா மசூரி" },
  { id: "Raw Rice", name: "Raw Rice", name_ta: "பச்சரிசி" },
  { id: "Boiled Rice", name: "Boiled Rice", name_ta: "வேக வைத்த அரிசி" },
  { id: "IR 64", name: "IR 64", name_ta: "ஐஆர் 64" },
  { id: "Other", name: "Other", name_ta: "மற்றவை" },
];

/* ═══════════════════════════════════════════════════════
   VEHICLE NUMBER INPUT
   ═══════════════════════════════════════════════════════ */
function VehicleNumberInput({ value, onChange, placeholder }) {
  const formatVehicle = (raw) => {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    let result = "";
    const p1 = clean.slice(0, 2).replace(/[^A-Z]/g, ""); result += p1;
    if (clean.length > 2) { const p2 = clean.slice(2, 4).replace(/[^0-9]/g, ""); result += " " + p2; }
    if (clean.length > 4) { const p3 = clean.slice(4, 6).replace(/[^A-Z]/g, ""); result += " " + p3; }
    if (clean.length > 6) { const p4 = clean.slice(6, 10).replace(/[^0-9]/g, ""); result += " " + p4; }
    return result.trim();
  };
  return (
    <input
      className="input-field uppercase"
      value={value}
      onChange={(e) => onChange(formatVehicle(e.target.value))}
      placeholder={placeholder || "TN 01 AB 1234"}
      maxLength={13}
      style={{ letterSpacing: "0.12em", fontFamily: "ui-monospace, monospace" }}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   DRIVER NUMBER INPUT
   ═══════════════════════════════════════════════════════ */
function DriverNumberInput({ value, onChange, placeholder }) {
  return (
    <input
      className="input-field"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
      placeholder={placeholder || "10-digit mobile"}
      maxLength={10}
      inputMode="numeric"
      pattern="[0-9]*"
      type="tel"
    />
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION DIVIDER
   ═══════════════════════════════════════════════════════ */
function SectionLabel({ children, color }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: color || "var(--text-muted)" }}
    >
      {children}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════
   ARRIVAL FORM  (warehouse-first, mobile-optimised grid)
   ═══════════════════════════════════════════════════════ */
function ArrivalForm({ onSubmit, onClose, brands, riceTypes, warehouses, onBrandsRefresh, onRiceTypesRefresh, isAdmin, i18n }) {
  const { t } = useTranslation();

  const [header, setHeader] = useState({
    vehicle_number: "", driver_name: "", driver_number: "",
    source: "", commission_partner: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "", mill_owner_name: "", rent: "", hidden_charges: "",
    // buying_price is now per-item, not global
  });

  const blankRow   = () => ({ weight: "", quantity: "", buying_price: "" });
  const blankGroup = () => ({ warehouse_id: "", rows: [blankRow()] });
  const blankItem  = () => ({ brand_id: "", rice_type_id: "", bag_size: 25, buying_price: "", warehouseGroups: [blankGroup()] });

  const [items, setItems] = useState([blankItem()]);
  const [loading, setLoading] = useState(false);
  const [newBrandName, setNewBrandName] = useState({});
  const [newBrandTa, setNewBrandTa]     = useState({});
  const [newRiceName, setNewRiceName]   = useState({});
  const [newRiceTa, setNewRiceTa]       = useState({});
  const [showNewBrand, setShowNewBrand] = useState({});
  const [showNewRice, setShowNewRice]   = useState({});
  const [creating, setCreating]         = useState(false);

  // ── item helpers ──
  const addItem    = () => setItems(p => [...p, blankItem()]);
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i, patch) => setItems(p => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  // ── group helpers ──
  const addGroup    = (i) => setItems(p => p.map((it, idx) => idx === i ? { ...it, warehouseGroups: [...it.warehouseGroups, blankGroup()] } : it));
  const removeGroup = (i, g) => setItems(p => p.map((it, idx) => idx === i ? { ...it, warehouseGroups: it.warehouseGroups.filter((_, gi) => gi !== g) } : it));
  const updateGroup = (i, g, patch) => setItems(p => p.map((it, idx) => idx === i ? { ...it, warehouseGroups: it.warehouseGroups.map((gr, gi) => gi === g ? { ...gr, ...patch } : gr) } : it));

  // ── row helpers ──
  const addRow    = (i, g) => setItems(p => p.map((it, idx) => idx === i ? { ...it, warehouseGroups: it.warehouseGroups.map((gr, gi) => gi === g ? { ...gr, rows: [...gr.rows, blankRow()] } : gr) } : it));
  const removeRow = (i, g, r) => setItems(p => p.map((it, idx) => idx === i ? { ...it, warehouseGroups: it.warehouseGroups.map((gr, gi) => gi === g ? { ...gr, rows: gr.rows.filter((_, ri) => ri !== r) } : gr) } : it));
  const updateRow = (i, g, r, patch) => setItems(p => p.map((it, idx) => idx === i ? { ...it, warehouseGroups: it.warehouseGroups.map((gr, gi) => gi === g ? { ...gr, rows: gr.rows.map((rw, ri) => ri === r ? { ...rw, ...patch } : rw) } : gr) } : it));

  // ── masters ──
  const handleCreateBrand = async (idx) => {
    const name = (newBrandName[idx] || "").trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await brandApi.create({ name, name_ta: (newBrandTa[idx] || "").trim() });
      toast.success(`Brand "${name}" added`);
      setNewBrandName(p => ({ ...p, [idx]: "" })); setNewBrandTa(p => ({ ...p, [idx]: "" }));
      setShowNewBrand(p => ({ ...p, [idx]: false }));
      if (onBrandsRefresh) await onBrandsRefresh();
      updateItem(idx, { brand_id: res.data.id });
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create brand")); }
    finally { setCreating(false); }
  };

  const handleCreateRiceType = async (idx) => {
    const name = (newRiceName[idx] || "").trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await riceTypeApi.create({ name, name_ta: (newRiceTa[idx] || "").trim(), brand_id: items[idx].brand_id || null });
      toast.success(`Rice type "${name}" added`);
      setNewRiceName(p => ({ ...p, [idx]: "" })); setNewRiceTa(p => ({ ...p, [idx]: "" }));
      setShowNewRice(p => ({ ...p, [idx]: false }));
      if (onRiceTypesRefresh) await onRiceTypesRefresh();
      updateItem(idx, { rice_type_id: res.data.id });
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create rice type")); }
    finally { setCreating(false); }
  };

  // ── totals ──
  const flatEntries = (item) =>
    item.warehouseGroups.flatMap(g => g.rows.map(r => ({
      weight: Number(r.weight) || 0, quantity: Number(r.quantity) || 0, warehouse_id: g.warehouse_id,
      buying_price: r.buying_price !== "" && r.buying_price != null ? Number(r.buying_price) : null,
    })));

  const itemTotals = useMemo(() => items.map(it => {
    const rows = flatEntries(it).map(e => ({ weight: e.weight, quantity: e.quantity }));
    const totalKg = calcTotalWeight(rows);
    const calc = calcArrivalEntries(rows);
    return { totalKg, totalBagUnits: calc.totalBagUnits, totalPieceUnits: calc.totalPieceUnits, totalUnits: calc.totalBagUnits + calc.totalPieceUnits };
  }), [items]);

  const grandTotal = useMemo(() => itemTotals.reduce((acc, t) => ({
    bagUnits: acc.bagUnits + t.totalBagUnits, pieceUnits: acc.pieceUnits + t.totalPieceUnits, kg: acc.kg + t.totalKg,
  }), { bagUnits: 0, pieceUnits: 0, kg: 0 }), [itemTotals]);

  const totalGlobalCharges = useMemo(() => {
    const r = Number(header.rent) || 0, h = Number(header.hidden_charges) || 0;
    return (r === 0 && h === 0) ? null : r + h;
  }, [header.rent, header.hidden_charges]);

  const filteredRiceTypes = (brandId) => riceTypes.filter(rt => !rt.brand_id || rt.brand_id === Number(brandId));

  // ── submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!header.vehicle_number) return toast.error("Vehicle number required");
    if (!header.driver_name)    return toast.error("Driver name required");
    if (!header.driver_number)  return toast.error("Driver number required");
    if (header.driver_number.length !== 10) return toast.error("Driver number must be exactly 10 digits");

    for (let i = 0; i < items.length; i++) {
      const it = items[i], tot = itemTotals[i];
      if (!it.brand_id) return toast.error(`Load #${i + 1}: Select a brand`);
      if (tot.totalUnits === 0) return toast.error(`Load #${i + 1}: Add at least one entry`);
      for (let g = 0; g < it.warehouseGroups.length; g++) {
        const grp = it.warehouseGroups[g];
        if (!grp.warehouse_id) return toast.error(`Load #${i + 1} · Group #${g + 1}: Select a warehouse`);
        for (let r = 0; r < grp.rows.length; r++) {
          const row = grp.rows[r];
          if ((Number(row.weight) || 0) <= 0 || (Number(row.quantity) || 0) <= 0)
            return toast.error(`Load #${i + 1} · Group #${g + 1} · Row #${r + 1}: Enter weight and quantity`);
        }
      }
    }

    setLoading(true);
    try {
      const payload = {
        type: "arrival",
        vehicle_no: header.vehicle_number,
        driver_name: header.driver_name,
        driver_number: header.driver_number,
        source: header.source || null,
        commission_partner: isAdmin ? (header.commission_partner || null) : null,
        transaction_date: new Date(header.transaction_date).toISOString(),
        notes: header.notes || null,
        items: items.map((it, i) => {
          const validEntries = flatEntries(it)
            .filter(e => e.weight > 0 && e.quantity > 0 && e.warehouse_id)
            .map(e => ({ weight: e.weight, quantity: e.quantity, warehouse_id: Number(e.warehouse_id) }));
          const weightAgg = new Map(), splitAgg = new Map(), weightPriceAgg = new Map();
          for (const en of validEntries) {
            weightAgg.set(en.weight, (weightAgg.get(en.weight) || 0) + en.quantity);
            splitAgg.set(en.warehouse_id, (splitAgg.get(en.warehouse_id) || 0) + en.quantity);
            // Store buying_price per weight (last one wins if same weight appears in multiple groups)
            if (isAdmin && en.buying_price != null) weightPriceAgg.set(en.weight, en.buying_price);
          }
          // Derive item-level buying_price: use first row's price as fallback for legacy compat
          const allRowPrices = flatEntries(it)
            .map(r => r.buying_price)
            .filter(p => p != null && p > 0);
          const itemBuyingPrice = allRowPrices.length === 1 ? allRowPrices[0] : null; // only set global if uniform single price
          return {
            brand_id: Number(it.brand_id),
            rice_type_id: it.rice_type_id ? Number(it.rice_type_id) : null,
            bag_size: Number(it.bag_size),
            total_bags: itemTotals[i].totalBagUnits,
            total_pieces: itemTotals[i].totalPieceUnits,
            total_units: itemTotals[i].totalUnits,
            total_weight_kg: itemTotals[i].totalKg,
            entries: validEntries,
            weights: Array.from(weightAgg.entries()).map(([weight, quantity]) => ({
              weight, quantity,
              ...(isAdmin && weightPriceAgg.has(weight) ? { buying_price: weightPriceAgg.get(weight) } : {}),
            })),
            warehouse_splits: Array.from(splitAgg.entries()).map(([warehouse_id, bags]) => ({ warehouse_id, bags })),
            ...(isAdmin && itemBuyingPrice != null ? { buying_price: itemBuyingPrice } : {}),
          };
        }),
        ...(isAdmin ? {
          mill_owner_name: header.mill_owner_name || null,
          rent: header.rent !== "" ? Number(header.rent) : null,
          hidden_charges: header.hidden_charges !== "" ? Number(header.hidden_charges) : null,
        } : {}),
      };
      await onSubmit(payload);
      // Inform admin clearly when pricing was not filled — it will appear pending on dashboard
      if (isAdmin) {
        const anyBuyingPriceFilled = items.some(it => it.buying_price !== "");
        const priceFilled = anyBuyingPriceFilled && header.mill_owner_name !== "";
        toast.success(
          priceFilled
            ? "Arrival recorded"
            : "Arrival recorded — pricing pending. Complete it from the dashboard.",
          { duration: priceFilled ? 3000 : 5000 }
        );
      } else {
        toast.success("Arrival recorded — sent for admin review");
      }
      onClose();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to record arrival")); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Vehicle & Driver ── */}
      <div>
        <SectionLabel>{i18n.language === "ta" ? "வாகனம் & ஓட்டுநர்" : "Vehicle & Driver"}</SectionLabel>
        <div className="space-y-3">
          <div>
            <label className="label flex items-center gap-1.5"><Truck size={11} /> Vehicle Number *</label>
            <VehicleNumberInput value={header.vehicle_number} onChange={v => setHeader(h => ({ ...h, vehicle_number: v }))} />
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div>
              <label className="label flex items-center gap-1.5"><UserIcon size={11} /> Driver Name *</label>
              <input className="input-field" value={header.driver_name}
                onChange={e => setHeader(h => ({ ...h, driver_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Phone size={11} /> Driver No. *</label>
              <DriverNumberInput value={header.driver_number} onChange={v => setHeader(h => ({ ...h, driver_number: v }))} />
              {header.driver_number && header.driver_number.length !== 10 && (
                <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
                  {header.driver_number.length}/10 digits
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="label">Source / From</label>
            <input className="input-field" value={header.source}
              onChange={e => setHeader(h => ({ ...h, source: e.target.value }))} placeholder="From where..." />
          </div>
          <div>
            <label className="label">Date & Time</label>
            <input type="datetime-local" className="input-field" value={header.transaction_date}
              onChange={e => setHeader(h => ({ ...h, transaction_date: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* ── Admin-only ── */}
      {isAdmin && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ backgroundColor: "rgba(99,102,241,0.04)", border: "1.5px dashed rgba(99,102,241,0.25)" }}>
          <SectionLabel color="#6366f1">
            <Factory size={11} style={{ display: "inline", marginRight: 4 }} />
            {i18n.language === "ta" ? "நிர்வாக தகவல்" : "Admin Details"}
          </SectionLabel>
          <div>
            <label className="label flex items-center gap-1.5"><Factory size={11} /> Mill Owner Name</label>
            <input className="input-field" value={header.mill_owner_name}
              onChange={e => setHeader(h => ({ ...h, mill_owner_name: e.target.value }))} placeholder="Type mill owner..." />
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><UserCheck size={11} /> Commission Partner</label>
            <input className="input-field" value={header.commission_partner}
              onChange={e => setHeader(h => ({ ...h, commission_partner: e.target.value }))} placeholder="Agent / Partner..." />
          </div>
          {/* Rent + Hidden Charges are GLOBAL for the whole arrival */}
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Global Charges (apply to entire vehicle load)
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label className="label text-[10px]">Rent (Global)</label>
              <input type="number" step="0.01" className="input-field" value={header.rent}
                onWheel={e => e.target.blur()}
                        onChange={e => setHeader(h => ({ ...h, rent: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="label text-[10px]">Hidden Charges (Global)</label>
              <input type="number" step="0.01" className="input-field" value={header.hidden_charges}
                onWheel={e => e.target.blur()}
                        onChange={e => setHeader(h => ({ ...h, hidden_charges: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          {totalGlobalCharges !== null && (
            <div className="rounded-xl p-3 flex items-center justify-between"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Total Global Charges</span>
              <span className="text-lg font-extrabold tabular-nums" style={{ color: "#6366f1" }}>₹{totalGlobalCharges.toFixed(2)}</span>
            </div>
          )}
          <p className="text-[10px] font-semibold mt-1" style={{ color: "rgba(99,102,241,0.7)" }}>
            💡 Buying price per bag is entered per load item below
          </p>
        </div>
      )}

      {/* ── Loads ── */}
      <div>
        <SectionLabel>{i18n.language === "ta" ? "இந்த வாகனத்தில் சரக்கு" : "Loads in this Vehicle"}</SectionLabel>
        <div className="space-y-4">
          {items.map((it, idx) => {
            const tot = itemTotals[idx];
            return (
              <div key={idx} className="rounded-2xl overflow-hidden"
                style={{ border: "1.5px solid var(--border)", backgroundColor: "var(--bg-card)" }}>

                {/* Load header bar */}
                <div className="flex items-center justify-between px-3 py-2.5"
                  style={{ backgroundColor: "rgba(16,185,129,0.06)", borderBottom: "1px solid var(--border-light)" }}>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#10b981" }}>
                    {i18n.language === "ta" ? `சரக்கு ${idx + 1}` : `Load #${idx + 1}`}
                  </span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)}
                      className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg"
                      style={{ color: "var(--danger)", backgroundColor: "var(--danger-soft)" }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  {/* Brand */}
                  <div>
                    <label className="label">Brand *</label>
                    {!showNewBrand[idx] ? (
                      <div className="flex gap-2">
                        <select className="input-field flex-1" value={it.brand_id}
                          onChange={e => updateItem(idx, { brand_id: e.target.value, rice_type_id: "" })}>
                          <option value="">— Select Brand —</option>
                          {brands.map(b => (
                            <option key={b.id} value={b.id}>
                              {i18n.language === "ta" && b.name_ta ? b.name_ta : b.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setShowNewBrand(p => ({ ...p, [idx]: true }))}
                          className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                          style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--accent)" }}>
                          + New
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 rounded-xl"
                        style={{ backgroundColor: "var(--bg-secondary)", border: "1.5px solid var(--accent)" }}>
                        <input className="input-field" placeholder="Brand name (English)"
                          value={newBrandName[idx] || ""}
                          onChange={e => { setNewBrandName(p => ({ ...p, [idx]: e.target.value })); setNewBrandTa(p => ({ ...p, [idx]: transliterateToTamil(e.target.value) })); }}
                          autoFocus />
                        <input className="input-field" placeholder="பிராண்ட் (தமிழ்)"
                          value={newBrandTa[idx] || ""} onChange={e => setNewBrandTa(p => ({ ...p, [idx]: e.target.value }))} />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setShowNewBrand(p => ({ ...p, [idx]: false }))}
                            className="btn-secondary flex-1 py-2 text-xs justify-center">Cancel</button>
                          <button type="button" onClick={() => handleCreateBrand(idx)}
                            disabled={creating || !newBrandName[idx]?.trim()}
                            className="btn-primary flex-1 py-2 text-xs justify-center">
                            {creating ? "..." : "Create"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rice Type only (Bag Size removed — not needed) */}
                  <div>
                    <div>
                      <label className="label">Rice Type</label>
                      {!showNewRice[idx] ? (
                        <div className="flex gap-1.5">
                          <select className="input-field flex-1 min-w-0" value={it.rice_type_id}
                            onChange={e => updateItem(idx, { rice_type_id: e.target.value })}>
                            <option value="">— None —</option>
                            {filteredRiceTypes(it.brand_id).map(rt => (
                              <option key={rt.id} value={rt.id}>{rt.name}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => setShowNewRice(p => ({ ...p, [idx]: true }))}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold shrink-0"
                            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5 p-2.5 rounded-xl"
                          style={{ backgroundColor: "var(--bg-secondary)", border: "1.5px solid var(--accent)" }}>
                          <input className="input-field" placeholder="Rice type"
                            value={newRiceName[idx] || ""}
                            onChange={e => { setNewRiceName(p => ({ ...p, [idx]: e.target.value })); setNewRiceTa(p => ({ ...p, [idx]: transliterateToTamil(e.target.value) })); }}
                            autoFocus />
                          <input className="input-field" placeholder="அரிசி (தமிழ்)"
                            value={newRiceTa[idx] || ""} onChange={e => setNewRiceTa(p => ({ ...p, [idx]: e.target.value }))} />
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => setShowNewRice(p => ({ ...p, [idx]: false }))}
                              className="btn-secondary flex-1 py-1.5 text-[11px] justify-center">×</button>
                            <button type="button" onClick={() => handleCreateRiceType(idx)}
                              disabled={creating || !newRiceName[idx]?.trim()}
                              className="btn-primary flex-1 py-1.5 text-[11px] justify-center">
                              {creating ? "..." : "Add"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

               {/* ── Warehouse Groups ── */}
                  <div>
                    <SectionLabel>{i18n.language === "ta" ? "கிடங்கு பகிர்வு" : "Entries → Warehouse"}</SectionLabel>
                    <div className="space-y-2.5">
                      {it.warehouseGroups.map((grp, gIdx) => {
                        const grpKg = grp.rows.reduce((s, r) => s + (Number(r.weight) || 0) * (Number(r.quantity) || 0), 0);
                        const grpCalc = calcArrivalEntries(grp.rows.map(r => ({ weight: Number(r.weight) || 0, quantity: Number(r.quantity) || 0 })));

                        return (
                          <div key={gIdx} className="rounded-xl overflow-hidden"
                            style={{ border: "1.5px solid var(--border)", backgroundColor: "var(--bg-secondary)" }}>

                            {/* Warehouse selector */}
                            <div className="flex items-center gap-2 px-3 py-2.5"
                              style={{ backgroundColor: "var(--bg-card)", borderBottom: "1px solid var(--border-light)" }}>
                              <div className="flex items-center justify-center rounded-lg shrink-0"
                                style={{ width: 28, height: 28, backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
                                <Warehouse size={13} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <label className="text-[9px] font-bold uppercase tracking-wider block mb-1"
                                  style={{ color: "var(--text-muted)" }}>Warehouse *</label>
                                <select className="input-field"
                                  style={{ padding: "5px 8px", height: 32, fontSize: 13 }}
                                  value={grp.warehouse_id}
                                  onChange={e => updateGroup(idx, gIdx, { warehouse_id: e.target.value })}>
                                  <option value="">— Select —</option>
                                  {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>
                                      {i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button type="button"
                                onClick={() => removeGroup(idx, gIdx)}
                                disabled={it.warehouseGroups.length <= 1}
                                className="btn-ghost shrink-0"
                                style={{
                                  color: it.warehouseGroups.length > 1 ? "var(--danger)" : "transparent",
                                  padding: "5px 6px",
                                  pointerEvents: it.warehouseGroups.length <= 1 ? "none" : "auto",
                                }}>
                                <Trash2 size={13} />
                              </button>
                            </div>

                            {/* Weight × Qty rows */}
                            <div className="px-3 pt-3 pb-3 space-y-2">
                              {/* Column headers */}
                              <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr 1fr auto" : "1fr 1fr auto", gap: 8 }}>
                                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                                  Weight (KG)
                                </label>
                                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                                  Quantity
                                </label>
                                {isAdmin && (
                                  <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#6366f1" }}>
                                    ₹ / Unit
                                  </label>
                                )}
                                <div style={{ width: 32 }} />
                              </div>

                              {grp.rows.map((row, rIdx) => {
                                const wt = Number(row.weight) || 0;
                                const qty = Number(row.quantity) || 0;
                                const kind = classifyWeight(wt);
                                const isBag = kind === "bag", isPiece = kind === "piece";
                                const kindLabel = isBag ? `${qty} bag${qty !== 1 ? "s" : ""}` : isPiece ? `${qty} pc${qty !== 1 ? "s" : ""}` : null;
                                const kindColor = isBag ? "var(--success)" : isPiece ? "var(--warning)" : "var(--text-muted)";
                                const kindBg = isBag ? "var(--success-soft)" : isPiece ? "var(--warning-soft)" : "var(--bg-secondary)";

                                return (
                                  <div key={rIdx}>
                                    <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr 1fr auto" : "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                                      <input type="number" min="0" step="0.5" className="input-field"
                                        placeholder="25" value={row.weight} style={{ minWidth: 0 }}
                                        onWheel={e => e.target.blur()}
                                        onChange={e => updateRow(idx, gIdx, rIdx, { weight: e.target.value })} />
                                      <input type="number" min="0" className="input-field"
                                        placeholder="5" value={row.quantity} style={{ minWidth: 0 }}
                                        onWheel={e => e.target.blur()}
                                        onChange={e => updateRow(idx, gIdx, rIdx, { quantity: e.target.value })} />
                                      {isAdmin && (
                                        <input type="number" min="0" step="0.01" className="input-field"
                                          placeholder="₹ price" value={row.buying_price || ""}
                                          style={{ minWidth: 0 }}
                                          onWheel={e => e.target.blur()}
                                          onChange={e => updateRow(idx, gIdx, rIdx, { buying_price: e.target.value })} />
                                      )}
                                      <button type="button"
                                        onClick={() => removeRow(idx, gIdx, rIdx)}
                                        disabled={grp.rows.length <= 1}
                                        className="btn-ghost"
                                        style={{
                                          color: grp.rows.length > 1 ? "var(--danger)" : "transparent",
                                          padding: 6, width: 32, height: 32,
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                          flexShrink: 0, pointerEvents: grp.rows.length <= 1 ? "none" : "auto",
                                        }}>
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                    {wt > 0 && qty > 0 && (
                                      <div className="flex items-center gap-2 mt-1.5 pl-1 flex-wrap">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                                          style={{ color: kindColor, backgroundColor: kindBg }}>
                                          {isBag ? <Box size={9} /> : isPiece ? <Layers size={9} /> : null}
                                          {kindLabel}
                                        </span>
                                        {isAdmin && row.buying_price && Number(row.buying_price) > 0 && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                            style={{ color: "#6366f1", backgroundColor: "rgba(99,102,241,0.08)" }}>
                                            ₹{Number(row.buying_price).toFixed(2)}/unit · total ₹{(Number(row.buying_price) * qty).toFixed(2)}
                                          </span>
                                        )}
                                        <span className="text-[10px] tabular-nums font-medium" style={{ color: "var(--text-muted)" }}>
                                          = {(wt * qty).toFixed(1)} KG
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Add weight row */}
                              <button type="button" onClick={() => addRow(idx, gIdx)}
                                className="flex items-center justify-center gap-2 w-full rounded-lg transition-all"
                                style={{
                                  padding: "9px 12px", marginTop: 4,
                                  backgroundColor: "transparent", border: "1.5px dashed var(--border)",
                                  color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  WebkitTapHighlightColor: "transparent",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.backgroundColor = "var(--accent-soft)"; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                                <Plus size={13} /> Add weight row
                              </button>
                            </div>

                            {/* Group subtotal */}
                            {grpKg > 0 && (
                              <div className="px-3 py-2 flex items-center justify-between flex-wrap gap-2"
                                style={{ borderTop: "1px solid var(--border-light)", backgroundColor: "var(--bg-card)" }}>
                                <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Subtotal</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {grpCalc.totalBagUnits > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                                      style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
                                      <Box size={9} /> {grpCalc.totalBagUnits} bag{grpCalc.totalBagUnits !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {grpCalc.totalPieceUnits > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                                      style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}>
                                      <Layers size={9} /> {grpCalc.totalPieceUnits} pc{grpCalc.totalPieceUnits !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                  <span className="text-[10px] tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>
                                    {grpKg.toFixed(1)} KG
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Add warehouse group */}
                      <button type="button" onClick={() => addGroup(idx)}
                        className="flex items-center justify-center gap-2 w-full rounded-xl transition-all"
                        style={{
                          padding: "10px 16px", backgroundColor: "var(--bg-card)",
                          border: "1.5px solid var(--border)", color: "var(--text-secondary)",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.backgroundColor = "var(--accent-soft)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.backgroundColor = "var(--bg-card)"; }}>
                        <Warehouse size={14} /> Add another warehouse
                      </button>
                    </div>

                    {/* Item total strip */}
                    {tot.totalUnits > 0 && (
                      <div className="mt-2 px-3 py-2.5 rounded-xl flex items-center justify-between flex-wrap gap-2"
                        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                        <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                          Load #{idx + 1} total
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {tot.totalBagUnits > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                              style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
                              <Box size={9} /> {tot.totalBagUnits} bag{tot.totalBagUnits !== 1 ? "s" : ""}
                            </span>
                          )}
                          {tot.totalPieceUnits > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                              style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}>
                              <Layers size={9} /> {tot.totalPieceUnits} pcs
                            </span>
                          )}
                          <span className="text-[10px] tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>
                            {tot.totalKg.toFixed(1)} KG
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addItem}
            className="flex items-center justify-center gap-2 w-full rounded-xl transition-all"
            style={{
              padding: "11px 16px", backgroundColor: "var(--bg-card)",
              border: "2px dashed var(--border)", color: "var(--accent)",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.backgroundColor = "var(--accent-soft)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.backgroundColor = "var(--bg-card)"; }}>
            <Plus size={15} /> Add another load (different brand)
          </button>
        </div>
      </div>

      {/* ── Grand Total ── */}
      {grandTotal.bagUnits + grandTotal.pieceUnits > 0 && (
        <div className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
          <div>
            <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">Total Stock</p>
            <p className="text-2xl font-extrabold mt-1 tracking-tight">
              {grandTotal.bagUnits} <span className="text-sm font-medium opacity-70">bag{grandTotal.bagUnits !== 1 ? "s" : ""}</span>
              {grandTotal.pieceUnits > 0 && <> + {grandTotal.pieceUnits} <span className="text-sm font-medium opacity-70">pcs</span></>}
            </p>
            <p className="text-xs opacity-60 mt-0.5">{grandTotal.kg.toFixed(1)} KG</p>
          </div>
          <Package size={28} className="opacity-70" />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="label">Notes</label>
        <textarea className="input-field resize-none" rows={2} value={header.notes}
          onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} placeholder="Additional notes..." />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{t("common.cancel")}</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
          {loading ? t("common.loading") : (i18n.language === "ta" ? "வரவு பதிவு" : "Record Arrival")}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════
   SEND FORM  (stock-aware, mobile-optimised)
   ═══════════════════════════════════════════════════════ */
function SendForm({ onSubmit, onClose, brands, warehouses, stocks, isAdmin, i18n }) {
  const { t } = useTranslation();

  const [header, setHeader] = useState({
    vehicle_number: "", driver_name: "", driver_number: "",
    destination: "", to_whom: "", location: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "",
  });

  const blankGroup = () => ({ brand_id: "", warehouse_id: "", weight_entries: [] });
  const [groups, setGroups] = useState([blankGroup()]);
  const [loading, setLoading] = useState(false);

  const addGroup    = () => setGroups(p => [...p, blankGroup()]);
  const removeGroup = gi => setGroups(p => p.filter((_, i) => i !== gi));
  const updateGroup = (gi, patch) =>
    setGroups(p => p.map((g, i) => i === gi ? { ...g, ...patch } : g));

  const addWeightEntry = (gi, wkg) =>
    setGroups(p => p.map((g, i) => {
      if (i !== gi) return g;
      if (g.weight_entries.some(e => e.weight_kg === wkg)) return g;
      return { ...g, weight_entries: [...g.weight_entries, { weight_kg: wkg, qty: "", selling_price: "" }] };
    }));

  const removeWeightEntry = (gi, wkg) =>
    setGroups(p => p.map((g, i) =>
      i !== gi ? g : { ...g, weight_entries: g.weight_entries.filter(e => e.weight_kg !== wkg) }
    ));

  const updateWeightEntry = (gi, wkg, patch) =>
    setGroups(p => p.map((g, i) =>
      i !== gi ? g : {
        ...g,
        weight_entries: g.weight_entries.map(e => e.weight_kg === wkg ? { ...e, ...patch } : e)
      }
    ));

  const stocksWithQty = useMemo(
    () => stocks.filter(s => (s.remaining_bags ?? s.total_bags ?? 0) > 0), [stocks]);

  const brandsWithStock = useMemo(() => {
    const bIds = new Set(stocksWithQty.map(s => String(s.brand_id ?? s.brand?.id)));
    return brands.filter(b => bIds.has(String(b.id)));
  }, [brands, stocksWithQty]);

  const warehousesForGroup = brandId => {
    if (!brandId) return [];
    const wIds = new Set(
      stocksWithQty
        .filter(s => String(s.brand_id ?? s.brand?.id) === String(brandId))
        .map(s => s.warehouse_id ?? s.warehouse?.id)
    );
    return warehouses.filter(w => wIds.has(w.id));
  };

  const weightRowsForGroup = (brandId, warehouseId) => {
    if (!brandId || !warehouseId) return [];
    const matchingStocks = stocksWithQty.filter(
      s => String(s.brand_id ?? s.brand?.id) === String(brandId) &&
           String(s.warehouse_id ?? s.warehouse?.id) === String(warehouseId)
    );
    const weightMap = new Map();
    for (const s of matchingStocks) {
      const remaining = s.remaining_bags ?? s.total_bags ?? 0;
      if (s.weight_breakdowns && s.weight_breakdowns.length > 0) {
        for (const wb of s.weight_breakdowns) {
          if ((wb.quantity || 0) <= 0) continue;
          weightMap.set(wb.weight_kg, {
            weight_kg: wb.weight_kg,
            qty: (weightMap.get(wb.weight_kg)?.qty || 0) + wb.quantity,
            last_buy_price: s.last_buy_price ?? null,
            isPiece: wb.weight_kg < 25,
          });
        }
      } else if (remaining > 0) {
        const wkg = s.bag_weight_kg;
        weightMap.set(wkg, {
          weight_kg: wkg,
          qty: (weightMap.get(wkg)?.qty || 0) + remaining,
          last_buy_price: s.last_buy_price ?? null,
          isPiece: wkg < 25,
        });
      }
    }
    return Array.from(weightMap.values()).sort((a, b) => b.weight_kg - a.weight_kg);
  };

  const grandUnits = groups.reduce(
    (sum, g) => sum + g.weight_entries.reduce((s, e) => s + (Number(e.qty) || 0), 0), 0);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!header.vehicle_number || !header.driver_name || !header.driver_number)
      return toast.error("Vehicle, driver name & number required");
    if (header.driver_number.length !== 10) return toast.error("Driver number must be 10 digits");

    const payloadItems = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (!g.brand_id) return toast.error(`Send #${gi + 1}: Select a brand`);
      if (!g.warehouse_id) return toast.error(`Send #${gi + 1}: Select a warehouse`);
      if (g.weight_entries.length === 0) return toast.error(`Send #${gi + 1}: Add at least one weight`);
      const availWeights = weightRowsForGroup(g.brand_id, g.warehouse_id);
      for (const entry of g.weight_entries) {
        const qty = Number(entry.qty) || 0;
        if (qty <= 0) return toast.error(`Send #${gi + 1} · ${entry.weight_kg}KG: Enter quantity`);
        const avail = availWeights.find(w => w.weight_kg === entry.weight_kg);
        if (qty > (avail?.qty || 0)) return toast.error(`Send #${gi + 1} · ${entry.weight_kg}KG: Exceeds available (${avail?.qty || 0})`);
        if (isAdmin && (!entry.selling_price || Number(entry.selling_price) <= 0))
          return toast.error(`Send #${gi + 1} · ${entry.weight_kg}KG: Enter selling price`);
        payloadItems.push({
          brand_id: Number(g.brand_id),
          warehouse_id: Number(g.warehouse_id),
          bag_weight_kg: entry.weight_kg,
          bags: qty,
          ...(isAdmin && entry.selling_price ? { selling_price: Number(entry.selling_price) } : {}),
        });
      }
    }
    if (payloadItems.length === 0) return toast.error("No items to send");

    setLoading(true);
    try {
      const payload = {
        type: "send",
        vehicle_no: header.vehicle_number,
        driver_name: header.driver_name,
        driver_number: header.driver_number,
        destination: header.destination || null,
        commission_partner: isAdmin ? (header.to_whom || null) : null,
        transaction_date: new Date(header.transaction_date).toISOString(),
        notes: header.notes || null,
        items: payloadItems,
        ...(isAdmin ? { location: header.location || null } : {}),
      };
      await onSubmit(payload);
      toast.success(isAdmin ? "Send recorded" : "Send recorded — awaiting admin pricing");
      onClose();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to record send")); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Vehicle & Driver */}
      <div>
        <SectionLabel>{i18n.language === "ta" ? "வாகனம் & ஓட்டுநர்" : "Vehicle & Driver"}</SectionLabel>
        <div className="space-y-3">
          <div>
            <label className="label flex items-center gap-1.5"><Truck size={11} /> Vehicle Number *</label>
            <VehicleNumberInput value={header.vehicle_number} onChange={v => setHeader(h => ({ ...h, vehicle_number: v }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label flex items-center gap-1.5"><UserIcon size={11} /> Driver Name *</label>
              <input className="input-field" value={header.driver_name}
                onChange={e => setHeader(h => ({ ...h, driver_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Phone size={11} /> Driver No. *</label>
              <DriverNumberInput value={header.driver_number} onChange={v => setHeader(h => ({ ...h, driver_number: v }))} />
              {header.driver_number && header.driver_number.length !== 10 && (
                <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
                  {header.driver_number.length}/10
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="label">Destination / To</label>
            <input className="input-field" value={header.destination}
              onChange={e => setHeader(h => ({ ...h, destination: e.target.value }))} placeholder="Where to..." />
          </div>
          <div>
            <label className="label">Date & Time</label>
            <input type="datetime-local" className="input-field" value={header.transaction_date}
              onChange={e => setHeader(h => ({ ...h, transaction_date: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Admin block */}
      {isAdmin && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ backgroundColor: "rgba(99,102,241,0.04)", border: "1.5px dashed rgba(99,102,241,0.25)" }}>
          <SectionLabel color="#6366f1">Admin Details</SectionLabel>
          <div>
            <label className="label flex items-center gap-1.5"><UserIcon size={11} /> To Whom</label>
            <input className="input-field" value={header.to_whom}
              onChange={e => setHeader(h => ({ ...h, to_whom: e.target.value }))} placeholder="Buyer / Recipient..." />
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><MapPin size={11} /> Location</label>
            <input className="input-field" value={header.location}
              onChange={e => setHeader(h => ({ ...h, location: e.target.value }))} placeholder="Location..." />
          </div>
        </div>
      )}

      {brandsWithStock.length === 0 && (
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ backgroundColor: "var(--warning-soft)", border: "1.5px solid var(--warning)" }}>
          <AlertCircle size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--warning)" }}>No stock available</p>
            <p className="text-xs mt-0.5 opacity-80" style={{ color: "var(--warning)" }}>Record an arrival first before sending stock.</p>
          </div>
        </div>
      )}

      {/* Send Groups */}
      <div>
        <SectionLabel>{i18n.language === "ta" ? "அனுப்பும் சரக்கு" : "Items to Send"}</SectionLabel>
        <div className="space-y-3">
          {groups.map((g, gi) => {
            const availWarehouses  = warehousesForGroup(g.brand_id);
            const availWeights     = weightRowsForGroup(g.brand_id, g.warehouse_id);
            const addedWkgs        = new Set(g.weight_entries.map(e => e.weight_kg));
            const remainingWeights = availWeights.filter(w => !addedWkgs.has(w.weight_kg));

            return (
              <div key={gi} className="rounded-2xl overflow-hidden"
                style={{ border: "1.5px solid rgba(239,68,68,0.25)", backgroundColor: "var(--bg-card)" }}>

                <div className="flex items-center justify-between px-3 py-2.5"
                  style={{ backgroundColor: "rgba(239,68,68,0.05)", borderBottom: "1px solid var(--border-light)" }}>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>
                    Send #{gi + 1}
                  </span>
                  {groups.length > 1 && (
                    <button type="button" onClick={() => removeGroup(gi)}
                      className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg"
                      style={{ color: "var(--danger)", backgroundColor: "var(--danger-soft)" }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  {/* Brand + Warehouse */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="label">Brand *</label>
                      <select className="input-field" value={g.brand_id}
                        disabled={brandsWithStock.length === 0}
                        onChange={e => updateGroup(gi, { brand_id: e.target.value, warehouse_id: "", weight_entries: [] })}>
                        <option value="">— Select —</option>
                        {brandsWithStock.map(b => (
                          <option key={b.id} value={b.id}>
                            {i18n.language === "ta" && b.name_ta ? b.name_ta : b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Warehouse *</label>
                      <select className="input-field" value={g.warehouse_id}
                        disabled={!g.brand_id}
                        onChange={e => updateGroup(gi, { warehouse_id: e.target.value, weight_entries: [] })}>
                        <option value="">— Select —</option>
                        {availWarehouses.map(w => (
                          <option key={w.id} value={w.id}>
                            {i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Added weight entries */}
                  {g.weight_entries.map(entry => {
                    const avail    = availWeights.find(w => w.weight_kg === entry.weight_kg);
                    const qty      = Number(entry.qty) || 0;
                    const sp       = Number(entry.selling_price) || 0;
                    const bp       = avail?.last_buy_price;
                    const diff     = sp > 0 && bp != null ? sp - bp : null;
                    const isPiece  = avail?.isPiece ?? entry.weight_kg < 25;
                    const unitLbl  = isPiece ? "piece" : "bag";
                    const uColor   = isPiece ? "var(--warning)" : "var(--success)";
                    const uBg      = isPiece ? "var(--warning-soft)" : "var(--success-soft)";
                    const col      = diff == null ? "var(--text-muted)" : diff > 0 ? "var(--success)" : "var(--danger)";

                    return (
                      <div key={entry.weight_kg} className="rounded-xl p-3 space-y-2"
                        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg"
                            style={{ color: uColor, backgroundColor: uBg }}>
                            {entry.weight_kg} KG · {unitLbl}
                            {avail && <span className="ml-1.5 text-[10px] opacity-70">({avail.qty} avail)</span>}
                          </span>
                          <button type="button" onClick={() => removeWeightEntry(gi, entry.weight_kg)}
                            className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}>
                            <X size={14} />
                          </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr", gap: 8 }}>
                          <div>
                            <label className="label text-[10px]">Quantity {avail ? `(max ${avail.qty})` : ""}</label>
                            <input type="number" min="0" max={avail?.qty} className="input-field"
                              value={entry.qty} onWheel={e => e.target.blur()}
                              onChange={e => updateWeightEntry(gi, entry.weight_kg, { qty: e.target.value })}
                              placeholder="0" />
                          </div>
                          {isAdmin && (
                            <div>
                              <label className="label text-[10px]" style={{ color: "#ef4444" }}>
                                ₹ / {unitLbl} *
                              </label>
                              <input type="number" min="0" step="0.01" className="input-field"
                                value={entry.selling_price} onWheel={e => e.target.blur()}
                                style={{ borderColor: entry.selling_price ? "rgba(239,68,68,0.5)" : undefined }}
                                onChange={e => updateWeightEntry(gi, entry.weight_kg, { selling_price: e.target.value })}
                                placeholder="0.00" />
                            </div>
                          )}
                        </div>

                        {qty > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>
                              {qty} {unitLbl}{qty !== 1 ? "s" : ""}
                            </span>
                            {sp > 0 && (
                              <span className="text-[11px] font-semibold" style={{ color: "#ef4444" }}>
                                = ₹{(sp * qty).toFixed(0)}
                              </span>
                            )}
                            {isAdmin && diff != null && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ color: col, backgroundColor: diff > 0 ? "var(--success-soft)" : "var(--danger-soft)" }}>
                                {diff > 0 ? "+" : ""}{diff.toFixed(2)}/{unitLbl} · P&L ₹{(diff * qty).toFixed(0)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Weight chips */}
                  {g.warehouse_id && remainingWeights.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>+ Add weight:</p>
                      <div className="flex flex-wrap gap-2">
                        {remainingWeights.map(wr => (
                          <button key={wr.weight_kg} type="button"
                            onClick={() => addWeightEntry(gi, wr.weight_kg)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all"
                            style={{
                              backgroundColor: wr.isPiece ? "var(--warning-soft)" : "var(--success-soft)",
                              color: wr.isPiece ? "var(--warning)" : "var(--success)",
                              border: `1.5px solid ${wr.isPiece ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`,
                            }}>
                            <Plus size={12} />
                            {wr.weight_kg} KG
                            <span className="text-[10px] opacity-70">({wr.qty})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {g.warehouse_id && availWeights.length === 0 && (
                    <p className="text-xs py-2 text-center" style={{ color: "var(--text-muted)" }}>
                      No stock found for this warehouse.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addGroup} disabled={brandsWithStock.length === 0}
            className="flex items-center justify-center gap-2 w-full rounded-xl transition-all"
            style={{
              padding: "11px 16px", backgroundColor: "var(--bg-card)",
              border: "2px dashed var(--border)", color: "var(--danger)",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              opacity: brandsWithStock.length === 0 ? 0.4 : 1,
            }}>
            <Plus size={15} /> Add another brand / warehouse
          </button>
        </div>
      </div>

      {grandUnits > 0 && (
        <div className="rounded-2xl p-4 flex items-center justify-between"
          style={{ backgroundColor: "#ef4444", color: "#fff" }}>
          <div>
            <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">Total Dispatch</p>
            <p className="text-2xl font-extrabold mt-1">{grandUnits}
              <span className="text-sm font-medium text-white/70 ml-2">units</span>
            </p>
          </div>
          <ArrowUpFromLine size={28} style={{ opacity: 0.7 }} />
        </div>
      )}

      <div>
        <label className="label">Notes</label>
        <textarea className="input-field" style={{ minHeight: 60 }} value={header.notes}
          onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} placeholder="Additional notes..." />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={loading || brandsWithStock.length === 0} className="btn-primary">
          {loading ? "Sending…" : "Send Stock"}
        </button>
      </div>
    </form>
  );
}


function TransactionForm({ onSubmit, onClose, brands, riceTypes, warehouses,
  stocks, initialType, onBrandsRefresh, onRiceTypesRefresh, isAdmin, i18n }) {
  const [txType, setTxType] = useState(initialType || "arrival");

  const handleArrival = async (payload) => { await transactionApi.createArrival(payload); await onSubmit(); };
  const handleSend    = async (payload) => { await transactionApi.createSend(payload); await onSubmit(); };

  return (
    <div className="space-y-4">
      {/* Type toggle */}
      <div className="flex overflow-hidden" style={{ border: "1.5px solid var(--border)", borderRadius: 12 }}>
        {["arrival", "send"].map(type => (
          <button key={type} type="button" onClick={() => setTxType(type)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all"
            style={txType === type
              ? { backgroundColor: type === "arrival" ? "#10b981" : "#ef4444", color: "white" }
              : { color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}>
            {type === "arrival" ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
            {type === "arrival"
              ? (i18n.language === "ta" ? "வரவு" : "Arrival")
              : (i18n.language === "ta" ? "அனுப்பு" : "Send")}
          </button>
        ))}
      </div>

      {txType === "arrival" ? (
        <ArrivalForm
          onSubmit={handleArrival} onClose={onClose}
          brands={brands} riceTypes={riceTypes} warehouses={warehouses}
          onBrandsRefresh={onBrandsRefresh} onRiceTypesRefresh={onRiceTypesRefresh}
          isAdmin={isAdmin} i18n={i18n}
        />
      ) : (
        <SendForm
          onSubmit={handleSend} onClose={onClose}
          brands={brands} warehouses={warehouses} stocks={stocks}
          isAdmin={isAdmin} i18n={i18n}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PENDING ADMIN MODAL
   ═══════════════════════════════════════════════════════ */
function PendingAdminModal({ tx, onClose, onSave, i18n }) {
  const isArrival = tx.transaction_type === "inbound";

  // Arrival state
  const [millOwnerName, setMillOwnerName] = useState(tx.mill_owner_name || "");
  const [commissionPartner, setCommissionPartner] = useState(tx.commission_partner || "");
  const [rent, setRent] = useState(tx.rent ?? "");
  const [hiddenCharges, setHiddenCharges] = useState(tx.hidden_charges ?? "");

  // Per-weight-row buying prices: key = `${item_id}__${weight_kg}`
  // Pre-fill from existing saved weight prices
  const initWeightPrices = () => {
    const out = {};
    (tx.items || []).forEach(it => {
      (it.weights || []).forEach(w => {
        if (w.buying_price != null)
          out[`${it.id}__${w.weight_kg}`] = String(w.buying_price);
      });
    });
    return out;
  };
  const [weightBuyingPrices, setWeightBuyingPrices] = useState(initWeightPrices);

  // Send state
  const [toWhom, setToWhom] = useState(tx.commission_partner || "");
  const [location, setLocation] = useState(tx.location || "");

  // Per-weight-row selling prices for send: key = `${item_id}__${weight_kg}`
  const initSellPrices = () => {
    const out = {};
    (tx.items || []).forEach(it => {
      (it.weights || []).forEach(w => {
        if (w.selling_price != null)
          out[`${it.id}__${w.weight_kg}`] = String(w.selling_price);
        else if (it.selling_price != null)
          out[`${it.id}__${w.weight_kg}`] = String(it.selling_price);
      });
    });
    return out;
  };
  const [weightSellingPrices, setWeightSellingPrices] = useState(initSellPrices);

  const [loading, setLoading] = useState(false);

  // Build weight rows for display — flatten items × weights
  const allWeightRows = useMemo(() => {
    const rows = [];
    (tx.items || []).forEach(it => {
      const brandLabel = it.brand?.name || `Brand #${it.brand_id}`;
      const typeLabel  = it.rice_type_ref?.name || null;
      const weights = it.weights?.length > 0
        ? it.weights
        : [{ weight_kg: it.bag_size_kg, quantity: it.total_bags, buying_price: it.buying_price, selling_price: it.selling_price }];
      weights.forEach(w => {
        const isPiece = w.weight_kg < 25;
        rows.push({
          itemId: it.id,
          brandLabel,
          typeLabel,
          weight_kg: w.weight_kg,
          quantity: w.quantity,
          isPiece,
          unitLabel: isPiece ? "piece" : "bag",
          existingBuyPrice: w.buying_price ?? it.buying_price ?? null,
          existingSellPrice: w.selling_price ?? it.selling_price ?? null,
          key: `${it.id}__${w.weight_kg}`,
        });
      });
    });
    return rows;
  }, [tx]);

  const handleSave = async () => {
    const data = {};

    if (isArrival) {
      if (millOwnerName.trim())     data.mill_owner_name = millOwnerName.trim();
      if (commissionPartner.trim()) data.commission_partner = commissionPartner.trim();
      if (rent !== "")              data.rent = parseFloat(rent);
      if (hiddenCharges !== "")     data.hidden_charges = parseFloat(hiddenCharges);

      // Build per-item buying prices from weight rows
      const itemBuyingPrices = {};
      Object.entries(weightBuyingPrices).forEach(([key, val]) => {
        if (!val || parseFloat(val) <= 0) return;
        const [itemIdStr] = key.split("__");
        // Use last entered value per item (if multiple weights, we store per-weight on the backend)
        itemBuyingPrices[itemIdStr] = parseFloat(val);
      });

      // Also build weight-level prices map: { item_id: { weight_kg: price } }
      const weightPrices = {};
      Object.entries(weightBuyingPrices).forEach(([key, val]) => {
        if (!val || parseFloat(val) <= 0) return;
        const [itemIdStr, wkgStr] = key.split("__");
        if (!weightPrices[itemIdStr]) weightPrices[itemIdStr] = {};
        weightPrices[itemIdStr][wkgStr] = parseFloat(val);
      });

      if (Object.keys(itemBuyingPrices).length > 0) {
        data.item_buying_prices = itemBuyingPrices;
        data.item_weight_prices = weightPrices;
      }

      if (!data.mill_owner_name && Object.keys(itemBuyingPrices).length === 0 && !data.rent) {
        toast.error("Enter at least Mill Owner or one buying price to save");
        return;
      }
    } else {
      if (toWhom.trim())   data.commission_partner = toWhom.trim();
      if (location.trim()) data.location = location.trim();

      const itemSellingPrices = {};
      const weightPrices = {};
      Object.entries(weightSellingPrices).forEach(([key, val]) => {
        if (!val || parseFloat(val) <= 0) return;
        const [itemIdStr, wkgStr] = key.split("__");
        itemSellingPrices[itemIdStr] = parseFloat(val);
        if (!weightPrices[itemIdStr]) weightPrices[itemIdStr] = {};
        weightPrices[itemIdStr][wkgStr] = parseFloat(val);
      });

      const existingFilled = tx.items?.some(it =>
        it.selling_price != null || it.weights?.some(w => w.selling_price != null)
      );

      if (Object.keys(itemSellingPrices).length > 0) {
        data.item_selling_prices = itemSellingPrices;
        data.item_weight_sell_prices = weightPrices;
      }

      if (Object.keys(itemSellingPrices).length === 0 && !existingFilled) {
        toast.error("Enter selling price for at least one item to save");
        return;
      }
    }

    setLoading(true);
    try { await onSave(tx.id, data); onClose(); }
    catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* Transaction summary card */}
      <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--bg-secondary)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          {tx.vehicle_number || "—"} · {tx.total_bags || 0} bags
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {tx.transaction_date && format(new Date(tx.transaction_date), "dd MMM yyyy, HH:mm")}
          {tx.driver_name && ` · ${tx.driver_name}`}
        </p>
      </div>

      {isArrival ? (
        <>
          {/* Mill Owner + Commission Partner */}
          <div>
            <label className="label flex items-center gap-1.5"><Factory size={11} /> Mill Owner Name</label>
            <input className="input-field" value={millOwnerName}
              onChange={e => setMillOwnerName(e.target.value)} placeholder="Mill owner..." />
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><UserCheck size={11} /> Commission Partner</label>
            <input className="input-field" value={commissionPartner}
              onChange={e => setCommissionPartner(e.target.value)} placeholder="Agent / Partner..." />
          </div>

          {/* Global charges */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}>Global Charges</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label className="label text-[10px]">Rent</label>
                <input type="number" step="0.01" className="input-field" value={rent}
                  onWheel={e => e.target.blur()} onChange={e => setRent(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label text-[10px]">Hidden Charges</label>
                <input type="number" step="0.01" className="input-field" value={hiddenCharges}
                  onWheel={e => e.target.blur()} onChange={e => setHiddenCharges(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* Per-weight buying prices */}
          {allWeightRows.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#6366f1" }}>
                Buying Price per Weight
              </p>
              <div className="space-y-2">
                {allWeightRows.map(row => {
                  const val = weightBuyingPrices[row.key] ?? "";
                  const total = val && row.quantity ? (parseFloat(val) * row.quantity).toFixed(2) : null;
                  return (
                    <div key={row.key} className="rounded-xl p-3 space-y-2"
                      style={{ backgroundColor: "rgba(99,102,241,0.04)", border: "1px dashed rgba(99,102,241,0.25)" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                            {row.brandLabel}
                            {row.typeLabel && <span className="font-normal opacity-70"> · {row.typeLabel}</span>}
                          </span>
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: row.isPiece ? "var(--warning-soft)" : "var(--success-soft)",
                                     color: row.isPiece ? "var(--warning)" : "var(--success)" }}>
                            {row.weight_kg} KG · {row.quantity} {row.unitLabel}{row.quantity !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {row.existingBuyPrice != null && val === "" && (
                          <span className="text-[10px] font-bold" style={{ color: "#6366f1" }}>
                            Saved: ₹{row.existingBuyPrice}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.01" className="input-field flex-1"
                          value={val}
                          onWheel={e => e.target.blur()}
                          onChange={e => setWeightBuyingPrices(p => ({ ...p, [row.key]: e.target.value }))}
                          placeholder={`₹ per ${row.unitLabel}${row.existingBuyPrice ? ` (was ₹${row.existingBuyPrice})` : ""}`} />
                        {total && (
                          <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: "#6366f1" }}>
                            = ₹{total}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Send: To Whom + Location */}
          <div>
            <label className="label flex items-center gap-1.5"><UserIcon size={11} /> To Whom</label>
            <input className="input-field" value={toWhom}
              onChange={e => setToWhom(e.target.value)} placeholder="Buyer / Recipient..." />
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><MapPin size={11} /> Location</label>
            <input className="input-field" value={location}
              onChange={e => setLocation(e.target.value)} placeholder="Location..." />
          </div>

          {/* Per-weight selling prices */}
          {allWeightRows.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#ef4444" }}>
                Selling Price per Weight *
              </p>
              <div className="space-y-2">
                {allWeightRows.map(row => {
                  const val = weightSellingPrices[row.key] ?? "";
                  const buyP = row.existingBuyPrice;
                  const diff = val && buyP != null ? (parseFloat(val) - buyP) : null;
                  const col = diff == null ? "var(--text-muted)" : diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--text-muted)";
                  const bg  = diff == null ? "transparent" : diff > 0 ? "var(--success-soft)" : diff < 0 ? "var(--danger-soft)" : "transparent";
                  const total = val && row.quantity ? (parseFloat(val) * row.quantity).toFixed(2) : null;
                  return (
                    <div key={row.key} className="rounded-xl p-3 space-y-2"
                      style={{ backgroundColor: "rgba(239,68,68,0.04)", border: "1.5px solid rgba(239,68,68,0.2)" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                            {row.brandLabel}
                            {row.typeLabel && <span className="font-normal opacity-70"> · {row.typeLabel}</span>}
                          </span>
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: row.isPiece ? "var(--warning-soft)" : "var(--success-soft)",
                                     color: row.isPiece ? "var(--warning)" : "var(--success)" }}>
                            {row.weight_kg} KG · {row.quantity} {row.unitLabel}{row.quantity !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {buyP != null && (
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            Buy: ₹{buyP}/{row.unitLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <input type="number" step="0.01" className="input-field flex-1"
                          value={val}
                          onWheel={e => e.target.blur()}
                          onChange={e => setWeightSellingPrices(p => ({ ...p, [row.key]: e.target.value }))}
                          placeholder={`₹ per ${row.unitLabel}${row.existingSellPrice ? ` (was ₹${row.existingSellPrice})` : ""}`} />
                        {diff != null && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                            style={{ color: col, backgroundColor: bg }}>
                            {diff > 0 ? "+" : ""}{diff.toFixed(2)}/{row.unitLabel}
                          </span>
                        )}
                      </div>
                      {total && (
                        <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                          Revenue: ₹{total}
                          {diff != null && (
                            <span className="ml-2" style={{ color: col }}>
                              P&L: ₹{(diff * row.quantity).toFixed(2)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No weight details found for this transaction.
            </p>
          )}
        </>
      )}

      {/* Action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close (keep pending)
        </button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   INFO ROW  (detail card rows)
   ═══════════════════════════════════════════════════════ */
function InfoRow({ icon, iconBg, iconColor, label, value, valueBg, valueColor, pill, mono, large }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg || "var(--bg-secondary)", color: iconColor || "var(--text-muted)" }}>
          {React.cloneElement(icon, { size: 13, style: { color: iconColor || "var(--text-muted)" } })}
        </div>
        <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
      <span className={`text-right truncate max-w-[55%] ${pill ? "px-2.5 py-0.5 rounded-full" : ""} ${large ? "text-base font-extrabold" : "text-sm font-bold"} ${mono ? "font-mono tracking-wide" : ""} tabular-nums`}
        style={{ backgroundColor: pill ? (valueBg || "var(--bg-secondary)") : undefined, color: valueColor || "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TRANSACTION ACCORDION CARD
   ═══════════════════════════════════════════════════════ */
function TransactionAccordion({ tx, isOpen, onToggle, isAdmin,
  onDelete, onFillPending, brands, warehouses, i18n }) {
  const isArrival = tx.transaction_type === "inbound";
  const typeColor = isArrival ? "#10b981" : "#ef4444";
  const typeBg = isArrival ? "rgba(16,185,129," : "rgba(239,68,68,";

  const directionLabel = isArrival
    ? (tx.source || (i18n.language === "ta" ? "மூலம் இல்லை" : "Unknown Source"))
    : (tx.destination || (i18n.language === "ta" ? "இடம் இல்லை" : "Unknown Dest"));

  const totalBags = tx.total_bags ?? tx.quantity_bags ?? 0;
  const totalKg   = tx.total_weight_kg ?? tx.quantity_kg ?? 0;
  const txItems   = tx.items || [];
  const sellDiff  = tx.sell_price != null && tx.price != null ? tx.sell_price - tx.price : null;

  const brandName = (id) => {
    if (id) { const b = brands.find(x => x.id == id); if (b) return i18n.language === "ta" && b.name_ta ? b.name_ta : b.name; }
    return tx.stock?.brand_name || "—";
  };
  const wName = (id) => {
    if (id) { const w = warehouses.find(x => x.id == id); if (w) return i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name; }
    return tx.warehouse?.location_name || "—";
  };

  return (
    <div className="overflow-hidden transition-all"
      style={{
        backgroundColor: "var(--bg-card)",
        border: `1.5px solid ${isOpen ? typeColor : tx.admin_pending ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
        borderRadius: 16, boxShadow: isOpen ? "var(--shadow-md)" : "var(--shadow-xs)",
        borderLeftWidth: 4, borderLeftColor: tx.admin_pending ? "#f59e0b" : typeColor,
      }}>

      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors"
        style={{ backgroundColor: isOpen ? `${typeBg}0.04)` : "transparent" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${typeBg}0.1)` }}>
          {isArrival ? <ArrowDownToLine size={17} style={{ color: typeColor }} /> : <ArrowUpFromLine size={17} style={{ color: typeColor }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: typeColor }}>
              {isArrival ? (i18n.language === "ta" ? "வரவு" : "From") : (i18n.language === "ta" ? "அனுப்பு" : "To")}
            </span>
            <span className="text-sm font-extrabold truncate" style={{ color: "var(--text-primary)" }}>{directionLabel}</span>
            {tx.admin_pending && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>⚠ Pending</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {tx.vehicle_number && (
              <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-muted)" }}>
                {tx.vehicle_number}
              </span>
            )}
            {txItems.length > 0 && (
              <>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
                <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                  {txItems.length} {txItems.length === 1 ? "item" : "items"}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xl font-extrabold tabular-nums" style={{ color: typeColor, letterSpacing: "-0.02em" }}>{totalBags}</span>
          <div className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>{i18n.language === "ta" ? "மூட்டை" : "bags"}</div>
        </div>
        <ChevronDown size={16} className="shrink-0 transition-transform duration-300"
          style={{ color: "var(--text-muted)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>

      <div className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isOpen ? "3000px" : "0px", opacity: isOpen ? 1 : 0 }}>
        <div className="px-3 pb-4 pt-1" style={{ borderTop: "1px solid var(--border-light)" }}>
          {/* Core info rows */}
          <div className="space-y-2.5 py-3 mb-3" style={{ borderBottom: "1px solid var(--border-light)" }}>
            <InfoRow icon={isArrival ? <ArrowDownToLine /> : <ArrowUpFromLine />}
              iconBg={`${typeBg}0.08)`} iconColor={typeColor}
              label={i18n.language === "ta" ? "வகை" : "Type"}
              value={isArrival ? "Arrival" : "Send"} valueBg={`${typeBg}0.1)`} valueColor={typeColor} pill />
            <InfoRow icon={<Calendar />} label="Date"
              value={format(new Date(tx.transaction_date), "dd MMM yyyy, HH:mm")} />
            {tx.vehicle_number && <InfoRow icon={<Truck />} label="Vehicle" value={tx.vehicle_number} mono />}
            {tx.driver_name && <InfoRow icon={<UserCheck />} label="Driver" value={tx.driver_name} />}
            {tx.driver_number && <InfoRow icon={<Phone />} label="Driver No." value={tx.driver_number} mono />}
            {(tx.source || tx.destination) && (
              <InfoRow icon={<MapPin />}
                label={isArrival ? "Source" : "Destination"}
                value={tx.source || tx.destination} />
            )}
            {isAdmin && tx.commission_partner && (
              isArrival
                ? <InfoRow icon={<UserCheck />} label="Commission Partner" value={tx.commission_partner} />
                : <InfoRow icon={<UserIcon />} label="To Whom" value={tx.commission_partner} />
            )}
            {tx.location && isAdmin && <InfoRow icon={<MapPin />} label="Location" value={tx.location} />}
            <InfoRow icon={<Hash />} iconBg={`${typeBg}0.08)`} iconColor={typeColor}
              label={i18n.language === "ta" ? "மொத்த மூட்டை" : "Total Bags"}
              value={`${totalBags} bags`} valueColor={typeColor} large />
            <InfoRow icon={<Package />} label="Total Weight"
              value={`${Number(totalKg).toFixed(1)} KG`} large />
          </div>

          {/* Item breakdown */}
          {txItems.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                {i18n.language === "ta" ? "பொருள் விவரங்கள்" : "Item Breakdown"}
              </p>
              <div className="space-y-2">
                {txItems.map((it, i2) => (
                  <div key={i2} className="p-2.5 rounded-xl"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: typeColor }}>
                        Item {i2 + 1}
                      </span>
                      <span className="text-sm font-extrabold tabular-nums" style={{ color: typeColor }}>
                        {it.total_bags} bags
                      </span>
                    </div>
                    <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                      {it.brand?.name || brandName(it.brand_id)}
                      {(it.rice_type_ref?.name || it.rice_type) && (
                        <span className="ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
                          {it.rice_type_ref?.name || it.rice_type}
                        </span>
                      )}
                    </div>
                    {it.weights?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {it.weights.map((w, wi) => (
                          <span key={wi} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
                            {w.quantity}×{w.weight_kg}KG
                          </span>
                        ))}
                      </div>
                    )}
                    {it.splits?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {it.splits.map((s, si) => (
                          <span key={si} className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                            style={{ backgroundColor: "rgba(99,102,241,0.08)", color: "#6366f1" }}>
                            <Building2 size={9} />
                            {s.warehouse?.location_name || wName(s.warehouse_id)}: {s.bags}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.warehouse_id && (!it.splits || !it.splits.length) && (
                      <div className="mt-1.5 text-[11px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "rgba(99,102,241,0.08)", color: "#6366f1" }}>
                        <Building2 size={9} /> {it.warehouse?.location_name || wName(it.warehouse_id)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin complete details block */}
          {isAdmin && (
            <div className="space-y-2.5 py-3 mb-3" style={{ borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#6366f1" }}>
                Admin Details
              </p>

              {/* Inbound admin info */}
              {isArrival && (
                <>
                  {tx.mill_owner_name && <InfoRow icon={<Factory />} label="Mill Owner" value={tx.mill_owner_name} iconBg="rgba(99,102,241,0.08)" iconColor="#6366f1" />}
                  {tx.commission_partner && <InfoRow icon={<UserCheck />} label="Commission Partner" value={tx.commission_partner} />}
                  {tx.rent != null && tx.rent > 0 && <InfoRow icon={<DollarSign />} label="Rent (Global)" value={`₹${tx.rent.toFixed(2)}`} />}
                  {tx.hidden_charges != null && tx.hidden_charges > 0 && <InfoRow icon={<DollarSign />} label="Hidden Charges (Global)" value={`₹${tx.hidden_charges.toFixed(2)}`} />}
                  {/* Per-item buying prices */}
                  {txItems.length > 0 && txItems.some(it => it.buying_price != null) && (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.15)" }}>
                      <div className="px-3 py-1.5" style={{ backgroundColor: "rgba(99,102,241,0.06)" }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6366f1" }}>Buying Price per Item</span>
                      </div>
                      {txItems.map((it, i2) => {
                        // Show per-weight row prices if available, else item-level price
                        const hasWeightPrices = it.weights?.some(w => w.buying_price != null);
                        if (!hasWeightPrices && it.buying_price == null) return null;
                        return (
                          <div key={i2} style={{ borderTop: i2 === 0 ? "none" : "1px solid var(--border-light)" }}>
                            <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                                {it.brand?.name || brandName(it.brand_id)}
                                {it.rice_type_ref?.name && <span className="ml-1 opacity-60">· {it.rice_type_ref.name}</span>}
                              </span>
                              {!hasWeightPrices && it.buying_price != null && (
                                <span className="text-sm font-bold tabular-nums" style={{ color: "#6366f1" }}>₹{it.buying_price.toFixed(2)}/unit</span>
                              )}
                            </div>
                            {hasWeightPrices && (
                              <div className="px-3 pb-2 space-y-1">
                                {it.weights.filter(w => w.buying_price != null).map((w, wi) => (
                                  <div key={wi} className="flex items-center justify-between py-1 px-2 rounded-lg"
                                    style={{ backgroundColor: "rgba(99,102,241,0.04)" }}>
                                    <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                                      {w.weight_kg}KG × {w.quantity}
                                    </span>
                                    <span className="text-xs font-bold tabular-nums" style={{ color: "#6366f1" }}>
                                      ₹{w.buying_price.toFixed(2)}/unit · ₹{(w.buying_price * w.quantity).toFixed(2)} total
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Legacy global price field */}
                  {tx.price != null && txItems.every(it => it.buying_price == null) && (
                    <InfoRow icon={<DollarSign />} label="Buying Price/Bag" value={`₹${tx.price}`} />
                  )}
                </>
              )}

              {/* Outbound admin info */}
              {!isArrival && (
                <>
                  {tx.commission_partner && <InfoRow icon={<UserCheck />} label="To Whom" value={tx.commission_partner} />}
                  {tx.location && <InfoRow icon={<MapPin />} label="Location" value={tx.location} />}
                  {/* Per-item selling prices */}
                  {txItems.length > 0 && txItems.some(it => it.selling_price != null) && (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.2)" }}>
                      <div className="px-3 py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.05)" }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>Selling Price per Item</span>
                      </div>
                      {txItems.map((it, i2) => {
                        const sp = it.selling_price;
                        const bp = it.buying_price ?? tx.price;
                        const diff = sp != null && bp != null ? sp - bp : null;
                        const col = diff == null ? "var(--text-muted)" : diff > 0 ? "#10b981" : diff < 0 ? "#ef4444" : "var(--text-muted)";
                        const bg  = diff == null ? "var(--bg-secondary)" : diff > 0 ? "var(--success-soft)" : diff < 0 ? "var(--danger-soft)" : "var(--bg-secondary)";
                        return sp != null ? (
                          <div key={i2} className="px-3 py-2" style={{ borderTop: i2 === 0 ? "none" : "1px solid var(--border-light)" }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                                {it.brand?.name || brandName(it.brand_id)}
                                {it.rice_type_ref?.name && <span className="ml-1 opacity-60">· {it.rice_type_ref.name}</span>}
                                <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>({it.total_bags} bags)</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold tabular-nums" style={{ color: "#ef4444" }}>₹{sp.toFixed(2)}/bag</span>
                                {diff != null && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: col, backgroundColor: bg }}>
                                    {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              {bp != null && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Buy: ₹{bp.toFixed(2)}</span>}
                              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Total: ₹{(sp * it.total_bags).toFixed(2)}</span>
                              {diff != null && <span className="text-[10px] font-semibold" style={{ color: col }}>P&L: ₹{(diff * it.total_bags).toFixed(2)}</span>}
                            </div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  {/* Global sell_price fallback */}
                  {tx.sell_price != null && txItems.every(it => it.selling_price == null) && (
                    <InfoRow icon={<DollarSign />} label="Sell Price/Bag" value={`₹${tx.sell_price}`} />
                  )}
                  {sellDiff != null && (
                    <InfoRow icon={<DollarSign />}
                      iconBg={sellDiff > 0 ? "rgba(16,185,129,0.08)" : sellDiff < 0 ? "rgba(239,68,68,0.08)" : undefined}
                      iconColor={sellDiff > 0 ? "#10b981" : sellDiff < 0 ? "#ef4444" : undefined}
                      label="Profit / Loss"
                      value={`${sellDiff > 0 ? "+" : ""}₹${sellDiff.toFixed(2)}/bag`}
                      valueColor={sellDiff > 0 ? "#10b981" : sellDiff < 0 ? "#ef4444" : "var(--text-primary)"} large />
                  )}
                </>
              )}
            </div>
          )}

          {tx.notes && (
            <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-secondary)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <FileText size={12} style={{ color: "var(--text-muted)" }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Notes</span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{tx.notes}</p>
            </div>
          )}

          {isAdmin && tx.admin_pending && (
            <button onClick={e => { e.stopPropagation(); onFillPending(tx); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all mb-2"
              style={{ backgroundColor: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>
              <Bell size={14} />
              {i18n.language === "ta" ? "நிலுவை விவரங்களை நிரப்பு" : "Fill Pending Details"}
            </button>
          )}

          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); onDelete(tx); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ backgroundColor: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
              <Trash2 size={14} />
              {i18n.language === "ta" ? "பரிவர்த்தனையை நீக்கு" : "Delete Transaction"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin, canSeeField } = useAuth();

  const [transactions, setTransactions] = useState([]);
  const [brands, setBrands]             = useState([]);
  const [riceTypes, setRiceTypes]       = useState(FALLBACK_RICE_TYPES);
  const [warehouses, setWarehouses]     = useState([]);
  const [stocks, setStocks]             = useState([]);
  const [loading, setLoading]           = useState(true);

  const [modal, setModal]               = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingModal, setPendingModal] = useState(null);
  const [openCardId, setOpenCardId]     = useState(null);

  const [filters, setFilters] = useState({
    transaction_type: "", warehouse_id: "", brand_id: "",
    date_from: "", date_to: "", vehicle_no: "", mill_owner_name: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    transactionApi.list(params)
      .then(r => setTransactions(r.data || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [filters]);

  const refreshBrands = useCallback(async () => {
    try { const r = await brandApi.list(); setBrands(r.data || []); } catch { setBrands([]); }
  }, []);

  const refreshRiceTypes = useCallback(async () => {
    try {
      const r = await riceTypeApi.list();
      const d = r.data || [];
      setRiceTypes(d.length ? d : FALLBACK_RICE_TYPES);
    } catch { setRiceTypes(FALLBACK_RICE_TYPES); }
  }, []);

  const refreshStocks = useCallback(async () => {
    try {
      // Try stockApi first; fall back to aggregating warehouse stocks
      const { stockApi } = await import("../utils/api").catch(() => ({}));
      if (stockApi) {
        const r = await stockApi.list();
        setStocks(r.data || []);
      }
    } catch { setStocks([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    refreshBrands(); refreshRiceTypes(); refreshStocks();
    warehouseApi.list().then(r => setWarehouses(r.data || [])).catch(() => setWarehouses([]));
  }, [refreshBrands, refreshRiceTypes, refreshStocks]);

  const handleCreate = async () => { load(); refreshBrands(); refreshRiceTypes(); refreshStocks(); };

  const handleDelete = async () => {
    try {
      await transactionApi.delete(deleteTarget.id);
      toast.success(i18n.language === "ta" ? "பரிவர்த்தனை நீக்கப்பட்டது" : "Transaction deleted");
      setDeleteTarget(null); load();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const handlePendingFill = async (id, data) => { await transactionApi.completeAdminFields(id, data); load(); };

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters({ transaction_type: "", warehouse_id: "", brand_id: "", date_from: "", date_to: "", vehicle_no: "", mill_owner_name: "" });
  const toggleCard = (id) => setOpenCardId(prev => prev === id ? null : id);

  const totalArrival = transactions.filter(tx => tx.transaction_type === "inbound").reduce((s, tx) => s + (tx.total_bags ?? tx.quantity_bags ?? 0), 0);
  const totalSend    = transactions.filter(tx => tx.transaction_type === "outbound").reduce((s, tx) => s + (tx.total_bags ?? tx.quantity_bags ?? 0), 0);
  const pendingCount = transactions.filter(tx => tx.admin_pending).length;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {t("transaction.title")}
          </h1>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {transactions.length} {i18n.language === "ta" ? "பரிவர்த்தனைகள்" : "transactions"}
            {totalArrival > 0 && <span style={{ color: "#10b981" }}> · ▲{totalArrival}</span>}
            {totalSend > 0 && <span style={{ color: "#ef4444" }}> · ▼{totalSend}</span>}
            {isAdmin && pendingCount > 0 && <span style={{ color: "#f59e0b" }}> · ⚠ {pendingCount} pending</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFilters(s => !s)} className="btn-secondary relative"
            style={showFilters ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
            <Filter size={16} />
            <span className="hidden sm:inline">{t("common.filter")}</span>
            {activeFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ backgroundColor: "var(--accent)" }}>{activeFilters}</span>
            )}
          </button>
          <button onClick={() => setModal({ initialType: "arrival" })} className="btn-primary">
            <Plus size={16} />
            <span className="hidden sm:inline">{i18n.language === "ta" ? "புதிய பரிவர்த்தனை" : "New"}</span>
            <span className="sm:hidden">+</span>
          </button>
        </div>
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setModal({ initialType: "arrival" })}
          className="relative overflow-hidden transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)",
            border: "2px solid rgba(16,185,129,0.18)", borderRadius: 16, padding: "18px 12px",
          }}>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
              <ArrowDownToLine size={22} style={{ color: "#10b981" }} />
            </div>
            <span className="text-sm font-extrabold" style={{ color: "#10b981" }}>
              {i18n.language === "ta" ? "வரவு" : "Arrival"}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "இறக்கு" : "Unload Stock"}
            </span>
          </div>
        </button>
        <button onClick={() => setModal({ initialType: "send" })}
          className="relative overflow-hidden transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.01) 100%)",
            border: "2px solid rgba(239,68,68,0.18)", borderRadius: 16, padding: "18px 12px",
          }}>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
              <ArrowUpFromLine size={22} style={{ color: "#ef4444" }} />
            </div>
            <span className="text-sm font-extrabold" style={{ color: "#ef4444" }}>
              {i18n.language === "ta" ? "அனுப்பு" : "Send"}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "செலவு" : "Dispatch Stock"}
            </span>
          </div>
        </button>
      </div>

      {/* Pending banner */}
      {isAdmin && pendingCount > 0 && (
        <div className="card" style={{ borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.04)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
              <Bell size={16} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "#f59e0b" }}>
                {pendingCount} {i18n.language === "ta" ? "பரிவர்த்தனைகளுக்கு கவனம் தேவை" : "transactions need attention"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Mill owner, price, rent or sell price not filled
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="card animate-scale-in space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input-field" value={filters.transaction_type}
                onChange={e => setFilters(f => ({ ...f, transaction_type: e.target.value }))}>
                <option value="">{t("common.all")}</option>
                <option value="inbound">Arrival</option>
                <option value="outbound">Send</option>
              </select>
            </div>
            <div>
              <label className="label">Warehouse</label>
              <select className="input-field" value={filters.warehouse_id}
                onChange={e => setFilters(f => ({ ...f, warehouse_id: e.target.value }))}>
                <option value="">{t("common.all")}</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Brand</label>
              <select className="input-field" value={filters.brand_id}
                onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value }))}>
                <option value="">{t("common.all")}</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>
                    {i18n.language === "ta" && b.name_ta ? b.name_ta : b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date From</label>
              <input type="date" className="input-field" value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date To</label>
              <input type="date" className="input-field" value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
            </div>
            <div>
              <label className="label">Vehicle</label>
              <input className="input-field" value={filters.vehicle_no}
                onChange={e => setFilters(f => ({ ...f, vehicle_no: e.target.value }))} placeholder="TN 01..." />
            </div>
            {isAdmin && (
              <div>
                <label className="label">Mill Owner</label>
                <input className="input-field" value={filters.mill_owner_name}
                  onChange={e => setFilters(f => ({ ...f, mill_owner_name: e.target.value }))} placeholder="Name..." />
              </div>
            )}
          </div>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="btn-ghost" style={{ color: "#ef4444" }}>
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Transaction list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "transparent" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{t("common.loading")}</span>
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
                {i18n.language === "ta" ? "முதல் வரவு பதிவு செய்யவும்" : "Record your first arrival or send"}
              </p>
            </div>
          </div>
        ) : (
          transactions.map(tx => (
            <TransactionAccordion
              key={tx.id} tx={tx}
              isOpen={openCardId === tx.id}
              onToggle={() => toggleCard(tx.id)}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              onFillPending={setPendingModal}
              brands={brands} warehouses={warehouses}
              i18n={i18n}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <Modal open={!!modal} onClose={() => setModal(null)}
        title={i18n.language === "ta" ? "புதிய பரிவர்த்தனை" : "New Transaction"} size="lg">
        {modal && (
          <TransactionForm
            onSubmit={handleCreate} onClose={() => setModal(null)}
            brands={brands} riceTypes={riceTypes} warehouses={warehouses} stocks={stocks}
            initialType={modal.initialType}
            onBrandsRefresh={refreshBrands} onRiceTypesRefresh={refreshRiceTypes}
            isAdmin={isAdmin} i18n={i18n}
          />
        )}
      </Modal>

      <Modal open={!!pendingModal} onClose={() => setPendingModal(null)}
        title={i18n.language === "ta" ? "நிலுவை விவரங்கள்" : "Fill Pending Details"}>
        {pendingModal && (
          <PendingAdminModal
            tx={pendingModal} onClose={() => setPendingModal(null)}
            onSave={handlePendingFill} i18n={i18n}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={i18n.language === "ta" ? "பரிவர்த்தனை நீக்கம்" : "Delete Transaction"}
        message={i18n.language === "ta" ? "இந்த பரிவர்த்தனை நிரந்தரமாக நீக்கப்படும்." : "This will permanently delete this transaction record."} />
    </div>
  );
}