import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Eye, EyeOff, Shield, User, Mail, Phone, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { userApi, getErrorMessage } from "../utils/api";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";

function UserForm({ initial, onSubmit, onClose, isEdit }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    initial || { username: "", full_name: "", password: "", role: "user", email: "", phone_1: "", phone_2: "" }
  );
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;
      // strip empty optional strings
      if (!payload.email)   delete payload.email;
      if (!payload.phone_1) delete payload.phone_1;
      if (!payload.phone_2) delete payload.phone_2;
      await onSubmit(payload);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Username & Full Name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("users.username")} *</label>
          <input className="input-field" value={form.username} onChange={set("username")}
            required disabled={isEdit} autoCapitalize="none"
            placeholder="john_doe" />
        </div>
        <div>
          <label className="label">{t("users.fullName")} *</label>
          <input className="input-field" value={form.full_name} onChange={set("full_name")}
            required placeholder="John Doe" />
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="label">
          {t("users.password")} {isEdit && <span className="normal-case font-normal" style={{ color: "var(--text-muted)" }}>(leave blank to keep)</span>}
        </label>
        <div className="relative">
          <input className="input-field pr-10" type={showPass ? "text" : "password"}
            value={form.password} onChange={set("password")}
            required={!isEdit} placeholder="••••••••" />
          <button type="button" onClick={() => setShowPass(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg"
            style={{ color: "var(--text-muted)" }}>
            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Email — required for admin, optional for user */}
      <div>
        <label className="label">
          {t("users.email")}
          {form.role === "admin" && <span className="ml-1 text-red-500">* (required for OTP)</span>}
        </label>
        <div className="relative">
          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input className="input-field pl-9" type="email" value={form.email} onChange={set("email")}
            required={form.role === "admin"}
            placeholder="user@example.com" />
        </div>
        {form.role === "admin" && (
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            OTP login codes will be sent to this email address.
          </p>
        )}
      </div>

      {/* Role */}
      <div>
        <label className="label">{t("users.role")}</label>
        <div className="flex gap-3">
          {["user", "admin"].map(role => (
            <button key={role} type="button"
              onClick={() => setForm(f => ({ ...f, role }))}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all duration-200"
              style={form.role === role
                ? { borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "var(--accent-soft)" }
                : { borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }
              }>
              {role === "admin" ? <Shield size={15} /> : <User size={15} />}
              {role === "admin" ? t("users.admin") : t("users.user")}
            </button>
          ))}
        </div>
      </div>

      {/* Phones */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("users.phone1")}</label>
          <div className="relative">
            <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input className="input-field pl-8" value={form.phone_1} onChange={set("phone_1")}
              placeholder="+91 99999 99999" type="tel" />
          </div>
        </div>
        <div>
          <label className="label">{t("users.phone2")}</label>
          <div className="relative">
            <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input className="input-field pl-8" value={form.phone_2} onChange={set("phone_2")}
              placeholder="+91 99999 99999" type="tel" />
          </div>
        </div>
      </div>

      {/* Active toggle for edit */}
      {isEdit && (
        <div className="flex items-center gap-3 p-3 rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)" }}>
          <label className="flex items-center gap-2 cursor-pointer select-none flex-1 text-sm font-medium"
            style={{ color: "var(--text-primary)" }}>
            <input type="checkbox" checked={form.is_active ?? true}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4 rounded accent-blue-600" />
            {t("users.active")}
          </label>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {form.is_active ? "User can log in" : "User cannot log in"}
          </span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{t("common.cancel")}</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
          {loading ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    userApi.list().then(r => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => { await userApi.create(data); toast.success("User created"); load(); };
  const handleUpdate = async (data) => { await userApi.update(modal.data.id, data); toast.success("User updated"); load(); };
  const handleDelete = async () => { await userApi.delete(deleteTarget.id); toast.success("User deleted"); setDeleteTarget(null); load(); };

  const adminCount = users.filter(u => u.role === "admin").length;
  const activeCount = users.filter(u => u.is_active).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
            {t("users.title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {users.length} total · {adminCount} admin · {activeCount} active
          </p>
        </div>
        <button onClick={() => setModal({ mode: "create" })} className="btn-primary">
          <Plus size={16} /> {t("users.add")}
        </button>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="card h-40 animate-pulse" style={{ backgroundColor: "var(--bg-secondary)" }} />
          ))
        ) : users.length === 0 ? (
          <div className="col-span-3 text-center py-16" style={{ color: "var(--text-muted)" }}>
            <User size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t("common.noData")}</p>
          </div>
        ) : users.map(u => (
          <div key={u.id} className="card hover:shadow-md transition-all duration-200 group">
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                  style={{ background: u.role === "admin"
                    ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                    : "linear-gradient(135deg, #10b981, #059669)" }}>
                  {u.full_name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                    {u.full_name}
                  </div>
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>@{u.username}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setModal({ mode: "edit", data: u })}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--accent-soft)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteTarget(u)}
                  className="p-1.5 rounded-lg text-red-400 transition-colors"
                  style={{ color: "#ef4444" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#fee2e2"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`badge ${u.role === "admin" ? "badge-blue" : "badge-success"}`}>
                {u.role === "admin" ? <Shield size={10} /> : <User size={10} />}
                {u.role === "admin" ? t("users.admin") : t("users.user")}
              </span>
              <span className={`badge ${u.is_active ? "badge-success" : "badge-danger"}`}>
                {u.is_active ? t("users.active") : t("users.inactive")}
              </span>
            </div>

            {/* Contact info */}
            <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--border-light)" }}>
              {u.email ? (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Mail size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span className="truncate">{u.email}</span>
                  {u.role === "admin" && (
                    <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>OTP</span>
                  )}
                </div>
              ) : u.role === "admin" ? (
                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <Mail size={12} style={{ flexShrink: 0 }} />
                  <span>No email — OTP login unavailable</span>
                </div>
              ) : null}
              {u.phone_1 && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Phone size={12} style={{ flexShrink: 0 }} />
                  <span>{u.phone_1}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <Calendar size={12} style={{ flexShrink: 0 }} />
                <span>Joined {format(new Date(u.created_at), "dd MMM yyyy")}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal?.mode === "create" ? t("users.add") : t("users.edit")}>
        {modal && (
          <UserForm
            initial={modal.data}
            isEdit={modal.mode === "edit"}
            onSubmit={modal.mode === "create" ? handleCreate : handleUpdate}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={t("users.delete")}
        message={`Delete user "${deleteTarget?.full_name}"? This cannot be undone.`} />
    </div>
  );
}
