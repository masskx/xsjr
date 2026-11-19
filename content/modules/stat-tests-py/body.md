# 统计检验选择与执行工具包

## 解决什么问题

写论文和组会汇报时，反复要回答三个问题：这批数据该用 t 检验还是 Mann-Whitney U？p 值报了要不要再报效应量？APA 报告串怎么拼才不会被审稿人挑格式。这个脚本把「研究设计 → 检验方法」的判断规则写成 `recommend()`，并让 `auto_test()` 一次算出统计量、p 值、效应量和 APA 报告串。本机没装 scipy 时，t 检验、单因素/重复测量方差分析、Mann-Whitney U 会自动切到纯 numpy 实现，不会卡在 `ImportError` 上。

## 使用步骤

1. 下载 `files/stat_tests.py` 放到项目里，单文件、无安装步骤；只需 `numpy`，`scipy` 可选。

2. 先确认研究设计对应的检验（不接触数据，也不依赖 scipy）：

```python
from stat_tests import recommend

r = recommend(n_groups=2, paired=False, normal=False)
print(r.test)            # Mann-Whitney U 检验
print(r.effect_size)     # rank-biserial r
print(r.scipy_required)  # False（无 scipy 时用正态近似）
print(r.reason)          # 选择依据，可直接写进方法部分
```

3. 两组数据一次算完，打印 APA 报告串：

```python
import numpy as np
from stat_tests import auto_test

treatment = np.array([12.1, 11.4, 13.0, 10.8, 12.6, 11.9, 12.2, 12.8])
control   = np.array([9.8, 10.4, 9.1, 10.9, 9.6, 10.2, 9.9, 10.5])

res = auto_test(treatment, control, paired=False, normal=True)
print(res.report())
# Welch 独立样本 t 检验：t(13.17) = 6.24, p < .001, Cohen's d = 3.12, 95% CI [1.34, 2.76]（scipy 引擎）

print(res.p, res.effect_size)   # 2.84e-05 3.12
print(res.notes)                # ["Welch 不要求方差齐性，df 为小数属正常。", "Hedges' g = 2.95"]
```

4. 三组及以上用 `auto_anova`；重复测量传二维矩阵（行 = 被试，列 = 条件）：

```python
from stat_tests import auto_anova

res = auto_anova([group_a, group_b, group_c])                        # 单因素 ANOVA
res = auto_anova(np.column_stack([t1, t2, t3]), repeated=True)        # 重复测量 ANOVA
print(res.report())
```

5. 跑自检，确认本机 scipy 状态和几个典型设计的输出：

```
python files/stat_tests.py
```

## 参数说明

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `recommend(n_groups, paired, normal)` | int / bool / bool | 只做推荐：`n_groups` 为 1、2 或 ≥3；`paired` 表示配对/重复测量；`normal` 表示近似正态。返回 `Recommendation(test, effect_size, scipy_required, fallback, reason)`。 |
| `auto_test(x, y=None, *, paired=False, normal=True, equal_var=False, popmean=0.0)` | 序列 | 一站式检验。`y=None` 时做单样本 t 检验（与 `popmean` 比较）；`paired=True` 时要求 x、y 等长且顺序对应；`equal_var=True` 才用 Student t，默认 Welch。 |
| `auto_anova(groups, *, normal=True, repeated=False)` | 列表 / 二维数组 | `groups` 为各组观测值的列表；`repeated=True` 时传行=被试、列=条件的二维矩阵。 |
| `res.p` / `res.effect_size` | float | 直接用数值时读这两个字段，`res.as_dict()` 可序列化成 JSON。 |
| `res.apa()` | str | 纯统计串，如 `t(28) = 2.31, p = .021, d = 0.85`。 |

## 输出示例

```
[环境] numpy 2.5.3 | scipy 已安装
[推荐] 两组独立·正态 → Welch 独立样本 t 检验
[推荐] 三组重复·非正态 → Friedman 检验
[独立样本] Welch 独立样本 t 检验：t(55.85) = 3.01, p = .004, Cohen's d = 0.79, 95% CI [0.83, 4.15]（scipy 引擎）
[配对样本] 配对样本 t 检验：t(29) = 5.94, p < .001, Cohen's d_z = 1.09, 95% CI [0.73, 1.50]（scipy 引擎）
[三组 ANOVA] 单因素方差分析：F(2, 57) = 6.01, p = .004, η² = 0.17（numpy 引擎）
[Mann-Whitney] Mann-Whitney U 检验：U = 615.00, p = .002, rank-biserial r = 0.46（scipy 引擎）
[Wilcoxon] Wilcoxon 符号秩检验：W = 24.00, p < .001, rank-biserial r = 0.90（scipy 引擎）
```

没装 scipy 时，最后一行会变成捕获到的安装提示：

```
[非参数校验] 已捕获：Wilcoxon 符号秩检验 需要 scipy 才能得到精确 p 值。安装：pip install scipy
```

## 注意事项

- **缺失值不会被自动删除**。任何输入含 `NaN`/`inf` 会直接抛 `ValueError`，请先按你的缺失值方案（剔除、插补）处理完再传入。
- **配对数据顺序必须一一对应**。`paired_t`/`wilcoxon` 只检查长度，不帮你对齐 ID；先按被试 ID 排序再传入。
- **Welch 的自由度是小数**（如 55.85），这是公式结果而非 bug；APA 里照实写即可。
- **无 scipy 时的近似边界**：Mann-Whitney U 用带并列校正的正态近似，每组 n ≥ 8 时才比较稳；小样本要精确 p 值请 `pip install scipy`。Wilcoxon（含单样本）、Kruskal-Wallis、Friedman 没有 numpy 回退，会抛 `MissingScipyError` 并给出 pip 命令。
- **单样本且 `normal=False` 时**走 Wilcoxon 符号秩：与 `popmean` 的比较通过先平移数据（`x - popmean`）再与 0 比较实现，同样需要 scipy。
- **多组显著后的事后比较脚本不做**。ANOVA/Kruskal 显著只代表「至少有一组不同」，Tukey HSD、Dunn 检验及多重比较校正需要你另做（脚本在 `notes` 里提醒）。
- **正态性靠你自己判断**。`normal=True` 不会替你跑 Shapiro-Wilk；n < 30 且直方图明显偏态时传 `normal=False`，大样本可依中心极限定理用参数检验。
- **效应量阈值不是硬标准**。Cohen's d 的 0.2/0.5/0.8 只是惯例，报告时要结合领域背景解释。
