"use client";

import { ArrowDown, ArrowUp, CheckCircle2, Download, Film, Play, Plus, RefreshCw, Scissors, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = { notify: (message: string) => void };
type ProductRecord = { id:number; title:string; description:string; status:string; metadata:Record<string,string>; createdAt:string; updatedAt:string };
type Ratio = "9:16" | "16:9" | "1:1" | "4:3";

const outputSizes: Record<Ratio, { width:number; height:number; name:string }> = {
  "9:16": { width: 720, height: 1280, name: "手机竖屏" },
  "16:9": { width: 1280, height: 720, name: "视频横屏" },
  "1:1": { width: 720, height: 720, name: "方形视频" },
  "4:3": { width: 960, height: 720, name: "标准横版" },
};

function sizeText(size:number) { return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`; }

export function VideoEditor({ notify }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [title, setTitle] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("等待添加素材");
  const [preview, setPreview] = useState("");
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/records?module=video", { cache:"no-store" });
      const data = await response.json() as { records?:ProductRecord[]; error?:string };
      if (!response.ok) throw new Error(data.error || "读取失败");
      setRecords((data.records || []).filter(item => item.metadata.source === "browser-editor"));
    } catch (error) { notify(error instanceof Error ? error.message : "读取失败"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadRecords(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const acceptFiles = (list: FileList | null) => {
    const selected = Array.from(list || []).filter(file => file.type.startsWith("video/"));
    if (!selected.length) { notify("请选择 MP4、MOV、WebM 等视频文件。 "); return; }
    setFiles(current => [...current, ...selected].slice(0, 12));
    setStage("素材已就绪");
    if (!title.trim()) setTitle(selected[0].name.replace(/\.[^.]+$/, "") + " 混剪");
  };
  const move = (index:number, delta:number) => setFiles(current => {
    const next = [...current]; const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const ensureFfmpeg = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;
    setStage("首次加载本地剪辑引擎（约31MB）");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", event => setProgress(Math.min(96, Math.max(1, Math.round(event.progress * 100)))));
    await ffmpeg.load({
      coreURL: new URL("/ffmpeg/ffmpeg-core.esm.js", window.location.origin).toString(),
      wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", window.location.origin).toString(),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const render = async () => {
    if (!files.length) { notify("请先添加至少一个视频片段。 "); return; }
    if (totalSize > 1024 * 1024 * 1024) { notify("单次本地剪辑素材总量不能超过 1GB。 "); return; }
    setProcessing(true); setProgress(1); setOutputBlob(null);
    if (preview) { URL.revokeObjectURL(preview); setPreview(""); }
    const written:string[] = [];
    try {
      const ffmpeg = await ensureFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      const size = outputSizes[ratio];
      const filter = `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
      const parts:string[] = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "mp4";
        const input = `input-${index}.${extension}`; const part = `part-${index}.mp4`;
        written.push(input, part); parts.push(part);
        setStage(`正在处理第 ${index + 1}/${files.length} 个片段`);
        setProgress(Math.round((index / files.length) * 80));
        await ffmpeg.writeFile(input, await fetchFile(file));
        await ffmpeg.exec(["-y", "-i", input, "-vf", filter, "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", part]);
      }
      let outputName = parts[0];
      if (parts.length > 1) {
        outputName = "qiyu-output.mp4"; written.push("concat.txt", outputName);
        await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(parts.map(item => `file '${item}'`).join("\n")));
        setStage("正在按顺序合并并封装成片");
        await ffmpeg.exec(["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", outputName]);
      }
      const output = await ffmpeg.readFile(outputName);
      if (typeof output === "string") throw new Error("剪辑引擎没有返回视频数据");
      const bytes = new Uint8Array(output.byteLength); bytes.set(output);
      const blob = new Blob([bytes], { type:"video/mp4" });
      const url = URL.createObjectURL(blob);
      setOutputBlob(blob); setPreview(url); setProgress(100); setStage("本地剪辑完成，可预览并保存");
      notify("视频已经在当前电脑完成剪辑；确认预览后点击保存到作品库。 ");
    } catch (error) {
      const reason = error instanceof Error ? error.message : typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as {message?:unknown}).message || "未知错误") : JSON.stringify(error) || "未知错误";
      setStage(`剪辑失败：${reason}`);
      notify(`视频剪辑失败：${reason}`);
    } finally {
      const ffmpeg = ffmpegRef.current;
      if (ffmpeg) for (const name of [...new Set(written)]) { try { await ffmpeg.deleteFile(name); } catch {} }
      setProcessing(false);
    }
  };

  const save = async () => {
    if (!outputBlob) return;
    setProcessing(true); setStage("正在保存到作品库");
    try {
      const form = new FormData();
      form.append("file", new File([outputBlob], `qiyu-edit-${Date.now()}.mp4`, { type:"video/mp4" }));
      form.append("module", "video");
      form.append("title", title.trim() || "奇遇AI混剪成片");
      form.append("description", `${files.length} 个片段 · ${ratio} · 浏览器本地剪辑`);
      form.append("metadata", JSON.stringify({ source:"browser-editor", ratio, clips:String(files.length), engine:"ffmpeg.wasm" }));
      const response = await fetch("/api/media", { method:"POST", body:form });
      const data = await response.json() as { record?:ProductRecord; error?:string };
      if (!response.ok || !data.record) throw new Error(data.error || "保存失败");
      setRecords(current => [data.record!, ...current]); setStage("已保存到作品库");
      notify("成片已保存到作品库，可直接预览或下载。 ");
    } catch (error) { notify(error instanceof Error ? error.message : "保存失败"); }
    finally { setProcessing(false); }
  };

  const removeRecord = async (record:ProductRecord) => {
    if (!window.confirm(`删除“${record.title}”？`)) return;
    const response = await fetch("/api/media", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:record.id, module:"video", key:record.metadata.objectKey }) });
    if (response.ok) setRecords(current => current.filter(item => item.id !== record.id));
  };

  return <div className="module-page browser-video-editor">
    <div className="module-header"><div><span>LOCAL VIDEO STUDIO</span><h2>视频剪辑</h2><p>素材在客户电脑本地完成转码与混剪，完成后再保存到奇遇AI作品库。</p></div><button className="primary-action" onClick={() => picker.current?.click()}><Plus size={16}/>添加视频片段</button></div>
    <input ref={picker} hidden type="file" accept="video/*" multiple onChange={event => { acceptFiles(event.target.files); event.target.value=""; }}/>
    <div className="video-editor-layout">
      <section className="panel clip-workbench">
        <header><div><Scissors/><span><h3>片段时间线</h3><p>拖入顺序就是最终播放顺序，最多 12 个片段</p></span></div><button onClick={() => picker.current?.click()}><Upload/>添加片段</button></header>
        {files.length === 0 ? <button className="clip-drop" onClick={() => picker.current?.click()}><Upload/><strong>选择需要混剪的视频</strong><small>支持 MP4、MOV、WebM；全程在本机处理</small></button> : <div className="clip-list">{files.map((file,index)=><article key={`${file.name}-${file.lastModified}-${index}`}><span>{index+1}</span><Film/><div><strong>{file.name}</strong><small>{sizeText(file.size)}</small></div><button disabled={index===0} onClick={()=>move(index,-1)} title="上移"><ArrowUp/></button><button disabled={index===files.length-1} onClick={()=>move(index,1)} title="下移"><ArrowDown/></button><button onClick={()=>setFiles(current=>current.filter((_,fileIndex)=>fileIndex!==index))} title="移除"><X/></button></article>)}</div>}
      </section>
      <aside className="panel export-settings"><header><h3>导出设置</h3><p>选择用户易懂的画面比例</p></header><label>作品名称<input value={title} onChange={event=>setTitle(event.target.value)} placeholder="输入成片名称"/></label><div className="editor-ratios">{(Object.entries(outputSizes) as Array<[Ratio,typeof outputSizes[Ratio]]>).map(([key,value])=><button key={key} className={ratio===key?"active":""} onClick={()=>setRatio(key)}><i style={{aspectRatio:key.replace(":"," / ")}}/><span><strong>{key}</strong><small>{value.name}</small></span></button>)}</div><div className="editor-summary"><span><strong>{files.length}</strong><small>片段</small></span><span><strong>{sizeText(totalSize)}</strong><small>原素材</small></span><span><strong>720P</strong><small>导出</small></span></div><button className="render-video" disabled={processing||!files.length} onClick={render}>{processing?<><RefreshCw className="spin"/>处理中 {progress}%</>:<><Play/>开始本地剪辑</>}</button><div className="editor-stage"><i style={{width:`${progress}%`}}/><span>{stage}</span></div><small className="editor-safe"><ShieldCheck/>不会上传原始素材；只有你确认的成片会保存到云端。</small></aside>
    </div>
    {preview&&<section className="panel editor-preview"><video src={preview} controls/><div><CheckCircle2/><span><h3>成片预览</h3><p>{ratio} · {sizeText(outputBlob?.size||0)} · 本地已完成</p></span><a href={preview} download={`${title||"奇遇AI混剪"}.mp4`}><Download/>下载到电脑</a><button disabled={processing} onClick={save}><Upload/>{processing?"保存中…":"保存到作品库"}</button></div></section>}
    <section className="panel editor-library"><header><div><h3>混剪作品</h3><p>这里仅展示由视频剪辑模块导出的真实成片</p></div><button onClick={loadRecords}><RefreshCw/>刷新</button></header>{loading?<div className="records-empty"><RefreshCw className="spin"/><strong>正在读取作品</strong></div>:records.length===0?<div className="records-empty"><Film/><strong>还没有混剪成片</strong><p>添加片段并完成第一次导出。</p></div>:<div className="editor-records">{records.map(record=><article key={record.id}><video src={record.metadata.url} controls preload="metadata"/><div><strong>{record.title}</strong><small>{record.description}</small><span><a href={record.metadata.url} target="_blank" rel="noreferrer"><Play/>打开</a><a href={record.metadata.url} download><Download/>下载</a><button onClick={()=>removeRecord(record)}><Trash2/>删除</button></span></div></article>)}</div>}</section>
  </div>;
}
