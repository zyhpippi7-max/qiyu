param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("probe", "open", "focus-contact", "paste-draft", "paste-send", "scan-contacts", "scan-inbox", "scan-history", "open-moments")]
  [string]$Mode,
  [int]$Limit = 40
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName Microsoft.VisualBasic

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class QiyuMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
}
"@

function Write-Result([hashtable]$Value, [int]$ExitCode = 0) {
  $Value | ConvertTo-Json -Depth 8 -Compress
  exit $ExitCode
}

function Get-WeChatProcesses {
  return @(Get-Process -Name "Weixin", "WeChat", "WeChatAppEx" -ErrorAction SilentlyContinue)
}

function Find-WeChatProcess([switch]$IncludeBackground) {
  $processes = Get-WeChatProcesses
  if (-not $IncludeBackground) { $processes = @($processes | Where-Object { $_.MainWindowHandle -ne 0 }) }
  return $processes | Sort-Object StartTime -Descending | Select-Object -First 1
}

function Add-WeChatPath([System.Collections.Generic.List[string]]$Paths, [string]$Candidate) {
  if (-not $Candidate) { return }
  $value = $Candidate.Trim().Trim('"')
  if ($value.StartsWith('\"')) { $value = $value.Substring(2) }
  if ($value.EndsWith('\"')) { $value = $value.Substring(0, $value.Length - 2) }
  if ($value -match '^(.+?\.exe)(?:,\d+)?$') { $value = $Matches[1].Trim('"') }
  try {
    if ((Test-Path -LiteralPath $value -PathType Leaf) -and -not $Paths.Contains($value)) { [void]$Paths.Add($value) }
  } catch {}
}

function Get-WeChatLaunchPaths {
  $paths = New-Object 'System.Collections.Generic.List[string]'
  @(
    "$env:ProgramFiles\Tencent\Weixin\Weixin.exe", "$env:ProgramFiles\Tencent\WeChat\WeChat.exe", "$env:ProgramFiles\Tencent\WeChat\WeChatAppEx.exe",
    "${env:ProgramFiles(x86)}\Tencent\Weixin\Weixin.exe", "${env:ProgramFiles(x86)}\Tencent\WeChat\WeChat.exe", "${env:ProgramFiles(x86)}\Tencent\WeChat\WeChatAppEx.exe",
    "$env:LOCALAPPDATA\Tencent\Weixin\Weixin.exe", "$env:LOCALAPPDATA\Tencent\WeChat\WeChat.exe", "$env:LOCALAPPDATA\Programs\Tencent\WeChat\WeChat.exe",
    "$env:APPDATA\Tencent\Weixin\Weixin.exe", "$env:APPDATA\Tencent\WeChat\WeChat.exe"
  ) | ForEach-Object { Add-WeChatPath $paths $_ }
  foreach ($key in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\WeChat.exe", "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Weixin.exe",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\WeChat.exe", "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\Weixin.exe"
  )) { try { Add-WeChatPath $paths ((Get-Item $key -ErrorAction Stop).GetValue("")) } catch {} }
  foreach ($root in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")) {
    Get-ItemProperty $root -ErrorAction SilentlyContinue | Where-Object { "$($_.DisplayName)" -match "微信|WeChat|Weixin" } | ForEach-Object {
      try { Add-WeChatPath $paths $_.DisplayIcon } catch {}
      foreach ($file in @("WeChat.exe", "Weixin.exe", "WeChatAppEx.exe")) {
        if ($_.InstallLocation) {
          try { Add-WeChatPath $paths (Join-Path -Path $_.InstallLocation -ChildPath $file -ErrorAction Stop) } catch {}
        }
      }
    }
  }
  try {
    $shell = New-Object -ComObject WScript.Shell
    foreach ($menu in @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")) {
      Get-ChildItem -LiteralPath $menu -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match "微信|WeChat|Weixin" } | ForEach-Object { Add-WeChatPath $paths ($shell.CreateShortcut($_.FullName).TargetPath) }
    }
  } catch {}
  return @($paths)
}

function Get-WeChatStartAppIds {
  try { return @(Get-StartApps | Where-Object { "$($_.Name)" -match "微信|WeChat|Weixin" } | Select-Object -ExpandProperty AppID) } catch { return @() }
}

