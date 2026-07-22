"use client";

import { Check, CircleDollarSign, Edit3, LoaderCircle, PackagePlus, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ModalPortal } from "./ModalPortal";

type Plan = {
  id: number; code: string; name: string; description: string; priceCents: number; durationDays: number;
  deviceLimit: number; aiCredits: number; features: string[]; status: "active" | "inactive"; sortOrder: number;
};
const empty = { id: 0, code: "", name: "", description: "", priceYuan: "0", durationDays: "30", deviceLimit: "1", aiCredits: "0", features: "", status: "active", sortOrder: "0" };

export function MembershipPlans({ notify }: { notify: (message: string) => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/membership-plans", { cache: "no-store" });
      const data = await response.json() as { plans?: Plan[]; error?: string };
      if (!response.ok) throw new Error(data.error || "读取套餐失败");
      setPlans(data.plans || []);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "读取套餐失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const open = (plan?: Plan) => {
    setForm(plan ? {
      id: plan.id, code: plan.code, name: plan.name, description: plan.description,
      priceYuan: String(plan.priceCents / 100), durationDays: String(plan.durationDays),
      deviceLimit: String(plan.deviceLimit), aiCredits: String(plan.aiCredits),
      features: plan.features.join("\n"), status: plan.status, sortOrder: String(plan.sortOrder),
    } : { ...empty });
    setDialog(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) { notify("请填写套餐名称和英文编号。"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/membership-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, action: "save" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败");
      setDialog(false); await load(); notify(form.id ? "会员套餐已更新。" : "会员套餐已创建。");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存失败");
    } finally { setSaving(false); }
  };

  const toggle = async (plan: Plan) => {
    const next = plan.status === "active" ? "inactive" : "active";
    const response = await fetch("/api/admin/membership-plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id: plan.id, status: next }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) { notify(data.error || "操作失败"); return; }
    await load(); notify(next === "active" ? "套餐已上架。" : "套餐已下架。");
  };

  return <div className="module-page membership-page">
    <div className="module-header">
      <div><span>MEMBERSHIP PLANS</span><h2>会员套餐</h2><p>管理员可以创建、编辑和上下架会员版本；支付功能接入后可直接关联购买。</p></div>
      <button className="primary-action" onClick={() => open()}><Plus />新增会员套餐</button>
    </div>
    <div className="membership-summary">
      <span><PackagePlus /><strong>{plans.length}</strong><small>全部套餐</small></span>
      <span><Check /><strong>{plans.filter((plan) => plan.status === "active").length}</strong><small>已上架</small></span>
      <span><ShieldCheck /><strong>管理员</strong><small>当前管理权限</small></span>
    </div>
    <section className="panel membership-list">
      <header><div><h3>会员版本</h3><p>价格目前仅作套餐配置，不会自动扣款</p></div><button onClick={load}><RefreshCw />刷新</button></header>
      {loading ? <div className="membership-empty"><LoaderCircle />正在读取套餐…</div> : plans.length === 0 ? <div className="membership-empty"><PackagePlus /><strong>还没有会员套餐</strong><p>创建免费版、专业版或企业版，之后可以继续关联用户与支付。</p><button onClick={() => open()}>创建第一个套餐</button></div> :
        <div className="membership-grid">{plans.map((plan) => <article key={plan.id} className={plan.status}>
          <div className="membership-card-top"><span><CircleDollarSign /></span><em>{plan.status === "active" ? "已上架" : "已下架"}</em></div>
          <small>{plan.code}</small><h3>{plan.name}</h3><p>{plan.description || "暂无套餐说明"}</p>
          <div className="membership-price"><strong>¥{(plan.priceCents / 100).toFixed(2)}</strong><span>/ {plan.durationDays}天</span></div>
          <ul><li><Check />最多 {plan.deviceLimit} 台电脑</li><li><Check />{plan.aiCredits ? `${plan.aiCredits} AI额度` : "AI额度按服务配置"}</li>{plan.features.map((feature) => <li key={feature}><Check />{feature}</li>)}</ul>
          <div className="membership-actions"><button onClick={() => open(plan)}><Edit3 />编辑</button><button className={plan.status === "active" ? "off" : "on"} onClick={() => toggle(plan)}>{plan.status === "active" ? "下架" : "上架"}</button></div>
        </article>)}</div>}
    </section>
    {dialog && <ModalPortal><div className="record-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(false); }}>
      <div className="private-modal wide membership-modal"><header><h3>{form.id ? "编辑会员套餐" : "新增会员套餐"}</h3><button onClick={() => setDialog(false)}><X /></button></header>
        <div className="builder-body">
          <div className="field-pair"><label>套餐名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：专业版" /></label><label>英文编号<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder="例如：pro" /></label></div>
          <label>套餐说明<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="说明适合的人群和主要能力" /></label>
          <div className="field-pair"><label>价格（元）<input type="number" min="0" step="0.01" value={form.priceYuan} onChange={(event) => setForm({ ...form, priceYuan: event.target.value })} /></label><label>有效期（天）<input type="number" min="1" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} /></label></div>
          <div className="field-pair"><label>允许电脑数<input type="number" min="1" value={form.deviceLimit} onChange={(event) => setForm({ ...form, deviceLimit: event.target.value })} /></label><label>AI额度<input type="number" min="0" value={form.aiCredits} onChange={(event) => setForm({ ...form, aiCredits: event.target.value })} /></label></div>
          <label>套餐功能（每行一项）<textarea value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} placeholder={"GPT Image 2 生图\nSeedance 视频\n电脑自动化助手"} /></label>
          <div className="field-pair"><label>状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">上架</option><option value="inactive">下架</option></select></label><label>排序<input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label></div>
        </div>
        <div className="modal-actions"><button onClick={() => setDialog(false)}>取消</button><button className="primary-action" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存套餐"}</button></div>
      </div>
    </div></ModalPortal>}
  </div>;
}
