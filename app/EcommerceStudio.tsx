"use client";

import {
  CheckCircle2,
  ChevronRight,
  Download,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ProductRecord = {
  id: number;
  module: string;
  title: string;
  description: string;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type Props = { notify: (message: string) => void };

const modes = [
  { key: "white_bg", name: "白底图", tip: "平台标准商品图" },
  { key: "theme", name: "主图设计", tip: "主题与视觉氛围" },
  { key: "selling_point", name: "卖点图", tip: "商品与核心卖点" },
  { key: "size_chart", name: "尺寸图", tip: "尺寸标注与参数" },
  { key: "detail", name: "细节图", tip: "材质与工艺特写" },
  { key: "scene_custom", name: "场景定制", tip: "自定义使用场景" },
  { key: "usage_scene", name: "使用场景", tip: "真实人物与环境" },
  { key: "poster", name: "营销海报", tip: "活动视觉与文案" },
  { key: "scene_swap", name: "场景转换", tip: "保留商品换背景" },
  { key: "detail_page", name: "一键详情页", tip: "三屏长图自动合成" },
] as const;

const styles = ["简约", "高级感", "清新", "国潮", "科技感", "温馨", "欧美", "小红书风"];

const ratios = [
  { value: "1:1", name: "方形主图", width: 1, height: 1, apiSize: "1024x1024" },
  { value: "3:4", name: "电商竖图", width: 3, height: 4, apiSize: "1024x1536" },
  { value: "4:3", name: "商品横图", width: 4, height: 3, apiSize: "1536x1024" },
  { value: "4:5", name: "社媒竖图", width: 4, height: 5, apiSize: "1024x1536" },
  { value: "9:16", name: "手机长图", width: 9, height: 16, apiSize: "1024x1536" },
  { value: "16:9", name: "横版海报", width: 16, height: 9, apiSize: "1536x1024" },
] as const;

type Ratio = typeof ratios[number];
type GeneratedImage = { b64_json?: string; url?: string };

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取商品图失败"));
    reader.readAsDataURL(file);
  });
}

function extractChatText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(item => {
    if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text || "");
    return "";
  }).join("");
  return "";
}

function extractImages(payload: unknown): GeneratedImage[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  const candidates = [body.data, body.images, (body.data as Record<string, unknown> | undefined)?.images];
  for (const value of candidates) {
    if (!Array.isArray(value)) continue;
    const images = value.map(item => {
      if (typeof item === "string") return item.startsWith("http") ? { url: item } : { b64_json: item.replace(/^data:image\/[^;]+;base64,/, "") };
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const url = typeof row.url === "string" ? row.url : typeof row.image_url === "string" ? row.image_url : "";
      const b64 = typeof row.b64_json === "string" ? row.b64_json : typeof row.image_base64 === "string" ? row.image_base64 : "";
      return url || b64 ? { ...(url ? { url } : {}), ...(b64 ? { b64_json: b64.replace(/^data:image\/[^;]+;base64,/, "") } : {}) } : null;
    }).filter(Boolean) as GeneratedImage[];
    if (images.length) return images;
  }
  return [];
}

async function cropToRatio(blob: Blob, ratio: Ratio) {
  const bitmap = await createImageBitmap(blob);
  const target = ratio.width / ratio.height;
  const source = bitmap.width / bitmap.height;
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (source > target) { sw = bitmap.height * target; sx = (bitmap.width - sw) / 2; }
  if (source < target) { sh = bitmap.width / target; sy = (bitmap.height - sh) / 2; }
  const canvas = document.createElement("canvas");
  const longEdge = 1536;
  if (target >= 1) { canvas.width = longEdge; canvas.height = Math.round(longEdge / target); }
  else { canvas.height = longEdge; canvas.width = Math.round(longEdge * target); }
  canvas.getContext("2d")?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("图片处理失败")), "image/png", .96));
}

async function imageResultToBlob(image: GeneratedImage, ratio: Ratio) {
  const source = image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url;
  if (!source) throw new Error("模型没有返回图片数据");
  const response = await fetch(source);
  if (!response.ok) throw new Error("读取生成图片失败");
  return cropToRatio(await response.blob(), ratio);
}

