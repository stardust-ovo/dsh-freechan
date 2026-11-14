# 发布 dsh-freechan 到 GitHub（init → commit → remote → push）
# 用法： pwsh -File 发布.ps1            正式发布
#        pwsh -File 发布.ps1 -DryRun    只体检，不动任何东西
param([switch]$DryRun, [string]$Owner = "stardust-ovo", [string]$Repo = "dsh-freechan", [string]$Message = "dsh-freechan 0.2.0: freechan plugin first release")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Say($m) { Write-Host $m }
function Bad($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function First($s) { return (($s -split [Environment]::NewLine) | Where-Object { $_.Trim() } | Select-Object -First 1) }

Say "== 1. 体检 =="
# git 可能搬过家（2026-11-14 从 D:\Git 迁到 D:\_Groups\Apps\Git），PATH 未必跟上
$gitExe = $null
foreach ($cand in @((Get-Command git -ErrorAction SilentlyContinue).Source,
                    "D:\_Groups\Apps\Git\cmd\git.exe", "D:\Git\cmd\git.exe",
                    "C:\Program Files\Git\cmd\git.exe")) {
  if ($cand -and (Test-Path $cand)) { $gitExe = $cand; break }
}
if (-not $gitExe) { Bad "找不到 git.exe（查过 PATH 与 D:\_Groups\Apps\Git、D:\Git、C:\Program Files\Git）"; exit 2 }
$git = { param($a) & $gitExe @a }
Say ("  git        : " + (& $gitExe --version) + "  [" + $gitExe + "]")
Say ("  user.name  : " + (& $gitExe config user.name))
Say ("  user.email : " + (& $gitExe config user.email))
if (-not (& $gitExe config user.name)) { Bad "git 身份为空"; exit 2 }

Say "  SSH 测试中…"
$ssh = (ssh -o BatchMode=yes -o ConnectTimeout=12 -T git@github.com 2>&1 | Out-String)
if ($ssh -match "successfully authenticated") {
  Say ("  SSH        : OK — " + (First $ssh.Trim()))
} else {
  Bad ("SSH 未通过：" + (First $ssh.Trim()))
  Bad "先解决钥匙（ssh-agent 加载带口令的 key，或改 HTTPS+PAT）再回来"
  if (-not $DryRun) { exit 3 }
}

Say "== 2. 仓库状态 =="
Say ("  .git       : " + (Test-Path ".git"))
Say ("  .gitignore : " + (Test-Path ".gitignore"))
Say ("  package    : " + ((Get-Content package.json -Raw | ConvertFrom-Json).version))
if ($DryRun) { Say "  （DryRun：到此为止）"; exit 0 }

Say "== 3. init / commit =="
if (-not (Test-Path ".git")) { & $gitExe init -b main | Out-Null; Say "  已 git init（main）" }
& $gitExe add -A
$staged = (& $gitExe diff --cached --name-only | Measure-Object).Count
Say ("  待提交文件 : " + $staged)
if ($staged -gt 0) { & $gitExe commit -q -m $Message; Say "  已提交" } else { Say "  无改动，跳过提交" }

Say "== 4. remote =="
$url = "git@github.com:$Owner/$Repo.git"
$cur = (& $gitExe remote get-url origin 2>$null)
if ($cur) {
  if ($cur -ne $url) { & $gitExe remote set-url origin $url; Say "  remote 改指 $url" } else { Say "  remote 已是 $url" }
} else { & $gitExe remote add origin $url; Say "  已添加 remote $url" }

Say "== 5. push =="
& $gitExe push -u origin main
if ($LASTEXITCODE -eq 0) { Say ("  推送完成：https://github.com/" + $Owner + "/" + $Repo) } else { Bad "推送失败：仓库可能还没在 GitHub 上建，或网络受限"; exit 4 }
