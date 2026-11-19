# 出版级 Matplotlib 样式

## 解决什么问题

投稿图被打回，最常见的原因不是数据不好看，而是中文全是方块、负号变成乱码、导出只有 96 DPI、上边框和右边框还在——一眼就像 PPT 截图。`pub_style.py` 用一份 rcParams 把中文字体回退、300 DPI、去边框、色盲友好配色和字号层级一次配好：画图前调一次 `apply_style()`，所有新图自动生效；`save()` 负责建目录、补扩展名并按 300 DPI 落盘。

## 使用步骤

1. 下载 `files/pub_style.py` 放进项目，只依赖 `matplotlib`（无需其他包）。

2. 画图前套用样式，再用 `save()` 导出：

```python
import matplotlib.pyplot as plt
from pub_style import apply_style, save

apply_style()                                # 9pt 正文、300 DPI、去上/右边框、Okabe-Ito 配色

fig, ax = plt.subplots(figsize=(3.5, 2.6))   # 双栏期刊单图宽度一般 3.4–3.6 英寸
ax.plot([0, 1, 2, 3], [0.2, 0.9, 0.4, 0.7], label="实验组")
ax.set_xlabel("时间 / s")
ax.set_ylabel("响应幅值")
ax.legend()
save(fig, "figures/fig1.png")                # 自动创建 figures/，PNG 为 300 DPI
```

3. 期刊指定了字体或字号重置：

```python
apply_style(base_size=8, font_family=["Arial"])   # Arial 可用则排第一，缺失自动跳过
```

4. 多子图拼版时加 A/B/C 标签（SimHei 没有粗体字形，显式传 `weight="normal"` 避免 findfont 警告）：

```python
from pub_style import panel_label

panel_label(ax, "A", weight="normal")
```

5. 跑自检，确认本机字体命中情况并导出一张示例图：

```
python files/pub_style.py
```

## 参数说明

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `apply_style(*, base_size=9, dpi=300, font_family=None, palette=PALETTE, grid=False)` | 关键字参数 | 写入全局 rcParams 并返回本次设置字典。`base_size` 正文字号（pt）；`dpi` 导出分辨率；`font_family` 优先字体列表，`None` 时按 SimHei → Microsoft YaHei → Noto Sans CJK SC 顺序找可用字体；`grid` 默认关网格。 |
| `save(fig, path, *, dpi=None, transparent=False, close=False)` | Figure / 路径 | 保存图片，自动补 `.png` 扩展名、创建父目录；`dpi=None` 时用 rcParams 的 300。支持 png/pdf/svg/jpg/tif/eps，返回 `Path`。 |
| `despine(ax, *, keep=("left", "bottom"), grid_axis=None)` | Axes | 对已有的 axes 手动去边框；`grid_axis="y"` 可顺手打开水平网格。 |
| `panel_label(ax, label, *, x=-0.14, y=1.04, fontsize=None, weight="bold")` | Axes / str | 在子图左上角放 A/B/C 分图标签，坐标用 axes 比例。 |
| `current_style()` | — | 返回当前关键 rcParams 快照，便于在脚本里打印核对。 |

## 输出示例

```
[字体] 使用 SimHei（CJK 可用：是）
[样式] 300 DPI | 去上/右边框 | 8 色色盲友好循环 | 基准 9pt
[导出] C:\Users\you\AppData\Local\Temp\pub_style_demo\figure.png（143 KB，300 DPI）
```

导出的图长这样：双面板、无上/右边框、中文标题正常、误差棒带 cap、配色为 Okabe–Ito 色盲友好色板。

## 注意事项

- **字体回退只负责“挑第一个装了的”**。候选字体（SimHei、Microsoft YaHei、Noto Sans CJK SC 等）都不存在时会退到 DejaVu Sans，中文仍会显示成方块——需要先装中文字体，或把图内文字改成英文。
- **300 DPI 只影响位图**。PDF/SVG 是矢量，分辨率参数不起作用；脚本已设置 `pdf.fonttype=42`（TrueType 嵌入），投稿系统一般不会再报“字体未嵌入”。
- **`apply_style()` 改的是全局 rcParams**。只想让某张图生效，用 `with plt.rc_context(): apply_style(); ...` 把改动限制在上下文内。
- **SimHei 没有粗体字形**。`panel_label` 默认 `weight="bold"` 在 SimHei 下会触发一次 findfont 警告（不影响出图），追求干净输出就传 `weight="normal"`。
- **颜色循环只有 8 色**。超过 8 条线会重复；类别多时显式 `palette[:k]` 取色，并配合 marker/线型区分，保证黑白打印也能分辨。
- **图宽按目标栏宽设**。双栏期刊单图约 3.5 in、跨栏图约 7 in；字号低于 7 pt 印刷后基本看不清。
