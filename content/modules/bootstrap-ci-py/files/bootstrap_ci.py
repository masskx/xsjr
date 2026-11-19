"""Bootstrap 置信区间与效应量（slug: bootstrap-ci-py）。

只依赖标准库 + numpy，不依赖 scipy：

* Bootstrap 置信区间：percentile（百分位）、BCa（偏差校正加速）、basic（基本法）
* 支持的统计量：均值、中位数、Pearson / Spearman 相关系数
* 效应量：Cohen's d（单样本 / 两独立样本，可选 Hedges 校正）、Cliff's delta
* 两组比较：均值差、d、δ 的点估计 + bootstrap 置信区间

为什么不用 t 分布：样本量小、分布偏斜、或统计量不是均值（如中位数、相关系数）时，
bootstrap 直接对“重抽样分布”取分位数，比正态近似更稳。

用法
----
>>> from bootstrap_ci import bootstrap_ci, compare_groups
>>> r = bootstrap_ci(scores, statistic="mean", n_boot=10000, seed=0)
>>> print(r["estimate"], r["ci_low"], r["ci_high"])
>>> compare_groups(group_a, group_b, seed=0)
"""

from __future__ import annotations

import math
from statistics import NormalDist
from typing import Any, Iterable

import numpy as np

__all__ = [
    "rankdata",
    "pearson",
    "spearman",
    "cohens_d",
    "cliffs_delta",
    "cliffs_delta_magnitude",
    "bootstrap_ci",
    "bootstrap_corr",
    "compare_groups",
    "format_estimate",
]

ArrayLike = Iterable[float] | np.ndarray
_METHODS = ("percentile", "bca", "basic")
_STATS = ("mean", "median")


# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------


def _as_1d(x: ArrayLike, name: str = "x", min_n: int = 3) -> np.ndarray:
    arr = np.asarray(x, dtype=float).ravel()
    if arr.size < min_n:
        raise ValueError(f"{name} 至少需要 {min_n} 个观测值，当前 {arr.size} 个")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} 含 NaN 或无穷值，请先剔除或插补")
    return arr


def rankdata(a: ArrayLike) -> np.ndarray:
    """平均秩（并列取均值），与 scipy.stats.rankdata 的 'average' 一致。"""
    arr = np.asarray(a, dtype=float).ravel()
    order = np.argsort(arr, kind="mergesort")
    ranks = np.empty(arr.size, dtype=float)
    ranks[order] = np.arange(1, arr.size + 1, dtype=float)
    sorted_a = arr[order]
    i = 0
    while i < arr.size:
        j = i
        while j + 1 < arr.size and sorted_a[j + 1] == sorted_a[i]:
            j += 1
        if j > i:
            ranks[order[i : j + 1]] = (i + j + 2) / 2.0
        i = j + 1
    return ranks


def pearson(x: ArrayLike, y: ArrayLike) -> float:
    """Pearson 相关系数；任一变量无变异时抛 ValueError。"""
    a = _as_1d(x, "x", min_n=3)
    b = _as_1d(y, "y", min_n=3)
    if a.size != b.size:
        raise ValueError("相关系数要求 x、y 长度相同且一一配对")
    xc = a - a.mean()
    yc = b - b.mean()
    denom = math.sqrt(float((xc**2).sum()) * float((yc**2).sum()))
    if denom == 0:
        raise ValueError("变量无变异，相关系数无定义")
    return float((xc * yc).sum() / denom)


def spearman(x: ArrayLike, y: ArrayLike) -> float:
    """Spearman 秩相关（对 x、y 分别取平均秩后算 Pearson）。"""
    a = _as_1d(x, "x", min_n=3)
    b = _as_1d(y, "y", min_n=3)
    if a.size != b.size:
        raise ValueError("相关系数要求 x、y 长度相同且一一配对")
    return pearson(rankdata(a), rankdata(b))


# ---------------------------------------------------------------------------
# 效应量
# ---------------------------------------------------------------------------


