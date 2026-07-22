#!/usr/bin/env python3
"""奇遇AI电脑助手：安全、可审计的本地任务执行器。"""

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

VERSION = "0.1.0"
HOME = Path.home() / ".qiyu-ai-agent"
CONFIG_FILE = HOME / "config.json"
LOG_FILE = HOME / "agent.log"


def log(message):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {message}"
    print(line, flush=True)
    HOME.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def load_config(server, name):
    HOME.mkdir(parents=True, exist_ok=True)
    data = {}
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    data.setdefault("deviceId", str(uuid.uuid5(uuid.NAMESPACE_DNS, f"qiyu-{socket.gethostname()}-{uuid.getnode()}")))
    data["server"] = server.rstrip("/")
    data["name"] = name or data.get("name") or socket.gethostname()
    CONFIG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def request(config, method="GET", query=None, body=None, authenticated=False):
    url = config["server"] + "/api/automation"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    headers = {"Content-Type": "application/json", "User-Agent": f"QiyuAgent/{VERSION}"}
    if authenticated and config.get("token"):
        headers["Authorization"] = "Bearer " + config["token"]
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def run(command, timeout=15):
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    return result.returncode, (result.stdout or result.stderr).strip()


def wechat_running():
    system = platform.system()
    if system == "Darwin":
        code, output = run(["pgrep", "-ifl", "WeChat|微信"])
        return code == 0, output
    if system == "Windows":
        code, output = run(["tasklist", "/FI", "IMAGENAME eq WeChat.exe"])
        return code == 0 and "WeChat.exe" in output, output
    code, output = run(["pgrep", "-ifl", "wechat|weixin"])
    return code == 0, output


def open_wechat():
    system = platform.system()
    if system == "Darwin":
        for app in ("WeChat", "微信"):
            code, output = run(["open", "-a", app])
            if code == 0:
                return {"opened": True, "application": app}
        raise RuntimeError("没有找到微信应用，请先安装并登录微信桌面版")
    if system == "Windows":
        code, output = run(["cmd", "/c", "start", "", "WeChat.exe"])
        if code == 0:
            return {"opened": True, "application": "WeChat.exe"}
        raise RuntimeError(output or "没有找到微信应用")
    raise RuntimeError("当前 Linux 版本暂不支持打开微信")


def mac_wechat_draft(contact, message):
    if not contact or not message:
        raise RuntimeError("联系人和消息内容不能为空")
    script = r'''
on run argv
  set targetName to item 1 of argv
  set draftText to item 2 of argv
  tell application "WeChat" to activate
  delay 1
  tell application "System Events"
    keystroke "f" using command down
    delay 0.5
    set the clipboard to targetName
    keystroke "v" using command down
    delay 1
    key code 36
    delay 1
    set the clipboard to draftText
    keystroke "v" using command down
  end tell
end run
'''
    code, output = run(["osascript", "-e", script, contact, message], timeout=25)
    if code != 0:
        if "not allowed assistive access" in output.lower() or "辅助" in output:
            raise RuntimeError("需要在“系统设置 → 隐私与安全性 → 辅助功能”中允许终端或奇遇AI控制电脑")
        raise RuntimeError(output or "微信草稿填写失败")
    return {"drafted": True, "contact": contact, "sent": False, "notice": "消息只填入输入框，没有发送"}


def mac_wechat_send(contact, message):
    result = mac_wechat_draft(contact, message)
    code, output = run(["osascript", "-e", 'tell application "System Events" to key code 36'], timeout=10)
    if code != 0:
        raise RuntimeError(output or "点击发送失败")
    result.update({"sent": True, "notice": "消息已按已审核任务发送"})
    return result


