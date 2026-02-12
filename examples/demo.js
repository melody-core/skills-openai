/**
 * 示例：使用 createAgent 与 meeting-summary 技能对话
 *
 * 运行前请设置环境变量 OPENAI_API_KEY
 *   export OPENAI_API_KEY=your-api-key
 *   node examples/demo.js
 */

const path = require('path');
const { createAgent } = require('../dist');

async function main() {
  const skillDir = path.join(__dirname, 'skills');
  console.log('Skill path:', skillDir);

  const agent = await createAgent({
    // 如果需要使用自定义的apiKey，可以在这里设置
    apiKey: process.env.API_KEY,
    // 如果需要使用自定义的baseURL，可以在这里设置
    // baseURL: process.env.BASE_URL,
    defaultHeaders: {
      'Content-Type': 'application/json',
      // 如果需要使用自定义的Authorization，可以在这里设置
      // 'Authorization': process.env.AUTHORIZATION_TOKEN
    },
    skillPaths: [skillDir],
    model: process.env.OPENAI_MODEL || 'gpt-4',
    autoSelectSkill: true,
    autoLoadReferences: true,
    autoExecuteScripts: false,
  });

  console.log('已发现技能:', agent.availableSkills);

  const query = process.argv[2] || '帮我总结会议：今天讨论了 Q1 目标和预算，决定增加 10 万市场费用，张三负责在下周五前提交方案。';
  console.log('\n用户:', query);
  console.log('\n... 调用 LLM ...\n');

  const response = await agent.chat(query, { temperature: 0.5 });

  console.log('回复:', response.content);
  console.log('\n使用的技能:', response.skillUsed);
  console.log('已加载参考:', response.referencesLoaded);
  console.log('已执行脚本:', response.scriptsExecuted);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