def cohens_d(x: ArrayLike, y: ArrayLike | None = None, *, hedges: bool = False) -> float:
    """Cohen's d。

    * ``y is None``：单样本 d = (mean - 0) / sd（或需自行减去的总体均值）。
    * 两组：合并标准差 d = (mean_x - mean_y) / s_pooled。

    ``hedges=True`` 时乘小样本校正因子，得到 Hedges' g。
    """
    a = _as_1d(x, "x", min_n=2)
    if y is None:
        sd = float(a.std(ddof=1))
        if sd == 0:
            raise ValueError("数据无变异，Cohen's d 无定义")
        d = float(a.mean()) / sd
        if hedges:
            d *= 1.0 - 3.0 / (4.0 * a.size - 5.0)
        return d

    b = _as_1d(y, "y", min_n=2)
    n1, n2 = a.size, b.size
    s1, s2 = float(a.std(ddof=1)), float(b.std(ddof=1))
    pooled = math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2))
    if pooled == 0:
        raise ValueError("两组均无变异，Cohen's d 无定义")
    d = (float(a.mean()) - float(b.mean())) / pooled
    if hedges:
        d *= 1.0 - 3.0 / (4.0 * (n1 + n2) - 9.0)
    return float(d)


def cliffs_delta(x: ArrayLike, y: ArrayLike) -> float:
    """Cliff's delta：P(x > y) - P(x < y)，取值 [-1, 1]，并列不计入。

    复杂度 O(n log m)：对 y 排序后用二分计数，不做 n×m 全比较。
    """
    a = _as_1d(x, "x", min_n=2)
    b = _as_1d(y, "y", min_n=2)
    ys = np.sort(b)
    left = np.searchsorted(ys, a, side="left")  # b < a 的个数
    right = np.searchsorted(ys, a, side="right")  # b <= a 的个数
    greater = float(left.sum())
    less = float(b.size * a.size - right.sum())
    return (greater - less) / (a.size * b.size)


def cliffs_delta_magnitude(delta: float) -> str:
    """按 Romano et al. (2006) 的经验阈值给出量级描述。"""
    d = abs(float(delta))
    if d < 0.147:
        return "可忽略"
    if d < 0.33:
        return "小"
    if d < 0.474:
        return "中等"
    return "大"


# ---------------------------------------------------------------------------
# Bootstrap 核心
# ---------------------------------------------------------------------------


def _check_args(n_boot: int, ci: float) -> None:
    if n_boot < 100:
        raise ValueError("n_boot 至少 100；报告用建议 >= 2000，默认 10000")
    if not 0.0 < ci < 1.0:
        raise ValueError("ci 必须在 (0, 1) 之间，例如 0.95")


def _resample_batches(
    data: np.ndarray, stat_fn: Any, n_boot: int, rng: np.random.Generator
) -> np.ndarray:
    """对一维样本做批量重抽样，stat_fn(arr, axis=1) 必须支持按行计算。"""
    n = data.size
    out = np.empty(n_boot, dtype=float)
    batch = max(1, min(1024, n_boot))
    for start in range(0, n_boot, batch):
        k = min(batch, n_boot - start)
        idx = rng.integers(0, n, size=(k, n))
        out[start : start + k] = stat_fn(data[idx], axis=1)
    return out


def _jackknife(data: np.ndarray, stat_fn: Any) -> np.ndarray:
    """留一法（jackknife）统计量，用于 BCa 的加速常数。"""
    n = data.size
    out = np.empty(n, dtype=float)
    for i in range(n):
        out[i] = stat_fn(np.delete(data, i))
    return out


def _percentile_interval(boot: np.ndarray, ci: float) -> tuple[float, float]:
    alpha = 1.0 - ci
    lo, hi = np.quantile(boot, [alpha / 2.0, 1.0 - alpha / 2.0])
    return float(lo), float(hi)


def _basic_interval(theta: float, boot: np.ndarray, ci: float) -> tuple[float, float]:
    alpha = 1.0 - ci
    q_lo, q_hi = np.quantile(boot, [alpha / 2.0, 1.0 - alpha / 2.0])
    return float(2.0 * theta - q_hi), float(2.0 * theta - q_lo)


def _bca_interval(
    theta: float, boot: np.ndarray, jack: np.ndarray, ci: float
) -> tuple[float, float]:
    """BCa：偏差校正 z0 + 加速常数 a，再对分位点做单调变换。"""
    alpha = 1.0 - ci
    norm = NormalDist()
    b = boot.size
    # 偏差校正：bootstrap 分布中落在点估计左侧的比例（并列按 1/2 计）
    prop = (float(np.sum(boot < theta)) + 0.5 * float(np.sum(boot == theta))) / b
    prop = min(max(prop, 0.5 / b), 1.0 - 0.5 / b)
    z0 = norm.inv_cdf(prop)

    # 加速常数：留一法统计量的三阶矩
    jack_mean = float(jack.mean())
    diffs = jack_mean - jack
    denom = 6.0 * float((diffs**2).sum()) ** 1.5
    a = float((diffs**3).sum()) / denom if denom > 0 else 0.0

    def adjust(z: float) -> float:
        shrink = 1.0 - a * (z0 + z)
        if abs(shrink) < 1e-12:
            return 0.5
        q = norm.cdf(z0 + (z0 + z) / shrink)
        return min(max(q, 0.0), 1.0)

    q_lo = adjust(norm.inv_cdf(alpha / 2.0))
    q_hi = adjust(norm.inv_cdf(1.0 - alpha / 2.0))
    lo, hi = np.quantile(boot, [q_lo, q_hi])
    if not np.isfinite(lo) or not np.isfinite(hi):
        return _percentile_interval(boot, ci)
    if lo > hi:  # 极端偏斜时调整后区间倒挂，退回百分位法
        return _percentile_interval(boot, ci)
    return float(lo), float(hi)


