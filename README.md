<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="InkOS Logo">
  <img src="assets/inkos-text.svg" width="240" height="65" alt="InkOS">
</p>

<h1 align="center">Story Creation AI Agent<br><sub>面向长短篇小说、剧本剧作、互动影游、IP 内容与多语言翻译的创作智能体系统</sub></h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@actalk/inkos"><img src="https://img.shields.io/npm/v/@actalk/inkos.svg?color=cb3837&logo=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="https://github.com/Narcooo/inkos/stargazers"><img src="https://img.shields.io/github/stars/Narcooo/inkos?style=flat&logo=github&color=yellow" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/@actalk/inkos"><img src="https://img.shields.io/npm/dm/@actalk/inkos?color=cb3837&logo=npm&label=downloads" alt="npm downloads"></a>
  <a href="https://clawhub.ai/narcooo/inkos"><img src="https://img.shields.io/badge/🦞%20ClawHub-Skill-FF6B35?labelColor=1a1a1a" alt="ClawHub Skill"></a>
</p>

<p align="center">
  <a href="README.en.md">English</a> | 中文 | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <strong>InkOS 网页版上线！</strong>
  <a href="https://huohuaapi.com/apps">立刻体验</a>
</p>

---

InkOS 是一个面向故事创作与多语言翻译的 AI Agent 系统：长篇连载、独立短篇、剧本剧作、同人番外、仿写续写、互动影游、开放世界和长文翻译，都可以从同一个工作台开始。支持 Studio、TUI、CLI 交互形式，把创意、设定、角色、记忆、审稿、修订、封面、互动状态和跨语言交付交给智能体统一管理。

<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://kimi-file.moonshot.cn/prod-chat-kimi/kfs/4/1/2026-06-05/1d8h69mt3v89kkekg24gg">
    <img alt="Kimi Open Source Friends" width="420" src="https://kimi-file.moonshot.cn/prod-chat-kimi/kfs/4/1/2026-06-05/1d8h69fudcmosb3pipls0">
  </picture>
  <br>
  🎉🎉 InkOS 入选首批 KIMI 开源合作伙伴 🎉🎉
</p>

<p align="center">
  <img src="https://gcdn.moonshot.cn/growth-cdn/sponsor/kimi-zh.png" width="900" alt="Kimi 赞助 InkOS">
</p>

感谢 Kimi 赞助本项目！Kimi K3 是 Moonshot AI 迄今能力最强的模型，也是全球首个开源 3T 级模型，拥有原生视觉能力与 100 万 Token 上下文。搭配 InkOS，K3 可以参与长短篇小说、剧本、互动影游与多语言内容的规划、写作、审稿和修订；InkOS 则持续管理角色、设定、伏笔与故事状态，让长篇创作更连贯、更可控。

<p align="center">
  <a href="https://kkaiapi.com/?utm_source=inkos&utm_medium=repo&utm_campaign=kk-models-readme&utm_content=zh-screenshot"><img src="assets/kkaiapi-home-promotion.jpg" width="840" alt="kkaiapi 首页"></a>
</p>

