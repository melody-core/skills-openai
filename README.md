# melody-skills-openai-core

基于 [openai](https://github.com/openai/openai-node) 的 **Node.js 版** Agent Skill 框架，实现渐进式披露（Progressive Disclosure）架构。

## 特性

- **三层渐进式披露**
  - Layer 1（元数据）：始终加载，用于技能发现与匹配
  - Layer 2（指令）：按需加载，技能被选中时加载
  - Layer 3（资源）：按条件加载 References 与 Scripts

- **SKILL.md 格式**：基于 Markdown + YAML frontmatter 的技能定义
- **智能 Reference 加载**：explicit / implicit / always 三种模式，可配合 LLM 选择
- **自动发现**：从 `references/` 目录自动发现参考文档
- **脚本执行**：支持通过 `[INVOKE:name]` 触发脚本（Node 本地执行）
- **OpenAI 兼容**：使用 OpenAI API（或兼容接口）
- **自动技能调用**：根据用户查询匹配并注入对应技能

## 安装

```bash
npm install @melody-core/skills-openai
```

## 快速开始

### 使用 SkillAgent（推荐）

```javascript
const { createAgent } = require('@melody-core/skills-openai');

async function main() {
  const agent = await createAgent({
    skillPaths: ['./skills'],
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
  });

  const response = await agent.chat('帮我总结会议');
  console.log(response.content);
  console.log('使用的技能:', response.skillUsed);
}

main();
```

### 使用 SkillManager（底层 API）

```javascript
const path = require('path');
const { SkillManager } = require('@melody-core/skills-openai');

async function main() {
  const manager = new SkillManager({
    skillPaths: [path.resolve('./skills')],
  });

  await manager.discover();
  const matched = manager.match('summarize meeting');

  if (matched.length > 0) {
    await manager.loadInstruction(matched[0].metadata.name);
    console.log(matched[0].instruction?.content);
  }
}

main();
```

## 技能目录结构

```
my-skill/
├── SKILL.md           # 技能定义（必需）
├── references/        # 参考文档
│   └── handbook.md
└── scripts/          # 可执行脚本
    └── upload.js
```

## SKILL.md 格式

```markdown
---
name: meeting-summary
description: 用结构化格式总结会议
version: 1.0.0
triggers:
  - "summarize meeting"
  - "会议总结"

references:
  - path: references/finance-handbook.md
    condition: "当内容涉及财务或预算时"
    mode: explicit
  - path: references/safety-policy.md
    mode: always

scripts:
  - name: upload
    path: scripts/upload.js
    description: 将总结上传到云存储
---

# 会议总结技能

你是一名专业的会议助手...
```

## Reference 加载模式

| 模式       | 行为 |
|------------|------|
| `explicit` | 带条件，由 LLM 判断是否满足条件后加载 |
| `implicit` | 无条件，由 LLM 决定是否对当前查询有用（默认） |
| `always`   | 始终加载（如安全规范、规格说明） |

## 环境变量

```bash
export OPENAI_API_KEY=your-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1  # 可选
export OPENAI_MODEL=gpt-4  # 可选
```

## API 概览

- **createAgent(options)**：创建并初始化 SkillAgent
- **SkillAgent**：自动根据查询选择技能并对话
  - `initialize()`：发现技能
  - `chat(content, options)`：发送消息并得到 AgentResponse
  - `selectSkill(name)` / `deselectSkill()`：手动选择/取消技能
  - `reset()`：清空对话上下文
- **SkillManager**：技能发现、加载、匹配、执行脚本
  - `discover()`：发现所有技能（仅 Layer 1）
  - `match(query, limit)`：匹配技能
  - `loadInstruction(name)`：加载指令（Layer 2）
  - `loadReference(skillName, refPath)`：加载参考（Layer 3）
  - `executeScript(skillName, scriptName, options)`：执行脚本
- **OpenAICompatClient**：OpenAI 兼容的 LLM 客户端

## 与 Python 版 OpenSkills 的对应关系

| OpenSkills (Python)     | melody-skills-openai-core (Node) |
|-------------------------|-----------------------------------|
| `create_agent()`         | `createAgent()`                   |
| `SkillAgent`             | `SkillAgent`                      |
| `SkillManager`           | `SkillManager`                    |
| `OpenAICompatClient`     | `OpenAICompatClient`              |
| `AgentResponse`          | `AgentResponse`                   |
| SKILL.md / references/   | 相同目录与 frontmatter 约定       |

当前 Node 版**未实现**：沙箱执行（AIO Sandbox）、流式 `chat_stream`、Reference 摘要与召回等高级特性，可按需在后续迭代中补齐。

## 示例

仓库内提供示例技能与运行脚本：

```bash
# 先构建
npm run build
# 设置 API Key 后运行
export OPENAI_API_KEY=your-api-key
node examples/demo.js "帮我总结会议：今天讨论了 Q1 目标..."
```

示例技能目录：`examples/skills/meeting-summary/`（SKILL.md + references/ + scripts/）。

## License

Apache-2.0