function Get-WeChatProbe {
  $visible = Find-WeChatProcess
  $running = Find-WeChatProcess -IncludeBackground
  $paths = @(Get-WeChatLaunchPaths)
  $appIds = @(Get-WeChatStartAppIds)
  $message = if ($visible) { "已发现可操作的微信窗口：$($visible.ProcessName)（PID $($visible.Id)）" } elseif ($running) { "已发现微信后台进程，但没有主窗口；请从托盘恢复或重新登录微信" } elseif ($paths.Count -gt 0) { "已找到微信安装文件：$($paths[0])" } elseif ($appIds.Count -gt 0) { "已找到开始菜单中的微信应用" } else { "未找到微信安装文件、开始菜单应用或运行进程" }
  return @{ ok = $true; installed = ($paths.Count -gt 0 -or $appIds.Count -gt 0); running = [bool]$running; windowReady = [bool]$visible; processName = if ($running) { $running.ProcessName } else { "" }; executable = if ($paths.Count -gt 0) { $paths[0] } else { "" }; message = $message }
}

function Start-WeChat {
  $process = Find-WeChatProcess
  if ($process) { return $process }
  $paths = @(Get-WeChatLaunchPaths); $started = $false
  foreach ($launchPath in $paths) { try { Start-Process -FilePath $launchPath -ErrorAction Stop | Out-Null; $started = $true; break } catch {} }
  if (-not $started) {
    foreach ($appId in (Get-WeChatStartAppIds)) { try { Start-Process "shell:AppsFolder\$appId" -ErrorAction Stop | Out-Null; $started = $true; break } catch {} }
  }
  if (-not $started) {
    foreach ($protocol in @("weixin://", "wechat://")) { try { Start-Process $protocol -ErrorAction Stop | Out-Null; $started = $true; break } catch {} }
  }
  for ($index = 0; $index -lt 20; $index++) {
    Start-Sleep -Milliseconds 500
    $process = Find-WeChatProcess
    if ($process) { return $process }
  }
  $background = Find-WeChatProcess -IncludeBackground
  if ($background) { throw "已发现微信后台进程，但没有可操作的主窗口；请从系统托盘恢复微信或重新登录" }
  if ($paths.Count -gt 0) { throw "已找到微信安装文件但 10 秒内没有打开主窗口：$($paths[0])" }
  throw "没有找到微信 Windows 版；请从开始菜单手动打开并登录后重试"
}

function Activate-WeChat {
  $process = Start-WeChat
  [Microsoft.VisualBasic.Interaction]::AppActivate($process.Id) | Out-Null
  Start-Sleep -Milliseconds 700
  return $process
}

function Get-WeChatRoot {
  $process = Activate-WeChat
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $process.Id
  )
  $root = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Children,
    $condition
  )
  if (-not $root) { throw "没有找到微信主窗口，请确认微信已经登录" }
  return $root
}

function Click-Element($Element) {
  if (-not $Element) { return $false }
  try {
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
    return $true
  } catch {}
  try {
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $pattern.Select()
    return $true
  } catch {}
  try {
    $rectangle = $Element.Current.BoundingRectangle
    if ($rectangle.Width -gt 2 -and $rectangle.Height -gt 2) {
      [QiyuMouse]::Click([int]($rectangle.X + $rectangle.Width / 2), [int]($rectangle.Y + $rectangle.Height / 2))
      return $true
    }
  } catch {}
  return $false
}

function Find-ByName($Root, [string[]]$Names) {
  $elements = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($element in $elements) {
    $name = ""
    try { $name = [string]$element.Current.Name } catch {}
    if ($Names -contains $name.Trim()) { return $element }
  }
  return $null
}

function Is-ContactName([string]$Name) {
  $value = ($Name -replace "\s+", " ").Trim()
  if ($value.Length -lt 1 -or $value.Length -gt 80) { return $false }
  if ($value -match "^(微信|通讯录|聊天|发现|我|朋友圈|视频号|小程序|公众号|新的朋友|群聊|标签|仅聊天的朋友|企业微信联系人|联系人|Contacts|Chats|Moments|Search)$") { return $false }
  if ($value -match "^(\d{1,2}:\d{2}|\d+|\d+位联系人|星期.|周.|昨天|前天)$") { return $false }
  if ($value -match "^[\p{P}\p{S}\s]+$") { return $false }
  return $true
}

function Find-BestList($Root) {
  $listCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::List
  )
  $lists = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $listCondition)
  $best = $null
  $bestCount = -1
  foreach ($list in $lists) {
    try {
      $items = $list.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $count = 0
      foreach ($item in $items) {
        if ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::ListItem -and (Is-ContactName ([string]$item.Current.Name))) { $count++ }
      }
      if ($count -gt $bestCount) { $best = $list; $bestCount = $count }
    } catch {}
  }
  return $best
}

