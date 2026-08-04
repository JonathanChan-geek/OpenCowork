import type { RecordedRecipe } from './recipe-types'

function frontmatterValue(value: string): string {
  return JSON.stringify(value)
}

export function renderRecipeSkill(recipe: RecordedRecipe): string {
  const frontmatterDescription = `${recipe.description.trim()}；Recorded browser workflow`
  const recipeJson = JSON.stringify(recipe, null, 2)

  return `---
name: ${recipe.name}
description: ${frontmatterValue(frontmatterDescription)}
---

# ${recipe.title}

这是一次录制得到的浏览器工作流。请严格按下面的线性步骤执行，不增加分支、循环或并行操作。

## 操作契约

1. 若 \`startUrl\` 非空，先用 \`BrowserNavigate\` 打开它；随后按记录顺序复现所有步骤。
2. 使用 \`BrowserNavigate\`、\`BrowserClick\` 和 \`BrowserType\` 执行动作，并用 \`BrowserSnapshot\` 观察当前页面和确认结果。
3. 点击或输入前优先使用记录的 \`selector\`。若选择器失效，先调用 \`BrowserSnapshot\` 重新定位，并参考该步骤的 \`hint\`，不要盲目点击相似元素。
4. 遇到 \`{{PASSWORD}}\` 时，必须向用户索取或使用已获授权的密码；绝不把真实密码写回配方或对话记录。
5. 遇到确认门或危险操作时，照常停下等待用户审批，不得因本工作流而绕过确认。
6. 同一步骤连续失败两次后立即停止，并向用户说明失败步骤、页面状态与已尝试的方法。

## 结构化配方

下面的 JSON 是完整录制数据，供后续确定性回放器读取。当前仅作为执行配方使用。

\`\`\`json
${recipeJson}
\`\`\`
`
}