async function composeDetailPage(blobs: Blob[]) {
  const bitmaps = await Promise.all(blobs.map(blob => createImageBitmap(blob)));
  const width = 1080;
  const heights = bitmaps.map(bitmap => Math.round(bitmap.height * width / bitmap.width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = heights.reduce((sum, value) => sum + value, 0);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("详情页合成失败");
  let y = 0;
  bitmaps.forEach((bitmap, index) => { context.drawImage(bitmap, 0, y, width, heights[index]); y += heights[index]; bitmap.close(); });
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("详情页合成失败")), "image/png", .95));
}

function buildPrompt(mode: string, subject: string, style: string, extra: string, sellingPoints: string) {
  const points = sellingPoints.split("\n").map(item => item.trim()).filter(Boolean).join("、");
  const base = `以用户上传的商品参考图为唯一商品依据，准确保留商品外形、颜色、材质、结构、商标与关键细节，不得替换或重新设计商品。商品主题：${subject || "根据参考图识别"}。视觉风格：${style}。${extra ? `补充要求：${extra}。` : ""}`;
  const instructions: Record<string, string> = {
    white_bg: "生成专业电商白底主图，纯白背景，商品居中，柔和棚拍光，边缘干净，带自然接触阴影，不添加无关物体和文字。",
    theme: "生成高完成度电商主图，围绕商品主题设计背景、道具、光线与层次，商品必须是第一视觉焦点，预留标题安全区。",
    selling_point: `生成商品卖点信息图，画面包含清晰商品主体、简洁图标和层级明确的中文卖点文案。核心卖点：${points || "根据商品视觉特征提炼三个卖点"}。文字必须可读。`,
    size_chart: `生成商品尺寸参数图，使用清晰标注线、箭头和中文参数区域。已知信息：${points || extra || "未提供具体数值时保留可编辑参数位，不编造数值"}。`,
    detail: "生成商品材质与工艺细节特写，使用微距镜头表现纹理、接口、做工和质感，可用三宫格或局部放大框。",
    scene_custom: `把商品自然放入用户描述的定制场景，光线、透视和接触阴影真实统一。场景要求：${extra || "高级生活方式场景"}。`,
    usage_scene: "生成真实使用场景，展示目标用户正在自然使用该商品，动作合理，商品大小与人体比例准确，适合电商种草内容。",
    poster: `生成商业营销海报，商品主体突出，具有活动氛围、标题区和行动引导区。需要表达：${points || extra || "新品推荐"}。中文排版清晰。`,
    scene_swap: `仅替换商品背景，商品本身保持与参考图一致。新背景：${extra || "高级简约商业摄影棚"}，匹配原商品透视、光向与阴影。`,
    detail_page: `生成电商详情页竖版分屏，商品一致、视觉统一、信息层级清楚。卖点：${points || "根据商品识别"}。`,
  };
  return `${base}\n${instructions[mode] || instructions.theme}\n输出成品图，不要解释。`;
}