function Read-VisibleListNames($List) {
  $output = New-Object System.Collections.Generic.List[string]
  if (-not $List) { return $output }
  try {
    $elements = $List.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($element in $elements) {
      if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::ListItem) { continue }
      $name = ([string]$element.Current.Name -replace "\s+", " ").Trim()
      if (Is-ContactName $name) { $output.Add($name) }
    }
  } catch {}
  return $output
}

function Scroll-List($List) {
  try {
    $pattern = $List.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern)
    if ($pattern.Current.VerticallyScrollable) {
      if ($pattern.Current.VerticalScrollPercent -ge 99.5) { return $false }
      $pattern.Scroll([System.Windows.Automation.ScrollAmount]::NoAmount, [System.Windows.Automation.ScrollAmount]::LargeIncrement)
      return $true
    }
  } catch {}
  try {
    $rectangle = $List.Current.BoundingRectangle
    [QiyuMouse]::Click([int]($rectangle.X + $rectangle.Width / 2), [int]($rectangle.Y + [Math]::Min($rectangle.Height - 25, 90)))
    [System.Windows.Forms.SendKeys]::SendWait("{PGDN}")
    return $true
  } catch {}
  return $false
}

function Read-VisibleChatMessages($Root) {
  $rows = New-Object System.Collections.Generic.List[object]
  $bounds = $Root.Current.BoundingRectangle
  $elements = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($element in $elements) {
    try {
      $type = $element.Current.ControlType
      if ($type -ne [System.Windows.Automation.ControlType]::Text -and $type -ne [System.Windows.Automation.ControlType]::ListItem) { continue }
      $name = ([string]$element.Current.Name -replace "\s+", " ").Trim()
      if ($name.Length -lt 1 -or $name.Length -gt 800) { continue }
      if ($name -match "^(微信|聊天|通讯录|搜索|发送|表情|文件|语音聊天|视频聊天|以下为新消息|\d{1,2}:\d{2})$") { continue }
      $rect = $element.Current.BoundingRectangle
      if ($rect.Width -lt 2 -or $rect.Height -lt 2) { continue }
      $centerX = $rect.X + $rect.Width / 2
      $centerY = $rect.Y + $rect.Height / 2
      if ($centerX -lt ($bounds.X + $bounds.Width * 0.34) -or $centerX -gt ($bounds.X + $bounds.Width * 0.97)) { continue }
      if ($centerY -lt ($bounds.Y + 75) -or $centerY -gt ($bounds.Y + $bounds.Height - 105)) { continue }
      $direction = if ($centerX -gt ($bounds.X + $bounds.Width * 0.69)) { "outgoing" } else { "incoming" }
      $rows.Add([pscustomobject]@{ direction = $direction; text = $name; y = [double]$centerY })
    } catch {}
  }
  return @($rows | Sort-Object y | Select-Object direction, text)
}

function Read-ChatHistory($Root, [int]$Maximum) {
  $Maximum = [Math]::Max(30, [Math]::Min(50, $Maximum))
  $history = New-Object System.Collections.Generic.List[object]
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $bounds = $Root.Current.BoundingRectangle
  for ($page = 0; $page -lt 10; $page++) {
    $visible = @(Read-VisibleChatMessages $Root)
    $pageRows = New-Object System.Collections.Generic.List[object]
    foreach ($row in $visible) {
      $key = "$($row.direction)|$($row.text)"
      if ($seen.Add($key)) { $pageRows.Add($row) }
    }
    for ($index = $pageRows.Count - 1; $index -ge 0; $index--) { $history.Insert(0, $pageRows[$index]) }
    if ($history.Count -ge $Maximum) { break }
    [QiyuMouse]::Click([int]($bounds.X + $bounds.Width * 0.68), [int]($bounds.Y + $bounds.Height * 0.42))
    [System.Windows.Forms.SendKeys]::SendWait("{PGUP}")
    Start-Sleep -Milliseconds 550
    $Root = Get-WeChatRoot
  }
  return @($history | Select-Object -Last $Maximum)
}

