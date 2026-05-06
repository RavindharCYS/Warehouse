// pages/DashboardPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Warehouse, Package, TrendingUp, TrendingDown, AlertTriangle,
  ArrowRight, Activity, ArrowDownToLine, ArrowUpFromLine,
  Plus, Trash2, ClipboardList, Truck, User, Phone, MapPin,
  IndianRupee, Factory, Box, Layers, PlusCircle,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  dashboardApi, transactionApi, stockApi, warehouseApi, brandApi,
  riceTypeApi, millOwnerApi, getErrorMessage,
  calcTotalWeight, calcArrivalEntries, classifyWeight, BAG_SIZES,
  PIECE_THRESHOLD_KG,
} from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import StatCard from "../components/common/StatCard";
import StockLevelBar from "../components/common/StockLevelBar";
import Modal from "../components/common/Modal";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ──────────────────────────────────────────────────────────
   VEHICLE NUMBER INPUT  (CC NN CC NNNN)
   ────────────────────────────────────────────────────────── */
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
      className="input-field uppercase"
      value={value}
      onChange={(e) => onChange(formatVehicle(e.target.value))}
      placeholder={placeholder || "TN 01 AB 1234"}
      maxLength={13}
      style={{ letterSpacing: "0.12em", fontFamily: "ui-monospace, monospace" }}
    />
  );
}

/* ──────────────────────────────────────────────────────────
   DRIVER NUMBER INPUT — only 10 digits, no chars
   ────────────────────────────────────────────────────────── */
function DriverNumberInput({ value, onChange, placeholder }) {
  const handleChange = (e) => {
    const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 10);
    onChange(onlyDigits);
  };
  return (
    <input
      className="input-field"
      value={value}
      onChange={handleChange}
      placeholder={placeholder || "10-digit mobile"}
      maxLength={10}
      inputMode="numeric"
      pattern="[0-9]*"
      type="tel"
    />
  );
}

/* ──────────────────────────────────────────────────────────
   PROFIT / LOSS BADGE
   ────────────────────────────────────────────────────────── */