def _summarize(
    name: str,
    theta: float,
    boot: np.ndarray,
    lo: float,
    hi: float,
    method: str,
    ci: float,
    n_boot: int,
) -> dict[str, Any]:
    return {
        "statistic": name,
        "estimate": float(theta),
        "ci_low": float(lo),
        "ci_high": float(hi),
        "ci_level": float(ci),
        "method": method,
        "n_boot": int(n_boot),
        "se": float(np.std(boot, ddof=1)),
    }


def bootstrap_ci(
    data: ArrayLike,
    statistic: str = "mean",
    *,
    n_boot: int = 10000,
    ci: float = 0.95,
    method: str = "bca",
    seed: int | None = None,
) -> dict[str, Any]:
    """单样本统计量的 bootstrap 置信区间。

    Parameters
    ----------
    data : 一维观测值
    statistic : "mean" | "median"
    n_boot : int
        重抽样次数；报告用 >= 2000，默认 10000。
    ci : float
        置信水平，默认 0.95。
    method : "bca" | "percentile" | "basic"
        BCa 对偏斜分布更准；percentile 最直观；basic 适合有偏校正。
    seed : int | None
        随机种子；复现结果时必填。

    Returns
    -------
    dict
        ``estimate``、``ci_low``、``ci_high``、``se``、``method`` 等。
    """
    if statistic not in _STATS:
        raise ValueError(f"statistic 只支持 {_STATS}，收到 {statistic!r}")
    if method not in _METHODS:
        raise ValueError(f"method 只支持 {_METHODS}，收到 {method!r}")
    _check_args(n_boot, ci)
    arr = _as_1d(data, "data")
    stat_fn = np.mean if statistic == "mean" else np.median
    theta = float(stat_fn(arr))
    rng = np.random.default_rng(seed)
    boot = _resample_batches(arr, stat_fn, n_boot, rng)

    if method == "percentile":
        lo, hi = _percentile_interval(boot, ci)
    elif method == "basic":
        lo, hi = _basic_interval(theta, boot, ci)
    else:
        lo, hi = _bca_interval(theta, boot, _jackknife(arr, stat_fn), ci)
    return _summarize(statistic, theta, boot, lo, hi, method, ci, n_boot)


def _corr_rows(
    xs: np.ndarray, ys: np.ndarray, method: str
) -> np.ndarray:
    """按行批量计算相关系数（xs/ys 形状为 [批次, n]）。"""
    if method == "spearman":
        xs = np.apply_along_axis(rankdata, 1, xs)
        ys = np.apply_along_axis(rankdata, 1, ys)
    xc = xs - xs.mean(axis=1, keepdims=True)
    yc = ys - ys.mean(axis=1, keepdims=True)
    denom = np.sqrt((xc**2).sum(axis=1) * (yc**2).sum(axis=1))
    with np.errstate(divide="ignore", invalid="ignore"):
        return (xc * yc).sum(axis=1) / denom


