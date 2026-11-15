# 安装 dsh-freechan

## 前置

- DeepSeek Harness（桌面端或 CLI），插件目录 `$DSH_HOME/profiles/<profile>/node_modules`
- Node.js ≥ 20（插件本身无第三方依赖）
- 网页通道需要 Python + Playwright（`pip install playwright && playwright install chromium`）
- 至少一个 API 通道密钥（推荐智谱 GLM）

## 三步装好

1. 放进插件目录

   ```bash
   git clone <this-repo> "$DSH_HOME/profiles/desktop/node_modules/dsh-freechan"
   ```

   本地开发时用 Junction / 软链指向源码目录，改完重启即生效。

2. 四处登记（缺一不加载，而且没有任何报错）

   - `profiles/<profile>/package.json` → `dependencies` 加 `"dsh-freechan": "link:<绝对路径>"`
   - `profiles/<profile>/package.json` → `dsh.profile.bundles` 数组追加 `"dsh-freechan"`
   - `profiles/<profile>/cordis.patch.yml` 末尾追加：

     ```yaml
     - id: dsh-freechan
       name: dsh-freechan
     ```

3. 重启 DSH，工具面板出现 9 个工具。

## 验证

```
freechan_providers()                 → 列 provider 与就绪状态
freechan_doctor()                    → 本机自检
freeask(prompt="只回复两个字：收到")  → 3–15 秒返回答案
```

### 最小可用（只装 API 层，不需要 python）

```bash
export ZAI_API_KEY=...        # 智谱；或 DEEPSEEK_API_KEY / MOONSHOT_API_KEY
node scripts/report.mjs       # 看哪家「就绪」
node selftest.mjs --offline   # 不联网、不需要密钥也能跑的两个工具
```

此时 `freeask` 走纯 Node 的 fetch，返回体里 `via` 字段是 `api`；
网页通道会明确提示需要工具链，而不是抛堆栈。

## 配置通道

编辑 `providers.json`：加网页站点填 `url` + `input`/`reply` 选择器 + `login_markers`；
加 API 填 `base`/`path`/`key_env`/`model`（OpenAI 兼容即可）；`order` 决定自动路由顺序。

密钥来源：环境变量（`key_env`）或本机文件 + 正则（`key_file`/`key_regex`）。

## 卸载

删 `node_modules/dsh-freechan`，并从 `package.json`（dependencies、bundles）与 `cordis.patch.yml` 删掉对应条目，重启。
