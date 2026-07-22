"use client";

import { Bot, CheckCircle2, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "./ModalPortal";

type Props = { notify: (message: string) => void };
type ExpertRecord = { id: number; title: string; description: string; status: string; metadata: Record<string, string>; updatedAt: string };

const roles = {
  service: { name: "客服顾问", desc: "答疑、售后与问题处理", prompt: "你是耐心、准确的客服专家。先解决问题，不夸大承诺，不编造政策；信息不足时只提出一个最关键的问题。回答简洁、友好，并明确下一步。" },
  sales: { name: "销售顾问", desc: "识别需求并推进成交", prompt: "你是顾问式销售专家。先理解客户需求，再说明最相关的价值；不施压、不虚构优惠。每次只推进一个动作，结尾给出自然且容易回答的问题。" },
  private: { name: "私域运营顾问", desc: "客户激活、跟进与维护", prompt: "你是私域运营专家。像熟悉客户的真人顾问一样简洁交流，结合客户阶段推进下一步，避免模板感、连续轰炸和过度营销。" },
  success: { name: "客户成功顾问", desc: "促进使用与续费", prompt: "你是客户成功专家。关注客户是否真正获得结果，主动发现阻碍，给出明确而简短的下一步建议，并记录需要后续跟进的事项。" },
  content: { name: "内容营销顾问", desc: "选题、文案与内容转化", prompt: "你是内容营销专家。表达有吸引力但不标题党，突出真实场景、受众痛点、核心价值和明确行动建议，避免无法验证的宣传。" },
};

export function AIExperts({ notify }: Props) {
  const [records, setRecords] = useState<ExpertRecord[]>([]); const [loading, setLoading] = useState(true); const [dialog, setDialog] = useState(false); const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [role, setRole] = useState<keyof typeof roles>("sales"); const [modelTier, setModelTier] = useState("smart"); const [prompt, setPrompt] = useState(roles.sales.prompt); const [business, setBusiness] = useState("");
  const stats = useMemo(() => ({ total: records.length, active: records.filter(item => item.status === "active").length }), [records]);
  const load = async () => { setLoading(true); try { const response=await fetch("/api/records?module=ai-expert",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"加载失败");setRecords(data.records||[]); } catch(error){notify(error instanceof Error?error.message:"加载失败");} finally{setLoading(false);} };
  useEffect(()=>{load();},[]);
  const chooseRole = (next: keyof typeof roles) => { setRole(next); setPrompt(roles[next].prompt); if(!name.trim())setName(roles[next].name); };
  const open = () => { setName(roles.sales.name); setRole("sales"); setModelTier("smart"); setPrompt(roles.sales.prompt); setBusiness(""); setDialog(true); };
  const save = async () => { if(!name.trim()||!prompt.trim()){notify("请填写专家名称和专家指令。");return;}setSaving(true);try{const response=await fetch("/api/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({module:"ai-expert",title:name,description:roles[role].desc,status:"active",metadata:{role,roleName:roles[role].name,modelTier,prompt,business}})});const data=await response.json();if(!response.ok)throw new Error(data.error||"保存失败");setDialog(false);await load();notify("AI 专家已启用，自动化方案可以直接使用这个角色。");}catch(error){notify(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);} };
  const remove = async (record: ExpertRecord) => { if(!window.confirm(`删除“${record.title}”？`))return;await fetch("/api/records",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:record.id,module:"ai-expert"})});await load(); };

  return <div className="module-page expert-page">
    <div className="module-header"><div><span>AI EXPERT TEAM</span><h2>AI 专家</h2><p>客户只选择专家角色和智能程度，系统在后台自动选择可用模型。</p></div><button className="primary-action" onClick={open}><Plus size={16}/>新建 AI 专家</button></div>
    <div className="expert-summary"><div><Sparkles/><strong>{stats.total}</strong><small>专家角色</small></div><div><CheckCircle2/><strong>{stats.active}</strong><small>已启用</small></div><div><Zap/><strong>自动</strong><small>模型路由</small></div><div><ShieldCheck/><strong>内置</strong><small>角色提示词</small></div></div>
    <section className="panel expert-explain"><Bot/><div><h3>客户不需要知道 GPT、Claude 或其他模型全称</h3><p>选择“高质量、智能推荐、快速省成本”即可。现在统一由 GPT-5.5 执行；后续接入 DeepSeek、Claude、Gemini、Grok、GLM 后，服务器会自动路由，不改变客户操作方式。</p></div></section>
    {loading?<div className="records-empty panel"><RefreshCw className="spin"/><strong>正在读取专家</strong></div>:records.length===0?<section className="panel"><div className="records-empty"><Sparkles/><strong>还没有 AI 专家</strong><p>先创建一个销售顾问或私域运营顾问，系统会自动带入完整提示词。</p><button onClick={open}>创建第一个专家</button></div></section>:<div className="expert-grid">{records.map(record=><article className="panel" key={record.id}><span className="expert-avatar"><Bot/></span><div><em>{record.metadata.roleName||"AI专家"}</em><h3>{record.title}</h3><p>{record.description}</p><div className="expert-tags"><span>{record.metadata.modelTier==="quality"?"高质量":record.metadata.modelTier==="fast"?"快速省成本":"智能推荐"}</span><span>提示词已内置</span><span>可用于自动化</span></div></div><button onClick={()=>remove(record)}><Trash2/></button></article>)}</div>}
    {dialog&&<ModalPortal><div className="record-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDialog(false);}}><div className="private-modal wide"><header><div><h3>创建 AI 专家</h3><p>选择角色后，专家指令会自动填好</p></div><button onClick={()=>setDialog(false)}><X/></button></header><div className="expert-role-picker">{(Object.entries(roles) as Array<[keyof typeof roles, typeof roles[keyof typeof roles]]>).map(([key,item])=><button className={role===key?"active":""} key={key} onClick={()=>chooseRole(key)}><Bot/><strong>{item.name}</strong><small>{item.desc}</small></button>)}</div><div className="builder-body"><div className="field-pair"><label>专家名称<input value={name} onChange={event=>setName(event.target.value)} placeholder="客户可见名称"/></label><label>智能程度<select value={modelTier} onChange={event=>setModelTier(event.target.value)}><option value="smart">智能推荐（默认）</option><option value="quality">高质量</option><option value="fast">快速省成本</option></select></label></div><label>业务背景<textarea value={business} onChange={event=>setBusiness(event.target.value)} placeholder="产品、价格、客户类型、服务范围、不可承诺的内容…"/></label><label>专家指令<textarea className="expert-prompt" value={prompt} onChange={event=>setPrompt(event.target.value)}/></label><div className="expert-boundary"><ShieldCheck/><span><strong>自动化边界</strong><small>专家会按联系人范围、每日上限和人工审核设置工作，不会自行扩大触达对象。</small></span></div></div><div className="modal-actions"><button onClick={()=>setDialog(false)}>取消</button><button className="primary-action" disabled={saving} onClick={save}>{saving?"保存中…":"保存并启用"}</button></div></div></div></ModalPortal>}
  </div>;
}
