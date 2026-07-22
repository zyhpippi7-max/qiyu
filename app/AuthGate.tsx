"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuthUser } from "./auth-server";

async function readJson(response: Response) {
  const data = await response.json() as { error?: string; user?: AuthUser; bootstrap?: boolean };
  if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试");
  return data;
}

export function AuthGate({ children }: { children: (user: AuthUser, logout: () => Promise<void>) => React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ displayName: "", phone: "", password: "", confirmPassword: "" });

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then(readJson)
      .then((data) => {
        setUser(data.user || null);
        setBootstrap(Boolean(data.bootstrap));
        if (data.bootstrap) setMode("register");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "登录服务暂时不可用"))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, ...form }),
      });
      const data = await readJson(response);
      if (data.user) setUser(data.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    setMode("login");
    setForm({ displayName: "", phone: "", password: "", confirmPassword: "" });
  };

  if (loading) {
    return <main className="auth-loading"><LoaderCircle /><strong>正在安全登录奇遇AI…</strong></main>;
  }
  if (user) return <>{children(user, logout)}</>;

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand"><img src="/qiyu-logo.png" alt="" /><span><strong>奇遇AI</strong><small>AI CREATIVE OS</small></span></div>
        <div className="auth-copy">
          <span className="auth-kicker"><ShieldCheck size={18} /> 企业级智能内容与自动化工作台</span>
          <h1>一个账号，连接内容创作、客户运营与电脑自动化</h1>
          <p>登录后即可在网页和奇遇AI电脑助手中使用同一工作空间。API 密钥始终保存在服务器，不会下发给客户。</p>
        </div>
        <div className="auth-features">
          <span><Smartphone /> 手机号与密码登录</span>
          <span><LockKeyhole /> 密码加密保存</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>登录</button>
            <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>注册账号</button>
          </div>
          <div className="auth-heading">
            <h2>{mode === "login" ? "欢迎回来" : "创建奇遇AI账号"}</h2>
            <p>{mode === "login" ? "使用手机号和密码进入工作空间" : "目前无需验证码，注册后直接登录"}</p>
          </div>
          {bootstrap && mode === "register" && <div className="auth-bootstrap"><ShieldCheck /> 首个注册账号将自动成为系统管理员</div>}
          <form onSubmit={submit}>
            {mode === "register" && <label>姓名或昵称<input autoComplete="name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="请输入2—30个字" /></label>}
            <label>手机号<input inputMode="numeric" autoComplete="tel" maxLength={13} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="请输入11位手机号" /></label>
            <label>密码<div className="auth-password"><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="请输入8—72位密码" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {mode === "register" && <label>确认密码<input type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="请再次输入密码" /></label>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={submitting}>{submitting && <LoaderCircle />}{submitting ? "正在处理…" : mode === "login" ? "登录奇遇AI" : "注册并进入"}</button>
          </form>
          <p className="auth-footnote">注册即表示同意遵守平台使用规范。当前版本暂不使用短信验证码。</p>
        </div>
      </section>
    </main>
  );
}
