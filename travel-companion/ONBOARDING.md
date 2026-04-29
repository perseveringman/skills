# Travel Companion — Onboarding

5 分钟把 skill 装好、把第一段旅行聊起来。

---

## 你需要的东西

- macOS / Linux（Windows 用 WSL 也行）
- `git`、`python3`、`node 20+`
- 一个 codebuddy / Claude Code / 类似的 agent 客户端（这个 skill 用任何
  能加载本地 SKILL.md 的客户端都可以）
- (可选) GitHub 账号 + Vercel 账号 — 想要"对话即更新网站"的话需要

---

## Step 1 — 装 skill

```bash
# clone skill repo (or pull latest)
git clone https://github.com/perseveringman/skills.git ~/Developer/skills

# 让你的 agent 客户端能找到 skill
ln -s ~/Developer/skills/travel-companion ~/.workbuddy/skills/travel-companion
# (codebuddy / claude code 通常默认扫 ~/.workbuddy/skills/)
```

启动 agent 后输入 `/skills`，应该能看到 `travel-companion`。

---

## Step 2 — 创建你的"旅行档案"目录

旅行数据**不应该**写在 skill repo 里——它是你的私人内容，应该有自己的
git repo。skill 自带一个一键初始化脚本，会把 explorer SPA + 所有
helper 脚本 + Vercel 配置都一并拷进去，**生成一个完全 self-contained
的 repo**：

```bash
# 1. 在 GitHub 创建空 repo: github.com/<you>/trips（私有/公开都行）

# 2. 在本地初始化
bash ~/Developer/skills/travel-companion/scripts/init_trips_repo.sh \
     ~/Trips \
     --remote git@github.com:<you>/trips.git \
     --seed egypt-south        # 可选：放一份埃及南线作 demo

# 3. 推一下让 GitHub repo 也有数据
cd ~/Trips
git push -u origin main
```

现在 `~/Trips/` 长这样：

```
~/Trips/
├── trips/
│   └── egypt-south/        ← seed 数据（可删）
├── web/                    ← 完整 Vite SPA（Vercel 直接 build）
├── scripts/                ← active_trip / publish / export_data / ...
├── assets/  references/    ← SCHEMA + 抽实体 prompt
├── vercel.json             ← 部署配置
├── .gitignore  README.md  ONBOARDING.md
└── (.workbuddy/ 是本地状态，被 gitignore)
```

> 这个 repo **不依赖** skill repo 运行——Vercel 拿到它就能直接 build。
> skill 升级时再用 `--upgrade` flag 刷一次工具部分（见 Step 4 末尾）。

---

## Step 3 — 第一次对话

```bash
cd ~/Trips
codebuddy   # 或 claude code，确保在这个目录启动
```

加载 skill：客户端通常会根据 SKILL.md 描述自动激活，或显式 `/skills load
travel-companion`。

然后**直接说人话**：

> 我下个月想去京都看樱花，住宿和路线该怎么规划？

skill 内部会做这些事（你看不到，但会在回复末尾告诉你结果）：

```
A0. python3 .../active_trip.py --cwd . resolve "京都樱花"
       → 没匹配 → 自动 mkdir trips/kyoto/ + 写 .trip/meta.json
       → 写 .workbuddy/active-trip 指针
A1. ingest.py append            （记录这一轮对话）
A2. (LLM) 抽实体: 京都, 清水寺, 樱花季, 哲学之道, ...
A3. ingest.py upsert            （写 wiki/entities/*.md）
A4. geocode.py                  （给京都/清水寺等查坐标）
A5. (LLM) 给"京都"生成 4 类推荐
A6. export_data.py              （生成 trips/kyoto/data/trip.json）
A7. publish.py --cwd .          （git add+commit+push）
```

agent 会在回复末尾加一句：

> 📍 这次我会记到 trips/kyoto/。不喜欢 slug 就告诉我，可以改成别的。

如果你不喜欢 `kyoto` 这个 slug：

> 把这次叫 kyoto-spring-2026 吧

agent 会调 `active_trip.py rename`，原子地改目录 + meta + 指针。

---

## Step 4 — 部署到 Vercel（可选，但强烈推荐）

**好消息：你的 trips repo 已经是个完整的 Vite 项目了**，`init_trips_repo.sh`
已经把 `web/`、`scripts/`、`vercel.json` 都拷进去了。所以 Vercel 直接
import 即可，**没有 submodule、没有额外配置**。