try {
  switch ($Mode) {
    "probe" {
      Write-Result (Get-WeChatProbe)
    }
    "open" {
      $process = Activate-WeChat
      Write-Result @{ ok = $true; pid = $process.Id; message = "微信已打开" }
    }
    "focus-contact" {
      Activate-WeChat | Out-Null
      [System.Windows.Forms.SendKeys]::SendWait("^f")
      Start-Sleep -Milliseconds 450
      [System.Windows.Forms.SendKeys]::SendWait("^v")
      Start-Sleep -Milliseconds 900
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      Start-Sleep -Milliseconds 800
      Write-Result @{ ok = $true; message = "联系人会话已打开" }
    }
    "paste-draft" {
      Activate-WeChat | Out-Null
      [System.Windows.Forms.SendKeys]::SendWait("^v")
      Write-Result @{ ok = $true; drafted = $true; sent = $false }
    }
    "paste-send" {
      Activate-WeChat | Out-Null
      [System.Windows.Forms.SendKeys]::SendWait("^v")
      Start-Sleep -Milliseconds 300
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      Write-Result @{ ok = $true; drafted = $true; sent = $true }
    }
    "scan-contacts" {
      $root = Get-WeChatRoot
      $contactsTab = Find-ByName $root @("通讯录", "Contacts")
      if ($contactsTab) { Click-Element $contactsTab | Out-Null; Start-Sleep -Milliseconds 900 }
      $root = Get-WeChatRoot
      $list = Find-BestList $root
      if (-not $list) { Write-Result @{ ok = $false; error = "contacts_not_exposed"; message = "没有定位到微信通讯录列表，请先在微信中点开通讯录后重试" } 2 }
      $contacts = New-Object System.Collections.Generic.HashSet[string]
      $stagnant = 0
      $pages = 0
      for ($page = 0; $page -lt 240; $page++) {
        $before = $contacts.Count
        foreach ($name in (Read-VisibleListNames $list)) { $contacts.Add($name) | Out-Null }
        $pages++
        if ($contacts.Count -eq $before) { $stagnant++ } else { $stagnant = 0 }
        if ($stagnant -ge 6) { break }
        if (-not (Scroll-List $list)) { break }
        Start-Sleep -Milliseconds 250
      }
      $result = @($contacts) | Sort-Object
      if ($result.Count -eq 0) { Write-Result @{ ok = $false; error = "no_contacts"; message = "没有读取到联系人，请保持微信通讯录页面可见后重试" } 3 }
      Write-Result @{ ok = $true; contacts = $result; count = $result.Count; pages = $pages }
    }
    "scan-inbox" {
      $root = Get-WeChatRoot
      $chatTab = Find-ByName $root @("微信", "聊天", "Chats")
      if ($chatTab) { Click-Element $chatTab | Out-Null; Start-Sleep -Milliseconds 500 }
      $root = Get-WeChatRoot
      $list = Find-BestList $root
      if (-not $list) { Write-Result @{ ok = $true; unread = $false; message = "没有未读消息" } }
      $items = Read-VisibleListNames $list
      $unreadItem = $null
      foreach ($item in $items) {
        if ($item -match "(\[\d+\]|\d+条新消息|未读)") { $unreadItem = $item; break }
      }
      if (-not $unreadItem) { Write-Result @{ ok = $true; unread = $false; message = "没有未读消息" } }
      $contact = ($unreadItem -split "\s+|\[")[0].Trim()
      Write-Result @{ ok = $true; unread = $true; contact = $contact; message = $unreadItem }
    }
    "scan-history" {
      $root = Get-WeChatRoot
      $history = @(Read-ChatHistory $root $Limit)
      if ($history.Count -eq 0) {
        Write-Result @{ ok = $false; error = "history_not_exposed"; message = "当前微信版本没有向Windows辅助功能暴露聊天文字，请将目标会话保持在前台后重试" } 5
      }
      Write-Result @{ ok = $true; history = $history; count = $history.Count; source = "windows_uia" }
    }
    "open-moments" {
      $root = Get-WeChatRoot
      $moments = Find-ByName $root @("朋友圈", "Moments")
      if (-not $moments -or -not (Click-Element $moments)) { Write-Result @{ ok = $false; error = "moments_not_found"; message = "没有定位到朋友圈入口，请先把微信升级到最新版" } 4 }
      Start-Sleep -Milliseconds 800
      Write-Result @{ ok = $true; message = "朋友圈入口已打开，发布文案已复制" }
    }
  }
} catch {
  Write-Result @{ ok = $false; error = "automation_failed"; message = $_.Exception.Message } 1
}
