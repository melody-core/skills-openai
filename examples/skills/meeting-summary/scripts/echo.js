#!/usr/bin/env node
// 示例脚本：从 stdin 读取并原样输出（用于演示 [INVOKE:echo]）
const chunks = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = chunks.join('');
  try {
    const parsed = JSON.parse(input);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(input || '[empty]');
  }
});