def bootstrap_corr(
    x: ArrayLike,
    y: ArrayLike,
    *,
    method: str = "pearson",
    n_boot: int = 10000,
    ci: float = 0.95,
    ci_method: str = "bca",
    seed: int | None = None,
) -> dict[str, Any]:
    """相关系数的 bootstrap 置信区间（按配对整体重抽样，保持配对结构）。"""
    if method not in ("pearson", "spearman"):
        raise ValueError("method 只支持 'pearson' 或 'spearman'")
    if ci_method not in _METHODS:
        raise ValueError(f"ci_method 只支持 {_METHODS}")
    _check_args(n_boot, ci)
    a = _as_1d(x, "x")
    b = _as_1d(y, "y")
    if a.size != b.size:
        raise ValueError("x、y 长度必须相同（配对数据）")
    if a.size < 4:
        raise ValueError("相关系数 bootstrap 至少需要 4 对观测值（BCa 需做留一法）")
    if a.std() == 0 or b.std() == 0:
        raise ValueError("变量无变异，相关系数无定义")
    theta = pearson(a, b) if method == "pearson" else spearman(a, b)

    n = a.size
    rng = np.random.default_rng(seed)
    boot = np.empty(n_boot, dtype=float)
    batch = max(1, min(1024, n_boot))
    for start in range(0, n_boot, batch):
        k = min(batch, n_boot - start)
        idx = rng.integers(0, n, size=(k, n))
        boot[start : start + k] = _corr_rows(a[idx], b[idx], method)
    boot = boot[np.isfinite(boot)]
    if boot.size < n_boot * 0.9:
        raise ValueError("相关系数 bootstrap 出现大量无效重抽样，请检查数据是否近似常数")
    name = "pearson_r" if method == "pearson" else "spearman_rho"

    if ci_method == "percentile":
        lo, hi = _percentile_interval(boot, ci)
    elif ci_method == "basic":
        lo, hi = _basic_interval(theta, boot, ci)
    else:
        jack = np.empty(n, dtype=float)
        ok = True
        for i in range(n):
            mask = np.ones(n, dtype=bool)
            mask[i] = False
            try:
                jack[i] = (
                    pearson(a[mask], b[mask])
                    if method == "pearson"
                    else spearman(a[mask], b[mask])
                )
            except ValueError:  # 留一后出现常数子样本，无法校正
                ok = False
                break
        if ok and np.all(np.isfinite(jack)):
            lo, hi = _bca_interval(theta, boot, jack, ci)
        else:  # 退回百分位法，保证仍能给出区间
            lo, hi = _percentile_interval(boot, ci)
    return _summarize(name, theta, boot, lo, hi, ci_method, ci, n_boot)


# ---------------------------------------------------------------------------
# 两组比较
# ---------------------------------------------------------------------------


def _cohen_d_rows(xb: np.ndarray, yb: np.ndarray) -> np.ndarray:
    n1, n2 = xb.shape[1], yb.shape[1]
    s1 = xb.std(axis=1, ddof=1)
    s2 = yb.std(axis=1, ddof=1)
    pooled = np.sqrt(((n1 - 1) * s1**2 + (n2 - 1) * s2**2) / (n1 + n2 - 2))
    with np.errstate(divide="ignore", invalid="ignore"):
        return (xb.mean(axis=1) - yb.mean(axis=1)) / pooled


def _cliffs_delta_rows(xb: np.ndarray, yb: np.ndarray) -> np.ndarray:
    """按批次计算 Cliff's delta（利用广播，仅用于 bootstrap 内部）。"""
    n1, n2 = xb.shape[1], yb.shape[1]
    greater = np.empty(xb.shape[0], dtype=float)
    less = np.empty(xb.shape[0], dtype=float)
    for start in range(0, xb.shape[0], 256):
        a = xb[start : start + 256, :, None]
        b = yb[start : start + 256, None, :]
        greater[start : start + 256] = (a > b).sum(axis=(1, 2))
        less[start : start + 256] = (a < b).sum(axis=(1, 2))
    return (greater - less) / (n1 * n2)


def _quantile_ci(samples: np.ndarray, ci: float) -> tuple[float, float]:
    alpha = 1.0 - ci
    lo, hi = np.quantile(samples, [alpha / 2.0, 1.0 - alpha / 2.0])
    return float(lo), float(hi)


