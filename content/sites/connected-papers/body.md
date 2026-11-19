## 解决什么问题

开题时最难的不是找到论文，而是判断这个方向到底有哪些绕不开的工作、它们之间是什么关系。Connected Papers 输入一篇种子论文，就把语义相近的文章铺成一张关系图，位置越近代表越相似，颜色深浅对应发表年份，几分钟内就能看清一个领域的奠基文献和最近进展。

## 主要能力

- 以种子论文生成相似文献图，节点大小对应被引次数、颜色对应年份，一眼分辨老文章与新文章。
- Prior Works 视图单列该领域重要的祖先工作，Derivative Works 视图单列综述与近期后续研究。
- 相似度基于共被引（co-citation）与文献耦合（bibliographic coupling）计算，不是简单的引用树。
- 图上点开节点即可查看标题、作者、年份与引用信息，并可导出 BibTeX，直接进文献管理器。
- 支持在列表里按相似度、被引数、年份排序，方便挑出必须精读的那几篇。

## 适合谁用

适合刚进入新方向、要写开题报告或相关工作章节的研究生，也适合需要给课题组快速梳理领域版图的老师。

## 使用提示

- 种子论文要挑领域内被反复引用的中早期代表作；拿刚上线的最新预印本当种子，往往铺不出完整脉络。
- 免费账户每月只能生成 5 张图，用满后会提示已达到免费计划的月度上限，需等下月或升级 Academic / Business 订阅；建议先攒好种子论文再出图。
- 图的数据来自 Semantic Scholar 语料，计算机与生物医学覆盖较好，人文社科和部分工程领域会有缺口，正式引用前仍要回原文核对。

## 核验记录

2026-11-19 核验：首页 https://www.connectedpapers.com 返回 HTTP 200，但该站是单页应用、HTML 中只有标题，故改用抓取前端脚本 https://www.connectedpapers.com/assets/index-DcBynCAl.js 核对；脚本中确认 Free 档写有 5 graphs per month、存在「You have reached the monthly graph limit in the Free plan」的限额提示、另有 Academic 与 Business 两个付费档（按 /month 计价），以及 Prior Works、Derivative Works 视图说明与 Semantic Scholar Paper Corpus（ODC-BY）数据来源。定价页 https://www.connectedpapers.com/pricing 亦返回 200。据此标注「部分免费」、需登录。