function ProfitLossBadge({ buyPrice, sellPrice, size = "sm" }) {
  if (buyPrice == null || sellPrice == null || buyPrice === "" || sellPrice === "") return null;
  const diff = Number(sellPrice) - Number(buyPrice);
  const isProfit = diff > 0;
  const isLoss = diff < 0;
  const sign = isProfit ? "+" : "";
  const color = isProfit ? "var(--success)" : isLoss ? "var(--danger)" : "var(--text-primary)";
  const px = size === "lg" ? "text-base" : "text-xs";
  return (
    <span className={`font-bold tabular-nums ${px}`} style={{ color }}>
      {sign}{diff.toFixed(2)}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────
   REALTIME SELL PRICE INDICATOR
   ────────────────────────────────────────────────────────── */
function SellPriceIndicator({ buyPrice, sellPrice }) {
  if (!sellPrice || sellPrice === "") return null;
  const sell = Number(sellPrice);
  const buy = Number(buyPrice);
  const diff = sell - buy;
  const hasRef = buyPrice != null && buyPrice !== "";
  const profitColor = diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--text-muted)";
  const sign = diff > 0 ? "+" : "";

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span
        className="text-base font-extrabold tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        ₹{sell.toFixed(2)}
      </span>
      {hasRef && (
        <span
          className="text-sm font-bold tabular-nums rounded-lg px-2 py-0.5"
          style={{
            color: profitColor,
            backgroundColor: diff > 0 ? "var(--success-soft)" : diff < 0 ? "var(--danger-soft)" : "var(--bg-secondary)",
          }}
        >
          ({sign}{diff.toFixed(2)})
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ARRIVAL FORM — warehouse-first grouping
   Each warehouse group carries multiple weight×qty rows.
   - weight ≥ 25kg → bag (1 per qty)
   - weight < 25kg → piece (loose)
   ══════════════════════════════════════════════════════════ */

/**
 * Data shape for each item (load):
 *   brand_id, rice_type_id, bag_size
 *   warehouseGroups: [
 *     { warehouse_id, rows: [{ weight, quantity }] }
 *   ]
 *
 * On submit we flatten warehouseGroups → entries[{ weight, quantity, warehouse_id }]
 */
function ArrivalForm({ onSubmit, onClose, brands, riceTypes, warehouses, onMastersRefresh }) {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();

  const [header, setHeader] = useState({
    vehicle_number: "",
    driver_name: "",
    driver_number: "",
    source: "",
    commission_partner: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "",
    mill_owner_name: "",
    price: "",
    rent: "",
    hidden_charges: "",
  });

  // Per item: brand + ricetype + bag_size + warehouseGroups[]
  const blankRow = () => ({ weight: "", quantity: "" });
  const blankGroup = () => ({ warehouse_id: "", rows: [blankRow()] });
  const blankItem = () => ({
    brand_id: "",
    rice_type_id: "",
    bag_size: 25,
    warehouseGroups: [blankGroup()],
  });

  const [items, setItems] = useState([blankItem()]);
  const [loading, setLoading] = useState(false);
  const [newBrandName, setNewBrandName] = useState({});
  const [newRiceTypeName, setNewRiceTypeName] = useState({});

  // ── Item-level helpers ──
  const addItem = () => setItems((p) => [...p, blankItem()]);
  const removeItem = (idx) => setItems((p) => p.filter((_, i) => i !== idx));
  const updateItem = (idx, patch) =>
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  // ── Warehouse-group helpers ──
  const addGroup = (itemIdx) =>
    setItems((p) =>
      p.map((it, i) =>
        i === itemIdx
          ? { ...it, warehouseGroups: [...it.warehouseGroups, blankGroup()] }
          : it
      )
    );
  const removeGroup = (itemIdx, gIdx) =>
    setItems((p) =>
      p.map((it, i) =>
        i === itemIdx
          ? { ...it, warehouseGroups: it.warehouseGroups.filter((_, g) => g !== gIdx) }
          : it
      )
    );
  const updateGroup = (itemIdx, gIdx, patch) =>
    setItems((p) =>
      p.map((it, i) =>
        i === itemIdx
          ? {
              ...it,
              warehouseGroups: it.warehouseGroups.map((g, gi) =>
                gi === gIdx ? { ...g, ...patch } : g
              ),
            }
          : it
      )
    );

  // ── Row helpers (inside a warehouse group) ──
  const addRow = (itemIdx, gIdx) =>
    setItems((p) =>
      p.map((it, i) =>
        i === itemIdx
          ? {
              ...it,
              warehouseGroups: it.warehouseGroups.map((g, gi) =>
                gi === gIdx ? { ...g, rows: [...g.rows, blankRow()] } : g
              ),
            }
          : it
      )
    );
  const removeRow = (itemIdx, gIdx, rIdx) =>
    setItems((p) =>
      p.map((it, i) =>
        i === itemIdx
          ? {
              ...it,
              warehouseGroups: it.warehouseGroups.map((g, gi) =>
                gi === gIdx
                  ? { ...g, rows: g.rows.filter((_, ri) => ri !== rIdx) }
                  : g
              ),
            }
          : it
      )
    );
  const updateRow = (itemIdx, gIdx, rIdx, patch) =>
    setItems((p) =>
      p.map((it, i) =>
        i === itemIdx
          ? {
              ...it,
              warehouseGroups: it.warehouseGroups.map((g, gi) =>
                gi === gIdx
                  ? {
                      ...g,
                      rows: g.rows.map((r, ri) => (ri === rIdx ? { ...r, ...patch } : r)),
                    }
                  : g
              ),
            }
          : it
      )
    );

  // ── Masters ──
  const handleCreateBrand = async (idx) => {
    const name = (newBrandName[idx] || "").trim();
    if (!name) return;
    try {
      const res = await brandApi.create({ name });
      toast.success(`Brand "${name}" added`);
      setNewBrandName((p) => ({ ...p, [idx]: "" }));
      await onMastersRefresh();
      updateItem(idx, { brand_id: res.data.id });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create brand"));
    }
  };

  const handleCreateRiceType = async (idx) => {
    const name = (newRiceTypeName[idx] || "").trim();
    if (!name) return;
    const brandId = items[idx].brand_id || null;
    try {
      const res = await riceTypeApi.create({ name, brand_id: brandId });
      toast.success(`Rice type "${name}" added`);
      setNewRiceTypeName((p) => ({ ...p, [idx]: "" }));
      await onMastersRefresh();
      updateItem(idx, { rice_type_id: res.data.id });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create rice type"));
    }
  };

  // ── Flatten warehouseGroups → flat entries[] for totals ──
  const flatEntries = (item) =>
    item.warehouseGroups.flatMap((g) =>
      g.rows.map((r) => ({
        weight: Number(r.weight) || 0,
        quantity: Number(r.quantity) || 0,
        warehouse_id: g.warehouse_id,
      }))
    );

  const itemTotals = useMemo(
    () =>
      items.map((it) => {
        const rows = flatEntries(it).map((e) => ({
          weight: e.weight,
          quantity: e.quantity,
        }));
        const totalKg = calcTotalWeight(rows);
        const calc = calcArrivalEntries(rows);
        return {
          totalKg,
          totalBagUnits: calc.totalBagUnits,
          totalPieceUnits: calc.totalPieceUnits,
          totalUnits: calc.totalBagUnits + calc.totalPieceUnits,
        };
      }),
    [items]
  );

  const grandTotal = useMemo(
    () =>
      itemTotals.reduce(
        (acc, t) => ({
          bagUnits: acc.bagUnits + t.totalBagUnits,
          pieceUnits: acc.pieceUnits + t.totalPieceUnits,
          kg: acc.kg + t.totalKg,
        }),
        { bagUnits: 0, pieceUnits: 0, kg: 0 }
      ),
    [itemTotals]
  );

  const totalCost = useMemo(() => {
    const p = Number(header.price) || 0;
    const r = Number(header.rent) || 0;
    const h = Number(header.hidden_charges) || 0;
    if (p === 0 && r === 0 && h === 0) return null;
    return p + r + h;
  }, [header.price, header.rent, header.hidden_charges]);

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!header.vehicle_number) return toast.error("Vehicle number is required");
    if (!header.driver_name) return toast.error("Driver name is required");
    if (!header.driver_number) return toast.error("Driver number is required");
    if (header.driver_number.length !== 10)
      return toast.error("Driver number must be exactly 10 digits");

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tot = itemTotals[i];
      if (!it.brand_id) return toast.error(`Load #${i + 1}: Select a brand`);
      if (tot.totalUnits === 0) return toast.error(`Load #${i + 1}: Add at least one valid entry`);

      for (let g = 0; g < it.warehouseGroups.length; g++) {
        const grp = it.warehouseGroups[g];
        if (!grp.warehouse_id)
          return toast.error(`Load #${i + 1} · Warehouse group #${g + 1}: Select a warehouse`);
        for (let r = 0; r < grp.rows.length; r++) {
          const row = grp.rows[r];
          const wt = Number(row.weight) || 0;
          const qty = Number(row.quantity) || 0;
          if (wt <= 0 || qty <= 0)
            return toast.error(
              `Load #${i + 1} · Warehouse group #${g + 1} · Row #${r + 1}: Enter weight and quantity`
            );
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
            .filter((e) => e.weight > 0 && e.quantity > 0 && e.warehouse_id)
            .map((e) => ({
              weight: e.weight,
              quantity: e.quantity,
              warehouse_id: Number(e.warehouse_id),
            }));

          // Legacy aggregation for backward compatibility
          const weightAgg = new Map();
          const splitAgg = new Map();
          for (const en of validEntries) {
            weightAgg.set(en.weight, (weightAgg.get(en.weight) || 0) + en.quantity);
            splitAgg.set(en.warehouse_id, (splitAgg.get(en.warehouse_id) || 0) + en.quantity);
          }

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
              weight,
              quantity,
            })),
            warehouse_splits: Array.from(splitAgg.entries()).map(([warehouse_id, bags]) => ({
              warehouse_id,
              bags,
            })),
          };
        }),
        ...(isAdmin
          ? {
              mill_owner_name: header.mill_owner_name || null,
              price: header.price !== "" ? Number(header.price) : null,
              rent: header.rent !== "" ? Number(header.rent) : null,
              hidden_charges: header.hidden_charges !== "" ? Number(header.hidden_charges) : null,
            }
          : {}),
      };
      await onSubmit(payload);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to record arrival"));
    } finally {
      setLoading(false);
    }
  };

  const filteredRiceTypes = (brandId) =>
    riceTypes.filter((rt) => !rt.brand_id || rt.brand_id === Number(brandId));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Vehicle / Driver */}
      <div className="divider-label">Vehicle & Driver</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="label flex items-center gap-1.5">
            <Truck size={11} /> Vehicle Number *
          </label>
          <VehicleNumberInput
            value={header.vehicle_number}
            onChange={(v) => setHeader((h) => ({ ...h, vehicle_number: v }))}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <User size={11} /> Driver Name *
          </label>
          <input
            className="input-field"
            value={header.driver_name}
            onChange={(e) => setHeader((h) => ({ ...h, driver_name: e.target.value }))}
            placeholder="Driver full name"
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <Phone size={11} /> Driver Number *
          </label>
          <DriverNumberInput
            value={header.driver_number}
            onChange={(v) => setHeader((h) => ({ ...h, driver_number: v }))}
          />
          {header.driver_number && header.driver_number.length !== 10 && (
            <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
              Must be exactly 10 digits ({header.driver_number.length}/10)
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Source / From</label>
          <input
            className="input-field"
            value={header.source}
            onChange={(e) => setHeader((h) => ({ ...h, source: e.target.value }))}
            placeholder="From where..."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Date & Time</label>
          <input
            type="datetime-local"
            className="input-field"
            value={header.transaction_date}
            onChange={(e) => setHeader((h) => ({ ...h, transaction_date: e.target.value }))}
          />
        </div>
      </div>

      {/* Admin-only fields */}
      {isAdmin && (
        <>
          <div className="divider-label" style={{ color: "var(--accent)" }}>
            Admin-only fields
          </div>
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--accent-soft)",
              border: "1.5px dashed var(--accent-muted)",
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label flex items-center gap-1.5">
                  <Factory size={11} /> Mill Owner Name
                </label>
                <input
                  className="input-field"
                  value={header.mill_owner_name}
                  onChange={(e) => setHeader((h) => ({ ...h, mill_owner_name: e.target.value }))}
                  placeholder="Type mill owner name..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Commission Partner</label>
                <input
                  className="input-field"
                  value={header.commission_partner}
                  onChange={(e) => setHeader((h) => ({ ...h, commission_partner: e.target.value }))}
                  placeholder="Agent / Partner..."
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <IndianRupee size={11} /> Price (per bag)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={header.price}
                  onChange={(e) => setHeader((h) => ({ ...h, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="label">Rent</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={header.rent}
                  onChange={(e) => setHeader((h) => ({ ...h, rent: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Hidden Charges</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={header.hidden_charges}
                  onChange={(e) => setHeader((h) => ({ ...h, hidden_charges: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              {totalCost !== null && (
                <div
                  className="sm:col-span-2 rounded-xl p-3 flex items-center justify-between"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1.5px solid var(--accent-muted)",
                  }}
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Total Amount
                    </p>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {[
                        header.price ? `Price ₹${header.price}` : null,
                        header.rent ? `+ Rent ₹${header.rent}` : null,
                        header.hidden_charges ? `+ Charges ₹${header.hidden_charges}` : null,
                      ]
                        .filter(Boolean)
                        .join("  ")}
                    </div>
                  </div>
                  <span className="text-xl font-extrabold tabular-nums" style={{ color: "var(--accent)" }}>
                    ₹{totalCost.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Loads ── */}
      <div className="divider-label">Loads in this Vehicle</div>
      <div className="space-y-4">
        {items.map((it, idx) => {
          const tot = itemTotals[idx];

          return (
            <div key={idx} className="card animate-scale-in" style={{ padding: "12px 12px" }}>
              {/* Load header */}
              <div className="flex items-center justify-between mb-3">
                <span className="badge badge-accent">Load #{idx + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="btn-ghost"
                    style={{ color: "var(--danger)", padding: "6px 10px" }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>

              {/* Brand / Rice Type / Bag Size */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Brand *</label>
                  <select
                    className="input-field"
                    value={it.brand_id}
                    onChange={(e) =>
                      updateItem(idx, { brand_id: e.target.value, rice_type_id: "" })
                    }
                  >
                    <option value="">— Select Brand —</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {i18n.language === "ta" && b.name_ta ? b.name_ta : b.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 mt-2">
                    <input
                      className="input-field flex-1"
                      placeholder="+ Add new brand"
                      value={newBrandName[idx] || ""}
                      onChange={(e) =>
                        setNewBrandName((p) => ({ ...p, [idx]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => handleCreateBrand(idx)}
                      className="btn-secondary"
                      style={{ padding: "10px 12px" }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Rice Type</label>
                  <select
                    className="input-field"
                    value={it.rice_type_id}
                    onChange={(e) => updateItem(idx, { rice_type_id: e.target.value })}
                  >
                    <option value="">— Select Rice Type —</option>
                    {filteredRiceTypes(it.brand_id).map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 mt-2">
                    <input
                      className="input-field flex-1"
                      placeholder="+ Add new rice type"
                      value={newRiceTypeName[idx] || ""}
                      onChange={(e) =>
                        setNewRiceTypeName((p) => ({ ...p, [idx]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => handleCreateRiceType(idx)}
                      className="btn-secondary"
                      style={{ padding: "10px 12px" }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Bag Size</label>
                  <select
                    className="input-field"
                    value={it.bag_size}
                    onChange={(e) => updateItem(idx, { bag_size: e.target.value })}
                  >
                    {BAG_SIZES.map((b) => (
                      <option key={b} value={b}>
                        {b} KG / bag
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] mt-2 font-medium" style={{ color: "var(--text-muted)" }}>
                    Used to pool pieces in stock view.
                  </p>
                </div>
              </div>

              {/* ── Warehouse groups ── */}
              <div className="mt-5">
                <p className="label mb-3" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
                  Entries · Weight × Qty → Warehouse
                </p>

                <div className="space-y-3">
                  {it.warehouseGroups.map((grp, gIdx) => {
                    // Totals for this group
                    const grpKg = grp.rows.reduce(
                      (s, r) => s + (Number(r.weight) || 0) * (Number(r.quantity) || 0),
                      0
                    );
                    const grpRows = grp.rows.map((r) => ({
                      weight: Number(r.weight) || 0,
                      quantity: Number(r.quantity) || 0,
                    }));
                    const grpCalc = calcArrivalEntries(grpRows);

                    return (
                      <div
                        key={gIdx}
                        className="rounded-xl overflow-hidden"
                        style={{
                          border: "1.5px solid var(--border)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        {/* Warehouse selector header */}
                        <div
                          className="flex items-center gap-2 px-3 py-2.5"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderBottom: "1px solid var(--border-light)",
                          }}
                        >
                          <div
                            className="flex items-center justify-center rounded-lg shrink-0"
                            style={{
                              width: 28,
                              height: 28,
                              backgroundColor: "var(--accent-soft)",
                              color: "var(--accent)",
                            }}
                          >
                            <Warehouse size={13} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <label
                              className="text-[9px] font-bold uppercase tracking-wider block mb-1"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Warehouse *
                            </label>
                            <select
                              className="input-field"
                              style={{ padding: "5px 8px", height: 32, fontSize: 13 }}
                              value={grp.warehouse_id}
                              onChange={(e) => updateGroup(idx, gIdx, { warehouse_id: e.target.value })}
                            >
                              <option value="">— Select Warehouse —</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {i18n.language === "ta" && w.location_name_ta
                                    ? w.location_name_ta
                                    : w.location_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {/* Always render delete slot to keep layout stable; hide when only 1 group */}
                          <button
                            type="button"
                            onClick={() => removeGroup(idx, gIdx)}
                            disabled={it.warehouseGroups.length <= 1}
                            className="btn-ghost shrink-0"
                            style={{
                              color: it.warehouseGroups.length > 1 ? "var(--danger)" : "transparent",
                              padding: "5px 6px",
                              pointerEvents: it.warehouseGroups.length <= 1 ? "none" : "auto",
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Weight × Qty rows */}
                        <div className="px-3 pt-3 pb-3 space-y-2">
                          {/* Column headers — only shown once above rows */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr auto",
                              gap: 8,
                              alignItems: "end",
                            }}
                          >
                            <label
                              className="text-[9px] font-bold uppercase tracking-wider"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Weight (KG)
                            </label>
                            <label
                              className="text-[9px] font-bold uppercase tracking-wider"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Quantity
                            </label>
                            {/* spacer for delete column */}
                            <div style={{ width: 32 }} />
                          </div>

                          {grp.rows.map((row, rIdx) => {
                            const wt = Number(row.weight) || 0;
                            const qty = Number(row.quantity) || 0;
                            const kind = classifyWeight(wt);
                            const isBag = kind === "bag";
                            const isPiece = kind === "piece";
                            const kindLabel = isBag
                              ? `${qty} bag${qty !== 1 ? "s" : ""}`
                              : isPiece
                              ? `${qty} piece${qty !== 1 ? "s" : ""}`
                              : null;
                            const kindColor = isBag
                              ? "var(--success)"
                              : isPiece
                              ? "var(--warning)"
                              : "var(--text-muted)";
                            const kindBg = isBag
                              ? "var(--success-soft)"
                              : isPiece
                              ? "var(--warning-soft)"
                              : "var(--bg-secondary)";

                            return (
                              <div key={rIdx}>
                                {/* Input row: Weight | Qty | Delete — always on one line */}
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr auto",
                                    gap: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className="input-field"
                                    placeholder="25"
                                    value={row.weight}
                                    style={{ minWidth: 0 }}
                                    onChange={(e) =>
                                      updateRow(idx, gIdx, rIdx, { weight: e.target.value })
                                    }
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    className="input-field"
                                    placeholder="5"
                                    value={row.quantity}
                                    style={{ minWidth: 0 }}
                                    onChange={(e) =>
                                      updateRow(idx, gIdx, rIdx, { quantity: e.target.value })
                                    }
                                  />
                                  {/* Delete button — always occupies its column, invisible if only 1 row */}
                                  <button
                                    type="button"
                                    onClick={() => removeRow(idx, gIdx, rIdx)}
                                    disabled={grp.rows.length <= 1}
                                    className="btn-ghost"
                                    style={{
                                      color: grp.rows.length > 1 ? "var(--danger)" : "transparent",
                                      padding: "6px",
                                      width: 32,
                                      height: 32,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0,
                                      pointerEvents: grp.rows.length <= 1 ? "none" : "auto",
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>

                                {/* Kind badge + KG total — inline below inputs, only when values filled */}
                                {wt > 0 && qty > 0 && (
                                  <div className="flex items-center gap-2 mt-1.5 pl-1">
                                    <span
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                                      style={{ color: kindColor, backgroundColor: kindBg }}
                                    >
                                      {isBag ? <Box size={9} /> : isPiece ? <Layers size={9} /> : null}
                                      {kindLabel}
                                    </span>
                                    <span
                                      className="text-[10px] tabular-nums font-medium"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      = {(wt * qty).toFixed(1)} KG
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* ── Add Weight Row button ── */}
                          <button
                            type="button"
                            onClick={() => addRow(idx, gIdx)}
                            className="flex items-center justify-center gap-2 w-full rounded-lg transition-all"
                            style={{
                              padding: "9px 12px",
                              marginTop: 6,
                              backgroundColor: "transparent",
                              border: "1.5px dashed var(--border)",
                              color: "var(--text-muted)",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              WebkitTapHighlightColor: "transparent",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "var(--accent)";
                              e.currentTarget.style.color = "var(--accent)";
                              e.currentTarget.style.backgroundColor = "var(--accent-soft)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--border)";
                              e.currentTarget.style.color = "var(--text-muted)";
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <Plus size={13} />
                            Add weight row
                          </button>
                        </div>

                        {/* Group subtotal */}
                        {grpKg > 0 && (
                          <div
                            className="px-4 py-2 flex items-center justify-between flex-wrap gap-2"
                            style={{
                              borderTop: "1px solid var(--border-light)",
                              backgroundColor: "var(--bg-card)",
                            }}
                          >
                            <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                              Subtotal for this warehouse
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              {grpCalc.totalBagUnits > 0 && (
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                                  style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}
                                >
                                  <Box size={9} /> {grpCalc.totalBagUnits} bag{grpCalc.totalBagUnits !== 1 ? "s" : ""}
                                </span>
                              )}
                              {grpCalc.totalPieceUnits > 0 && (
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                                  style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}
                                >
                                  <Layers size={9} /> {grpCalc.totalPieceUnits} piece{grpCalc.totalPieceUnits !== 1 ? "s" : ""}
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
                </div>

                {/* ── Add Warehouse Group button ── */}
                <button
                  type="button"
                  onClick={() => addGroup(idx)}
                  className="flex items-center justify-center gap-2 w-full mt-3 rounded-xl transition-all"
                  style={{
                    padding: "10px 16px",
                    backgroundColor: "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.color = "var(--accent)";
                    e.currentTarget.style.backgroundColor = "var(--accent-soft)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                    e.currentTarget.style.backgroundColor = "var(--bg-card)";
                  }}
                >
                  <Warehouse size={14} />
                  Add another warehouse
                </button>

                {/* Item totals */}
                <div
                  className="mt-3 p-3 rounded-xl"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      Load #{idx + 1} Total
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {tot.totalKg.toFixed(1)} KG
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tot.totalBagUnits > 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                        style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}
                      >
                        <Box size={10} /> {tot.totalBagUnits} bag{tot.totalBagUnits !== 1 ? "s" : ""}
                      </span>
                    )}
                    {tot.totalPieceUnits > 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                        style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}
                      >
                        <Layers size={10} /> {tot.totalPieceUnits} piece{tot.totalPieceUnits !== 1 ? "s" : ""}
                      </span>
                    )}
                    {tot.totalBagUnits === 0 && tot.totalPieceUnits === 0 && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        — no entries yet —
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <button type="button" onClick={addItem} className="btn-outline-accent w-full">
          <Plus size={16} /> Add another load (different brand / rice type)
        </button>
      </div>

      {/* Grand Total */}
      <div className="card-accent" style={{ padding: "16px 20px" }}>
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">
              Total Stock Count
            </p>
            <p className="text-2xl font-extrabold text-white mt-1 tracking-tight">
              {grandTotal.bagUnits}{" "}
              <span className="text-sm font-medium text-white/70">bag{grandTotal.bagUnits !== 1 ? "s" : ""}</span>
              {grandTotal.pieceUnits > 0 && (
                <>
                  {" + "}
                  {grandTotal.pieceUnits}{" "}
                  <span className="text-sm font-medium text-white/70">piece{grandTotal.pieceUnits !== 1 ? "s" : ""}</span>
                </>
              )}
            </p>
            <p className="text-xs text-white/60 mt-0.5">{grandTotal.kg.toFixed(1)} KG total</p>
          </div>
          <Package size={28} className="text-white/70" />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input-field"
          style={{ minHeight: 60 }}
          value={header.notes}
          onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
          placeholder="Additional notes..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          {t("common.cancel")}
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? t("common.loading") : "Record Arrival"}
        </button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════
   SEND FORM — strict stock-aware
   ══════════════════════════════════════════════════════════ */
function SendForm({ onSubmit, onClose, brands, warehouses, stocks }) {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();

  const [header, setHeader] = useState({
    vehicle_number: "",
    driver_name: "",
    driver_number: "",
    destination: "",
    to_whom: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "",
    location: "",
    sell_price: "",
  });

  const blankItem = () => ({ brand_id: "", warehouse_id: "", bag_weight_kg: "", bags: "" });
  const [items, setItems] = useState([blankItem()]);
  const [loading, setLoading] = useState(false);

  const addItem = () => setItems((p) => [...p, blankItem()]);
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i, patch) =>
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const stocksWithQty = useMemo(
    () => stocks.filter((s) => (s.total_bags ?? s.remaining_bags ?? 0) > 0),
    [stocks]
  );

  const brandsWithStock = useMemo(() => {
    const bIds = new Set(stocksWithQty.map((s) => String(s.brand_id ?? s.brand?.id)));
    return brands.filter((b) => bIds.has(String(b.id)));
  }, [brands, stocksWithQty]);

  const warehousesForBrand = (brandId) => {
    if (!brandId) return [];
    const wIds = new Set(
      stocksWithQty
        .filter((s) => String(s.brand_id ?? s.brand?.id) === String(brandId))
        .map((s) => s.warehouse_id ?? s.warehouse?.id)
    );
    return warehouses.filter((w) => wIds.has(w.id));
  };

  const weightsForItem = (it) => {
    if (!it.brand_id || !it.warehouse_id) return [];
    return stocksWithQty
      .filter(
        (s) =>
          String(s.brand_id ?? s.brand?.id) === String(it.brand_id) &&
          String(s.warehouse_id ?? s.warehouse?.id) === String(it.warehouse_id)
      )
      .sort((a, b) => b.bag_weight_kg - a.bag_weight_kg);
  };

  const maxUnitsForItem = (it) => {
    const s = stocksWithQty.find(
      (s) =>
        String(s.brand_id ?? s.brand?.id) === String(it.brand_id) &&
        String(s.warehouse_id ?? s.warehouse?.id) === String(it.warehouse_id) &&
        Number(s.bag_weight_kg) === Number(it.bag_weight_kg)
    );
    return s ? Number(s.total_bags ?? s.remaining_bags ?? 0) : 0;
  };

  const buyPriceForItem = (it) => {
    const s = stocksWithQty.find(
      (s) =>
        String(s.brand_id ?? s.brand?.id) === String(it.brand_id) &&
        String(s.warehouse_id ?? s.warehouse?.id) === String(it.warehouse_id) &&
        Number(s.bag_weight_kg) === Number(it.bag_weight_kg)
    );
    return s?.last_buy_price ?? s?.price ?? null;
  };

  const warehouseBagTotal = (brandId, warehouseId) => {
    return stocksWithQty
      .filter(
        (s) =>
          String(s.brand_id ?? s.brand?.id) === String(brandId) &&
          String(s.warehouse_id ?? s.warehouse?.id) === String(warehouseId)
      )
      .reduce((sum, s) => sum + Number(s.total_bags ?? s.remaining_bags ?? 0), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!header.vehicle_number || !header.driver_name || !header.driver_number) {
      return toast.error("Vehicle number, driver name & driver number are required");
    }
    if (header.driver_number.length !== 10) {
      return toast.error("Driver number must be exactly 10 digits");
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.brand_id || !it.warehouse_id || !it.bag_weight_kg || !it.bags) {
        return toast.error(`Item ${i + 1}: Fill all fields`);
      }
      const maxBags = maxUnitsForItem(it);
      if (Number(it.bags) > maxBags) {
        return toast.error(`Item ${i + 1}: Only ${maxBags} available in stock`);
      }
      if (Number(it.bags) <= 0) {
        return toast.error(`Item ${i + 1}: Quantity must be greater than 0`);
      }
    }

    const cumulative = new Map();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = `${it.brand_id}|${it.warehouse_id}|${it.bag_weight_kg}`;
      const used = cumulative.get(key) || 0;
      const newUsed = used + Number(it.bags);
      const max = maxUnitsForItem(it);
      if (newUsed > max) {
        return toast.error(
          `Items duplicated for same stock — total ${newUsed} exceeds available ${max}`
        );
      }
      cumulative.set(key, newUsed);
    }

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
        items: items.map((it) => ({
          brand_id: Number(it.brand_id),
          warehouse_id: Number(it.warehouse_id),
          bag_weight_kg: Number(it.bag_weight_kg),
          bags: Number(it.bags),
        })),
        ...(isAdmin
          ? {
              location: header.location || null,
              sell_price: header.sell_price !== "" ? Number(header.sell_price) : null,
            }
          : {}),
      };
      await onSubmit(payload);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to record send"));
    } finally {
      setLoading(false);
    }
  };

  const grandUnits = items.reduce((s, it) => s + (Number(it.bags) || 0), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="divider-label">Vehicle & Driver</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="label flex items-center gap-1.5">
            <Truck size={11} /> Vehicle Number *
          </label>
          <VehicleNumberInput
            value={header.vehicle_number}
            onChange={(v) => setHeader((h) => ({ ...h, vehicle_number: v }))}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <User size={11} /> Driver Name *
          </label>
          <input
            className="input-field"
            value={header.driver_name}
            onChange={(e) => setHeader((h) => ({ ...h, driver_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <Phone size={11} /> Driver Number *
          </label>
          <DriverNumberInput
            value={header.driver_number}
            onChange={(v) => setHeader((h) => ({ ...h, driver_number: v }))}
          />
          {header.driver_number && header.driver_number.length !== 10 && (
            <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
              Must be exactly 10 digits ({header.driver_number.length}/10)
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Destination / To</label>
          <input
            className="input-field"
            value={header.destination}
            onChange={(e) => setHeader((h) => ({ ...h, destination: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Date & Time</label>
          <input
            type="datetime-local"
            className="input-field"
            value={header.transaction_date}
            onChange={(e) => setHeader((h) => ({ ...h, transaction_date: e.target.value }))}
          />
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="divider-label" style={{ color: "var(--accent)" }}>
            Admin-only
          </div>
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--accent-soft)",
              border: "1.5px dashed var(--accent-muted)",
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label flex items-center gap-1.5">
                  <User size={11} /> To Whom
                </label>
                <input
                  className="input-field"
                  value={header.to_whom}
                  onChange={(e) => setHeader((h) => ({ ...h, to_whom: e.target.value }))}
                  placeholder="Buyer / Recipient name..."
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <MapPin size={11} /> Location
                </label>
                <input
                  className="input-field"
                  value={header.location}
                  onChange={(e) => setHeader((h) => ({ ...h, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <IndianRupee size={11} /> Sell Price (per bag)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={header.sell_price}
                  onChange={(e) => setHeader((h) => ({ ...h, sell_price: e.target.value }))}
                  placeholder="0.00"
                />
                {items[0] && buyPriceForItem(items[0]) != null && (
                  <SellPriceIndicator
                    buyPrice={buyPriceForItem(items[0])}
                    sellPrice={header.sell_price}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {brandsWithStock.length === 0 && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            backgroundColor: "var(--warning-soft)",
            border: "1.5px solid var(--warning)",
          }}
        >
          <AlertTriangle size={20} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--warning-text)" }}>
              No stock available
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--warning-text)", opacity: 0.85 }}>
              You need to record an arrival before you can send stock.
            </p>
          </div>
        </div>
      )}

      <div className="divider-label">Items</div>
      <div className="space-y-4">
        {items.map((it, idx) => {
          const availWarehouses = warehousesForBrand(it.brand_id);
          const availWeights = weightsForItem(it);
          const maxUnits = maxUnitsForItem(it);
          const buyPrice = buyPriceForItem(it);
          const wt = Number(it.bag_weight_kg) || 0;
          const isPiece = wt > 0 && wt < PIECE_THRESHOLD_KG;
          const unitLabel = isPiece ? "piece" : "bag";

          return (
            <div key={idx} className="card animate-scale-in" style={{ padding: 16 }}>
              <div className="flex items-center justify-between mb-3">
                <span className="badge badge-danger">Send #{idx + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="btn-ghost"
                    style={{ color: "var(--danger)", padding: "6px 10px" }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Brand *</label>
                  <select
                    className="input-field"
                    value={it.brand_id}
                    onChange={(e) =>
                      updateItem(idx, {
                        brand_id: e.target.value,
                        warehouse_id: "",
                        bag_weight_kg: "",
                        bags: "",
                      })
                    }
                    disabled={brandsWithStock.length === 0}
                  >
                    <option value="">— Select Brand —</option>
                    {brandsWithStock.map((b) => (
                      <option key={b.id} value={b.id}>
                        {i18n.language === "ta" && b.name_ta ? b.name_ta : b.name}
                      </option>
                    ))}
                  </select>
                  {it.brand_id && availWarehouses.length === 0 && (
                    <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
                      No warehouses have this brand
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Warehouse *</label>
                  <select
                    className="input-field"
                    value={it.warehouse_id}
                    onChange={(e) =>
                      updateItem(idx, { warehouse_id: e.target.value, bag_weight_kg: "", bags: "" })
                    }
                    disabled={!it.brand_id || availWarehouses.length === 0}
                  >
                    <option value="">— Select Warehouse —</option>
                    {availWarehouses.map((w) => {
                      const total = warehouseBagTotal(it.brand_id, w.id);
                      const wName =
                        i18n.language === "ta" && w.location_name_ta
                          ? w.location_name_ta
                          : w.location_name;
                      return (
                        <option key={w.id} value={w.id}>
                          {wName} · {total} avail
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="label">Bag Weight *</label>
                  <select
                    className="input-field"
                    value={it.bag_weight_kg}
                    onChange={(e) => updateItem(idx, { bag_weight_kg: e.target.value, bags: "" })}
                    disabled={!it.warehouse_id || availWeights.length === 0}
                  >
                    <option value="">— Select Weight —</option>
                    {availWeights.map((s) => {
                      const sw = Number(s.bag_weight_kg);
                      const swQty = Number(s.total_bags ?? s.remaining_bags ?? 0);
                      const swIsPiece = sw < PIECE_THRESHOLD_KG;
                      return (
                        <option key={s.bag_weight_kg} value={s.bag_weight_kg}>
                          {sw} KG · {swQty} {swIsPiece ? "pcs" : "bags"} avail
                        </option>
                      );
                    })}
                  </select>
                  {it.bag_weight_kg && (
                    <p
                      className="text-[10px] mt-1 font-bold flex items-center gap-1"
                      style={{ color: isPiece ? "var(--warning)" : "var(--success)" }}
                    >
                      {isPiece ? <Layers size={10} /> : <Box size={10} />}
                      {isPiece ? "Loose piece" : "Standard bag"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">
                    {unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}s *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={maxUnits || undefined}
                    className="input-field"
                    value={it.bags}
                    onChange={(e) => updateItem(idx, { bags: e.target.value })}
                    disabled={!it.bag_weight_kg}
                    placeholder={maxUnits > 0 ? `1 to ${maxUnits}` : "—"}
                  />
                  {it.bag_weight_kg && maxUnits > 0 && (
                    <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                      Max available: {maxUnits} {unitLabel}{maxUnits !== 1 ? "s" : ""}
                    </p>
                  )}
                  {it.bags && Number(it.bags) > maxUnits && maxUnits > 0 && (
                    <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
                      ⚠ Exceeds available stock ({maxUnits})
                    </p>
                  )}
                </div>
              </div>

              {isAdmin && buyPrice != null && header.sell_price !== "" && (
                <div
                  className="mt-3 p-3 rounded-xl flex items-center justify-between"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                    Buy: ₹{buyPrice}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      ₹{Number(header.sell_price).toFixed(2)}
                    </span>
                    <span className="text-xs font-bold">→</span>
                    <span
                      className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg"
                      style={{
                        color:
                          Number(header.sell_price) - buyPrice > 0
                            ? "var(--success)"
                            : Number(header.sell_price) - buyPrice < 0
                            ? "var(--danger)"
                            : "var(--text-muted)",
                        backgroundColor:
                          Number(header.sell_price) - buyPrice > 0
                            ? "var(--success-soft)"
                            : Number(header.sell_price) - buyPrice < 0
                            ? "var(--danger-soft)"
                            : "var(--bg-secondary)",
                      }}
                    >
                      ({Number(header.sell_price) - buyPrice > 0 ? "+" : ""}
                      {(Number(header.sell_price) - buyPrice).toFixed(2)})
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addItem}
          className="btn-outline-accent w-full"
          disabled={brandsWithStock.length === 0}
        >
          <Plus size={16} /> Add another item
        </button>
      </div>

      <div
        className="card-accent"
        style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #ef4444, #dc2626, #b91c1c)",
        }}
      >
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">
              Total Dispatch
            </p>
            <p className="text-2xl font-extrabold text-white mt-1 tracking-tight">
              {grandUnits}{" "}
              <span className="text-sm font-medium text-white/70">unit{grandUnits !== 1 ? "s" : ""}</span>
            </p>
          </div>
          <ArrowUpFromLine size={28} className="text-white/70" />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input-field"
          style={{ minHeight: 60 }}
          value={header.notes}
          onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={loading || brandsWithStock.length === 0}
          className="btn-danger flex-1"
        >
          {loading ? t("common.loading") : "Record Send"}
        </button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════
   SKELETON
   ══════════════════════════════════════════════════════════ */
function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="skeleton h-7" style={{ width: 180 }} />
        <div className="skeleton h-3.5 mt-2" style={{ width: 140 }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="card">
            <div className="skeleton w-12 h-12 rounded-2xl mb-3" />
            <div className="skeleton h-7 mb-2" style={{ width: 60 }} />
            <div className="skeleton h-3" style={{ width: 90 }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="card" style={{ height: 140 }}>
            <div className="skeleton w-14 h-14 rounded-2xl mx-auto mb-3" />
            <div className="skeleton h-4 mx-auto" style={{ width: 80 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 110, borderRadius: "var(--radius-xl)" }} />
      <div className="grid md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="card">
            <div className="skeleton h-4 mb-3" style={{ width: 140 }} />
            <div className="skeleton h-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN DASHBOARD PAGE
   ══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [txModal, setTxModal] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [brands, setBrands] = useState([]);
  const [riceTypes, setRiceTypes] = useState([]);
  const [pending, setPending] = useState([]);

  const today = format(new Date(), "yyyy-MM-dd");

  const loadDashboard = useCallback(() => {
    setLoading(true);
    Promise.all([
      dashboardApi.getSummary({ date: today }).then((r) => r.data).catch(() => null),
      dashboardApi.getDailyInbound({ date: today }).then((r) => r.data).catch(() => null),
      dashboardApi.getDailyOutbound({ date: today }).then((r) => r.data).catch(() => null),
      dashboardApi.getTotalStock().then((r) => r.data).catch(() => null),
    ])
      .then(([summary, inb, outb, total]) => {
        setData({
          ...(summary || {}),
          total_inbound_today: inb?.total_bags ?? summary?.total_inbound_today ?? 0,
          total_outbound_today: outb?.total_bags ?? summary?.total_outbound_today ?? 0,
          total_bags: total?.total_bags ?? summary?.total_bags ?? 0,
          total_stock_kg: total?.total_kg ?? summary?.total_stock_kg ?? 0,
        });
      })
      .finally(() => setLoading(false));
  }, [today]);

  const refreshMasters = useCallback(async () => {
    const [s, w, b, rt] = await Promise.all([
      stockApi.list().then((r) => r.data).catch(() => []),
      warehouseApi.list().then((r) => r.data).catch(() => []),
      brandApi.list().then((r) => r.data).catch(() => []),
      riceTypeApi.list().then((r) => r.data).catch(() => []),
    ]);
    setStocks(s);
    setWarehouses(w);
    setBrands(b);
    setRiceTypes(rt);
    if (isAdmin) {
      const p = await dashboardApi.getPendingApprovals().then((r) => r.data).catch(() => []);
      setPending(p || []);
    }
  }, [isAdmin]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { refreshMasters(); }, [refreshMasters]);

  const handleArrival = async (payload) => {
    await transactionApi.createArrival(payload);
    toast.success(isAdmin ? "Arrival recorded" : "Arrival recorded — sent to admin for review");
    loadDashboard();
    refreshMasters();
  };
  const handleSend = async (payload) => {
    await transactionApi.createSend(payload);
    toast.success(isAdmin ? "Send recorded" : "Send recorded — sent to admin for review");
    loadDashboard();
    refreshMasters();
  };

  if (loading) return <DashboardSkeleton />;

  const txTypeColor = (type) => (type === "inbound" ? "badge-success" : "badge-danger");
  const txTypeLabel = (type) =>
    type === "inbound" ? t("transaction.inbound") : t("transaction.outbound");
  const chartData =
    data?.warehouse_summary?.map((w) => ({
      name: i18n.language === "ta" && w.location_name_ta ? w.location_name_ta : w.location_name,
      bags: w.total_bags,
      pct: w.stock_percentage,
    })) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page header ── */}
      <div>
        <h1 className="page-title">{t("dashboard.title")}</h1>
        <p className="page-subtitle">{format(new Date(), "EEEE, dd MMMM yyyy")}</p>
      </div>

      {/* ── Per-day stat cards ── */}
      <div className="grid grid-cols-2 gap-3 stagger-1">
        <StatCard
          icon={TrendingUp}
          label={`${t("dashboard.inboundToday")} (Today)`}
          value={`${data?.total_inbound_today ?? 0} ${t("dashboard.bags")}`}
          color="green"
        />
        <StatCard
          icon={TrendingDown}
          label={`${t("dashboard.outboundToday")} (Today)`}
          value={`${data?.total_outbound_today ?? 0} ${t("dashboard.bags")}`}
          color="amber"
        />
      </div>

      {/* ── Quick action cards ── */}
      <div className="grid grid-cols-2 gap-3 stagger-2">
        <button
          onClick={() => setTxModal("arrival")}
          className="card-hover text-left"
          style={{
            background: "linear-gradient(135deg, var(--success-soft) 0%, var(--bg-card) 100%)",
            borderColor: "var(--success)",
            borderWidth: 2,
          }}
        >
          <div className="flex flex-col items-center gap-2.5 py-2">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl"
              style={{ backgroundColor: "rgba(16,185,129,0.15)" }}
            >
              <ArrowDownToLine size={26} style={{ color: "var(--success)" }} />
            </div>
            <span className="text-base font-extrabold" style={{ color: "var(--success)" }}>
              {i18n.language === "ta" ? "வரவு" : "Arrival"}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "இறக்கு" : "Unload Stock"}
            </span>
          </div>
        </button>

        <button
          onClick={() => setTxModal("send")}
          className="card-hover text-left"
          style={{
            background: "linear-gradient(135deg, var(--danger-soft) 0%, var(--bg-card) 100%)",
            borderColor: "var(--danger)",
            borderWidth: 2,
          }}
        >
          <div className="flex flex-col items-center gap-2.5 py-2">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl"
              style={{ backgroundColor: "rgba(239,68,68,0.15)" }}
            >
              <ArrowUpFromLine size={26} style={{ color: "var(--danger)" }} />
            </div>
            <span className="text-base font-extrabold" style={{ color: "var(--danger)" }}>
              {i18n.language === "ta" ? "அனுப்பு" : "Send"}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {i18n.language === "ta" ? "செலவு" : "Dispatch Stock"}
            </span>
          </div>
        </button>
      </div>

      {/* ── Total Stock banner ── */}
      <div className="card-accent stagger-3">
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              {t("dashboard.totalStock")}
            </p>
            <p className="text-3xl font-extrabold text-white mt-1.5 tracking-tight">
              {data?.total_bags?.toLocaleString() ?? 0}
              <span className="text-base font-medium ml-2 text-white/70">{t("dashboard.bags")}</span>
            </p>
            <p className="text-xs text-white/60 mt-1 font-medium">
              {((data?.total_stock_kg ?? 0) / 1000).toFixed(2)} {t("dashboard.tonnes")}
            </p>
          </div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <Activity size={26} className="text-white/80" />
          </div>
        </div>
      </div>

      {/* ── ADMIN: Pending Approvals ── */}
      {isAdmin && pending.length > 0 && (
        <div
          className="card stagger-4"
          style={{
            borderColor: "var(--warning)",
            backgroundColor: "var(--warning-soft)",
            borderWidth: 1.5,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(245,158,11,0.2)" }}
              >
                <ClipboardList size={18} style={{ color: "var(--warning)" }} />
              </div>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "var(--warning-text)" }}>
                  Pending Admin Details
                </h2>
                <p
                  className="text-[10px] uppercase tracking-wider mt-0.5"
                  style={{ color: "var(--warning-text)", opacity: 0.8 }}
                >
                  {pending.length} transaction{pending.length > 1 ? "s" : ""} awaiting Mill Owner / Price / Sell Price
                </p>
              </div>
            </div>
            <Link
              to="/transactions?filter=pending"
              className="btn-secondary"
              style={{ padding: "6px 12px", fontSize: 11 }}
            >
              Review all <ArrowRight size={12} />
            </Link>
          </div>

          <div className="space-y-2">
            {pending.slice(0, 4).map((tx) => (
              <Link
                key={tx.id}
                to={`/transactions?filter=pending&highlight=${tx.id}`}   // ✅ Uses existing route
                className="flex items-center justify-between p-3 rounded-xl transition-all hover:translate-x-1"
                style={{ 
                  backgroundColor: "var(--bg-card)", 
                  border: "1px solid var(--border-light)",
                  textDecoration: "none",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`badge ${
                        tx.transaction_type === "inbound" ? "badge-success" : "badge-danger"
                      }`}
                    >
                      {tx.transaction_type === "inbound" ? "Arrival" : "Send"}
                    </span>
                    <span
                      className="text-sm font-bold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {tx.vehicle_number || "—"}
                    </span>
                  </div>
                  <div className="text-[11px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                    {tx.driver_name ? `${tx.driver_name} · ` : ""}
                    {tx.total_bags ?? tx.quantity_bags} bags ·{" "}
                    {format(new Date(tx.transaction_date), "dd MMM, HH:mm")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="badge badge-warning text-[10px]">Needs admin</span>
                  <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid md:grid-cols-2 gap-4 stagger-5">
        {/* Warehouse summary */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                {t("dashboard.warehouseSummary")}
              </h2>
              <p
                className="text-[10px] mt-0.5 uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Current Stock by Warehouse
              </p>
            </div>
            <Link to="/warehouses" className="badge badge-accent" style={{ cursor: "pointer" }}>
              {t("common.view")} <ArrowRight size={11} />
            </Link>
          </div>

          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={24} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 11,
                      boxShadow: "var(--shadow-md)",
                    }}
                    formatter={(v) => [`${v} bags`, "Stock"]}
                  />
                  <Bar dataKey="bags" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.pct < 20
                            ? "var(--danger)"
                            : entry.pct < 50
                            ? "var(--warning)"
                            : "var(--accent)"
                        }
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div
                className="space-y-3 mt-5 pt-4"
                style={{ borderTop: "1px solid var(--border-light)" }}
              >
                {data?.warehouse_summary?.map((w) => (
                  <div key={w.id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {i18n.language === "ta" && w.location_name_ta
                          ? w.location_name_ta
                          : w.location_name}
                      </span>
                      <span
                        className="text-[10px] font-bold tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {w.total_bags} bags
                      </span>
                    </div>
                    <StockLevelBar percentage={w.stock_percentage} showLabel={false} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: "32px 16px" }}>
              <div className="empty-state-icon">
                <Warehouse size={20} />
              </div>
              <span className="empty-state-text">{t("common.noData")}</span>
            </div>
          )}
        </div>

        {/* Low stock */}
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--danger-soft)" }}
            >
              <AlertTriangle size={15} style={{ color: "var(--danger)" }} />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                {t("dashboard.lowStock")}
              </h2>
              <p
                className="text-[10px] uppercase tracking-wider mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Items below threshold
              </p>
            </div>
          </div>

          {data?.low_stock_items?.length > 0 ? (
            <div className="space-y-1">
              {data.low_stock_items.map((s) => {
                const remaining = s.total_bags ?? s.remaining_bags ?? 0;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                    style={{ transition: "background-color var(--transition-fast)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <div>
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {i18n.language === "ta" && s.brand_name_ta ? s.brand_name_ta : s.brand_name}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {i18n.language === "ta" && s.rice_type_ta ? s.rice_type_ta : s.rice_type}
                      </div>
                    </div>
                    <span className={`badge ${remaining === 0 ? "badge-danger" : "badge-warning"}`}>
                      {remaining} {t("dashboard.bags")}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "32px 16px" }}>
              <div
                className="empty-state-icon"
                style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}
              >
                <Package size={20} />
              </div>
              <p className="empty-state-title">All stocks healthy!</p>
              <p className="empty-state-text">No items below threshold</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent transactions ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {t("dashboard.recentTransactions")}
            </h2>
            <p
              className="text-[10px] mt-0.5 uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Latest activity
            </p>
          </div>
          <Link to="/transactions" className="badge badge-accent" style={{ cursor: "pointer" }}>
            {t("common.view")} all <ArrowRight size={11} />
          </Link>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block table-container">
          <table>
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>Vehicle / Driver</th>
                <th>{t("stock.title")}</th>
                <th className="text-right">Bags</th>
                <th className="text-right">Total KG</th>
                {isAdmin && <th className="text-right">P/L</th>}
                <th className="text-center">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.recent_transactions?.length > 0 ? (
                data.recent_transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="text-xs tabular-nums">
                      {format(new Date(tx.transaction_date), "dd MMM, HH:mm")}
                    </td>
                    <td>
                      <div className="text-xs font-bold">{tx.vehicle_number || "—"}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {tx.driver_name || "—"}
                        {tx.driver_number ? ` · ${tx.driver_number}` : ""}
                      </div>
                    </td>
                    <td className="font-medium">
                      {tx.items?.length > 0
                        ? `${tx.items[0].brand?.name || tx.items[0].brand_name || "—"}${
                            tx.items.length > 1 ? ` +${tx.items.length - 1} more` : ""
                          }`
                        : (i18n.language === "ta" && tx.stock?.brand_name_ta
                            ? tx.stock.brand_name_ta
                            : tx.stock?.brand_name) || "—"}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {tx.total_bags ?? tx.quantity_bags}
                    </td>
                    <td className="text-right tabular-nums text-xs">
                      {(tx.total_weight_kg ?? tx.quantity_kg ?? 0).toFixed(1)}
                    </td>
                    {isAdmin && (
                      <td className="text-right">
                        {tx.transaction_type === "outbound" &&
                        tx.price != null &&
                        tx.sell_price != null ? (
                          <ProfitLossBadge buyPrice={tx.price} sellPrice={tx.sell_price} />
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                    )}
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <span className={`badge ${txTypeColor(tx.transaction_type)}`}>
                          {txTypeLabel(tx.transaction_type)}
                        </span>
                        {tx.admin_pending && (
                          <span className="badge badge-warning text-[10px]">Pending</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={isAdmin ? 7 : 6}
                    className="text-center py-8"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("common.noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {data?.recent_transactions?.length > 0 ? (
            data.recent_transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-bold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {tx.vehicle_number || "—"}
                    </span>
                    {tx.admin_pending && (
                      <span className="badge badge-warning text-[9px]">Pending</span>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                    {tx.driver_name ? `${tx.driver_name} · ` : ""}
                    {format(new Date(tx.transaction_date), "dd MMM, HH:mm")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {tx.total_bags ?? tx.quantity_bags}
                  </span>
                  <span className={`badge text-[10px] ${txTypeColor(tx.transaction_type)}`}>
                    {txTypeLabel(tx.transaction_type)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: "24px 16px" }}>
              <div className="empty-state-icon">
                <ArrowRight size={20} />
              </div>
              <span className="empty-state-text">{t("common.noData")}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal
        open={txModal === "arrival"}
        onClose={() => setTxModal(null)}
        title={i18n.language === "ta" ? "புதிய வரவு" : "New Arrival"}
        size="lg"
      >
        {txModal === "arrival" && (
          <ArrivalForm
            onSubmit={handleArrival}
            onClose={() => setTxModal(null)}
            brands={brands}
            riceTypes={riceTypes}
            warehouses={warehouses}
            onMastersRefresh={refreshMasters}
          />
        )}
      </Modal>

      <Modal
        open={txModal === "send"}
        onClose={() => setTxModal(null)}
        title={i18n.language === "ta" ? "புதிய அனுப்புதல்" : "New Send"}
        size="lg"
      >
        {txModal === "send" && (
          <SendForm
            onSubmit={handleSend}
            onClose={() => setTxModal(null)}
            brands={brands}
            warehouses={warehouses}
            stocks={stocks}
          />
        )}
      </Modal>
    </div>
  );
}