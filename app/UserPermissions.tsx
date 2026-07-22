"use client";

import {
  CalendarClock,
  CheckCircle2,
  Crown,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "./ModalPortal";

type UserRecord = {
  id: number;
  phone: string;
  displayName: string;
  role: "admin" | "member";
  planId: number | null;
  planName: string;
  membershipExpiresAt: string | null;
  status: "active" | "inactive";
  lastLoginAt: string | null;
  createdAt: string;
};

type Plan = { id: number; name: string; durationDays: number; status: "active" | "inactive" };
type FormState = {
  id: number; phone: string; displayName: string; password: string; role: "admin" | "member";
  planId: string; membershipExpiresAt: string; status: "active" | "inactive";
};

const emptyForm: FormState = {
  id: 0, phone: "", displayName: "", password: "", role: "member",
  planId: "", membershipExpiresAt: "", status: "active",
};

function localDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false, dateStyle: "medium", timeStyle: "short" });
}

function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function UserPermissions({ notify }: { notify: (message: string) => void }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, members: 0, admins: 0 });
  const [currentUserId, setCurrentUserId] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm });

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const data = await response.json() as {
        users?: UserRecord[]; plans?: Plan[]; summary?: typeof summary; currentUserId?: number; error?: string;
      };
      if (!response.ok) throw new Error(data.error || "读取账号失败");
      setUsers(data.users || []);
      setPlans(data.plans || []);
      setSummary(data.summary || { total: 0, active: 0, members: 0, admins: 0 });
      setCurrentUserId(data.currentUserId || 0);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "读取账号失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activePlans = useMemo(() => plans.filter((plan) => plan.status === "active"), [plans]);

  const open = (user?: UserRecord) => {
    setForm(user ? {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      password: "",
      role: user.role,
      planId: user.planId ? String(user.planId) : "",
      membershipExpiresAt: dateInput(user.membershipExpiresAt),
      status: user.status,
    } : { ...emptyForm });
    setDialog(true);
  };

  const selectPlan = (value: string) => {
    const plan = plans.find((item) => String(item.id) === value);
    let expires = form.membershipExpiresAt;
    if (plan && !expires) {
      const date = new Date();
      date.setDate(date.getDate() + plan.durationDays);
      expires = dateInput(date.toISOString());
    }
    setForm({ ...form, planId: value, membershipExpiresAt: value ? expires : "" });
  };

  const save = async () => {
    if (form.displayName.trim().length < 2) { notify("请填写姓名或昵称。"); return; }
    if (!form.id && !form.phone.trim()) { notify("请填写登录手机号。"); return; }
    if (!form.id && form.password.length < 8) { notify("初始密码至少需要8位。"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          action: form.id ? "update" : "create",
          planId: form.role === "admin" ? null : form.planId || null,
          membershipExpiresAt: form.role === "admin" || !form.membershipExpiresAt
            ? null
            : new Date(form.membershipExpiresAt).toISOString(),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存账号失败");
      setDialog(false);
      await load();
      notify(form.id ? "账号权限已更新。" : "账号已添加，可以使用手机号和初始密码登录。");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存账号失败");
    } finally {
      setSaving(false);
    }
  };

  return <div className="module-page user-admin-page">
    <div className="module-header">
      <div><span>USERS & PERMISSIONS</span><h2>用户与权限</h2><p>添加登录账号、开通会员、设置管理员权限，并控制账号启用状态。</p></div>
      <button className="primary-action" onClick={() => open()}><Plus />添加账号</button>
    </div>

    <div className="membership-summary user-summary">
      <span><UsersRound /><strong>{summary.total}</strong><small>全部账号</small></span>
      <span><CheckCircle2 /><strong>{summary.active}</strong><small>启用中</small></span>
      <span><Crown /><strong>{summary.members}</strong><small>已开会员</small></span>
      <span><ShieldCheck /><strong>{summary.admins}</strong><small>管理员</small></span>
    </div>

    <section className="panel user-admin-list">
      <header>
        <div><h3>账号列表</h3><p>账号信息和权限保存在服务器数据库中</p></div>
        <div className="user-admin-tools">
          <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") load(); }} placeholder="搜索手机号或昵称" /></label>
          <button onClick={load}><RefreshCw />刷新</button>
        </div>
      </header>
      {loading ? <div className="membership-empty"><LoaderCircle />正在读取账号…</div> : users.length === 0
        ? <div className="membership-empty"><UsersRound /><strong>没有找到账号</strong><p>可以清空搜索条件，或添加一个新的会员账号。</p></div>
        : <div className="user-admin-table">
          <div className="user-admin-row user-admin-head"><span>用户</span><span>身份</span><span>会员权限</span><span>状态</span><span>最近登录</span><span>操作</span></div>
          {users.map((user) => {
            const expired = Boolean(user.membershipExpiresAt && new Date(user.membershipExpiresAt).getTime() < Date.now());
            return <article className="user-admin-row" key={user.id}>
              <span className="user-admin-person"><i>{user.displayName.slice(0, 1)}</i><span><strong>{user.displayName}{user.id === currentUserId ? "（当前）" : ""}</strong><small>{user.phone}</small></span></span>
              <span><em className={`role-pill ${user.role}`}>{user.role === "admin" ? <><ShieldCheck />管理员</> : <><UserRoundCog />普通账号</>}</em></span>
              <span className="user-plan-cell"><strong>{user.role === "admin" ? "全部管理权限" : user.planName || "免费版"}</strong><small>{user.role === "admin" ? "长期有效" : user.membershipExpiresAt ? `${expired ? "已到期" : "到期"}：${localDate(user.membershipExpiresAt)}` : "未设置到期时间"}</small></span>
              <span><em className={`status-pill ${user.status}`}>{user.status === "active" ? "启用" : "已停用"}</em></span>
              <span className="user-login-time">{localDate(user.lastLoginAt)}</span>
              <span><button className="user-edit-button" onClick={() => open(user)}><Edit3 />权限设置</button></span>
            </article>;
          })}
        </div>}
    </section>

    {dialog && <ModalPortal><div className="record-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(false); }}>
      <div className="private-modal wide membership-modal user-admin-modal">
        <header><h3>{form.id ? "设置账号与权限" : "添加登录账号"}</h3><button onClick={() => setDialog(false)}><X /></button></header>
        <div className="builder-body">
          <div className="field-pair">
            <label>姓名或昵称<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="例如：运营小王" /></label>
            <label>登录手机号<input value={form.phone} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="11位手机号" /></label>
          </div>
          <div className="field-pair">
            <label>账号身份<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as FormState["role"], planId: event.target.value === "admin" ? "" : form.planId, membershipExpiresAt: event.target.value === "admin" ? "" : form.membershipExpiresAt })}><option value="member">普通账号 / 会员</option><option value="admin">管理员（全部后台权限）</option></select></label>
            <label>账号状态<select value={form.status} disabled={form.id === currentUserId} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}><option value="active">启用</option><option value="inactive">停用</option></select></label>
          </div>
          {form.role === "member" && <div className="user-membership-box">
            <div><Crown /><span><strong>会员权限</strong><small>选择套餐后会自动填写该套餐的默认到期时间，也可以手动修改。</small></span></div>
            <div className="field-pair">
              <label>会员套餐<select value={form.planId} onChange={(event) => selectPlan(event.target.value)}><option value="">免费版 / 不开通会员</option>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}（{plan.durationDays}天）</option>)}</select></label>
              <label>会员到期时间<span className="input-with-icon"><CalendarClock /><input type="datetime-local" value={form.membershipExpiresAt} disabled={!form.planId} onChange={(event) => setForm({ ...form, membershipExpiresAt: event.target.value })} /></span></label>
            </div>
          </div>}
          <label>{form.id ? "重置密码（不修改请留空）" : "初始登录密码"}<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={form.id ? "填写后将重置密码并退出该账号的旧登录" : "8到72位"} /></label>
          {form.id === currentUserId && <p className="self-protection"><ShieldCheck />当前管理员账号受保护，不能停用或取消自己的管理员权限。</p>}
        </div>
        <div className="modal-actions"><button onClick={() => setDialog(false)}>取消</button><button className="primary-action" disabled={saving} onClick={save}>{saving ? "保存中…" : form.id ? "保存权限" : "添加账号"}</button></div>
      </div>
    </div></ModalPortal>}
  </div>;
}
