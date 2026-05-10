// pages/DashboardPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Warehouse, Package, TrendingUp, TrendingDown, AlertTriangle,
  ArrowRight, Activity, ArrowDownToLine, ArrowUpFromLine, X,
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
function ProfitLossBadge({ buyPrice, sellPrice, items, totalBags, size = "sm" }) {
  // Prefer per-item calculation if items have both buy + sell prices
  let diff = null;
  const txItems = items || [];
  const itemsWithBoth = txItems.filter(it => it.buying_price != null && it.selling_price != null);
  if (itemsWithBoth.length > 0) {
    const totalPL = itemsWithBoth.reduce(
      (sum, it) => sum + (Number(it.selling_price) - Number(it.buying_price)) * (it.total_bags || 0), 0
    );
    const bags = totalBags || itemsWithBoth.reduce((s, it) => s + (it.total_bags || 0), 0);
    diff = bags > 0 ? totalPL / bags : 0;
  } else if (buyPrice != null && sellPrice != null && buyPrice !== "" && sellPrice !== "") {
    diff = Number(sellPrice) - Number(buyPrice);
  }
  if (diff == null) return null;
  const isProfit = diff > 0;
  const isLoss = diff < 0;
  const sign = isProfit ? "+" : "";
  const color = isProfit ? "var(--success)" : isLoss ? "var(--danger)" : "var(--text-primary)";
  const px = size === "lg" ? "text-base" : "text-xs";
  return (
    <span className={`font-bold tabular-nums ${px}`} style={{ color }}>
      {sign}{diff.toFixed(2)}/bag
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
    rent: "",
    hidden_charges: "",
    // price is now per-weight-row, not global
  });

  // Per item: brand + ricetype + bag_size + warehouseGroups[]
  const blankRow = () => ({ weight: "", quantity: "", buying_price: "" });
  const blankGroup = () => ({ warehouse_id: "", rows: [blankRow()] });
  const blankItem = () => ({
    brand_id: "",
    rice_type_id: "",
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
        buying_price: r.buying_price !== "" && r.buying_price != null ? Number(r.buying_price) : null,
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

  const totalGlobalCharges = useMemo(() => {
    const r = Number(header.rent) || 0;
    const h = Number(header.hidden_charges) || 0;
    if (r === 0 && h === 0) return null;
    return r + h;
  }, [header.rent, header.hidden_charges]);

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
              buying_price: e.buying_price ?? null,  // FIX: was stripped, so prices never reached backend
            }));

          // Legacy aggregation for backward compatibility
          const weightAgg = new Map();
          const splitAgg = new Map();
          for (const en of validEntries) {
            weightAgg.set(en.weight, (weightAgg.get(en.weight) || 0) + en.quantity);
            splitAgg.set(en.warehouse_id, (splitAgg.get(en.warehouse_id) || 0) + en.quantity);
          }

          // Per-weight buying prices
          const weightPriceAgg = new Map();
          for (const en of validEntries) {
            if (isAdmin && en.buying_price != null) weightPriceAgg.set(en.weight, en.buying_price);
          }
          // Derive item-level buying_price: use only if single uniform price across all rows
          const allRowPrices = flatEntries(it).map((r) => r.buying_price).filter((p) => p != null && p > 0);
          const itemBuyingPrice = allRowPrices.length === 1 ? allRowPrices[0] : null;

          return {
            brand_id: Number(it.brand_id),
            rice_type_id: it.rice_type_id ? Number(it.rice_type_id) : null,
            total_bags: itemTotals[i].totalBagUnits,
            total_pieces: itemTotals[i].totalPieceUnits,
            total_units: itemTotals[i].totalUnits,
            total_weight_kg: itemTotals[i].totalKg,
            entries: validEntries,
            weights: Array.from(weightAgg.entries()).map(([weight, quantity]) => ({
              weight,
              quantity,
              ...(isAdmin && weightPriceAgg.has(weight) ? { buying_price: weightPriceAgg.get(weight) } : {}),
            })),
            warehouse_splits: Array.from(splitAgg.entries()).map(([warehouse_id, bags]) => ({
              warehouse_id,
              bags,
            })),
            ...(isAdmin && itemBuyingPrice != null ? { buying_price: itemBuyingPrice } : {}),
          };
        }),
        ...(isAdmin
          ? {
              mill_owner_name: header.mill_owner_name || null,
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
              <p className="text-[10px] font-bold uppercase tracking-wider sm:col-span-2 mt-1" style={{ color: "var(--text-muted)" }}>
                Global Charges (apply to entire vehicle)
              </p>
              <div>
                <label className="label">Rent (Global)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={header.rent}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => setHeader((h) => ({ ...h, rent: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="label">Hidden Charges (Global)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={header.hidden_charges}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => setHeader((h) => ({ ...h, hidden_charges: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <p className="text-[10px] sm:col-span-2 font-semibold" style={{ color: "rgba(99,102,241,0.8)" }}>
                💡 Buying price per unit is entered in each weight row above
              </p>
              {totalGlobalCharges !== null && (
                <div
                  className="sm:col-span-2 rounded-xl p-3 flex items-center justify-between"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1.5px solid var(--accent-muted)",
                  }}
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Total Global Charges
                    </p>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {[
                        header.rent ? `Rent ₹${header.rent}` : null,
                        header.hidden_charges ? `+ Charges ₹${header.hidden_charges}` : null,
                      ]
                        .filter(Boolean)
                        .join("  ")}
                    </div>
                  </div>
                  <span className="text-xl font-extrabold tabular-nums" style={{ color: "var(--accent)" }}>
                    ₹{totalGlobalCharges.toFixed(2)}
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

              {/* Brand / Rice Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                              gridTemplateColumns: isAdmin ? "1fr 1fr 1fr auto" : "1fr 1fr auto",
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
                            {isAdmin && (
                              <label
                                className="text-[9px] font-bold uppercase tracking-wider"
                                style={{ color: "#6366f1" }}
                              >
                                ₹ / Unit
                              </label>
                            )}
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
                                {/* Input row: Weight | Qty | Price(admin) | Delete */}
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isAdmin ? "1fr 1fr 1fr auto" : "1fr 1fr auto",
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
                                    onWheel={(e) => e.target.blur()}
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
                                    onWheel={(e) => e.target.blur()}
                                    onChange={(e) =>
                                      updateRow(idx, gIdx, rIdx, { quantity: e.target.value })
                                    }
                                  />
                                  {isAdmin && (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="input-field"
                                      placeholder="₹ price"
                                      value={row.buying_price || ""}
                                      style={{ minWidth: 0 }}
                                      onWheel={(e) => e.target.blur()}
                                      onChange={(e) =>
                                        updateRow(idx, gIdx, rIdx, { buying_price: e.target.value })
                                      }
                                    />
                                  )}
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

                                {/* Kind badge + KG total + price badge */}
                                {wt > 0 && qty > 0 && (
                                  <div className="flex items-center gap-2 mt-1.5 pl-1 flex-wrap">
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
                                    {isAdmin && row.buying_price && Number(row.buying_price) > 0 && (
                                      <span
                                        className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                        style={{ color: "#6366f1", backgroundColor: "rgba(99,102,241,0.08)" }}
                                      >
                                        ₹{Number(row.buying_price).toFixed(2)}/{isBag ? "bag" : "piece"} · ₹{(Number(row.buying_price) * qty).toFixed(2)} total
                                      </span>
                                    )}
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
    vehicle_number: "", driver_name: "", driver_number: "",
    destination: "", to_whom: "", location: "",
    transaction_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "",
  });

  // One group per brand+warehouse.
  // weight_entries: array of { weight_kg, qty, selling_price } — user adds rows explicitly
  const blankGroup = () => ({ brand_id: "", warehouse_id: "", weight_entries: [] });
  const [groups, setGroups] = useState([blankGroup()]);
  const [loading, setLoading] = useState(false);

  const addGroup    = () => setGroups(p => [...p, blankGroup()]);
  const removeGroup = gi => setGroups(p => p.filter((_, i) => i !== gi));
  const updateGroup = (gi, patch) =>
    setGroups(p => p.map((g, i) => i === gi ? { ...g, ...patch } : g));

  const addWeightEntry = (gi, wkg) => {
    setGroups(p => p.map((g, i) => {
      if (i !== gi) return g;
      // Don't add duplicate
      if (g.weight_entries.some(e => e.weight_kg === wkg)) return g;
      return { ...g, weight_entries: [...g.weight_entries, { weight_kg: wkg, qty: "", selling_price: "" }] };
    }));
  };

  const removeWeightEntry = (gi, wkg) =>
    setGroups(p => p.map((g, i) =>
      i !== gi ? g : { ...g, weight_entries: g.weight_entries.filter(e => e.weight_kg !== wkg) }
    ));

  const updateWeightEntry = (gi, wkg, patch) =>
    setGroups(p => p.map((g, i) =>
      i !== gi ? g : {
        ...g,
        weight_entries: g.weight_entries.map(e =>
          e.weight_kg === wkg ? { ...e, ...patch } : e
        )
      }
    ));

  // BUG FIX: A stock row is only "available" if it has actual remaining quantity.
  // Use weight_breakdowns sum when available (most accurate after outbound),
  // otherwise fall back to remaining_bags / total_bags.
  const stocksWithQty = useMemo(() => {
    return stocks.filter(s => {
      if (s.weight_breakdowns && s.weight_breakdowns.length > 0) {
        // sum up breakdown quantities — this reflects actual deducted stock
        return s.weight_breakdowns.some(wb => (wb.quantity || 0) > 0);
      }
      return (s.remaining_bags ?? s.total_bags ?? 0) > 0;
    });
  }, [stocks]);

  const brandsWithStock = useMemo(() => {
    const bIds = new Set(stocksWithQty.map(s => String(s.brand_id ?? s.brand?.id)));
    return brands.filter(b => bIds.has(String(b.id)));
  }, [brands, stocksWithQty]);

  const warehousesForGroup = brandId => {
    if (!brandId) return [];
    // Only include warehouses that actually have remaining stock for this brand
    const wIds = new Set(
      stocksWithQty
        .filter(s => String(s.brand_id ?? s.brand?.id) === String(brandId))
        .map(s => s.warehouse_id ?? s.warehouse?.id)
    );
    return warehouses.filter(w => wIds.has(w.id));
  };

  // Returns available weight rows for a brand+warehouse.
  // BUG FIX: Previously it read wb.quantity from weight_breakdowns which was
  // never decremented on outbound (fixed in backend).  The display logic is
  // also fixed here to always trust weight_breakdowns > 0 only.
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
          const qty = wb.quantity || 0;
          if (qty <= 0) continue; // skip fully-exhausted weight rows
          const prev = weightMap.get(wb.weight_kg);
          weightMap.set(wb.weight_kg, {
            weight_kg: wb.weight_kg,
            qty: (prev?.qty || 0) + qty,
            last_buy_price: s.last_buy_price ?? prev?.last_buy_price ?? null,
            isPiece: wb.weight_kg < 25,
          });
        }
      } else if (remaining > 0) {
        const wkg = s.bag_weight_kg;
        const prev = weightMap.get(wkg);
        weightMap.set(wkg, {
          weight_kg: wkg,
          qty: (prev?.qty || 0) + remaining,
          last_buy_price: s.last_buy_price ?? prev?.last_buy_price ?? null,
          isPiece: wkg < 25,
        });
      }
    }
    return Array.from(weightMap.values()).sort((a, b) => b.weight_kg - a.weight_kg);
  };

  const grandUnits = groups.reduce(
    (sum, g) => sum + g.weight_entries.reduce((s, e) => s + (Number(e.qty) || 0), 0), 0
  );

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
        const max = avail?.qty || 0;
        if (qty > max) return toast.error(`Send #${gi + 1} · ${entry.weight_kg}KG: Exceeds available (${max})`);
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
        commission_partner: isAdmin ? header.to_whom || null : null,
        transaction_date: new Date(header.transaction_date).toISOString(),
        notes: header.notes || null,
        items: payloadItems,
        ...(isAdmin ? { location: header.location || null } : {}),
      };
      await onSubmit(payload);
      toast.success(isAdmin ? "Send recorded" : "Send recorded — awaiting admin pricing");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to record send"));
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Vehicle & Driver */}
      <div className="space-y-3">
        <div>
          <label className="label">Vehicle Number *</label>
          <VehicleNumberInput value={header.vehicle_number}
            onChange={v => setHeader(h => ({ ...h, vehicle_number: v }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Driver Name *</label>
            <input className="input-field" value={header.driver_name}
              onChange={e => setHeader(h => ({ ...h, driver_name: e.target.value }))}
              placeholder="Full name" />
          </div>
          <div>
            <label className="label">Driver No. *</label>
            <DriverNumberInput value={header.driver_number}
              onChange={v => setHeader(h => ({ ...h, driver_number: v }))} />
            {header.driver_number && header.driver_number.length !== 10 && (
              <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
                {header.driver_number.length}/10
              </p>
            )}
          </div>
        </div>
        <div>
          <label className="label">Destination</label>
          <input className="input-field" value={header.destination}
            onChange={e => setHeader(h => ({ ...h, destination: e.target.value }))}
            placeholder="Where to..." />
        </div>
        <div>
          <label className="label">Date & Time</label>
          <input type="datetime-local" className="input-field" value={header.transaction_date}
            onChange={e => setHeader(h => ({ ...h, transaction_date: e.target.value }))} />
        </div>
      </div>

      {/* Admin details */}
      {isAdmin && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ backgroundColor: "rgba(99,102,241,0.04)", border: "1.5px dashed rgba(99,102,241,0.25)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6366f1" }}>Admin Details</p>
          <div>
            <label className="label">To Whom</label>
            <input className="input-field" value={header.to_whom}
              onChange={e => setHeader(h => ({ ...h, to_whom: e.target.value }))}
              placeholder="Buyer / Recipient..." />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input-field" value={header.location}
              onChange={e => setHeader(h => ({ ...h, location: e.target.value }))}
              placeholder="Location..." />
          </div>
        </div>
      )}

      {brandsWithStock.length === 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--warning-soft)", border: "1.5px solid var(--warning)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--warning)" }}>No stock available</p>
          <p className="text-xs mt-0.5 opacity-80" style={{ color: "var(--warning)" }}>Record an arrival first.</p>
        </div>
      )}

      {/* Send Groups */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: "var(--text-muted)" }}>
          ITEMS TO SEND
        </p>

        {groups.map((g, gi) => {
          const availWarehouses = warehousesForGroup(g.brand_id);
          const availWeights    = weightRowsForGroup(g.brand_id, g.warehouse_id);
          const addedWkgs       = new Set(g.weight_entries.map(e => e.weight_kg));
          const remainingWeights = availWeights.filter(w => !addedWkgs.has(w.weight_kg));

          return (
            <div key={gi} className="rounded-2xl overflow-hidden"
              style={{ border: "1.5px solid rgba(239,68,68,0.25)", backgroundColor: "var(--bg-card)" }}>

              {/* Group header */}
              <div className="flex items-center justify-between px-3 py-2.5"
                style={{ backgroundColor: "rgba(239,68,68,0.05)", borderBottom: "1px solid var(--border-light)" }}>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>
                  Send #{gi + 1}
                </span>
                {groups.length > 1 && (
                  <button type="button" onClick={() => removeGroup(gi)}
                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg"
                    style={{ color: "var(--danger)", backgroundColor: "var(--danger-soft)" }}>
                    <X size={11} /> Remove
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
                {g.weight_entries.length > 0 && (
                  <div className="space-y-2">
                    {g.weight_entries.map(entry => {
                      const avail = availWeights.find(w => w.weight_kg === entry.weight_kg);
                      const qty   = Number(entry.qty) || 0;
                      const sp    = Number(entry.selling_price) || 0;
                      const bp    = avail?.last_buy_price;
                      const diff  = sp > 0 && bp != null ? sp - bp : null;
                      const isPiece = avail?.isPiece ?? entry.weight_kg < 25;
                      const unitLabel = isPiece ? "piece" : "bag";
                      const unitColor = isPiece ? "var(--warning)" : "var(--success)";
                      const unitBg    = isPiece ? "var(--warning-soft)" : "var(--success-soft)";
                      const col = diff == null ? "var(--text-muted)" : diff > 0 ? "var(--success)" : "var(--danger)";

                      return (
                        <div key={entry.weight_kg} className="rounded-xl p-3 space-y-2"
                          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>

                          {/* Weight badge + remove */}
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg"
                              style={{ color: unitColor, backgroundColor: unitBg }}>
                              {entry.weight_kg} KG · {unitLabel}
                              {avail && (
                                <span className="ml-1.5 text-[10px] opacity-70">({avail.qty} avail)</span>
                              )}
                            </span>
                            <button type="button" onClick={() => removeWeightEntry(gi, entry.weight_kg)}
                              className="p-1 rounded-lg"
                              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-card)" }}>
                              <X size={13} />
                            </button>
                          </div>

                          {/* Qty + Sell price (admin) */}
                          <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr", gap: 8 }}>
                            <div>
                              <label className="label text-[10px]">
                                Quantity {avail ? `(max ${avail.qty})` : ""}
                              </label>
                              <input type="number" min="0" max={avail?.qty} className="input-field"
                                value={entry.qty}
                                onWheel={e => e.target.blur()}
                                onChange={e => updateWeightEntry(gi, entry.weight_kg, { qty: e.target.value })}
                                placeholder="0" />
                            </div>
                            {isAdmin && (
                              <div>
                                <label className="label text-[10px]" style={{ color: "#ef4444" }}>
                                  ₹ / {unitLabel} *
                                </label>
                                <input type="number" min="0" step="0.01" className="input-field"
                                  value={entry.selling_price}
                                  onWheel={e => e.target.blur()}
                                  style={{ borderColor: entry.selling_price ? "rgba(239,68,68,0.5)" : undefined }}
                                  onChange={e => updateWeightEntry(gi, entry.weight_kg, { selling_price: e.target.value })}
                                  placeholder="0.00" />
                              </div>
                            )}
                          </div>

                          {/* Summary row */}
                          {qty > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>
                                {qty} {unitLabel}{qty !== 1 ? "s" : ""}
                              </span>
                              {sp > 0 && (
                                <span className="text-[11px] font-semibold" style={{ color: "#ef4444" }}>
                                  = ₹{(sp * qty).toFixed(0)}
                                </span>
                              )}
                              {isAdmin && diff != null && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ color: col, backgroundColor: diff > 0 ? "var(--success-soft)" : "var(--danger-soft)" }}>
                                  {diff > 0 ? "+" : ""}{diff.toFixed(2)}/{unitLabel} · P&L ₹{(diff * qty).toFixed(0)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Weight button — shows available weights not yet added */}
                {g.warehouse_id && remainingWeights.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                      + Add weight:
                    </p>
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
          className="flex items-center justify-center gap-2 w-full rounded-xl"
          style={{
            padding: "11px 16px", backgroundColor: "var(--bg-card)",
            border: "2px dashed var(--border)", color: "var(--danger)",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            opacity: brandsWithStock.length === 0 ? 0.4 : 1,
          }}>
          <Plus size={15} /> Add another brand / warehouse
        </button>
      </div>

      {/* Grand total */}
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
          onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
          placeholder="Additional notes..." />
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

  // Consolidated stock totals from actual weight_breakdowns
  // weight_breakdowns from API already reflect current remaining quantities (outbound deducted).
  // Pieces (weight < 25kg) are consolidated into 25kg bags for overview display.
  const stockTotals = (() => {
    let totalBags = 0, totalPieceKg = 0, totalKg = 0;
    for (const s of stocks) {
      if (s.weight_breakdowns && s.weight_breakdowns.length > 0) {
        for (const wb of s.weight_breakdowns) {
          const qty = wb.quantity || 0;
          if (qty <= 0) continue;
          const wkg = wb.weight_kg || 25;
          if (wkg >= 25) {
            totalBags += qty;
            totalKg += qty * wkg;
          } else {
            totalPieceKg += qty * wkg;
            totalKg += qty * wkg;
          }
        }
      } else {
        const qty = s.remaining_bags ?? 0;
        if (qty <= 0) continue;
        const wkg = s.bag_weight_kg || 25;
        if (wkg >= 25) {
          totalBags += qty;
          totalKg += qty * wkg;
        } else {
          totalPieceKg += qty * wkg;
          totalKg += qty * wkg;
        }
      }
    }
    // Consolidate pieces into 25kg bags for overview
    const piecesAsBags = Math.floor(totalPieceKg / 25);
    const leftoverKg = Math.round((totalPieceKg - piecesAsBags * 25) * 100) / 100;
    return { totalBags: totalBags + piecesAsBags, totalPieces: 0, totalKg, leftoverKg };
  })();

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
            <div className="mt-1.5 space-y-0.5">
              <p className="text-3xl font-extrabold text-white tracking-tight">
                {stockTotals.totalBags.toLocaleString()}
                <span className="text-base font-medium ml-2 text-white/70">bags</span>
              </p>
              {stockTotals.leftoverKg > 0 && (
                <p className="text-sm font-medium text-white/60">
                  + {stockTotals.leftoverKg.toFixed(1)} kg loose
                </p>
              )}
            </div>
            <p className="text-xs text-white/60 mt-1 font-medium">
              {(stockTotals.totalKg / 1000).toFixed(2)} T
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
                        {tx.transaction_type === "outbound" ? (
                          <ProfitLossBadge
                            buyPrice={tx.price}
                            sellPrice={tx.sell_price}
                            items={tx.items}
                            totalBags={tx.total_bags ?? tx.quantity_bags}
                          />
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
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {tx.total_bags ?? tx.quantity_bags} bags
                    </p>
                    {isAdmin && tx.transaction_type === "outbound" && (
                      <ProfitLossBadge
                        buyPrice={tx.price}
                        sellPrice={tx.sell_price}
                        items={tx.items}
                        totalBags={tx.total_bags ?? tx.quantity_bags}
                      />
                    )}
                  </div>
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