### 一次性 Vercel setup

1. 在 GitHub 把你的 trips repo push 上去（`git push -u origin main`）
2. 打开 https://vercel.com/new
3. **Import** 你的 trips repo
4. 设置：
   - **Framework Preset:** Other
   - **Root Directory:** 留空
   - Build / Output / Install Command 都不用填，Vercel 会读 `vercel.json`
5. 点 Deploy

第一次 build ~1.5 分钟（要装 vite/react/leaflet/cytoscape）。之后每次
agent 跑 `publish.py` 把 commit 推到 main → Vercel 自动 redeploy →
~30 秒后你的 URL 就是最新的。

### 部署后的 URL 结构

```
https://<your-project>.vercel.app/             ← Home（trip 卡片网格）
https://<your-project>.vercel.app/#/t/kyoto    ← 单 trip explorer
https://<your-project>.vercel.app/trips/manifest.json     ← 数据 API
https://<your-project>.vercel.app/trips/kyoto.json
```

### 升级 skill（拿到 UI / 脚本的新版本）

```bash
# 假设 skill 还在 ~/Developer/skills/
cd ~/Developer/skills && git pull

# 把新版 web/ scripts/ assets/ references/ vercel.json 同步到你的 repo
bash ~/Developer/skills/travel-companion/scripts/init_trips_repo.sh \
     ~/Trips --upgrade

# 提交
cd ~/Trips
git diff --stat     # 看一眼改了什么
git add -A && git commit -m "upgrade skill" && git push
```

`--upgrade` **不会动** `trips/`、`.workbuddy/`、`.git/`——只刷工具部分。

---

## 日常使用

### 多个旅行档案？

随时切换：

```
> 聊点别的，转到日本京都那次
agent → switch kyoto

> 开个新的，北海道冬游
agent → resolve "北海道冬游" → mkdir trips/hokkaido-winter/

> 把这次叫 hokkaido-2027
agent → rename hokkaido-2027

> 先别记了
agent → clear，本轮不入库
```

### 多终端并行

每个 cwd 自己有 `.workbuddy/active-trip`，所以：

```
terminal A: cd ~/Trips     聊埃及  → trips/egypt-south/
terminal B: cd ~/WorkTrips 聊出差  → 完全不干扰
```

### 改 explorer UI

要调网站本身的样式 / 交互（不是数据）：

```
> 把详情面板的字号调大一点
agent → 进入 Track B → cd .../web && npm run dev → edit *.tsx → build → push
```

具体哪些文件对应哪些 UI 区域，见 SKILL.md "Track B" 段。

### 离线导出

想要一份单文件 explorer.html（不用服务器，双击就能开）：

```bash
cd ~/Developer/skills/travel-companion/web
npm run build:single                                           # 写 ../assets/explorer.html
python3 ../scripts/inject.py --trip-root ~/Trips/trips/kyoto   # 注入数据
open ~/Trips/trips/kyoto/explorer.html
```

---

## 排错

| 现象 | 看这里 |
|---|---|
| `active_trip.py` 找不到 trips dir | 检查 `cd` 是不是在 trips repo 里；或者 `export TRIPS_DIR=~/Trips/trips` |
| `publish.py` 报 "no active-trip" | 还没聊过任何东西。先在 agent 里说一句话，让 A0 跑 |
| Vercel build 报 "no trips dir" | build command 里 `TRIPS_DIR` 路径不对。临时方案：build 出空站 |
| Home 页空白 | trips dir 里没有 `data/trip.json`。`python3 scripts/export_data.py --trip-root <...>` 跑一下 |
| dev server 显示空白 | `FIXTURE` 环境变量值不对。用 `FIXTURE=egypt-south npm run dev` 或 `FIXTURE=none npm run dev`（用 Home 路由） |
| commit message 乱码 | 终端编码问题，git 实际存的是 UTF-8，github 网页能看 |

---

## 进一步阅读

- `SKILL.md` — agent 的完整工作手册（Track A / Track B / 部署）
- `references/extraction-prompts.md` — LLM 抽实体的 prompt
- `references/entity-types.md` — 实体类型怎么选
- `web/README.md` — explorer SPA 的代码地图
