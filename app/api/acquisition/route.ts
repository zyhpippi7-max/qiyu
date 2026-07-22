import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

async function ensureSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS acquisition_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,platform TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',source_type TEXT NOT NULL DEFAULT 'keyword_search',target TEXT NOT NULL DEFAULT '',keywords TEXT NOT NULL DEFAULT '[]',exclude_keywords TEXT NOT NULL DEFAULT '[]',settings TEXT NOT NULL DEFAULT '{}',device_id TEXT,last_run_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS acquisition_leads (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,task_id INTEGER,platform TEXT NOT NULL,nickname TEXT NOT NULL,platform_id TEXT NOT NULL DEFAULT '',profile_url TEXT NOT NULL DEFAULT '',source_url TEXT NOT NULL DEFAULT '',source_text TEXT NOT NULL DEFAULT '',matched_keywords TEXT NOT NULL DEFAULT '[]',score INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'new',notes TEXT NOT NULL DEFAULT '',converted_contact_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS acquisition_tasks_workspace_status_idx ON acquisition_tasks(workspace_id,status)`,
    `CREATE INDEX IF NOT EXISTS acquisition_leads_workspace_status_idx ON acquisition_leads(workspace_id,status)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS acquisition_leads_workspace_dedupe_idx ON acquisition_leads(workspace_id,platform,nickname,platform_id,profile_url)`,
  ];
  await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
}
function parsed(value: unknown, fallback: unknown) { try { return typeof value === "string" ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } }
function fail(error: unknown, status=400) { return Response.json({error:error instanceof Error?error.message:String(error)},{status}); }

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const [tasks,leads,jobs] = await Promise.all([
      env.DB.prepare(`SELECT id,name,platform,status,source_type AS sourceType,target,keywords,exclude_keywords AS excludeKeywords,settings,device_id AS deviceId,last_run_at AS lastRunAt,created_at AS createdAt,updated_at AS updatedAt FROM acquisition_tasks WHERE workspace_id=? ORDER BY id DESC`).bind(user.workspaceId).all(),
      env.DB.prepare(`SELECT l.id,l.task_id AS taskId,l.platform,l.nickname,l.platform_id AS platformId,l.profile_url AS profileUrl,l.source_url AS sourceUrl,l.source_text AS sourceText,l.matched_keywords AS matchedKeywords,l.score,l.status,l.notes,l.converted_contact_id AS convertedContactId,l.created_at AS createdAt,t.name AS taskName FROM acquisition_leads l LEFT JOIN acquisition_tasks t ON t.id=l.task_id AND t.workspace_id=? WHERE l.workspace_id=? ORDER BY l.id DESC LIMIT 500`).bind(user.workspaceId, user.workspaceId).all(),
      env.DB.prepare(`SELECT id,device_id AS deviceId,type,payload,status,progress,result,error,created_at AS createdAt,updated_at AS updatedAt
        FROM automation_jobs WHERE workspace_id=? AND type='acquisition_search' ORDER BY id DESC LIMIT 100`).bind(user.workspaceId).all(),
    ]);
    return Response.json({
      tasks:tasks.results.map(row=>({...row,keywords:parsed(row.keywords,[]),excludeKeywords:parsed(row.excludeKeywords,[]),settings:parsed(row.settings,{})})),
      leads:leads.results.map(row=>({...row,matchedKeywords:parsed(row.matchedKeywords,[])})),
      jobs:jobs.results.map(row=>({...row,payload:parsed(row.payload,{}),result:parsed(row.result,{})})),
    });
  } catch(error){return fail(error,500);}
}