def compare_groups(
    x: ArrayLike,
    y: ArrayLike,
    *,
    n_boot: int = 10000,
    ci: float = 0.95,
    seed: int | None = None,
) -> dict[str, Any]:
    """两组比较：均值差、Cohen's d、Hedges' g、Cliff's delta 及 bootstrap 置信区间。

    x、y 为两组独立样本；均值差/效应量的 CI 用 percentile bootstrap
    （d 与 δ 的重抽样分布高度偏斜，BCa 在两组情形下加速常数不稳定，
    故此处统一用百分位法，并注明方法）。
    """
    a = _as_1d(x, "x", min_n=3)
    b = _as_1d(y, "y", min_n=3)
    _check_args(n_boot, ci)
    rng = np.random.default_rng(seed)

    diffs = np.empty(n_boot, dtype=float)
    ds = np.empty(n_boot, dtype=float)
    batch = max(1, min(512, n_boot))
    for start in range(0, n_boot, batch):
        k = min(batch, n_boot - start)
        xb = a[rng.integers(0, a.size, size=(k, a.size))]
        yb = b[rng.integers(0, b.size, size=(k, b.size))]
        diffs[start : start + k] = xb.mean(axis=1) - yb.mean(axis=1)
        ds[start : start + k] = _cohen_d_rows(xb, yb)

    delta_boot = np.empty(n_boot, dtype=float)
    cells = a.size * b.size
    delta_batch = max(1, min(256, 8_000_000 // max(cells, 1)))
    for start in range(0, n_boot, delta_batch):
        k = min(delta_batch, n_boot - start)
        xb = a[rng.integers(0, a.size, size=(k, a.size))]
        yb = b[rng.integers(0, b.size, size=(k, b.size))]
        delta_boot[start : start + k] = _cliffs_delta_rows(xb, yb)

    finite_d = ds[np.isfinite(ds)]
    if finite_d.size < n_boot * 0.9:
        raise ValueError("bootstrap 中大量样本的标准差为 0，数据变异过小")
    d_lo, d_hi = _quantile_ci(finite_d, ci)
    diff_lo, diff_hi = _quantile_ci(diffs, ci)
    delta_lo, delta_hi = _quantile_ci(delta_boot, ci)

    d_point = cohens_d(a, b)
    delta_point = cliffs_delta(a, b)
    return {
        "n": (int(a.size), int(b.size)),
        "mean_x": float(a.mean()),
        "mean_y": float(b.mean()),
        "mean_diff": float(a.mean() - b.mean()),
        "mean_diff_ci": (diff_lo, diff_hi),
        "cohens_d": float(d_point),
        "cohens_d_ci": (d_lo, d_hi),
        "hedges_g": float(cohens_d(a, b, hedges=True)),
        "cliffs_delta": float(delta_point),
        "cliffs_delta_ci": (delta_lo, delta_hi),
        "cliffs_delta_magnitude": cliffs_delta_magnitude(delta_point),
        "ci_level": float(ci),
        "method": "percentile",
        "n_boot": int(n_boot),
    }


def format_estimate(
    estimate: float,
    lo: float,
    hi: float,
    *,
    ci: float = 0.95,
    digits: int = 3,
    label: str | None = None,
) -> str:
    """格式化成 ``0.412 [95% CI 0.243, 0.594]`` 这样的报告串。"""
    level = int(round(ci * 100))
    text = f"{estimate:.{digits}f} [{level}% CI {lo:.{digits}f}, {hi:.{digits}f}]"
    return f"{label} = {text}" if label else text


# ---------------------------------------------------------------------------
# 自检
# ---------------------------------------------------------------------------


def _demo() -> None:
    rng = np.random.default_rng(20261119)
    scores = rng.normal(0.42, 1.0, 120)
    control = rng.normal(0.0, 1.2, 100)
    corr_x = rng.normal(0.0, 1.0, 150)
    corr_y = 0.5 * corr_x + rng.normal(0.0, 0.9, 150)

    mean_r = bootstrap_ci(scores, "mean", n_boot=10000, method="bca", seed=1)
    median_r = bootstrap_ci(scores, "median", n_boot=10000, method="percentile", seed=2)
    corr_r = bootstrap_corr(corr_x, corr_y, n_boot=10000, ci_method="bca", seed=3)
    cmp_r = compare_groups(scores, control, n_boot=10000, seed=4)

    print(f"[均值] {format_estimate(mean_r['estimate'], mean_r['ci_low'], mean_r['ci_high'], label='mean')}"
          f"（BCa，B={mean_r['n_boot']}）")
    print(f"[中位数] {format_estimate(median_r['estimate'], median_r['ci_low'], median_r['ci_high'], label='median')}"
          f"（percentile，B={median_r['n_boot']}）")
    print(f"[相关] {format_estimate(corr_r['estimate'], corr_r['ci_low'], corr_r['ci_high'], label='Pearson r')}"
          f"（BCa，n=150）")
    print(f"[两组] 均值差 {format_estimate(cmp_r['mean_diff'], *cmp_r['mean_diff_ci'])}"
          f" | d = {cmp_r['cohens_d']:.2f} [{cmp_r['cohens_d_ci'][0]:.2f}, {cmp_r['cohens_d_ci'][1]:.2f}]"
          f" | delta = {cmp_r['cliffs_delta']:.2f}（{cmp_r['cliffs_delta_magnitude']}）")


if __name__ == "__main__":
    _demo()