def execute(job):
    kind = job.get("type")
    payload = job.get("payload") or {}
    if kind == "system_test":
        if platform.system() == "Darwin":
            run(["osascript", "-e", 'display notification "电脑助手已成功收到网站任务" with title "奇遇AI"'])
        return {"message": "电脑助手连接正常", "hostname": socket.gethostname(), "platform": platform.platform()}
    if kind == "wechat_probe":
        running, details = wechat_running()
        return {"installedOrRunning": running, "running": running, "details": details[:500]}
    if kind == "wechat_open":
        return open_wechat()
    if kind == "wechat_draft":
        if payload.get("send"):
            raise RuntimeError("当前安全版本禁止自动发送；请在微信中人工确认后发送")
        open_wechat()
        if platform.system() != "Darwin":
            raise RuntimeError("微信草稿填写首版仅支持当前 Mac，Windows 插件稍后接入")
        return mac_wechat_draft(str(payload.get("contact", "")), str(payload.get("message", "")))
    if kind == "wechat_send":
        if not payload.get("sendApproved"):
            raise RuntimeError("缺少人工发送授权")
        open_wechat()
        if platform.system() != "Darwin":
            raise RuntimeError("微信自动发送首版仅支持当前 Mac")
        return mac_wechat_send(str(payload.get("contact", "")), str(payload.get("message", "")))
    if kind == "wechat_sop_step":
        action = str(payload.get("action", "message"))
        if action == "wait":
            return {"notice": "等待步骤已完成"}
        if action == "moments_publish":
            raise RuntimeError("当前 Mac 朋友圈发布控件尚未适配；方案已保留，请使用 Windows 微信执行端")
        contact, content = str(payload.get("contact", "")), str(payload.get("content", ""))
        open_wechat()
        if platform.system() != "Darwin":
            raise RuntimeError("微信SOP首版仅支持当前 Mac")
        if payload.get("approval", True):
            return mac_wechat_draft(contact, content)
        return mac_wechat_send(contact, content)
    if kind == "platform_open_login":
        urls = {
            "douyin": "https://creator.douyin.com/",
            "xiaohongshu": "https://creator.xiaohongshu.com/",
            "kuaishou": "https://cp.kuaishou.com/",
            "shipinhao": "https://channels.weixin.qq.com/platform/",
        }
        target = urls.get(str(payload.get("platform", "")))
        if not target:
            raise RuntimeError("暂不支持该平台")
        if platform.system() == "Darwin":
            run(["open", target])
        elif platform.system() == "Windows":
            run(["cmd", "/c", "start", "", target])
        return {"opened": True, "url": target, "notice": "请在浏览器中扫码登录"}
    if kind == "acquisition_search":
        target_platform = str(payload.get("platform", "douyin"))
        target_value = str(payload.get("target", "")).strip()
        source_type = str(payload.get("sourceType", "keyword_search"))
        if target_value.startswith(("http://", "https://")):
            target = target_value
        else:
            encoded = urllib.parse.quote(target_value)
            urls = {
                "douyin": f"https://www.douyin.com/search/{encoded}?type={'user' if source_type == 'competitor' else 'video'}",
                "xiaohongshu": f"https://www.xiaohongshu.com/search_result?keyword={encoded}",
                "kuaishou": f"https://www.kuaishou.com/search/video?searchKey={encoded}",
            }
            target = urls.get(target_platform, "")
        if not target:
            raise RuntimeError("不支持该平台或搜索目标为空")
        if platform.system() == "Darwin":
            run(["open", target])
        elif platform.system() == "Windows":
            run(["cmd", "/c", "start", "", target])
        else:
            run(["xdg-open", target])
        return {"opened": True, "url": target, "notice": "平台搜索页已打开，请登录后审核公开线索"}
    if kind == "platform_publish":
        raise RuntimeError("发布插件尚未授权：请先完成平台扫码登录与发布前人工确认")
    raise RuntimeError(f"不支持的任务类型：{kind}")


def post(config, body):
    body["deviceId"] = config["deviceId"]
    return request(config, "POST", body=body, authenticated=body.get("action") != "register")


def register(config):
    response = post(config, {
        "action": "register", "name": config["name"], "platform": platform.system(), "version": VERSION,
        "capabilities": ["system_test", "wechat_probe", "wechat_open", "wechat_draft", "wechat_send", "wechat_sop_step", "platform_open_login", "acquisition_search"],
    })
    config["token"] = response["token"]
    CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"设备已注册：{config['name']} ({config['deviceId']})")


def main():
    parser = argparse.ArgumentParser(description="奇遇AI电脑助手")
    parser.add_argument("--server", default="http://localhost:3000", help="奇遇AI网站地址")
    parser.add_argument("--name", default="当前 Mac", help="设备显示名称")
    parser.add_argument("--once", action="store_true", help="只领取一次任务后退出")
    args = parser.parse_args()
    config = load_config(args.server, args.name)
    register(config)
    last_heartbeat = 0
    log("助手已启动，等待网站下发任务（按 Ctrl+C 停止）")
    while True:
        try:
            now = time.time()
            if now - last_heartbeat > 25:
                post(config, {"action": "heartbeat"})
                last_heartbeat = now
            response = request(config, query={"action": "claim", "deviceId": config["deviceId"]}, authenticated=True)
            job = response.get("job")
            if job:
                log(f"领取任务 #{job['id']}：{job['type']}")
                post(config, {"action": "report", "jobId": job["id"], "status": "running", "progress": 10})
                try:
                    result = execute(job)
                    post(config, {"action": "report", "jobId": job["id"], "status": "succeeded", "progress": 100, "result": result})
                    log(f"任务 #{job['id']} 已完成")
                except Exception as error:
                    post(config, {"action": "report", "jobId": job["id"], "status": "failed", "progress": 100, "error": str(error)})
                    log(f"任务 #{job['id']} 失败：{error}")
                if args.once:
                    return
            time.sleep(2)
        except KeyboardInterrupt:
            log("助手已停止")
            return
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            log(f"暂时无法连接网站：{error}，5秒后重试")
            time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"启动失败：{error}")
        sys.exit(1)
