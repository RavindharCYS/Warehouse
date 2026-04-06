import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, User, ShieldCheck, RefreshCw, ArrowLeft, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { authApi, getErrorMessage } from "../utils/api";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [logoError, setLogoError] = useState(false);

  const isTamil = i18n.language === "ta";

  const startCooldown = () => {
    setResendCooldown(60);
    const timer = setInterval(() => setResendCooldown(c => {
      if (c <= 1) { clearInterval(timer); return 0; }
      return c - 1;
    }), 1000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login({ username, password });
      const data = res.data;

      if (data.session_token) {
        // Admin — Email OTP required
        setSessionToken(data.session_token);
        setEmailMasked(data.email_masked);
        setStep("otp");
        startCooldown();
        toast.success(
          isTamil ? `OTP மின்னஞ்சலுக்கு அனுப்பப்பட்டது: ${data.email_masked}` : `OTP sent to ${data.email_masked}`,
          { icon: "📧" }
        );
      } else {
        login(data.access_token, data.user);
        toast.success(
          isTamil ? `வரவேற்கிறோம், ${data.user.full_name}!` : `Welcome, ${data.user.full_name}!`,
          { icon: "👋" }
        );
        navigate("/");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t("auth.invalidCredentials")));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({ username, otp_code: otp, session_token: sessionToken });
      const data = res.data;
      login(data.access_token, data.user);
      toast.success(
        isTamil ? `வரவேற்கிறோம், ${data.user.full_name}!` : `Welcome, ${data.user.full_name}!`,
        { icon: "👋" }
      );
      navigate("/");
    } catch (err) {
      toast.error(getErrorMessage(err, isTamil ? "தவறான OTP" : "Invalid OTP"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await authApi.resendOtp(sessionToken);
      startCooldown();
      toast.success(isTamil ? "OTP மீண்டும் அனுப்பப்பட்டது" : "OTP resent to your email", { icon: "📧" });
    } catch {
      toast.error(isTamil ? "OTP அனுப்புவதில் தோல்வி" : "Failed to resend OTP");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ backgroundColor: "var(--bg-primary)" }}>

      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, #1e40af 0%, transparent 70%)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 60%)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">

        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-5">
            {!logoError ? (
              <img
                src="/logo.png"
                alt="Rice Warehouse"
                onError={() => setLogoError(true)}
                className="w-20 h-20 rounded-3xl object-cover mx-auto"
                style={{ boxShadow: "0 8px 32px rgba(59,130,246,0.4)" }}
              />
            ) : (
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-white font-bold text-4xl mx-auto"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                  boxShadow: "0 8px 32px rgba(59,130,246,0.4)"
                }}>
                🌾
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 flex items-center justify-center"
              style={{ borderColor: "var(--bg-primary)" }}>
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
          <h1 className="font-display font-bold text-2xl mb-1" style={{ color: "var(--text-primary)" }}>
            {isTamil ? "அரிசி கிடங்கு மேலாண்மை" : "Rice Warehouse"}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {isTamil ? "உள்நுழைக" : "Sign in to your account"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border p-6 shadow-xl"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}>

          {step === "credentials" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">{t("auth.username")}</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                  <input className="input-field pl-10" value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Admin" required autoFocus autoCapitalize="none" />
                </div>
              </div>
              <div>
                <label className="label">{t("auth.password")}</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                  <input className="input-field pl-10 pr-11"
                    type={showPass ? "text" : "password"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg"
                    style={{ color: "var(--text-muted)" }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2 py-3 rounded-xl text-base">
                {loading
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t("common.loading")}</span>
                  : t("auth.login")}
              </button>
            </form>
          ) : (
            /* ── Email OTP Step ── */
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, var(--accent-soft), #dbeafe)" }}>
                  <Mail size={30} style={{ color: "var(--accent)" }} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {isTamil ? "மின்னஞ்சல் OTP சரிபார்ப்பு" : "Email OTP Verification"}
                  </p>
                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {isTamil ? "OTP அனுப்பப்பட்டது:" : "OTP sent to"}{" "}
                    <span className="font-semibold" style={{ color: "var(--accent)" }}>{emailMasked}</span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {isTamil ? "உங்கள் மின்னஞ்சல் inbox சரிபார்க்கவும்" : "Please check your inbox and spam folder"}
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="label text-center block">{t("auth.otp")}</label>
                  <div className="flex gap-2 justify-center mt-2">
                    {[...Array(6)].map((_, idx) => (
                      <input
                        key={idx}
                        type="tel"
                        inputMode="numeric"
                        maxLength={1}
                        value={otp[idx] || ""}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, "");
                          const arr = otp.split("");
                          arr[idx] = val;
                          const next = arr.join("").slice(0, 6);
                          setOtp(next);
                          if (val && idx < 5) {
                            const boxes = document.querySelectorAll(".otp-box");
                            boxes[idx + 1]?.focus();
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Backspace" && !otp[idx] && idx > 0) {
                            const boxes = document.querySelectorAll(".otp-box");
                            boxes[idx - 1]?.focus();
                            const arr = otp.split("");
                            arr[idx - 1] = "";
                            setOtp(arr.join(""));
                          }
                        }}
                        onPaste={e => {
                          e.preventDefault();
                          const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                          setOtp(pasted);
                        }}
                        className="otp-box w-11 h-14 rounded-xl text-center font-bold border-2 outline-none transition-all"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          borderColor: otp[idx] ? "var(--accent)" : "var(--border)",
                          color: "var(--text-primary)",
                          fontSize: "1.5rem"
                        }}
                        autoFocus={idx === 0}
                      />
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={loading || otp.length < 6}
                  className="btn-primary w-full justify-center py-3.5 rounded-xl text-base">
                  {loading
                    ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t("common.loading")}</span>
                    : t("auth.verifyOtp")}
                </button>
              </form>

              <div className="flex items-center justify-between">
                <button onClick={() => { setStep("credentials"); setOtp(""); }}
                  className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  <ArrowLeft size={13} /> {isTamil ? "திரும்பு" : "Back"}
                </button>
                <button onClick={handleResend} disabled={resendCooldown > 0}
                  className="flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ color: "var(--accent)" }}>
                  <RefreshCw size={12} />
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : t("auth.resendOtp")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Language toggle */}
        <div className="text-center mt-5">
          <button
            onClick={() => i18n.changeLanguage(isTamil ? "en" : "ta")}
            className="text-xs font-medium px-5 py-2.5 rounded-2xl border transition-all duration-200"
            style={{ color: "var(--text-muted)", borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            {isTamil ? "View in English 🌐" : "தமிழில் பார்க்க 🌐"}
          </button>
        </div>
      </div>
    </div>
  );
}
