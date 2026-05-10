// pages/TransactionsPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Trash2, Filter, X, ArrowLeftRight, Truck, MapPin, Calendar,
  ChevronDown, Package, FileText, Hash,
  ArrowDownToLine, ArrowUpFromLine, UserCheck, Phone, DollarSign,
  Factory, Bell, User as UserIcon, Warehouse,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  transactionApi, warehouseApi, brandApi,
  getErrorMessage,
} from "../utils/api";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { transliterateToTamil } from "../utils/transliterate";

/* ═══════════════════════════════════════════════════════
   PENDING ADMIN MODAL
   ═══════════════════════════════════════════════════════ */
function PendingAdminModal({ tx: initialTx, onClose, onSave, i18n }) {
  // Fetch fresh transaction data so we always see the latest saved fields
  const [tx, setTx] = useState(initialTx);
  const [fetchingFresh, setFetchingFresh] = useState(true);

  useEffect(() => {
    setFetchingFresh(true);
    transactionApi.get(initialTx.id)
      .then(r => setTx(r.data || initialTx))
      .catch(() => setTx(initialTx))
      .finally(() => setFetchingFresh(false));
  }, [initialTx.id]);

  const isArrival = tx.transaction_type === "inbound";

  // Arrival state — only shown if not already filled
  const millOwnerAlreadyFilled = !!(tx.mill_owner_name && tx.mill_owner_name.trim());
  const commissionAlreadyFilled = !!(tx.commission_partner && tx.commission_partner.trim());
  const rentAlreadyFilled = tx.rent != null && tx.rent !== "";
  const hiddenChargesAlreadyFilled = tx.hidden_charges != null && tx.hidden_charges !== "";

  const [millOwnerName, setMillOwnerName] = useState("");
  const [commissionPartner, setCommissionPartner] = useState("");
  const [rent, setRent] = useState("");
  const [hiddenCharges, setHiddenCharges] = useState("");

  // Per-weight-row buying prices — keyed by `${item_id}__${weight_kg}`
  // Initialise from existing saved prices; update when fresh tx loads
  const [weightBuyingPrices, setWeightBuyingPrices] = useState(() => {
    const out = {};
    (initialTx.items || []).forEach(it => {
      (it.weights || []).forEach(w => {
        if (w.buying_price != null) out[`${it.id}__${w.weight_kg}`] = String(w.buying_price);
      });
    });
    return out;
  });

  // Re-seed price maps when fresh tx data arrives
  // Picks up both weight-level prices (w.buying_price) and item-level prices (it.buying_price)
  // so that prices entered at arrival time are also reflected here
  useEffect(() => {
    if (fetchingFresh) return;
    setWeightBuyingPrices(prev => {
      const out = { ...prev };
      (tx.items || []).forEach(it => {
        (it.weights || []).forEach(w => {
          const key = `${it.id}__${w.weight_kg}`;
          // Prefer weight-level price, fall back to item-level price
          const price = w.buying_price ?? it.buying_price ?? null;
          if (price != null && !out[key]) out[key] = String(price);
        });
      });
      return out;
    });
    setWeightSellingPrices(prev => {
      const out = { ...prev };
      (tx.items || []).forEach(it => {
        (it.weights || []).forEach(w => {
          const key = `${it.id}__${w.weight_kg}`;
          const sp = w.selling_price ?? it.selling_price ?? null;
          if (sp != null && !out[key]) out[key] = String(sp);
        });
      });
      return out;
    });
  }, [tx, fetchingFresh]);

  // Send state — only shown if not already filled
  const toWhomAlreadyFilled = !!(tx.commission_partner && tx.commission_partner.trim());
  const locationAlreadyFilled = !!(tx.location && tx.location.trim());

  const [toWhom, setToWhom] = useState("");
  const [location, setLocation] = useState("");

  // Per-weight-row selling prices for send: key = `${item_id}__${weight_kg}`
  const [weightSellingPrices, setWeightSellingPrices] = useState(() => {
    const out = {};
    (initialTx.items || []).forEach(it => {
      (it.weights || []).forEach(w => {
        const sp = w.selling_price ?? it.selling_price ?? null;
        if (sp != null) out[`${it.id}__${w.weight_kg}`] = String(sp);
      });
    });
    return out;
  });

  const [loading, setLoading] = useState(false);

  // Build weight rows for display — flatten items × weights
  // For arrival: show ALL rows; already-priced ones are read-only (green), unfilled ones are editable
  // For send: same logic for selling prices
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
        const key = `${it.id}__${w.weight_kg}`;
        const existingBuyPrice  = w.buying_price ?? it.buying_price ?? null;
        const existingSellPrice = w.selling_price ?? it.selling_price ?? null;
        const alreadyInBuyMap   = weightBuyingPrices[key] != null && weightBuyingPrices[key] !== "";
        const alreadyInSellMap  = weightSellingPrices[key] != null && weightSellingPrices[key] !== "";

        // BUG FIX: Previously rows with existing prices were filtered OUT entirely.
        // Now we include ALL rows but mark already-priced ones as readOnly so
        // the admin can see what was already entered (for reference) alongside
        // the rows still needing input.
        const isBuyFilled  = existingBuyPrice != null || alreadyInBuyMap;
        const isSellFilled = existingSellPrice != null || alreadyInSellMap;

        rows.push({
          itemId: it.id,
          brandLabel,
          typeLabel,
          weight_kg: w.weight_kg,
          quantity: w.quantity,
          isPiece,
          unitLabel: isPiece ? "piece" : "bag",
          existingBuyPrice,
          existingSellPrice,
          key,
          isBuyFilled,
          isSellFilled,
        });
      });
    });
    return rows;
  }, [tx, weightBuyingPrices, weightSellingPrices]);

  const handleSave = async () => {
    const data = {};

    if (isArrival) {
      if (millOwnerName.trim())     data.mill_owner_name = millOwnerName.trim();
      if (commissionPartner.trim()) data.commission_partner = commissionPartner.trim();
      if (rent !== "")              data.rent = parseFloat(rent);
      if (hiddenCharges !== "")     data.hidden_charges = parseFloat(hiddenCharges);

      // Only submit buying prices for rows that are NOT already filled on the backend.
      // This avoids accidentally overwriting existing prices with the seeded values
      // and prevents sending empty strings for rows the admin hasn't touched yet.
      const unfilledKeys = new Set(
        allWeightRows.filter(r => !r.isBuyFilled).map(r => r.key)
      );

      const itemBuyingPrices = {};
      const weightPrices = {};
      Object.entries(weightBuyingPrices).forEach(([key, val]) => {
        if (!unfilledKeys.has(key)) return; // skip already-filled rows
        if (!val || parseFloat(val) <= 0) return;
        const [itemIdStr, wkgStr] = key.split("__");
        itemBuyingPrices[itemIdStr] = parseFloat(val);
        if (!weightPrices[itemIdStr]) weightPrices[itemIdStr] = {};
        weightPrices[itemIdStr][wkgStr] = parseFloat(val);
      });

      if (Object.keys(itemBuyingPrices).length > 0) {
        data.item_buying_prices = itemBuyingPrices;
        data.item_weight_prices = weightPrices;
      }

      // Count truly unfilled rows to decide if save is valid
      const stillUnfilled = allWeightRows.filter(r => !r.isBuyFilled);
      const newPricesEntered = Object.keys(itemBuyingPrices).length > 0;
      if (!data.mill_owner_name && !newPricesEntered && !data.rent && stillUnfilled.length > 0) {
        toast.error("Enter at least Mill Owner or one buying price to save");
        return;
      }
    } else {
      if (toWhom.trim())   data.commission_partner = toWhom.trim();
      if (location.trim()) data.location = location.trim();

      // Only submit selling prices for rows that are NOT already filled
      const unfilledKeys = new Set(
        allWeightRows.filter(r => !r.isSellFilled).map(r => r.key)
      );

      const itemSellingPrices = {};
      const weightPrices = {};
      Object.entries(weightSellingPrices).forEach(([key, val]) => {
        if (!unfilledKeys.has(key)) return; // skip already-filled rows
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

  if (fetchingFresh) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading latest data…</span>
      </div>
    );
  }

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
          {/* Mill Owner + Commission Partner — only show if not already filled */}
          {!millOwnerAlreadyFilled && (
            <div>
              <label className="label flex items-center gap-1.5"><Factory size={11} /> Mill Owner Name</label>
              <input className="input-field" value={millOwnerName}
                onChange={e => setMillOwnerName(e.target.value)} placeholder="Mill owner..." />
            </div>
          )}
          {millOwnerAlreadyFilled && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
              ✓ Mill Owner: {tx.mill_owner_name}
            </div>
          )}
          {!commissionAlreadyFilled && (
            <div>
              <label className="label flex items-center gap-1.5"><UserCheck size={11} /> Commission Partner</label>
              <input className="input-field" value={commissionPartner}
                onChange={e => setCommissionPartner(e.target.value)} placeholder="Agent / Partner..." />
            </div>
          )}
          {commissionAlreadyFilled && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
              ✓ Commission Partner: {tx.commission_partner}
            </div>
          )}

          {/* Global charges — only show unfilled ones */}
          {(!rentAlreadyFilled || !hiddenChargesAlreadyFilled) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}>Global Charges</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {!rentAlreadyFilled ? (
                  <div>
                    <label className="label text-[10px]">Rent</label>
                    <input type="number" step="0.01" className="input-field" value={rent}
                      onWheel={e => e.target.blur()} onChange={e => setRent(e.target.value)} placeholder="0" />
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
                    ✓ Rent: ₹{tx.rent}
                  </div>
                )}
                {!hiddenChargesAlreadyFilled ? (
                  <div>
                    <label className="label text-[10px]">Hidden Charges</label>
                    <input type="number" step="0.01" className="input-field" value={hiddenCharges}
                      onWheel={e => e.target.blur()} onChange={e => setHiddenCharges(e.target.value)} placeholder="0" />
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
                    ✓ Hidden Charges: ₹{tx.hidden_charges}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Per-weight buying prices — filled rows shown in green, unfilled as editable */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#6366f1" }}>
              Buying Price per Weight
            </p>
            {allWeightRows.length === 0 ? (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
                ✓ All buying prices are already filled for this transaction.
              </div>
            ) : (
              <div className="space-y-2">
                {allWeightRows.map(row => {
                  const val = weightBuyingPrices[row.key] ?? "";
                  const filledPrice = row.isBuyFilled ? (row.existingBuyPrice ?? (val ? parseFloat(val) : null)) : null;
                  const displayVal = row.isBuyFilled ? (filledPrice != null ? String(filledPrice) : val) : val;
                  const total = displayVal && row.quantity ? (parseFloat(displayVal) * row.quantity).toFixed(2) : null;

                  if (row.isBuyFilled) {
                    // Already priced — show as read-only green reference row
                    return (
                      <div key={row.key} className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                        style={{ backgroundColor: "var(--success-soft)", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold" style={{ color: "var(--success)" }}>✓</span>
                          <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {row.brandLabel}
                            {row.typeLabel && <span className="font-normal opacity-70"> · {row.typeLabel}</span>}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: row.isPiece ? "var(--warning-soft)" : "rgba(16,185,129,0.15)",
                                     color: row.isPiece ? "var(--warning)" : "var(--success)" }}>
                            {row.weight_kg}KG · {row.quantity} {row.unitLabel}{row.quantity !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="text-xs font-bold shrink-0" style={{ color: "var(--success)" }}>
                          ₹{filledPrice ?? "—"}
                          {total && <span className="font-normal opacity-70 ml-1">= ₹{total}</span>}
                        </span>
                      </div>
                    );
                  }

                  // Not yet priced — show editable input
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
                      </div>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.01" className="input-field flex-1"
                          value={val}
                          onWheel={e => e.target.blur()}
                          onChange={e => setWeightBuyingPrices(p => ({ ...p, [row.key]: e.target.value }))}
                          placeholder={`₹ per ${row.unitLabel}`} />
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
            )}
          </div>
        </>
      ) : (
        <>
          {/* Send: To Whom + Location — only show unfilled */}
          {!toWhomAlreadyFilled ? (
            <div>
              <label className="label flex items-center gap-1.5"><UserIcon size={11} /> To Whom</label>
              <input className="input-field" value={toWhom}
                onChange={e => setToWhom(e.target.value)} placeholder="Buyer / Recipient..." />
            </div>
          ) : (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
              ✓ To Whom: {tx.commission_partner}
            </div>
          )}
          {!locationAlreadyFilled ? (
            <div>
              <label className="label flex items-center gap-1.5"><MapPin size={11} /> Location</label>
              <input className="input-field" value={location}
                onChange={e => setLocation(e.target.value)} placeholder="Location..." />
            </div>
          ) : (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
              ✓ Location: {tx.location}
            </div>
          )}

          {/* Per-weight selling prices — filled rows shown in green, unfilled as editable */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#ef4444" }}>
              Selling Price per Weight *
            </p>
            {allWeightRows.length === 0 ? (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}>
                ✓ All selling prices are already filled for this transaction.
              </div>
            ) : (
              <div className="space-y-2">
                {allWeightRows.map(row => {
                  const val = weightSellingPrices[row.key] ?? "";
                  const buyP = row.existingBuyPrice;

                  if (row.isSellFilled) {
                    // Already priced — read-only green reference row
                    const filledSell = row.existingSellPrice ?? (val ? parseFloat(val) : null);
                    const diff = filledSell != null && buyP != null ? filledSell - buyP : null;
                    const col = diff == null ? "var(--success)" : diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--text-muted)";
                    return (
                      <div key={row.key} className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                        style={{ backgroundColor: "var(--success-soft)", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold" style={{ color: "var(--success)" }}>✓</span>
                          <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {row.brandLabel}
                            {row.typeLabel && <span className="font-normal opacity-70"> · {row.typeLabel}</span>}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "var(--success)" }}>
                            {row.weight_kg}KG · {row.quantity} {row.unitLabel}{row.quantity !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="text-xs font-bold shrink-0" style={{ color: col }}>
                          ₹{filledSell ?? "—"}
                          {diff != null && (
                            <span className="ml-1 text-[10px]">({diff > 0 ? "+" : ""}{diff.toFixed(2)})</span>
                          )}
                        </span>
                      </div>
                    );
                  }

                  // Not yet priced — editable
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
            )}
          </div>
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
                            <Warehouse size={9} />
                            {s.warehouse?.location_name || wName(s.warehouse_id)}: {s.bags}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.warehouse_id && (!it.splits || !it.splits.length) && (
                      <div className="mt-1.5 text-[11px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "rgba(99,102,241,0.08)", color: "#6366f1" }}>
                        <Warehouse size={9} /> {it.warehouse?.location_name || wName(it.warehouse_id)}
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
  const { isAdmin } = useAuth();

  const [transactions, setTransactions] = useState([]);
  const [brands, setBrands]             = useState([]);
  const [warehouses, setWarehouses]     = useState([]);
  const [loading, setLoading]           = useState(true);

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
      .catch(err => {
        console.error("Failed to load transactions:", err);
        setTransactions([]);
        toast.error(getErrorMessage(err, "Failed to load transactions"));
      })
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    brandApi.list().then(r => setBrands(r.data || [])).catch(() => setBrands([]));
    warehouseApi.list().then(r => setWarehouses(r.data || [])).catch(() => setWarehouses([]));
  }, []);

  const handleDelete = async () => {
    try {
      await transactionApi.delete(deleteTarget.id);
      toast.success(i18n.language === "ta" ? "பரிவர்த்தனை நீக்கப்பட்டது" : "Transaction deleted");
      setDeleteTarget(null); load();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const handlePendingFill = async (id, data) => {
    await transactionApi.completeAdminFields(id, data);
    load();
  };

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters({ transaction_type: "", warehouse_id: "", brand_id: "", date_from: "", date_to: "", vehicle_no: "", mill_owner_name: "" });
  const toggleCard = (id) => setOpenCardId(prev => prev === id ? null : id);

  const arrivalTxs  = transactions.filter(tx => tx.transaction_type === "inbound");
  const sendTxs     = transactions.filter(tx => tx.transaction_type === "outbound");
  const totalArrival = arrivalTxs.reduce((s, tx) => s + (tx.total_bags ?? tx.quantity_bags ?? 0), 0);
  const totalSend    = sendTxs.reduce((s, tx) => s + (tx.total_bags ?? tx.quantity_bags ?? 0), 0);
  const totalArrivalKg = arrivalTxs.reduce((s, tx) => s + (tx.total_weight_kg ?? 0), 0);
  const totalSendKg    = sendTxs.reduce((s, tx) => s + (tx.total_weight_kg ?? 0), 0);
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
        </div>
      </div>

      {/* Summary stats — display only, no form open */}
      <div className="grid grid-cols-2 gap-3">
        {/* Arrival stat */}
        <div className="relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.03) 100%)",
            border: "2px solid rgba(16,185,129,0.22)", borderRadius: 18, padding: "16px 14px",
          }}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(16,185,129,0.14)" }}>
              <ArrowDownToLine size={20} style={{ color: "#10b981" }} />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }}>
              {arrivalTxs.length} {i18n.language === "ta" ? "பரிவர்" : "txns"}
            </span>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#10b981" }}>
            {i18n.language === "ta" ? "வரவு" : "Arrivals"}
          </p>
          <p className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            {totalArrival}
            <span className="text-sm font-semibold ml-1" style={{ color: "var(--text-muted)" }}>bags</span>
          </p>
          {totalArrivalKg > 0 && (
            <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
              {(totalArrivalKg / 1000).toFixed(2)} T total
            </p>
          )}
        </div>

        {/* Send stat */}
        <div className="relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.03) 100%)",
            border: "2px solid rgba(239,68,68,0.22)", borderRadius: 18, padding: "16px 14px",
          }}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
              <ArrowUpFromLine size={20} style={{ color: "#ef4444" }} />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444" }}>
              {sendTxs.length} {i18n.language === "ta" ? "பரிவர்" : "txns"}
            </span>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#ef4444" }}>
            {i18n.language === "ta" ? "அனுப்பு" : "Dispatched"}
          </p>
          <p className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            {totalSend}
            <span className="text-sm font-semibold ml-1" style={{ color: "var(--text-muted)" }}>bags</span>
          </p>
          {totalSendKg > 0 && (
            <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
              {(totalSendKg / 1000).toFixed(2)} T total
            </p>
          )}
        </div>
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