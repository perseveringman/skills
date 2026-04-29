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
git repo。skill 自带一个一键初始化脚本：

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
├── .gitignore              (忽略 .workbuddy/ 等本地状态)
└── README.md
```

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

让你的 trips repo 自动变成可访问的网站。

### 一次性 Vercel setup

1. 打开 https://vercel.com/new
2. **Import** 你的 trips repo (`<you>/trips`)
3. 设置：
   - **Framework Preset:** Other
   - **Root Directory:** 留空
   - **Build Command:**
     ```
     npm install --prefix /tmp/skill-build https://github.com/perseveringman/skills.git#main && \
     cd /tmp/skill-build/node_modules/perseveringman-skills/travel-companion/web && \
     TRIPS_DIR="$VERCEL_PROJECT_PRODUCTION_URL_DIR/../trips" \
     npm install && npm run build && \
     cp -R dist "$VERCEL_PROJECT_PRODUCTION_URL_DIR/dist"
     ```
     > 上面是用 npm 的"远程包"语法把 skill repo 当依赖拉。如果你想要更
     > 简单的方式，把 skill repo 作为 git submodule 引入 trips repo
     > 即可（见下方"submodule 模式"）。
   - **Output Directory:** `dist`
4. 点 Deploy

每次 `git push` 到 trips repo 的 main → Vercel 重 build → 网站
更新。

### Submodule 模式（更简单）

```bash
cd ~/Trips
git submodule add https://github.com/perseveringman/skills.git skill
git submodule update --init --recursive
git commit -m "add skill submodule"
git push
```

然后 vercel.json 用：

```json
{
  "buildCommand": "cd skill/travel-companion/web && npm install && TRIPS_DIR=../../../trips npm run build && cp -R dist ../../../../dist",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    { "source": "/((?!trips/|assets/|favicon).*)", "destination": "/index.html" }
  ]
}
```

skill 升级时：`git submodule update --remote skill && git push`。

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