export async function POST(request:Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema(); const body=await request.json() as Record<string,unknown>; const action=String(body.action||"");
    if(action==="task_save"){
      const name=String(body.name||"").trim(),target=String(body.target||"").trim(); if(!name||!target)return fail("任务名称和流量池来源不能为空");
      const deviceId=String(body.deviceId||"").trim();
      if(deviceId && !await env.DB.prepare("SELECT device_id FROM automation_devices WHERE device_id=? AND workspace_id=?").bind(deviceId,user.workspaceId).first()) return fail("设备不存在或不属于当前工作空间",404);
      const id=Number(body.id||0), keywords=JSON.stringify(body.keywords||[]), excludes=JSON.stringify(body.excludeKeywords||[]), settings=JSON.stringify(body.settings||{}); let row;
      if(id) row=await env.DB.prepare(`UPDATE acquisition_tasks SET name=?,platform=?,source_type=?,target=?,keywords=?,exclude_keywords=?,settings=?,device_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? RETURNING id`).bind(name,String(body.platform||"douyin"),String(body.sourceType||"keyword_search"),target,keywords,excludes,settings,deviceId||null,id,user.workspaceId).first();
      else row=await env.DB.prepare(`INSERT INTO acquisition_tasks(workspace_id,name,platform,source_type,target,keywords,exclude_keywords,settings,device_id) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id`).bind(user.workspaceId,name,String(body.platform||"douyin"),String(body.sourceType||"keyword_search"),target,keywords,excludes,settings,deviceId||null).first();
      if(!row)return fail("任务不存在",404);
      return Response.json({task:row});
    }
    if(action==="task_delete"){const row=await env.DB.prepare("DELETE FROM acquisition_tasks WHERE id=? AND workspace_id=? RETURNING id").bind(body.id,user.workspaceId).first();if(!row)return fail("任务不存在",404);return Response.json({ok:true});}
    if(action==="task_toggle"){const row=await env.DB.prepare("UPDATE acquisition_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? RETURNING id").bind(body.status,body.id,user.workspaceId).first();if(!row)return fail("任务不存在",404);return Response.json({ok:true});}
    if(action==="task_start"){
      const task=await env.DB.prepare(`SELECT id,platform,source_type AS sourceType,target,keywords,exclude_keywords AS excludeKeywords,settings,device_id AS deviceId
        FROM acquisition_tasks WHERE id=? AND workspace_id=?`).bind(body.id,user.workspaceId).first<{id:number;platform:string;sourceType:string;target:string;keywords:string;excludeKeywords:string;settings:string;deviceId?:string}>();
      if(!task)return fail("任务不存在",404);
      const deviceId=String(body.deviceId||task.deviceId||"").trim();if(!deviceId)return fail("请选择已配对的电脑助手");
      if(!await env.DB.prepare("SELECT device_id FROM automation_devices WHERE device_id=? AND workspace_id=?").bind(deviceId,user.workspaceId).first()) return fail("设备不存在或不属于当前工作空间",404);
      const payload={taskId:task.id,platform:task.platform,sourceType:task.sourceType,target:task.target,keywords:parsed(task.keywords,[]),excludeKeywords:parsed(task.excludeKeywords,[]),settings:parsed(task.settings,{})};
      const job=await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?, 'acquisition_search',?,'queued') RETURNING id").bind(user.workspaceId,deviceId,JSON.stringify(payload)).first();
      await env.DB.prepare("UPDATE acquisition_tasks SET status='running',device_id=?,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(deviceId,task.id,user.workspaceId).run();
      return Response.json({job},{status:201});
    }
    /* if(action==="task_start"){
      const task=await env.DB.prepare("SELECT * FROM acquisition_tasks WHERE id=?").bind(body.id).first();if(!task)return fail("任务不存在");
      const payload={taskId:task.id,platform:task.platform,sourceType:task.source_type,target:task.target,keywords:parsed(task.keywords,[]),excludeKeywords:parsed(task.exclude_keywords,[]),settings:parsed(task.settings,{})};
      const job=await env.DB.prepare("INSERT INTO automation_jobs(device_id,type,payload,status) VALUES(?,'acquisition_search',?,'queued') RETURNING id").bind(body.deviceId||task.device_id||null,JSON.stringify(payload)).first();
      await env.DB.prepare("UPDATE acquisition_tasks SET status='running',device_id=?,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.deviceId||task.device_id||null,task.id).run();
      return Response.json({job});
    } */
    if(action==="lead_save"){
      const nickname=String(body.nickname||"").trim();if(!nickname)return fail("请输入潜客昵称");
      const platform=String(body.platform||"douyin"), platformId=String(body.platformId||"").trim(), profileUrl=String(body.profileUrl||"").trim();
      const taskId=Number(body.taskId||0)||null;
      if(taskId && !await env.DB.prepare("SELECT id FROM acquisition_tasks WHERE id=? AND workspace_id=?").bind(taskId,user.workspaceId).first()) return fail("获客任务不存在",404);
      const row=await env.DB.prepare(`INSERT INTO acquisition_leads(workspace_id,task_id,platform,nickname,platform_id,profile_url,source_url,source_text,matched_keywords,score,notes)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,platform,nickname,platform_id,profile_url) DO UPDATE SET task_id=excluded.task_id,source_url=excluded.source_url,source_text=excluded.source_text,matched_keywords=excluded.matched_keywords,score=excluded.score,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP RETURNING id`)
        .bind(user.workspaceId,taskId,platform,nickname,platformId,profileUrl,String(body.sourceUrl||""),String(body.sourceText||""),JSON.stringify(body.matchedKeywords||[]),Math.max(0,Math.min(100,Number(body.score||0))),String(body.notes||"")).first();
      return Response.json({lead:row});
    }
    if(action==="lead_import"){
      const rows=Array.isArray(body.rows)?body.rows as Record<string,unknown>[]:[]; if(!rows.length)return fail("没有可导入的潜客"); let imported=0;
      const taskId=Number(body.taskId||0)||null;
      if(taskId && !await env.DB.prepare("SELECT id FROM acquisition_tasks WHERE id=? AND workspace_id=?").bind(taskId,user.workspaceId).first()) return fail("获客任务不存在",404);
      for(const row of rows.slice(0,500)){const nickname=String(row.nickname||"").trim();if(!nickname)continue;const platform=String(row.platform||body.platform||"douyin"),platformId=String(row.platformId||""),profileUrl=String(row.profileUrl||"");await env.DB.prepare(`INSERT OR IGNORE INTO acquisition_leads(workspace_id,task_id,platform,nickname,platform_id,profile_url,source_url,source_text,matched_keywords,score,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(user.workspaceId,taskId,platform,nickname,platformId,profileUrl,String(row.sourceUrl||""),String(row.sourceText||""),JSON.stringify(row.matchedKeywords||[]),Number(row.score||0),String(row.notes||"")).run();imported++;}
      return Response.json({ok:true,imported});
    }
    if(action==="lead_status"){const row=await env.DB.prepare("UPDATE acquisition_leads SET status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? RETURNING id").bind(body.status,String(body.notes||""),body.id,user.workspaceId).first();if(!row)return fail("潜客不存在",404);return Response.json({ok:true});}
    if(action==="lead_delete"){const row=await env.DB.prepare("DELETE FROM acquisition_leads WHERE id=? AND workspace_id=? RETURNING id").bind(body.id,user.workspaceId).first();if(!row)return fail("潜客不存在",404);return Response.json({ok:true});}
    if(action==="lead_convert"){
      const lead=await env.DB.prepare("SELECT * FROM acquisition_leads WHERE id=? AND workspace_id=?").bind(body.id,user.workspaceId).first();if(!lead)return fail("潜客不存在");
      const contact=await env.DB.prepare("INSERT INTO private_contacts(workspace_id,name,remark,source,status) VALUES(?,?,?, 'acquisition','active') RETURNING id").bind(user.workspaceId,lead.nickname,`${lead.platform}潜客${lead.platform_id?` · ${lead.platform_id}`:""}`).first<{id:number}>();
      await env.DB.prepare("UPDATE acquisition_leads SET status='converted',converted_contact_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(contact!.id,lead.id,user.workspaceId).run();return Response.json({ok:true,contactId:contact!.id});
    }
    return fail("未知操作");
  } catch(error){return fail(error,500);}
}