**[kkaiapi](https://kkaiapi.com/?utm_source=inkos&utm_medium=repo&utm_campaign=kk-models-readme&utm_content=zh-brand)｜一个 Key 调模型，一个 MCP 接数据与工具。**<br>
支持 Claude、GPT、Gemini、DeepSeek 等主流模型，按量付费、共用余额，用于 InkOS 写作、审稿与封面生成。<br>
[查看模型与价格 →](https://kkaiapi.com/models?utm_source=inkos&utm_medium=repo&utm_campaign=kk-models-readme&utm_content=zh-models) · [InkOS 接入指南 →](https://kkaiapi.com/docs/inkos?utm_source=inkos&utm_medium=repo&utm_campaign=kk-models-readme&utm_content=zh-guide) · [MCP 接入 →](https://kkaiapi.com/api/information/skill?utm_source=inkos&utm_medium=repo&utm_campaign=kk-models-readme&utm_content=zh-mcp)

> 💡 **写小说，先给 Agent 接一层专业数据** —— 写小说不只缺模型，更缺素材。推荐搭配 [**火花数据API（huohuaapi）**](https://huohuaapi.com/)：按调用计费的小说 / 网文创作数据，让 Agent 动笔前先查小说正文、章节结构、人物设定、文风和创作方法等带来源素材，而不是只靠 Prompt 硬凑一份“剧情提纲”。

## v2.0.0 - 统一 Pi Agent Harness 与专业创作内核

本分支为 2.0 开发版本，使用本地构建进行验证。旧项目先运行 `inkos work migrate --json` 查看升级清单，再运行 `inkos work migrate --apply` 导入统一创作库；原目录与早期版本清单备份会保留，冲突不会覆盖已有作品。

迁移会转换 1.x 的书籍默认配置、规则和状态快照，保留正文、原始目录及未填写的历史信息。旧写作控制字段保留在原件中，2.0 使用 Profile 的操作策略。缺少运行时状态的项目以草稿进入创作库，需完成状态重建后再继续生产。

本地开发与真实生产验收统一使用 kkaiapi（`https://api.kkaiapi.com/v1`）：文字按 DeepSeek V4 Flash / Pro 分工，封面使用 `gpt-image-2`。在项目 `llm.cover` 中配置服务和模型，CLI 与 Studio 读取同一配置，封面可复用 kkaiapi 服务密钥。

已有短篇可以在作品对话中要求按审稿意见整篇修订，或运行 `inkos short revise <story-id> --instruction "修复审稿指出的时间线与证据链问题"`。系统会更新相关章节、大纲和销售包，再次审稿，并保留原稿版本。

InkOS 2.0 把“Chat Agent 调工具”和“各类作品管线”收敛成一套围绕 pi-agent 的生产 harness。模型负责理解、提议和调用能力；InkOS 负责确认、上下文、状态、原子落盘和产物真实性。长篇、短篇、剧本、分镜、互动影游、Play 与翻译继续保留各自的专业方法，但共享同一套执行、检索、观测和恢复基础设施。

- **模型配置**：Studio 内置多服务配置、模型路由和封面服务配置；支持 [kkaiapi](https://kkaiapi.com/) / OpenRouter 等全球主流模型聚合入口，以及自定义 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages 服务。
- **单一生产 Harness**：Studio Chat、TUI、`inkos interact` 与生产 worker 共用 pi-agent 工具循环和结构化 action/result；既有 pipeline 降为可直接调用、可中断、可观测的确定性能力，不再维护平行的自然语言决策内核。
- **19 个内置专业 Skills**：长篇写作 / 审稿、商业短篇、Play、剧本、分镜、互动影游、翻译、拆稿、市场研究、导入、封面与去 AI 味都拥有独立 `SKILL.md`；各作品类型复用 Skill 架构，不复用不适合自己的长篇提示词。
- **统一本地检索**：故事记忆、材料库和 Skill 参考资料共用 SQLite FTS5 / BM25 检索投影；原始文件仍是权威来源，索引可重建，检索结果保留来源与位置。
- **书籍参考资料绑定**：导入材料可以显式绑定到某本书并声明用途，写作时按当前任务检索相关段落，而不是把所有文件全文塞进上下文。
- **安全章节工作区**：正文、状态、伏笔和运行快照先在章节工作区内校验，再原子提交；失败不会出现“状态已推进、正文未落盘”。Studio 可查看改写工作区和真实审稿问题。
- **跨作品生产一致性**：Short、剧本、分镜、互动影游、Play 与翻译接入统一 run snapshot、Skill 绑定、字数观测、取消信号和失败恢复，同时保留各自的状态模型与创作规则。
- **长任务与模型调用更稳**：多章写作按一个可恢复任务顺序执行；首 Token / 流式空闲超时、过期状态修复和原子文件集降低被动卡住或半完成的概率。
- **TUI 对齐 Studio**：新增 `/new`、`/short`、`/play`、`/cover`、`/write` 明确入口，结构化 `/confirm` / `/cancel`，会话级 `/model` 切换和明暗终端自适应配色；普通自由文本仍交给 Agent 理解。
- **模型与工作台补齐**：新增 LM Studio 本地服务，动态模型目录和外部母本导入可持久化；Studio 支持自定义封面 Base URL、宽屏章节预览和安全章节重写。

<p align="center">
  <img src="assets/interactive-film-e2e.png" width="440" alt="InkOS 互动影游剧情树实测截图">
  <img src="assets/studio-play-1-5.png" width="440" alt="InkOS Play Studio 开放世界界面">
</p>

### 主要创作形态

**长篇小说** — 从创作简报建书，生成世界观、角色、卷纲和章节意图；写作、审稿、修订、状态结算都是可独立调用、可追溯的 Harness action。上下文按 protected / compressible 分层组织，避免长书越写越乱。

**剧情多线推演** — 在写下一章前，基于当前正史生成 2-5 条彼此隔离的未来分支，并在 Studio Chat 中横向比较章节节拍、人物决定、预计变化、风险和作者意图匹配度。采用分支只会保存 `selected-branch-plan.md` 候选计划，不会修改正文、大纲或正史状态；正史变化后旧推演会标记为过期。

**InkOS Short** — Studio Chat 和 CLI 可以直接产出独立短篇：完整正文、大纲记录、审稿记录、简介卖点、封面提示词，并在配置封面服务后生成封面图。

**InkOS Play** — 新增开放世界与分支互动。你可以用自然语言指定世界契约、时间推进方式、角色 agent、物品 / 证据 / 关系规则和视觉风格；系统维护世界状态、可点击选择、自由动作、HUD 和自动配图。

**Studio Chat** — 普通聊天、建书、短篇、封面、互动世界都走同一套 action surface。重动作先确认，生成物可预览，可通过聊天修改章节、封面提示词、世界状态和持久化文本产物。

**Native English novel writing now supported！** Set `--lang en` to write in English. See [English README](README.en.md) for details.

## 欢迎交流

> 当前更新相对频繁，后续会持续新增功能与优化写作效果。
> 欢迎加群反馈问题、提出需求，也欢迎关注项目动态 — 我们的目标是做最强的基于小说的内容生态创作 AI Agent。

<p align="center">
  <img src="assets/wechat-group-v23.jpg" width="300" alt="微信交流群">
</p>

## 快速开始

### 安装

需要 **Node.js 22.16 或更高版本**。

```bash
npm i -g @actalk/inkos
```

### 通过 OpenClaw 使用 🦞

InkOS 已发布为 [OpenClaw](https://clawhub.ai/narcooo/inkos) Skill，可被任何兼容 Agent（Claude Code、OpenClaw 等）直接调用：

```bash
clawhub install inkos          # 从 ClawHub 安装 InkOS Skill
```

通过 npm 安装或克隆本项目时，`skills/SKILL.md` 已包含在内，🦞 可直接读取——无需额外从 ClawHub 安装。

安装后，Claw 应优先通过共享交互入口调用 InkOS：

```bash
inkos interact --json --message "继续当前书，但把节奏再收紧一点"
```

这条入口直接走和项目 TUI 相同的交互执行内核，因此 OpenClaw、TUI、Studio 共用同一套控制脑。当前 JSON 输出包含 assistant 文本回复和 interaction session 信息；真正的执行结果以工具结果和落盘文件为准，不从模型口头声明推断完成。

底层规划、上下文组装、写作和审稿由同一 Harness action 调度，不再作为平行入口暴露。也可以在 [ClawHub](https://clawhub.ai) 搜索 `inkos` 在线查看。

### Agent Skills

InkOS 直接使用标准 `SKILL.md` 作为专业能力扩展，不再维护一套 InkOS 私有 Skill 协议。Skill 只向 Chat Agent 提供专业说明和静态参考资料，不会增加执行权限；创建、写入、编辑和生成图片仍然由 InkOS 工具与确认闸门控制。

可用方式：

- 放到标准目录：项目 `skills/`、`.agents/skills/`，或用户目录 `~/.agents/skills/`、`~/.openclaw/skills/`。Studio 也可以导入包含 `SKILL.md` 的完整文件夹和静态参考资料；项目导入统一保存到 `.agents/skills/`。
- 或设置 `INKOS_SKILL_DIRS=/abs/path/to/skills`，可指向单个 skill 目录，也可指向包含多个 skill 子目录的目录。多个目录按系统分隔符分隔。
- 在 Chat 里用 `@skill-id` 强制本轮使用，例如：`@detective-play 做一个证据链驱动的开放世界`。
- 不写 `@skill-id` 时，Chat Agent 根据用户当前意图决定是否调用 `use_skill`；不再通过 session 类型、关键词或字符串包含匹配机械启用。
- 外部 Skill 只提供指令和静态参考资料，InkOS 不会自动执行其中的脚本；它也不会绕过现有工具权限与确认闸门。

专业创作方法统一由 Skill 提供。要调整内置方法，可在 Studio 导入同 ID 的项目 Skill 作为覆盖；Agent 文件只保留动态任务、上下文和工具协议。

最小 `SKILL.md` 示例：

```md
---
name: Detective Play
description: Detective evidence and suspect-board play.
---
Use evidence chains; do not turn clues into generic atmosphere.
```

### 配置

当前 InkOS 将 LLM 配置分成两条清晰路径：**Studio 用可视化服务配置**，**CLI / daemon / 部署环境支持 env 覆盖**。两者不会互相污染。

#### 方式一：Studio 服务配置（推荐）

适合本地写作、Web 工作台和可视化管理。

```bash
inkos init my-novel
cd my-novel
inkos
```

请从启动日志显示的本机地址打开 Studio。默认本地服务只接受同源浏览器请求；自定义嵌入或反向代理可通过服务启动参数 `allowedOrigins` 明确配置可信来源。

打开 Studio 后进入「模型配置」：

1. 选择服务商，例如 Google Gemini、Moonshot、MiniMax、智谱、百炼或自定义端点。
2. 选择协议类型：OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages；自定义端点应按上游实际协议选择。
3. 粘贴 API Key，点击「测试连接」。
4. 选择可用模型，保存配置。
5. 回到书籍页面开始写作。

Studio 运行时只使用：

```text
provider bank 默认值
→ inkos.json 里的 services / 当前 service / defaultModel
→ .inkos/secrets.json 里的 service API Key
```

即使检测到 `~/.inkos/.env` 或项目 `.env`，Studio 也只会展示提示，不会用 env 覆盖 service、model、baseUrl 或 API Key。API Key 存在项目内的 `.inkos/secrets.json`，不会写进 `inkos.json`。

#### 方式二：CLI / daemon / 部署环境的 env 配置

适合终端批处理、服务器部署、CI、Docker、守护进程和一次性切模型。

全局 env：

```bash
inkos config set-global \
  --provider <openai|anthropic|custom> \
  --base-url <API 地址> \
  --api-key <你的 API Key> \
  --model <模型名>
```

也可以手动写 `~/.inkos/.env` 或项目 `.env`：

```bash
INKOS_LLM_PROVIDER=custom
INKOS_LLM_BASE_URL=https://api.moonshot.cn/v1
INKOS_LLM_API_KEY=sk-...
INKOS_LLM_MODEL=kimi-k2.5

# 可选
INKOS_LLM_SERVICE=moonshot                         # 推荐写；不写时会尽量从 baseUrl 自动识别
INKOS_LLM_TEMPERATURE=0.7
INKOS_LLM_THINKING_BUDGET=0
INKOS_DEFAULT_LANGUAGE=zh
INKOS_LLM_EXTRA_top_p=0.9
```

CLI 合成顺序：

```text
Studio/project service 配置
→ .inkos/secrets.json service key
→ global ~/.inkos/.env
→ project .env
→ 当前进程环境变量
→ CLI 参数
```

也就是说，CLI 默认可以复用 Studio 配好的服务和密钥；如果 env 里声明了 `INKOS_LLM_SERVICE`、`INKOS_LLM_MODEL`、`INKOS_LLM_BASE_URL` 或 `INKOS_LLM_API_KEY`，则作为覆盖层生效。旧 env 只写 `baseUrl + model + apiKey` 也能继续用，InkOS 会尽量从 baseUrl 反推 service。

一次性指定服务或模型：

```bash
inkos write next --service google --model gemini-2.5-flash
inkos write next --service moonshot --model kimi-k2.5 --no-stream
inkos agent "继续写下一章" --api-key-env MOONSHOT_API_KEY
inkos doctor --service minimaxCodingPlan --model MiniMax-M2.7
```

`--service` 会从 provider bank 自动推导 baseUrl、协议和兼容策略；`--model` 必须属于最终 service，否则会直接报错，避免把 Kimi 模型发到 Gemini 这类错配问题。

#### 方式三：多模型路由（可选）

给不同 Agent 分配不同模型，按需平衡质量与成本：

```bash
# 给不同 agent 配不同模型/提供商
inkos config set-model writer <model> --provider <provider> --base-url <url> --api-key-env <ENV_VAR>
inkos config set-model auditor <model> --provider <provider>
inkos config show-models        # 查看当前路由
```

未单独配置的 Agent 自动使用全局模型。

#### 配置排查

```bash
inkos doctor
```

`doctor` 会显示当前 effective config mode、service/model/API Key 来源，并尝试 API 连通性。常见模式：


| 模式               | 含义                                        |
| ---------------- | ----------------------------------------- |
| `studio-project` | Studio 运行时：只使用 Studio/project 配置和 secrets |
| `cli-project`    | CLI 运行时：以 Studio 配置为基础，再叠加 env 和 CLI 参数   |
| `environment`    | CLI / daemon 直接使用当前环境配置                         |


如果服务测试失败，优先检查服务商、模型和协议是否匹配。Google Gemini 的 AI Studio API Key 可用于 Gemini OpenAI-compatible endpoint；InkOS 会自动禁用 Google 不支持的 OpenAI `store` 参数。MiniMax 默认走官方 OpenAI-compatible `/v1/chat/completions`，并优先使用可工作的非流式 transport，避免流式返回 usage 但无正文的问题；`MiniMax-M3*` 会默认关闭 thinking 返回，M2.x thinking 由上游限制无法关闭。

### LLM 配置更新

- **Studio / CLI 配置隔离**：Studio 固定使用服务页配置和 `.inkos/secrets.json`；CLI、daemon、部署环境支持 env 覆盖和一次性命令参数。
- **Provider bank 能力表**：内置 Google Gemini、Moonshot、MiniMax、智谱、百炼、DeepSeek、硅基流动、火山、腾讯混元、文心、讯飞星火、OpenRouter、kkaiapi、Ollama、CodingPlan 等服务的 baseUrl、协议、模型和兼容策略。
- **模型归属校验**：`--service google --model kimi-k2.5` 这类错配会直接报错，避免把请求发到错误服务商。
- **Google Gemini 兼容修复**：AI Studio API Key 可直接用于 Gemini OpenAI-compatible endpoint，InkOS 会自动禁用 Google 不支持的 OpenAI `store` 参数。
- **MiniMax transport 探测**：MiniMax / MiniMax CodingPlan 使用官方 OpenAI-compatible `/v1` 入口，并自动使用可工作的非流式 transport，规避流式 usage 正常但正文为空的问题。
- **环境配置**：CLI 可使用 `INKOS_LLM_BASE_URL + INKOS_LLM_MODEL + INKOS_LLM_API_KEY`；没有 `INKOS_LLM_SERVICE` 时从当前 baseUrl 识别服务。

### 当前交互入口

**Studio Chat + CLI + TUI 共用同一套执行面**

- **Studio Chat**：讨论、建书、短篇、封面、Play、编辑持久化文件都从同一个对话入口发起；重动作会先展示确认卡。
- **开始创作入口**：长篇小说、短篇小说、同人创作、番外创作、仿写创作、续写创作、分支互动、开放世界都可以从 Studio 顶部入口进入。
- **TUI 仪表盘**：`inkos tui` 进入终端全屏交互；支持 `/new`、`/short`、`/play`、`/cover`、`/write`、`/confirm`、`/cancel` 和会话级 `/model <模型名>`。
- **外部 Agent 入口**：`inkos interact --json --message "..."` 仍是 OpenClaw / 其他 agent 的结构化入口。
- **明确命令**：`write next`、`revise`、`review`、导入和导出仍可直接调用；内部规划与上下文阶段由 Harness 统一编排。

### 写第一本书

```bash
inkos book create --title "吞天魔帝" --genre xuanhuan  # 创建新书
inkos write next 吞天魔帝      # 写下一章并记录审稿 observation
inkos status                   # 查看状态
inkos review 吞天魔帝          # 查看已记录的审稿 observation
inkos export 吞天魔帝          # 导出全书
inkos export 吞天魔帝 --format epub  # 导出 EPUB（手机/Kindle 阅读）
```

### 写完整短篇

想直接生成一篇完整短篇，可以在 Studio 对话里说：

```text
写一篇 12 章短篇，方向是：都市婚姻反转，女主拿到账本证据后反杀。
```

也可以走 CLI：

```bash
inkos short run \
  --direction "都市短篇 婚姻反转 女主证据反杀" \
  --chapters 12 \
  --chars 1000
```

生成物会落在 `shorts/<故事名>/final/`，包含 `full.md`、`sales-package.md`、`cover-prompt.md`，配置封面服务后还会生成 `cover.png`。

### 单独制作封面

如果只想给已有标题或简介做封面，不需要重跑短篇正文，在 Studio 对话里直接说：

```text
给《她签下离婚协议那天，他悔疯了》生成一张短篇封面，偏现代都市、强反转。
```

封面工具会独立生成 `covers/<标题>/cover-prompt.md` 和 `covers/<标题>/cover.png`。如果还没有配置封面服务，先在 Studio 的模型配置里设置封面服务和 API Key。

生成后也可以继续通过 chat 改封面提示词，例如“把人物拉近一点、标题字更大、表情更冷笑”。系统会用新的 `coverPrompt` 重写 `cover-prompt.md` 并重生成封面，不需要重新写短篇。



### 启动开放世界 / 分支互动

在 Studio Chat 里选择「开放世界」或「分支互动」，直接用自然语言描述你想玩的世界：

```text
做一个魔兽风格的边境哨塔开放世界。时间不是固定回合，巡逻是一小时，练功可以跨几天。装备有稀有度，但不要数值面板，用材质和光泽体现。
```

系统会生成世界、角色、物品、证据、关系、当前场景和可选动作。开放世界支持自由输入动作；分支互动会给出可点击选项。配置封面 / 图片服务后，角色、物品、证据、场景都可以生成图，并在对话流里滚动显示。

---

## 核心特性

### Studio Chat + Action Surface

Studio Chat 不再只是问答框。它可以创建长篇、跑短篇、生成封面、启动 Play、编辑持久化文本文件，并在需要执行重动作前给出确认。普通讨论会直接回答；明确创作动作才进入工具执行。

### InkOS Play：开放世界与分支互动

Play 维护一个可持续推进的世界状态：角色、地点、物品、证据、关系、时间、场景和 HUD。它不是固定 RPG 模板，你可以用自然语言定义世界契约：修仙装备可以有稀有感，恋爱本可以有心动层级，侦探本可以有证据生命周期。系统把这些规则写进世界状态，再用于后续叙事和配图。

### 定性审稿 + 去 AI 味

连续性审查会从角色记忆、物资连续性、伏笔回收、大纲偏离、叙事节奏和情感弧线等维度记录具体 observation。内置 AI 痕迹检测会标出高频词、句式单调和过度总结等可修订位置。observation 是可追溯的创作反馈，不会把章节改写成“通过/失败”状态；用户或 Agent 可据此显式发起修订。

去 AI 味由可替换的 `inkos-story-deslop` Skill 提供语义方法；需要时显式调用 `revise --mode anti-detect`，不会由隐藏词表自动改稿。

### 文风仿写

`inkos style analyze` 按激活的分析与仿写 Skill，把参考文本编译为有证据的可执行文风指南；`inkos style import` 将指南绑定到指定作品，供后续写作与修订按需使用。

### 创作简报

`inkos book create --brief my-ideas.md` 传入你的脑洞、世界观设定或人设文档。Architect 基于简报生成 `outline/story_frame.md`、`outline/volume_map.md`、角色卡和 `book_rules.md/json`，并把长期方向保存到 `story/author_intent.md`。

### 输入治理控制面

每本书现在都有两份长期可编辑的 Markdown 控制文档：

- `story/author_intent.md`：这本书长期想成为什么
- `story/current_focus.md`：最近 1-3 章要把注意力拉回哪里

用户可直接在 Studio Chat、TUI 或 `inkos agent` 中调整方向。Planner 先通过语义选择得到本章工作集，再生成 `story/runtime/chapter-XXXX.intent.md`；Composer 持久化 `context.json` 与 `trace.json`，记录真正进入模型的来源、保护层级、检索结果和压缩情况。

### 字数治理

`write next` 与 `revise` 共享同一套字数遥测：

- `--words` 指定的是目标字数，系统会自动推导一个允许区间，不承诺逐字精确命中
- 中文默认按 `zh_chars` 计数，英文默认按 `en_words` 计数
- 系统不会截断正文，也不会因长度偏差把章节标成失败
- 超出 hard range 时仍保存正文，并在 chapter index 与 ActionResult 中记录结构化遥测和 observation

### 续写已有作品

`inkos import chapters` 从已有小说文本导入章节，自动重建结构化状态、章节摘要、伏笔、角色关系和可读 Markdown 投影，支持 `第X章` 和自定义分割模式、断点续导。导入后 `inkos write next` 可继续创作。

### 同人创作

`inkos fanfic init --from source.txt --mode canon` 从原作素材创建同人书。支持四种模式：canon（正典延续）、au（架空世界）、ooc（性格重塑）、cp（CP 向）。内置正典导入器、同人专属审计维度和信息边界管控——确保设定不矛盾。

### 多模型路由

不同 Agent 可以走不同模型和 Provider。写手用 Claude（创意强），审计用 GPT-4o（便宜快速），雷达用本地模型（零成本）。`inkos config set-model` 按 agent 粒度配置，未配置的自动回退全局模型。

### 守护进程 + 通知推送

`inkos up` 启动后台循环自动写章。管线会自动推进可处理的非关键问题；需要人工判断的问题会暂停并留下可审结果。通知推送支持 Telegram、飞书、企业微信、Webhook（HMAC-SHA256 签名 + 事件过滤）。日志写入 `inkos.log`（JSON Lines），`-q` 静默模式。

### 本地模型兼容

支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和自定义兼容端点。服务测试会验证协议与流式能力；结构化输出缺失、流中断或输出上限都会明确报错或触发完整续写，不会把残缺文本当成功结果。

### 可靠性保障

每章自动创建状态快照，正文、索引和结构化状态以原子文件集提交。文件锁与 Action 队列防止并发写入；中断会留下 Episode 事件和可恢复状态。审稿只记录有证据的 observation，修订由用户或 Agent 显式发起。

伏笔系统使用 Zod schema 校验——`lastAdvancedChapter` 必须是整数，`status` 只能是 open/progressing/deferred/resolved。LLM 输出的 JSON delta 在写入前经过 `applyRuntimeStateDelta` 做 immutable 更新 + `validateRuntimeState` 结构校验。坏数据直接拒绝，不会滚雪球。

模型输出上限由 provider bank 的模型卡管理；`llm.extra` / `INKOS_LLM_EXTRA_*` 中的保留键（max_tokens、temperature、model、messages、stream 等）会被自动过滤，防止意外覆盖核心请求参数。

---

## 工作原理

InkOS 以 pi-agent harness 作为统一认知与工具调用内核：Agent 理解用户意图并产生结构化 action，宿主执行确定性工具、确认权限、管理状态并以真实文件和 tool result 判定完成。长篇、短篇、剧本、分镜、互动影游、Play 和翻译复用这套架构，但保留各自的专业 Skill、状态模型与生产步骤。

<p align="center">
  <img src="assets/arch-system.svg" width="900" alt="InkOS 整体系统架构">
</p>

长篇每一章按“语义工作集 → 规划 → 写作 → 状态投影 → observation → 原子提交”运行；修订是独立 Action：

<p align="center">
  <img src="assets/arch-pipeline.svg" width="900" alt="InkOS 章节生产管线">
</p>


| Agent               | 职责                                                                |
| ------------------- | ----------------------------------------------------------------- |
| **雷达 Radar**        | 扫描平台趋势和读者偏好，指导故事方向（可插拔，可跳过）                                       |
| **规划师 Planner**     | 读取作者意图 + 当前焦点 + 记忆检索结果，产出本章意图（must-keep / must-avoid）             |
| **编排师 Composer**    | 从结构化状态、控制文档和材料中按任务选择上下文，记录保护层级、检索和语义压缩 trace                    |
| **建筑师 Architect**   | 建书、导入或番外初始化时生成基础设定：故事框架、规则、角色与长期控制文件                              |
| **写手 Writer**       | 基于编排后的精简上下文生成正文（字数治理 + 对话引导）                                      |
| **状态结算 Settler**    | 通过 typed tool 提交正文有证据的增量 state delta，由宿主校验并应用                                 |
| **审稿 Agent**  | 对照用户意图、正典、状态、章节计划和审稿 Skill，返回有证据的定性观察                                 |
| **修订者 Reviser**     | 接受用户、Agent 或审查 observation 给出的明确修改目标，生成并原子落盘新版本                         |


章节正文和故事状态作为同一组产物原子落盘；审稿意见作为 observation 保存在章节记录中，不改变正文完成态。修订是独立的显式动作，完成后生成新的 observation 与可追溯版本。

### 长期记忆

每本书的权威记忆与检索投影分开：


| 层                    | 用途                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `story/state/*.json` | 权威结构化状态：当前状态、伏笔、章节摘要等，经过 Zod schema 校验                                                      |
| `story/*.md`         | 人类可读投影：`current_state.md`、`pending_hooks.md`、`chapter_summaries.md`、`character_matrix.md` 等 |
| `story/memory.db`    | 可重建的 SQLite FTS5/BM25 检索投影；不作为故事事实权威                                                        |


连续性审计员对照这些状态检查每一章草稿。如果角色"记起"了从未亲眼见过的事，或者拿出了两章前已经丢失的武器，审计员会捕捉到。

Settler 通过 typed tool 输出完整增量 delta，代码层做 immutable apply 和结构校验。Markdown 只是人类可读投影；检索时从 canonical JSON 重建索引，再由 LLM 对 BM25 候选做语义选择。

<p align="center">
  <img src="assets/arch-memory.svg" width="900" alt="InkOS 长期记忆与状态">
</p>

### 控制面与运行时产物

除了运行时状态，InkOS 还把“护栏”和“自定义”拆成可审阅的控制层：

- `story/author_intent.md`：长期作者意图
- `story/current_focus.md`：当前阶段的关注点
- `story/runtime/chapter-XXXX.intent.md`：本章目标、保留项、避免项、冲突处理
- `story/runtime/chapter-XXXX.context.json`：本章实际选入的上下文
- `story/runtime/chapter-XXXX.trace.json`：本章输入编译轨迹

这样 `brief`、卷纲、书级规则、当前任务不再混成一坨 prompt，而是先编译，再写作。

### 创作规则体系

专业创作方法由 Work Profile 绑定的 Skill 提供，可由项目中同 ID 的 `SKILL.md` 覆盖。Agent 代码只保留任务、输入权威和 typed tool 协议；每本作品仍有独立的 `book_rules.md/json`、`outline/story_frame.md`、`outline/volume_map.md`、`author_intent.md` 和 `current_focus.md`。

## 使用模式

InkOS 提供 Studio Chat、TUI、CLI Agent 和明确命令，底层共享同一 Harness：

### 1. 完整管线（一键式）

```bash
inkos write next 吞天魔帝          # 规划 → 编排 → 写作 → 审查记录 → 原子落盘
inkos write next 吞天魔帝 --count 5 # 连续写 5 章
```

`write next` 使用唯一的 `plan -> compose -> write -> review -> commit` 创作链路。审查产生 observation；技术校验决定能否原子落盘，语义反馈不会被转换成章节失败状态。

### 2. 明确能力命令

```bash
inkos write next 吞天魔帝 --count 3
inkos revise 吞天魔帝 31 --json
inkos review 吞天魔帝 --json
inkos export 吞天魔帝 --format epub
```

这些命令表达已经确定的用户动作；自然语言意图仍进入 pi-agent Harness，由当前 Work Profile 的 capability surface 决策。

### 3. 自然语言 Agent 模式

```bash
inkos agent "帮我写一本都市修仙，主角是个程序员"
inkos agent "写下一章，重点写师徒矛盾"
inkos agent "先扫描市场趋势，然后根据结果创建一本新书"
```

Agent 模式只暴露当前 Work Profile 允许的 capability。模型可按意图加载 Skill、读取 Work、提出新作品确认、写作、审稿或修订；完成态只来自 ActionResult 和真实 artifact revision。

### 4. Studio Play 模式

Studio 里的「开放世界」和「分支互动」是交互式创作入口。它们不要求你先建书，也不要求写死 RPG 数值。你可以描述“世界怎样运行、时间怎样推进、角色是否自主行动、物品和证据怎样影响故事”，系统会生成可继续玩的世界，并把每回合状态写回本地。

## Studio 实测截图与生成结果

<p align="center">
  <img src="assets/studio-dashboard.png" width="760" alt="InkOS Studio 开始创作入口">
</p>

<p align="center">
  <strong>InkOS Short 手机封面</strong><br>
  <img src="assets/inkos-short-demo-cover.png" width="260" alt="短篇封面">
</p>

<p align="center">
  <strong>InkOS Play 恋爱互动</strong><br>
  <img src="assets/play-openworld-romance.png" width="560" alt="恋爱互动">
</p>

<p align="center">
  <strong>InkOS Play 侦探互动</strong><br>
  <img src="assets/play-openworld-detective.png" width="560" alt="侦探互动">
</p>

<p align="center">
  <strong>InkOS Play 物品配图</strong><br>
  <img src="assets/play-item-warcraft.png" width="560" alt="物品配图">
</p>

第一张是当前 Studio 的本地实测截图。后面四张来自 InkOS Short 和 InkOS Play 的真实本地生成结果：短篇封面用于手机端缩略图点击，Play 图用于展示开放世界、侦探证据、互动场景和物品视觉能力。

## 命令参考


| 命令                                          | 说明                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `inkos init [name]`                         | 初始化项目（省略 name 在当前目录初始化）                                                                    |
| `inkos book create`                         | 创建新书（`--genre`、`--platform`、`--chapter-words`、`--target-chapters`、`--brief <file>` 传入创作简报） |
| `inkos book update [id]`                    | 修改书设置（`--chapter-words`、`--target-chapters`、`--status`）                                    |
| `inkos book list`                           | 列出所有书籍                                                                                     |
| `inkos book delete <id>`                    | 删除书籍及全部数据（`--force` 跳过确认）                                                                  |
| `inkos genre list/show/copy/create`         | 查看、复制、创建题材                                                                                 |
| `inkos write next [id]`                     | 完整管线写下一章（`--words` 覆盖字数，`--count` 连写，`-q` 静默模式）                                            |
| `inkos write rewrite [id] <n>`              | 重写第 N 章（恢复状态快照，`--force` 跳过确认，`--words` 覆盖字数）                                              |
| `inkos revise [id] [n]`                     | 修订指定章节                                                                                     |
| `inkos agent <instruction>`                 | 自然语言 Agent 模式                                                                              |
| `inkos review [id]`                         | 查看已持久化的审稿 observation                                                                     |
| `inkos status [id]`                         | 项目状态                                                                                       |
| `inkos export [id]`                         | 导出书籍（`--format txt/md/epub`、`--output <path>`）                                               |
| `inkos radar scan`                          | 扫描平台趋势                                                                                     |
| `inkos fanfic init`                         | 从原作素材创建同人书（`--from`、`--mode canon/au/ooc/cp`）                                              |
| `inkos short run`                           | 生成独立短篇包（正文、简介卖点、封面提示词、可选封面图）                                                               |
| `inkos forecast create/show/select`          | 生成、核验并选择长篇的非正史剧情分支；选择只保存候选计划，不修改正史                                                        |
| `inkos interact`                            | 外部 agent / CLI 自然语言入口（`--json`、`--message`、`--book`）                                       |
| `inkos config set-global`                   | 设置 CLI / daemon / 部署环境的全局 LLM env（`~/.inkos/.env`）                                         |
| `inkos config show-global`                  | 查看全局配置                                                                                     |
| `inkos config set/show`                     | 查看/更新项目配置                                                                                  |
| `inkos config set-model <agent> <model>`    | 为指定 agent 设置模型覆盖（`--base-url`、`--provider`、`--api-key-env` 支持多 Provider 路由）                |
| `inkos config remove-model <agent>`         | 移除 agent 模型覆盖（回退到默认）                                                                       |
| `inkos config show-models`                  | 查看当前模型路由                                                                                   |
| `inkos doctor`                              | 诊断配置问题（显示 effective config mode、来源、API 连通性和提供商兼容性提示）                                       |
| `inkos detect [id] [n]`                     | AIGC 检测（`--all` 全部章节，`--stats` 统计）                                                         |
| `inkos style analyze <file>`                | 分析参考文本提取文风指纹                                                                               |
| `inkos style import <file> [id]`            | 导入文风指纹到指定书                                                                                 |
| `inkos import canon [id] --from <parent>`   | 导入正传正典到番外书                                                                                 |
| `inkos import chapters [id] --from <path>`  | 导入已有章节续写（`--split`、`--resume-from`）                                                        |
| `inkos analytics [id]` / `inkos stats [id]` | 书籍数据分析（observation、章节长度、token 用量）                                                           |
| `inkos update`                              | 更新到最新版本                                                                                    |
| `inkos studio` / `inkos`                    | 启动 Web 工作台（`-p` 指定端口，默认 4567；Studio 使用服务页配置，不使用 env 覆盖）                                    |
| `inkos tui`                                 | 启动终端全屏 TUI                                                                                 |
| `inkos up / down`                           | 启动/停止守护进程（`-q` 静默模式，自动写入 `inkos.log`）                                                      |


`[id]` 参数在项目只有一本书时可省略。`write next` 支持 `--context` 传入创作指导，`--words` 覆盖每章目标字数；`book create` 支持 `--brief <file>` 传入创作简报。内部 Planner/Composer 产生的 intent、context 和 trace 可在 Studio 中查看。

CLI 运行时还支持一次性 LLM 覆盖参数：`--service`、`--model`、`--api-key-env`、`--base-url`、`--api-format <chat|responses|anthropic>`、`--stream`、`--no-stream`。`anthropic` 对应 Anthropic Messages 协议。例如：

```bash
inkos write next --service google --model gemini-2.5-flash
inkos up --service moonshot --model kimi-k2.5 --api-key-env MOONSHOT_API_KEY
```

## 路线图

- ~~`packages/studio` Web UI 工作台（Vite + React + Hono）~~ — 已发布，`inkos` 或 `inkos studio` 启动
- ~~互动小说 / 开放世界（分支叙事 + 自由动作 + 自动配图）~~ — Studio Play 已落地
- 局部干预（重写半章 + 级联更新后续 truth 文件）
- 自定义 agent 插件系统
- 平台格式导出（起点、番茄等）

## 参与贡献

欢迎贡献代码。提 issue 或 PR。

```bash
pnpm install
pnpm dev          # 监听模式
pnpm test         # 运行测试
pnpm typecheck    # 类型检查
```

## Fork 性能与写作质量实验

### 分阶段模型路由

Planner、Composer、Writer 和 Auditor 可独立设置模型。将计划、上下文筛选和审稿配置为满足任务容量要求的快速模型，将正文配置为更擅长创作的模型。未配置的阶段仍使用全局模型。模型覆盖使用对应模型的上下文和输出容量；正文的上下文预算以 Writer 的模型为准。状态结算继续使用 Writer 的模型。

```bash
inkos config set-model planner <fast-model>
inkos config set-model composer <fast-model>
inkos config set-model auditor <fast-model>
inkos config set-model writer <writing-model>
inkos config show-models
```

上面的模型名称是配置示例，不是内置默认模型。跨服务商覆盖按原有 `--base-url` 等选项设置。

### 写作约束

`style-linter.ts` 在正文生成后、事实结算前检查叙述套话与破折号密度。只有命中规则才触发结构化段落精修，非目标段落保持原样；仅接受规则问题减少且没有引入新的同类问题的结果。潜在伤势与道具冲突只提示审查，不自动改动剧情。内置长篇与去套话技能同时提供同 ID 的 `.agents/skills/` 覆盖版本，保留原参考文件；若写作项目不在本仓库，将覆盖目录复制到该项目的 `.agents/skills/` 即可。

### 本地对照实验

基线为上游 commit `53adac4e974b54dafda975edc4edd07cad364c18`。Windows、Node.js 24.16.0、pnpm 9，使用相同的 [外部 GPT 原创章节](benchmarks/chapter-001.md)（874 个非空白字符）。以下为开发期间实测中位数：

| 指标 | v1 | v2 | 变化 |
| --- | ---: | ---: | ---: |
| CLI `--help` 启动 | 848.3 ms | 512.7 ms | -39.6% |
| CLI 峰值 RSS | 136.9 MiB | 107.2 MiB | -21.7% |
| CLI CPU 时间 | 999 ms | 655 ms | -34.4% |
| FTS5 首次建索引（1,000 条） | 50.261 ms | 45.267 ms | -9.9% |
| FTS5 未变更索引（1,000 条） | 36.848 ms | 1.762 ms | -95.2% |
| FTS5 单条变更 | 36.038 ms | 1.792 ms | -95.0% |
| FTS5 中文检索 | 0.134 ms | 0.116 ms | -13.3% |
| Compose（128 张角色卡，138 个条目） | 21.140 ms | 9.628 ms | -54.5% |

CLI 交替执行五次/版本；FTS5 在内存数据库中各执行三轮；Compose 预热后交替执行六次/版本，真实读取、筛选及运行时文件写入，筛选结果固定且两版上下文 JSON 完全一致。CLI/FTS5 数据来自 v2 早期优化检查点；Compose 来自加入并行读取后的检查点。

```bash
# 两份工作树均按锁文件安装依赖并构建后，在优化版根目录运行
node benchmarks/compose-replay.mjs ../inkos ../inkos-v2 benchmarks/chapter-001.md
```

这是外部正文与固定语义结果回放实验，不是完整模型写章基准。没有真实模型推理延迟、首 Token 延迟、精确 Token 用量、单章完整持久化或文学质量改善的对照数据。内存 FTS5 实验不能衡量磁盘 WAL 的效果。所有上游署名和 AGPL-3.0 许可证保持不变。

### Agent 请求轮次与上下文压缩

- Compose 在一次操作内复用同一份文件及 FTS 候选语料；当完整上下文超预算，直接对已准备的候选做语义筛选。当前状态、故事框架、卷纲和角色卡可在模型容量允许时合并为一个请求；记忆候选仍按独立预算筛选。固定 HTTP 响应的集成测试中，筛选请求从 5 次降至 2 次，选中条目数量不变（不是在线模型端到端基准）。
- 稳定作者方向和正典进入写作系统上下文；工作器的静态协议和已激活技能正文排列在动态作者请求及查询相关参考之前。云端实际前缀缓存由供应商决定。
- 素材工具的模型可见文本按内容去重，使用本地估算器限制在约 4,096 Token；每条摘录至多约 1,200 Token，部分摘录保留完整源范围地址；宿主详情仍保存完整证据。
- FTS5 增加 MEMORY 临时表和忙等待，索引哈希读取与更新处于同一写事务。单次 Compose 的语义阶段不持有 SQLite 连接。代理请求复用有界连接池（至多 8 个代理地址）；直连仍由底层 fetch 连接池处理。
- 模型调用完成证据新增完整响应耗时、流式首正文与首工具参数延迟；非流式首字延迟留空。结构化工作器汇总保留在实际 Agent 记录中的有效修正轮次用量。供应商未报告缓存用量时不应将零值当作已验证的缓存未命中。

本轮复测：128 张角色卡、138 个上下文条目，交替六次/版本，v1 16.649 ms、v2 7.983 ms（中位数，下降 52.0%），固定筛选结果完全一致。与上表属于不同轮次，不横向混算。现有 spot-fix 使用范围替换；全局重写的明确请求仍允许全章修订。

### 局部修订、文件缓存与长篇回放

对于 spot-fix，若所有质量问题都有本章唯一完整的行级引文，宿主直接绑定替换范围，跳过范围选择请求。歧义、过期或非局部证据保留原路径；明确选区仍优先。固定 HTTP 响应测试验证两处修改只用一次替换请求，其他原文字节不变。

Compose 文本和素材分段/元数据使用有界进程级文件缓存。每次命中校验 dev、ino、size、mtimeNs、ctimeNs；读前后身份不一致时不缓存。缓存预算按源文件字节计，不等同于实际堆内存。索引仍按内容哈希增量更新，不保持全局数据库连接。

原子事务的预写阶段每批最多八个并发任务，全部完成后才进入准备日志与替换阶段；日志同步与恢复协议不变。

| 本地实测（交替六轮/版本，中位数） | v1 | v2 |
| --- | ---: | ---: |
| 128 文件读取与 Markdown 分段（预热） | 2.802 ms | 0.978 ms |
| 24 文件原子提交 | 46.244 ms | 44.284 ms |
| 128 角色卡 Compose | 19.456 ms | 8.809 ms |

另一次独立进程对照：60 章、32 张角色卡、固定选择与真实状态归约/当前状态原子写入。v1 2,835 ms、v2 2,047 ms；峰值 RSS 115.56/111.34 MiB。强制 GC 后第 60 章堆内存 16.70/16.78 MiB。此回放不含模型、历史完整快照写入和长会话 Agent 记录，不能证明完整连载不存在内存泄漏。单次进程测试仅为初步测量。

```bash
node benchmarks/local-io-replay.mjs ../inkos ../inkos-v2 benchmarks/chapter-001.md
node --expose-gc benchmarks/longform-memory-replay.mjs ../inkos benchmarks/chapter-001.md
node --expose-gc benchmarks/longform-memory-replay.mjs ../inkos-v2 benchmarks/chapter-001.md
```

### CLI 与 Core 依赖隔离

CLI 使用精确 Core 子路径，不再通过根 barrel 导入运行时实现；根导出仍兼容原有使用者。CLI 入口按 Commander 实际解析的顶层命令动态加载原命令模块，保留完整选项、别名、全局参数及默认 Studio 行为。单工具执行器与全量能力注册表共用独立的工具适配器，不为显式长篇写作加载全部生产能力。纯项目读取/日志工具不依赖模型客户端。

本轮使用 Node.js 24.16.0 的同步模块加载钩子测量真实进程，交替六次/版本，取中位数。v1 为上游基线，v2 为本轮优化后的完整 Core + CLI 构建：

| 命令 | v1 延迟 | v2 延迟 | v1 峰值 RSS | v2 峰值 RSS | 加载模块数 v1 → v2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `--help` | 1130.76 ms | 56.25 ms | 137.32 MiB | 48.62 MiB | 1772 → 17 |
| `write next --help` | 945.20 ms | 376.98 ms | 137.48 MiB | 90.18 MiB | 1772 → 643 |
| `status --help` | 911.70 ms | 71.64 ms | 137.20 MiB | 52.99 MiB | 1772 → 50 |

三个路径的 Play、互动影片和短篇/分镜生产运行器模块数均从 27 降至 0；根帮助 Core 模块数为 0。上一轮检查点 `631eaf69` 的单次模块追踪为 974 个总模块、263 个 Core 模块，三个路径相同。与上表不同轮次的延迟不可混算。保留 Core 根入口和同步程序工厂的原始行为；完整通用 Agent/Studio 仍需要按其能力加载相关模块。此为启动和帮助路径测量，不是长篇模型写章的端到端延迟或常驻 RSS。

```bash
node benchmarks/cli-startup-replay.mjs ../inkos ../inkos-v2
```

### 通用 Agent 依赖隔离与创作自主性

- 通用会话绕开 Harness 根 barrel，生产工具保留同步 schema/确认逻辑，具体 Play、短篇、剧本、分镜、影片、封面、研究、素材入库实现在相应工具执行时加载；影片专用 authoring 实现仅在绑定影片 Work 的会话加载。原同步能力注册入口保持兼容。
- 默认不再强制统一表达语气、标点配额或段落结尾。内置及项目覆盖的长篇/去套话 Skill 以可选专业建议为主；用户明确的风格、事实、权限及交付约束仍有效。作品的 `works/<book-id>/source/book.json` 可设 `"styleRepair": true` 启用原规则驱动局部精修；省略或设为 false 时，确定性文风发现仅供审查参考，不自动重写。现阶段通过作品 JSON 配置，未增加 UI 开关。
- 素材与翻译共用有界文件读取和 UTF-8/UTF-16 BOM 解码；素材 URL 使用有界流式读取并在超限取消。纯文本素材保留字面实体；HTML 提取保留段落。PDF 解析器按需加载并在完成后释放文档，EPUB 导入/导出依赖延迟加载。不新增 OCR、DOCX 或其他格式；非 UTF-8/带 BOM UTF-16 的文本需要先转码。

基于 Node 24.16.0 的模块加载钩子，单次对照上一检查点 `e49b5d0c`：

| 启动路径 | 上轮总模块 / Core 模块 | 本轮总模块 / Core 模块 |
| --- | ---: | ---: |
| `agent --help` | 931 / 250 | 707 / 219 |
| `interact --help` | 931 / 250 | 707 / 219 |

相关 Play/影片/短篇及分镜运行器路径数从 26 降至 7（包含新增的独立变量类型校验模块）。单次峰值 RSS 分别约 116.2 → 105.1 MiB、116.1 → 100.7 MiB；仅为初步观测，不视作长期内存基准。Core 定向 86 项测试及 CLI 全部 90 项测试通过。没有在线模型写作质量对照，也未改动 SDK 初始化、长会话缓存容量、超时策略或跨任务 SQLite 池。

### 会话日志、空闲缓存与 Office 素材

- 普通会话事件追加仅缓存文件身份与 nextSeq、lastCommittedSeq、hasSessionCreated（至多 128 个条目），无需反复解析全量历史；文件变更时重新读取，检测到追加前的外部冲突则拒绝操作。依赖历史授权判断的调用仍走完整事件接口；进程内追加队列结束即释放。该机制未引入跨进程互斥，不能保证独立进程同时写同一日志的事务隔离。
- 空闲 Agent 按最后使用时间淘汰，最多保留 16 个空闲会话、单会话至多 512 条消息、合计 32 MiB 的磁盘日志大小预算。日志大小是序列化历史量代理，不是进程堆的硬限制；活跃任务和完整历史均不截断。淘汰时释放 episode SQLite 连接，下次从已提交记录恢复。
- Pi AI 0.67.1 已经懒加载各供应商 SDK，不重复造加载器。Agent/Interact 的帮助路径不初始化 Core；管线的 Architect、Radar、Reviser、StateValidator、StyleGuide 实现在使用时导入。结构化流式任务在显式输出预算至多 2048 且模型非推理时使用 120s 首事件/90s 空闲超时，其余使用 300s/180s；环境覆盖及非流式请求总超时保留。
- `ingest_material` 支持 DOCX 正文及表格和 XLSX 工作表、坐标、共享字符串、布尔值及公式缓存的文本提取；不会执行公式。使用现有 JSZip 和锁文件中已存在的 fast-xml-parser 5.5.8（本轮新增直接依赖），按需加载。压缩输入仍遵循 18 MiB 素材限制，Office XML 解压总量最多 32 MiB、提取文本最多 8 Mi 字符，拒绝 DTD/实体声明。暂不支持完整原版式编辑、旧二进制 DOC/XLS、扫描 OCR 或 DOCX 翻译专用入口。

本轮日志基准：预置 1000 条约 2.91 MB 事件，再追加 100 条，交替六轮/版本，原版中位数 1888.188 ms，本轮 72.147 ms（26.2 倍）；最终 1100 条事件逐项一致。

单次模块追踪（上一检查点 `39068ef8` → 本轮）：

| 命令 | 总模块 | Core 模块 |
| --- | ---: | ---: |
| `agent --help` | 707 → 19 | 219 → 0 |
| `interact --help` | 707 → 18 | 219 → 0 |
| `write next --help` | 643 → 633 | 152 → 142 |

```bash
node benchmarks/session-transcript-replay.mjs ../inkos ../inkos-v2 benchmarks/chapter-001.md
```

没有在线模型或完整长会话堆内存对照，保持上一版的创作自主性策略；SQLite 跨任务连接池和进一步提示词压缩未实施。

### 活跃会话、工具归档与原生 Office 导出

- Pi 已完成消息使用弱引用度量缓存（仅对明确不可变的已完成消息启用），摘要缓存只存消息数、SHA-256 前缀指纹及摘要，不再复制全部历史正文。历史替换使指纹失效；当前工具循环用一次逆向扫描查找完整调用/结果边界。完整消息历史仍可从 transcript 恢复；摘要尚未跨进程持久化。
- 成功的 `workspace__read`（项目读取权限或明确 artifactId）和 `workspace__retrieve_material` 文本观察超过 32 KiB 时，先写入会话级内容寻址归档 `.inkos/tool-results/<session-hash>/`，再将 8 KiB 预览、原文哈希、地址及必要回执写入 Pi 消息和 transcript。精确原始回执 JSON 和文本均保存，Episode ledger 仍保留真实 ActionResult。新只读工具 `read_archived_tool_result` 以 UTF-8 字节偏移分页恢复，验证地址及会话作用域；删除会话时清理相应归档。失败、写入、确认及其他能力保持原路径。完整阅读大文件可能增加分页模型调用，归档也增加磁盘占用；不声称总堆内存按回执比例下降。
- `workspace__export_work` 支持 `format: "docx"`（Markdown 源、标题/段落/基础管道表格）和 `format: "xlsx"`（JSON 记录数组、文本/数字/布尔值原生类型）。字符串公式不执行，版本校验及原始文件保留；`review_and_export_work_artifact` 也支持 DOCX。使用既有 JSZip 生成实际 OOXML 包，保存为带正确 MIME 类型的 Work 导出版本，无新依赖。非完整 Markdown 渲染、既有 Office 文件原位保真编辑、复杂样式和公式编辑尚不支持。
- 中英文主提示词行为边界合并为六条，原文估算 token 中文 1015 → 432、英文 932 → 438；保留事实/权限/确认/版本、Skill 及模型表达自主性。摘要提示词保留原文归档地址和部分阅读证据。

本轮本地缓存开关对照：240 条约 2.70 MB 历史，预热后重复 20 次上下文组装，交替六轮/模式，关闭缓存中位数 264.788 ms，开启 0.736 ms。两种模式语义摘要固定且仅调用一次，模型投影一致。不是与旧版完整流程或在线模型的对照。工具归档样本为 558734 → 17822 字节的序列化回执，原始 272400 字节正文分页拼接完全一致。

```bash
node benchmarks/context-metrics-replay.mjs benchmarks/chapter-001.md
```

在线模型质量/推理、跨进程日志锁、SQLite 跨任务池、完整活跃会话 RSS 尚未实测或实现。

### 跨进程会话摘要与有界历史压缩

- 会话摘要检查点存于 `.inkos/conversation-checkpoints/<session-hash>.json`。原子替换、128 KiB 文件上限、版本/模型/工作配置身份和历史前缀 SHA-256 校验；不匹配则重新压缩。当前工具循环的临时摘要不覆盖稳定前缀。删除会话时同步清理，原始 transcript 仍是权威。
- 历史工具回执在运行中和重启后采用相同的协议兼容投影；不再把全部恢复结果附加到系统提示词。模型获得作为历史数据的记录，而不是待执行工具调用。按实际系统提示词、工具 schema、保留输出和传输余量计算会话预算。
- 原递归分段压缩改为顺序分段归并，每段保有独立预算并携带当前任务意图。Unicode 切分可精确重组原文；最多 16 层，压缩不收敛或最终超出估算输出预算时报错，不静默截断内容。摘要语义保真仍依赖所用模型。

完整 Agent 本地压力测试（Node 24.16.0，16K 上下文、1024 输出预算、本地 HTTP 固定模型替身）：40 轮读取同一大文档，实际执行工具、归档、日志提交与语义压缩，40 次提交成功，119 次模型协议请求（其中 39 次摘要请求）。重复读取的归档仅有一对 JSON/TXT 文件。耗时 5665.01 ms，峰值 RSS 192.36 MiB；第 1/10/20/30/40 轮 GC 后堆内存 23.71/26.93/26.85/27.15/26.41 MiB，RSS 122.71/137.80/150.73/152.40/174.04 MiB。

退出进程后，从同一历史副本分别保留和移除检查点，恢复第 41 轮（各一次，两者均提交成功）：

| 指标 | 无检查点 | 有检查点 |
| --- | ---: | ---: |
| 模型协议请求 | 17 | 3 |
| 摘要请求 | 15 | 1 |
| 摘要请求体字节 | 606697 | 18168 |
| 恢复耗时 | 264.71 ms | 174.74 ms |

```bash
node benchmarks/active-session-replay.mjs
```

复测结果一致：40 轮均成功提交，119 次协议请求（39 次摘要）；恢复摘要请求仍为 15 → 1 次、摘要请求体 606697 → 18168 字节。第二次恢复耗时为 269.14 → 157.33 ms，40 轮峰值 RSS 为 196.75 MiB。以上为本地固定输出协议负载，不是在线模型评测；耗时为两次独立观测，未进行统计显著性检验。活跃完整消息仍保存在 Agent 中，RSS 随轮数增长，未证明长期内存无泄漏或已经达到硬上限。真实模型摘要和创作质量、原生 Office 原位编辑、跨进程日志互斥与 SQLite 跨任务连接池仍未实现或验证。

### 三层会话历史：磁盘、增量摘要、活跃窗口

- Agent 只在请求成功提交后释放已被稳定摘要覆盖且经前缀指纹验证的原始消息。摘要所有权移至独立的 historyWindow，滚动 SHA-256 链支持从已释放前缀继续验证增量；原始 JSONL、归档正文及回执完整保留。重启时读取并验证历史后只恢复未覆盖的窗口；当前版本冷恢复仍会短暂读入完整日志，尚未实现流式前缀校验/磁盘索引分页。指纹方案与历史投影变化使旧摘要缓存自动失效。
- 摘要即使在上下文未超窗时也进入模型投影；尽可能复用稳定检查点及近期历史。历史归档结果在当前模型有分页恢复工具时只携带原文哈希、地址、事实和最多 512 个 Unicode 字符摘录，恢复须从 offset 0 开始；当前工具结果保持原样。
- CLI、TUI、Studio 使用 `historyScope: "window"`，返回近期窗口和可选 `compactedHistoryCount`（已压缩的规范化消息数，不是磁盘事件数）。Core 默认完整历史接口在必要时从磁盘重新物化规范化已提交记录，保留原有恢复行为，包括过滤无内容的 assistant 消息。缓存预算按真实保留消息序列化量而不是全部磁盘日志计量。文件指纹变化即使最后提交序号不变，也使缓存失效；尚无跨进程互斥保证。

同上一版的本地固定 HTTP 模型替身，40 轮（16K/1024、每轮大文件读取）连续两次成功，240 个原始消息事件完整保留。第 1/10/20/30/40 轮窗口为 6/6/12/18/6 条；第 40 轮比磁盘消息事件少 97.5%。两次 40 轮峰值 RSS 为 191.16 / 188.17 MiB，最终 GC 后 heap 27.06 / 27.04 MiB，最终 RSS 173.99 / 171.82 MiB；上一版峰值 192.36 / 196.75 MiB。短时 RSS 仍增长，不能宣称整体内存无泄漏或硬上限。模型请求仍 119 次（摘要 39 次），摘要请求体总量 935150 字节，较上一版 730735 字节增加 28.0%，属于待继续优化的权衡。两次耗时 3023.23 / 2740.41 ms，仅为本地观测。

同历史第 41 轮恢复对照（复测一致）：

| 指标 | 无检查点 | 有检查点 |
| --- | ---: | ---: |
| 模型协议请求 | 10 | 3 |
| 摘要请求 | 8 | 1 |
| 摘要请求体字节 | 299928 | 20482 |
| 最近一次恢复耗时 | 186.49 ms | 140.92 ms |

继续第 42 轮，默认完整 API 返回 210 条规范化消息，包含全部 42 条原始用户请求，与既有 canonical restore 一致（252 条磁盘事件中含每轮空 assistant 记录）。全部 42 次提交成功。

```bash
node benchmarks/active-session-replay.mjs
```

模型输出为固定测试替身，未进行真实在线模型质量与延迟对照。活跃单轮工具循环尚未实施物理分段卸载，受当前上下文预算和单次请求规模影响。

### 磁盘日志流式校验与字节偏移恢复

- `transcript-reader.ts` 按二进制块和完整 UTF-8 JSONL 记录解析，保留精确字节位置，避免先构造整份日志字符串。公开的 `readTranscriptPage` 接受版本绑定的字节游标，单页 1–512 个事件（默认 128），按磁盘记录顺序读取；日志发生变化时拒绝旧游标。
- `.inkos/transcript-index/` 保存两个独立的小型派生索引，每个至多 4 KiB：序号索引保存最后提交序号及下一序号；恢复索引保存经过滚动 SHA-256 链验证的摘要覆盖数量、终止提交序号和字节偏移。两者绑定文件设备/身份、大小、mtime 与 ctime。恢复额外检查索引位置前至多 4 KiB 的提交边界。
- 在已有有效摘要且索引有效时，Agent 直接定位未压缩的日志后缀。缺少索引时按单个已提交请求流式重建摘要边界，不保留已压缩消息正文；重建会保留请求 ID 集合用于检查重复请求。索引更新只在本进程观察到连续追加时复用旧前缀；不连续、文件改写或配置变化时重新校验。兼容复杂旧式交叉请求、跨请求工具回执及不确定的思考块边界时仍使用原规范化全量恢复。无可用摘要、明确请求完整历史、部分旧 UI/授权接口也仍需完整记录。索引是可丢弃的派生数据，删除会话时同步清理。
- 本轮未修改在线模型摘要策略或单轮超长工具循环物理保留；不将文件指纹等同于跨进程事务互斥或对恶意本地篡改的防护。

在 Windows Node 24.16.0 下，`benchmarks/transcript-index-replay.mjs` 每个规模交替启动六次独立进程（每种模式三次，报告中位数），固定两个未压缩消息，计时从模块初始化之后开始：

| 完整请求数 | 日志字节 | 首次流式校验 ms | 索引恢复 ms | 后缀扫描字节 | 索引峰值 RSS MiB |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 129 | 666120 | 19.24 | 8.80 | 880 | 79.96 |
| 4097 | 21370494 | 146.45 | 8.73 | 906 | 80.10 |

后缀扫描字节不包括小型索引、检查点及最多 4 KiB 的边界校验读取。完整 Agent 的 `active-session-replay.mjs` 新增文件读取追踪断言：40 轮 1185251 字节日志，第 41 轮独立进程恢复无全量 `readFile`，只流式读取 1155614–1185250（含末尾，29637 字节），保留 9 条近期窗口消息；所有 42 轮提交成功，默认完整接口仍返回 210 条规范化消息。40 轮两个最终追踪测试峰值 RSS 164.55 / 165.80 MiB（上一版 191.16 / 188.17 MiB），耗时 2379.11 / 3293.42 ms；非配对样本，不能认定 RSS 或延迟下降全部来自本轮。摘要请求仍为 39 次，累计请求体 935150 字节。使用固定本地 HTTP 替身而非真实在线推理。长会话 RSS 仍有增长。

```bash
node benchmarks/transcript-index-replay.mjs
node benchmarks/active-session-replay.mjs
```

### 归档证据优先与单轮工具载荷治理

- 对拥有会话内分页恢复工具的模型，先尝试完整上下文，预算不足时优先将可寻址的成功读取结果替换为 512 个 Unicode 标量以内的摘录及原文地址，而不是立刻发起语义摘要。没有可用恢复工具时仍走原有上下文压缩流程。
- 窗口模式中，在工具结果完成并写入原始 JSONL 后，后续工具交换可释放旧归档读取预览和旧归档分页正文。Pi 的多组消息数组共享同一消息对象，因此释放的是共享内容字段与重复显示正文，不删除工具调用或结果记录。保留最新工具交换的完整载荷（若模型窗口不足仍可采用可恢复摘录投影）。归档页记录原始 offset 和内容哈希；错误和修改类回执不参与这种回收。已发送的消息事件不受后续字段替换影响。完整历史模式不执行物理回收；切换模式重建 Agent，完整历史从权威日志恢复。
- 上一版本与本轮的 `active-session-replay.mjs` 40 轮固定本地 HTTP 替身回放：主模型请求均为 80 次，摘要请求 39 → 19 次，总请求 119 → 99 次，摘要累计请求体 935150 → 339549 字节。两次本轮复测结果一致。第 41 轮索引恢复无全量读取，第 42 轮完整历史仍为 210 条规范化消息。保留窗口为 12 条消息（上一版 6 条），是减少摘要调用的实际权衡。
- `active-tool-loop-replay.mjs` 在同一新实现中交替运行完整和窗口模式（ABBA，各两次独立进程）。单轮 48 次真实读取/分页工具执行、49 次主模型请求、0 次摘要。完整模式活跃工具结果 628816 字节，窗口模式 113176 字节（-82.0%），磁盘原始结果均为 628816 字节。累计 HTTP 请求体 12280334 → 4793774 字节（-61.0%）。两种模式的峰值 RSS 样本分别为 172.51/174.24 与 170.06/169.14 MiB。载荷字节不是实际堆内存或计费 token 数，未验证真实模型的追加分页次数和摘要质量。
- 本轮未删除单轮工具调用及结果消息骨架，非归档工具载荷仍可能增长；没有宣称任意长单轮会话具备固定内存上限。

```bash
node benchmarks/active-session-replay.mjs
node benchmarks/active-tool-loop-replay.mjs
```

### 稳定历史与活跃任务的独立增量摘要

- 持久化稳定历史与请求内活跃任务分别维护覆盖计数、SHA-256 前缀和摘要。活跃摘要绑定当前用户消息身份，每次新请求清空；只有稳定历史进入持久化检查点。两类推理各自接收上一次对应摘要与新增记录，不重复传入另一类摘要。保留当前用户请求、近期闭合工具交换及独立生成的宿主进度回执。
- 成功提交后，若活跃摘要覆盖前缀与原始记录一致、规范化历史边界可验证、所有未压缩记录可完整纳入且候选不超过上下文预算的一半，下一请求可直接采用组合后的稳定历史摘要，不额外调用模型。候选跨请求暂存在同一 Agent 内存中，晋升后才持久化；回收进程前未晋升的候选不能跨重启复用。续执行请求不进行这类晋升，校验失败继续普通摘要路径。
- 主模型明确区分 `conversation_summary`、`active_task_summary` 和宿主生成的 `host_execution_progress`。前两者均不是执行证明；模型生成笔记中的保留框架标签被转义。原始日志与真实回执仍是权威，进度投影保留确定性总数和有界近期明细。

`benchmarks/summary-scope-replay.mjs` 从 Git 提交 `4d68a23f` 提取旧上下文实现，与新实现 ABBA 交替对照（8 轮，每轮两个大型读取结果与一个失败回执，固定摘要输出，每种实现两次）。两次结果完全一致：

| 指标 | 旧实现 | 独立摘要 |
| --- | ---: | ---: |
| 摘要调用 | 24 | 17 |
| 摘要 history 输入字节 | 463751 | 253668 |
| 最终保留消息 | 8 | 8 |

新实现 1 次稳定摘要、16 次活跃摘要；每轮真实进度统计不变。该回放量测的是摘要函数的 history 输入，不是 HTTP 请求总字节。实际 Agent 的 40 轮本地 HTTP 回放仍为 99 次请求（80 主模型 + 19 摘要），摘要请求体累计从上一版 339549 降至 264351 字节，40 次提交全部成功；第 41 轮索引恢复没有全量日志读取，第 42 轮完整接口返回 210 条规范化消息。新增真实 Agent 协议测试确认两轮各两次成功读取、一次失败，第二轮复用前一轮任务摘要，无稳定历史摘要调用。48 次单轮工具载荷回放仍保留 113176 字节活跃结果及 628816 字节磁盘结果。

```bash
node benchmarks/summary-scope-replay.mjs
node benchmarks/active-session-replay.mjs
```

以上为固定输出替身，未验证真实在线模型质量、token 费用或延迟。摘要晋升为有条件优化，不能保证所有工作负载都减少推理次数；单轮消息骨架和非归档内容尚未物理分页回收。

## Star History

<a href="https://www.star-history.com/#Narcooo/inkos&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Narcooo/inkos&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Narcooo/inkos&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Narcooo/inkos&type=date&legend=top-left" />
 </picture>
</a>


## Skills Download History

<div align="center">

<a href="https://skill-history.com/narcooo/inkos">
  <img alt="Skills Download History" src="https://skill-history.com/chart/narcooo/inkos.svg" />
</a>

</div>

## Repobeats

![Repobeats analytics image](https://repobeats.axiom.co/api/embed/024114415c1505a8c27fb121e3b392524e48f583.svg)

## Contributors

<a href="https://github.com/Narcooo/inkos/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Narcooo/inkos" alt="Contributors" />
</a>

## 致谢

InkOS 的 agent 运行时构建在 [pi](https://github.com/badlogic/pi-mono)（`@mariozechner/pi-ai` 与 `@mariozechner/pi-agent-core`，作者 Mario Zechner）之上。感谢 pi 提供的扎实底座。

本开源项目已链接并认可 [LINUX DO](https://linux.do/) 社区，感谢社区成员的反馈、测试与讨论。

## 许可证

[AGPL-3.0](LICENSE)