export function EcommerceStudio({ notify }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeMode, setActiveMode] = useState<(typeof modes)[number]["key"]>("white_bg");
  const [referencePreview, setReferencePreview] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [subject, setSubject] = useState("");
  const [style, setStyle] = useState("高级感");
  const [extra, setExtra] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [ratioValue, setRatioValue] = useState<Ratio["value"]>("1:1");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedMode = modes.find(item => item.key === activeMode) || modes[0];
  const selectedRatio = ratios.find(item => item.value === ratioValue) || ratios[0];

  const loadRecords = async () => {
    try {
      const response = await fetch("/api/records?module=ecommerce", { cache: "no-store" });
      const data = await response.json() as { records?: ProductRecord[] };
      if (response.ok) setRecords(data.records || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, []);
  useEffect(() => { if (activeMode === "detail_page") setRatioValue("9:16"); }, [activeMode]);

  const steps = useMemo(() => [
    { label: "上传商品图", done: Boolean(referencePreview) },
    { label: "配置生成内容", done: Boolean(subject.trim() || extra.trim() || sellingPoints.trim()) },
    { label: "生成并下载", done: records.length > 0 },
  ], [referencePreview, subject, extra, sellingPoints, records.length]);

  const acceptFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("请上传 JPG、PNG 或 WebP 商品图片。"); return; }
    if (file.size > 8 * 1024 * 1024) { notify("商品图不能超过 8MB。"); return; }
    setUploading(true);
    try {
      const preview = await fileToDataUrl(file);
      setReferencePreview(preview); setReferenceName(file.name); setReferenceUrl("");
      const form = new FormData();
      form.append("file", file); form.append("module", "ecommerce-reference"); form.append("title", file.name);
      form.append("metadata", JSON.stringify({ category: "AI参考图" }));
      const response = await fetch("/api/media", { method: "POST", body: form });
      const data = await response.json() as { record?: ProductRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "商品图上传失败");
      setReferenceUrl(data.record.metadata.url || "");
      notify("商品图已上传，可以使用 AI 智能填充或直接配置。 ");
    } catch (error) { setReferencePreview(""); notify(error instanceof Error ? error.message : "商品图上传失败"); }
    finally { setUploading(false); }
  };

  const analyze = async () => {
    if (!referencePreview) { notify("请先上传商品图。"); return; }
    setAnalyzing(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat", model: "gpt-5.5", temperature: .2, maxTokens: 900,
          messages: [{ role: "user", content: [
            { type: "text", text: "你是资深电商视觉策划。识别这张商品图，只返回JSON，不要Markdown：{\"title\":\"一句话商品主题\",\"style\":\"从简约、高级感、清新、国潮、科技感、温馨、欧美、小红书风中选一个\",\"prompt\":\"适合电商生图的中文补充描述\",\"selling_points\":[\"卖点1\",\"卖点2\",\"卖点3\"]}。不得臆造无法从图片判断的规格参数。" },
            { type: "image_url", image_url: { url: referencePreview } },
          ] }],
        }),
      });
      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(data.error || "商品识别失败");
      const text = extractChatText(data);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("视觉模型没有返回可用的商品信息");
      const parsed = JSON.parse(match[0]) as { title?: string; style?: string; prompt?: string; selling_points?: string[] };
      setSubject(parsed.title || subject);
      if (parsed.style && styles.includes(parsed.style)) setStyle(parsed.style);
      setExtra(parsed.prompt || extra);
      setSellingPoints(Array.isArray(parsed.selling_points) ? parsed.selling_points.join("\n") : sellingPoints);
      notify("AI 已识别商品并填好内容，你可以修改后再生成。 ");
    } catch (error) { notify(error instanceof Error ? error.message : "商品识别失败"); }
    finally { setAnalyzing(false); }
  };

  const requestImage = async (prompt: string, ratio: Ratio) => {
    const response = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "image", model: "gpt-image-2", prompt: `${prompt}\n按 ${ratio.value} 画幅构图，主体保留安全边距。`, size: ratio.apiSize, quality, n: 1, image: referencePreview }),
    });
    const data = await response.json() as Record<string, unknown> & { error?: string };
    if (!response.ok) throw new Error(data.error || "图片生成失败");
    const image = extractImages(data)[0];
    if (!image) throw new Error("模型已响应，但没有返回可保存的图片");
    return imageResultToBlob(image, ratio);
  };

  const saveOutput = async (blob: Blob, prompt: string, segmentCount = 1) => {
    const title = subject.trim() || `${selectedMode.name}作品`;
    const form = new FormData();
    form.append("file", new File([blob], `qiyu-${activeMode}-${Date.now()}.png`, { type: "image/png" }));
    form.append("module", "ecommerce"); form.append("title", title.slice(0, 42)); form.append("description", prompt);
    form.append("metadata", JSON.stringify({ model: "gpt-image-2", mode: activeMode, modeName: selectedMode.name, aspectRatio: activeMode === "detail_page" ? "详情长图" : selectedRatio.value, quality, referenceUrl, referenceName, segmentCount: String(segmentCount) }));
    const response = await fetch("/api/media", { method: "POST", body: form });
    const data = await response.json() as { record?: ProductRecord; error?: string };
    if (!response.ok || !data.record) throw new Error(data.error || "保存作品失败");
    return data.record;
  };

  const generate = async () => {
    if (!referencePreview) { notify("请先上传商品图，系统需要用它保持商品一致。 "); return; }
    if (activeMode === "size_chart" && !sellingPoints.trim() && !extra.trim()) { notify("尺寸图需要先填写真实尺寸或参数，系统不会替你编造。 "); return; }
    if (activeMode === "detail_page" && !window.confirm("一键详情页会连续生成 3 张分屏并合成长图，将产生 3 次生图费用。确定继续吗？")) return;
    setGenerating(true); setProgress("正在提交生成任务…");
    const prompt = buildPrompt(activeMode, subject.trim(), style, extra.trim(), sellingPoints.trim());
    try {
      let output: Blob;
      let count = 1;
      if (activeMode === "detail_page") {
        count = 3;
        const segmentRatio = ratios.find(item => item.value === "9:16") || ratios[4];
        const segmentPrompts = [
          `${prompt}\n这是详情页第1屏：品牌氛围、商品主视觉、核心利益点和三个卖点图标，构图有强吸引力。`,
          `${prompt}\n这是详情页第2屏：购买理由、材质工艺、细节放大、优势对比，信息丰富但排版清楚。`,
          `${prompt}\n这是详情页第3屏：真实使用场景、适用人群、使用步骤、服务保障和行动引导，形成自然收尾。`,
        ];
        const parts: Blob[] = [];
        for (let index = 0; index < segmentPrompts.length; index += 1) {
          setProgress(`正在生成详情页第 ${index + 1}/3 屏…`);
          parts.push(await requestImage(segmentPrompts[index], segmentRatio));
        }
        setProgress("正在合成详情长图…");
        output = await composeDetailPage(parts);
      } else {
        output = await requestImage(prompt, selectedRatio);
      }
      setProgress("正在保存到作品库…");
      const record = await saveOutput(output, prompt, count);
      setRecords(current => [record, ...current]);
      notify(`${selectedMode.name}已生成并保存，可以直接预览或下载。`);
    } catch (error) { notify(error instanceof Error ? error.message : "图片生成失败"); }
    finally { setGenerating(false); setProgress(""); }
  };

  const remove = async (record: ProductRecord) => {
    if (!window.confirm(`确定删除“${record.title}”吗？`)) return;
    const response = await fetch("/api/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id, module: "ecommerce", key: record.metadata.objectKey }) });
    if (response.ok) setRecords(current => current.filter(item => item.id !== record.id));
    else notify("删除失败，请稍后重试。 ");
  };

  return <div className="module-page ecommerce-studio">
    <div className="module-header"><div><span>E-COMMERCE STUDIO</span><h2>电商生图中心</h2><p>上传真实商品图，配置任务后直接生成可下载的电商成品。</p></div><button className="primary-action" onClick={() => inputRef.current?.click()}><Upload size={17}/>上传商品图</button></div>
    <div className="ecommerce-mode-tabs">{modes.map(mode => <button key={mode.key} className={activeMode === mode.key ? "active" : ""} onClick={() => setActiveMode(mode.key)}><strong>{mode.name}</strong><small>{mode.tip}</small></button>)}</div>
    <div className="ecommerce-progress">{steps.map((step, index) => <div className={step.done ? "done" : index === (referencePreview ? 1 : 0) ? "active" : ""} key={step.label}><i>{step.done ? <CheckCircle2 size={16}/> : index + 1}</i><span>{step.label}</span>{index < 2 && <ChevronRight size={15}/>}</div>)}</div>
    <div className="ecommerce-workflow">
      <section className="ecommerce-step panel"><header><i>1</i><div><h3>上传商品素材</h3><p>必填，系统会尽量保持商品本身不变</p></div></header><input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { acceptFile(event.target.files?.[0]); event.target.value = ""; }}/>
        <button className={`product-dropzone ${referencePreview ? "has-image" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); acceptFile(event.dataTransfer.files?.[0]); }}>{referencePreview ? <><img src={referencePreview} alt="商品参考图"/><span className="replace-image"><Upload size={15}/>更换商品图</span></> : <><span><Upload size={27}/></span><strong>点击或拖入商品图</strong><small>JPG / PNG / WebP，最大 8MB</small></>}{uploading && <em><RefreshCw className="spin" size={18}/>正在上传…</em>}</button>
        {referencePreview && <div className="reference-file"><CheckCircle2 size={16}/><span><strong>{referenceName}</strong><small>{referenceUrl ? "已安全保存，可用于生成" : "正在保存到素材库"}</small></span><button onClick={() => { setReferencePreview(""); setReferenceUrl(""); setReferenceName(""); }}><XCircle size={17}/></button></div>}
      </section>
      <section className="ecommerce-step panel"><header><i>2</i><div><h3>配置生成内容</h3><p>可以让 AI 识别后再手动修改</p></div><button className="smart-fill" disabled={!referencePreview || analyzing} onClick={analyze}><WandSparkles size={15}/>{analyzing ? "识别中…" : "AI 智能填充"}</button></header>
        <label>商品主题<input value={subject} onChange={event => setSubject(event.target.value)} placeholder="例如：轻量降噪蓝牙耳机"/></label>
        <label>视觉风格<div className="style-options">{styles.map(item => <button type="button" className={style === item ? "active" : ""} key={item} onClick={() => setStyle(item)}>{item}</button>)}</div></label>
        <label>场景或补充要求<textarea value={extra} onChange={event => setExtra(event.target.value)} placeholder={activeMode === "scene_swap" ? "例如：雨后城市夜景，霓虹倒影，冷蓝色电影光" : "可描述场景、构图、色彩、需要出现的中文文案等"}/></label>
        <label>{activeMode === "size_chart" ? "真实尺寸 / 参数（每行一项）" : "商品卖点（每行一项）"}<textarea value={sellingPoints} onChange={event => setSellingPoints(event.target.value)} placeholder={activeMode === "size_chart" ? "高度：18cm\n宽度：7.5cm\n容量：500ml" : "轻量佩戴\n主动降噪\n长续航"}/></label>
      </section>
      <section className="ecommerce-step panel"><header><i>3</i><div><h3>选择生成规格</h3><p>{activeMode === "detail_page" ? "将生成 3 屏并自动合成长图" : "选择用途比例和输出质量"}</p></div></header>
        <div className="spec-title"><strong>画面比例</strong><small>使用比例表达，不显示复杂像素</small></div><div className="ecommerce-ratios">{ratios.map(item => <button disabled={activeMode === "detail_page" && item.value !== "9:16"} className={ratioValue === item.value ? "active" : ""} key={item.value} onClick={() => setRatioValue(item.value)}><i><span style={{ aspectRatio: `${item.width}/${item.height}` }}/></i><strong>{item.value}</strong><small>{item.name}</small></button>)}</div>
        <div className="spec-title"><strong>输出质量</strong><small>质量越高，生成时间与费用通常越高</small></div><div className="quality-options">{([['low','快速'],['medium','标准'],['high','高清']] as const).map(item => <button className={quality === item[0] ? "active" : ""} onClick={() => setQuality(item[0])} key={item[0]}>{item[1]}{item[0] === "medium" && <small>推荐</small>}</button>)}</div>
        <button className="ecommerce-generate" disabled={generating || uploading || !referencePreview} onClick={generate}>{generating ? <><RefreshCw className="spin" size={19}/>{progress || "正在生成…"}</> : <><Sparkles size={19}/>生成{selectedMode.name}</>}</button><div className="ecommerce-safety"><ShieldCheck size={15}/><span>密钥只保存在服务器；生成结果会自动进入作品库。</span></div>
      </section>
    </div>
    <section className="ecommerce-results panel"><div className="panel-heading"><div><h3>电商作品</h3><p>{records.length ? `共 ${records.length} 个真实生成结果` : "生成结果会显示在这里"}</p></div><button className="outline-action" onClick={loadRecords}><RefreshCw size={15}/>刷新</button></div>{loading ? <div className="records-empty"><RefreshCw className="spin" size={26}/><strong>正在读取作品</strong></div> : records.length === 0 ? <div className="records-empty"><ImageIcon size={38}/><strong>还没有电商作品</strong><p>上传商品图并完成上面的三步，即可生成第一张。</p></div> : <div className="ecommerce-result-grid">{records.map(record => <article key={record.id}><a href={record.metadata.url} target="_blank" rel="noreferrer"><img src={record.metadata.url} alt={record.title}/><span>预览大图</span></a><div><span><strong>{record.title}</strong><small>{record.metadata.modeName || "电商生图"} · {record.metadata.aspectRatio || "1:1"} · {record.metadata.quality || "medium"}</small></span><a href={record.metadata.url} download title="下载"><Download size={17}/></a><button onClick={() => remove(record)} title="删除"><Trash2 size={17}/></button></div></article>)}</div>}</section>
  </div>;
}
