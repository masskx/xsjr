## 解决什么问题

投稿前最缺的是一双**不讲情面的眼睛**。同事帮你读，通常只指出措辞问题；自己读，会不知不觉顺着自己的逻辑补全缺口。

这个技能让 Agent 按期刊审稿单的五个维度读你的稿子，输出「可直接改」的批评清单：哪一句论证不成立、哪张图支撑不了结论、哪个基线选得不公平。

## 安装

**Claude Code（用户级）**

```bash
mkdir -p ~/.claude/skills/paper-reviewer-simulator
# 把右侧 SKILL.md 的完整内容保存为：
# ~/.claude/skills/paper-reviewer-simulator/SKILL.md
```

**项目级**：放到仓库的 `.claude/skills/paper-reviewer-simulator/SKILL.md`，仅在该项目生效。

**其他工具**：把 SKILL.md 正文（去掉 frontmatter）作为系统提示粘贴即可，行为一致。

## 使用

装好后直接在对话里说：

```
用审稿人技能评审 @manuscript.md，目标期刊 IEEE TGRS
```

## 验收标准

好的输出应当满足：每条批评都指向具体位置、给出改法、并标注严重程度。如果它只输出「建议加强实验」这类空话，说明你的稿件文本没有给够上下文（方法细节、实验设置、基线选择）。
