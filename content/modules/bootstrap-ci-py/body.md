# Bootstrap 置信区间与效应量

## 解决什么问题

样本量二三十、分布明显偏态，或者你要报告的根本不是均值（中位数、相关系数）时，t 分布的正态近似会给出偏窄或偏位的置信区间。这个脚本用重抽样直接对统计量的经验分布取分位数，一次给出 percentile / BCa 置信区间，并同时算出 Cohen's d、Hedges' g 与 Cliff's delta 三个效应量。全部只用标准库 + numpy，装不上 scipy 的服务器或受限环境也能直接跑。

## 使用步骤

1. 下载 `files/bootstrap_ci.py`，放到项目里；只需 `numpy`。

2. 单个统计量的置信区间（固定 `seed` 才能复现）：

```python
from bootstrap_ci import bootstrap_ci, format_estimate

r = bootstrap_ci(scores, statistic="mean", n_boot=10000, method="bca", seed=42)
print(format_estimate(r["estimate"], r["ci_low"], r["ci_high"], label="mean"))
# mean = 0.445 [95% CI 0.258, 0.619]
print(r["se"], r["method"])   # bootstrap 标准误；method 原样返回
```

3. 中位数与相关系数（相关按配对整体重抽样，保持配对结构）：

```python
from bootstrap_ci import bootstrap_ci, bootstrap_corr

r = bootstrap_ci(scores, statistic="median", method="percentile", seed=42)
r = bootstrap_corr(x, y, method="pearson", ci_method="bca", seed=42)
print(r["estimate"], r["ci_low"], r["ci_high"])   # 0.401 0.268 0.514
```

4. 两组比较，一次拿到均值差、d、g、δ 及各自 95% 置信区间：

```python
from bootstrap_ci import compare_groups

r = compare_groups(exp_group, ctrl_group, n_boot=10000, seed=42)
print(r["mean_diff"], r["mean_diff_ci"])          # 0.345 (0.048, 0.652)
print(r["cohens_d"], r["cohens_d_ci"])            # 0.31 (0.05, 0.59)
print(r["cliffs_delta"], r["cliffs_delta_magnitude"])  # 0.16 小
```

5. 跑自检：

```
python files/bootstrap_ci.py
```

## 参数说明

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `bootstrap_ci(data, statistic="mean", *, n_boot=10000, ci=0.95, method="bca", seed=None)` | 一维序列 | `statistic` 只支持 `"mean"` / `"median"`；`method` 为 `"bca"`（默认，偏斜分布更准）、`"percentile"`、`"basic"`；返回 `estimate`、`ci_low`、`ci_high`、`se`、`method` 等。 |
| `bootstrap_corr(x, y, *, method="pearson", n_boot=10000, ci=0.95, ci_method="bca", seed=None)` | 两个等长序列 | `method` 支持 `"pearson"` / `"spearman"`；`ci_method` 含义同 `bootstrap_ci` 的 `method`。 |
| `compare_groups(x, y, *, n_boot=10000, ci=0.95, seed=None)` | 两组序列 | 返回 `mean_diff`、`cohens_d`、`hedges_g`、`cliffs_delta`、三个 `*_ci` 元组、`cliffs_delta_magnitude`；CI 统一用 percentile 法。 |
| `cohens_d(x, y=None, *, hedges=False)` | 序列 | `y=None` 时为单样本 d（除以 0 均值）；两组时用合并标准差；`hedges=True` 返回 Hedges' g。 |
| `cliffs_delta(x, y)` | 序列 | P(x > y) − P(x < y)，并列不计；O(n log m)，不做 n×m 全比较。 |
| `seed` | int / None | 随机种子；论文结果需要复现实验时务必固定。 |

## 输出示例

```
[均值] mean = 0.445 [95% CI 0.261, 0.618]（BCa，B=10000）
[中位数] median = 0.560 [95% CI 0.319, 0.785]（percentile，B=10000）
[相关] Pearson r = 0.401 [95% CI 0.272, 0.514]（BCa，n=150）
[两组] 均值差 0.345 [95% CI 0.052, 0.650] | d = 0.31 [0.05, 0.59] | delta = 0.16（小）
```

## 注意事项

- **`n_boot` 至少 100，报告建议 ≥ 2000**。默认 10000 在 n≈100 时约 1 秒，够用；先跑小 `n_boot` 调试再放大。
- **BCa 比 percentile 慢**：BCa 要做 n 次留一法（jackknife），n > 5000 时明显变慢，这种规模用 `method="percentile"` 更划算。
- **重抽样假设观测独立同分布**。时间序列、重复测量、聚类抽样不能直接按行重抽样，否则 CI 会偏窄；请改用 block bootstrap 或按被试聚类重抽样。
- **`compare_groups` 的 CI 用 percentile 法**。d 与 δ 的重抽样分布高度偏斜，BCa 的加速常数在两组情形下不稳定，所以统一用百分位法并在返回值的 `method` 里注明。
- **Cliff's delta 的 0.147 / 0.33 / 0.474 是经验阈值**（Romano et al., 2006），不是领域硬标准；报告时给出原始 δ 和样本量更稳妥。
- **相关要求成对数据且无缺失**。x、y 长度不等、含 `NaN`、或任一变量近似常数都会抛 `ValueError`，脚本不做隐式删除。
- **bootstrap 不是万能药**。n < 10 时任何重抽样方法的 CI 都不可靠，此时应报告原始数据和描述统计，而不是强行给区间。
