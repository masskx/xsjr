"""统计检验选择与执行工具包（stat-tests-py）。

根据研究设计（独立/配对、两组/多组、是否正态）推荐检验方法，并直接计算
统计量、p 值、效应量与 APA 格式报告串。

依赖
----
numpy >= 1.24（必需）
scipy >= 1.10（可选）。未安装时：
    * t 检验、单因素方差分析、重复测量方差分析、Mann-Whitney U
      自动回退到纯 numpy 实现（p 值由不完全 beta 函数计算）；
    * Wilcoxon 符号秩、Kruskal-Wallis、Friedman 依赖 scipy 的精确分布，
      调用时会抛出 MissingScipyError 并给出 pip 安装提示。

快速使用
--------
>>> from stat_tests import recommend, auto_test
>>> recommend(2, paired=False, normal=True).test
'Welch 独立样本 t 检验'
>>> res = auto_test(x, y)          # x、y 为两组观测值
>>> print(res.report())
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

import numpy as np

try:  # 可选依赖：缺失时走纯 numpy 路径
    from scipy import stats as _sps

    HAS_SCIPY = True
except ImportError:  # pragma: no cover - 取决于运行环境
    _sps = None
    HAS_SCIPY = False

__all__ = [
    "HAS_SCIPY",
    "PIP_HINT",
    "MissingScipyError",
    "Recommendation",
    "TestResult",
    "recommend",
    "auto_test",
    "auto_anova",
    "one_sample_t",
    "paired_t",
    "welch_t",
    "student_t",
    "mann_whitney",
    "wilcoxon",
    "one_way_anova",
    "repeated_measures_anova",
    "kruskal",
    "friedman",
]

PIP_HINT = "需要 scipy 才能得到精确 p 值。安装：pip install scipy"


class MissingScipyError(RuntimeError):
    """当前检验依赖 scipy，但环境中没有安装。"""

    def __init__(self, func: str) -> None:
        super().__init__(f"{func} {PIP_HINT}")
        self.func = func


# ---------------------------------------------------------------------------
# 基础数值函数：不完全 beta 函数 → t / F 分布的 p 值（纯 numpy 路径可用）
# ---------------------------------------------------------------------------


def _betacf(a: float, b: float, x: float, max_iter: int = 500, eps: float = 3e-14) -> float:
    """不完全 beta 函数的连分式展开（Numerical Recipes 6.4）。"""
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def _reg_incomplete_beta(a: float, b: float, x: float) -> float:
    """正则化不完全 beta 函数 I_x(a, b)。"""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    ln_bt = (
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log1p(-x)
    )
    bt = math.exp(ln_bt)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _t_two_sided_p(t: float, df: float) -> float:
    """Student t 分布双侧 p 值。"""
    t = abs(float(t))
    df = float(df)
    if df <= 0:
        raise ValueError("自由度必须为正")
    if not math.isfinite(t):
        return 0.0
    return _reg_incomplete_beta(df / 2.0, 0.5, df / (df + t * t))


def _f_sf(f: float, df1: float, df2: float) -> float:
    """F 分布上尾概率 P(F > f)。"""
    if f <= 0:
        return 1.0
    return _reg_incomplete_beta(df2 / 2.0, df1 / 2.0, df2 / (df2 + df1 * f))


def _normal_two_sided_p(z: float) -> float:
    """标准正态双侧 p 值。"""
    return math.erfc(abs(float(z)) / math.sqrt(2.0))


def _t_critical(df: float, conf: float = 0.95) -> float:
    """二分法求 t 临界值（双侧），不依赖 scipy。"""
    alpha = 1.0 - conf
    lo, hi = 0.0, 1.0
    while _t_two_sided_p(hi, df) > alpha and hi < 1e6:
        hi *= 2.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if _t_two_sided_p(mid, df) > alpha:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def _rankdata(a: np.ndarray) -> np.ndarray:
    """平均秩（并列取均值），不依赖 scipy。"""
    a = np.asarray(a, dtype=float).ravel()
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(a.size, dtype=float)
    ranks[order] = np.arange(1, a.size + 1, dtype=float)
    sorted_a = a[order]
    i = 0
    while i < a.size:
        j = i
        while j + 1 < a.size and sorted_a[j + 1] == sorted_a[i]:
            j += 1
        if j > i:
            ranks[order[i : j + 1]] = (i + j + 2) / 2.0
        i = j + 1
    return ranks


# ---------------------------------------------------------------------------
# 数据校验与效应量
# ---------------------------------------------------------------------------


def _as_1d(x: Iterable[float] | np.ndarray, name: str = "x", min_n: int = 2) -> np.ndarray:
    arr = np.asarray(x, dtype=float).ravel()
    if arr.size < min_n:
        raise ValueError(f"{name} 至少需要 {min_n} 个观测值，当前 {arr.size} 个")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} 含 NaN 或无穷值，请先剔除或插补缺失值")
    return arr


def _sd(x: np.ndarray) -> float:
    return float(np.std(x, ddof=1))


def _cohens_d_pooled(x: np.ndarray, y: np.ndarray) -> float:
    n1, n2 = x.size, y.size
    s1, s2 = _sd(x), _sd(y)
    pooled = math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2))
    if pooled == 0:
        raise ValueError("两组数据均无变异，无法计算 Cohen's d")
    return (float(np.mean(x)) - float(np.mean(y))) / pooled


def _hedges_g(d: float, n1: int, n2: int) -> float:
    return d * (1.0 - 3.0 / (4.0 * (n1 + n2) - 9.0))


# ---------------------------------------------------------------------------
# 结果与推荐
# ---------------------------------------------------------------------------


def _fmt_df(df: float) -> str:
    if abs(df - round(df)) < 1e-6:
        return str(int(round(df)))
    return f"{df:.2f}"


def _fmt_p(p: float) -> str:
    if p < 0.001:
        return "p < .001"
    s = f"{p:.3f}"
    if s.startswith("0."):
        s = s[1:]
    return f"p = {s}"


@dataclass
class TestResult:
    """一次检验的完整结果，可直接输出 APA 报告串。"""

    test: str
    symbol: str
    statistic: float
    p: float
    effect_size: float
    effect_label: str
    df: float | tuple[float, ...] | None = None
    n: tuple[int, ...] = ()
    ci: tuple[float, float] | None = None
    notes: list[str] = field(default_factory=list)
    extra: dict[str, float | str] = field(default_factory=dict)
    engine: str = "numpy"

    def apa(self) -> str:
        """APA 风格统计报告串，例如 ``t(28) = 2.31, p = .021, d = 0.85``。"""
        if self.df is None:
            stat = f"{self.symbol} = {self.statistic:.2f}"
        elif isinstance(self.df, tuple):
            stat = f"{self.symbol}({', '.join(_fmt_df(d) for d in self.df)}) = {self.statistic:.2f}"
        else:
            stat = f"{self.symbol}({_fmt_df(self.df)}) = {self.statistic:.2f}"
        parts = [stat, _fmt_p(self.p), f"{self.effect_label} = {self.effect_size:.2f}"]
        if self.ci is not None:
            parts.append(f"95% CI [{self.ci[0]:.2f}, {self.ci[1]:.2f}]")
        return ", ".join(parts)

    def report(self) -> str:
        """中文检验名 + APA 报告串，附计算引擎。"""
        return f"{self.test}：{self.apa()}（{self.engine} 引擎）"

    def as_dict(self) -> dict[str, Any]:
        return {
            "test": self.test,
            "statistic": self.statistic,
            "p": self.p,
            "effect_size": self.effect_size,
            "effect_label": self.effect_label,
            "df": self.df,
            "n": self.n,
            "ci": self.ci,
            "apa": self.apa(),
            "engine": self.engine,
        }


@dataclass(frozen=True)
class Recommendation:
    """研究设计 → 检验方法的推荐结果。"""

    test: str
    effect_size: str
    scipy_required: bool
    fallback: str | None
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "test": self.test,
            "effect_size": self.effect_size,
            "scipy_required": self.scipy_required,
            "fallback": self.fallback,
            "reason": self.reason,
        }


def recommend(n_groups: int = 2, paired: bool = False, normal: bool = True) -> Recommendation:
    """根据设计给出检验建议，不接触数据，因此不会报错于缺失依赖。

    Parameters
    ----------
    n_groups : int
        组数：1（单样本）、2、或 >= 3。
    paired : bool
        观测是否配对/重复测量。
    normal : bool
        数据是否近似正态（或样本量足够大，依据中心极限定理）。
    """
    if n_groups < 1:
        raise ValueError("n_groups 必须 >= 1")

    if n_groups == 1:
        if normal:
            return Recommendation(
                test="单样本 t 检验",
                effect_size="Cohen's d",
                scipy_required=False,
                fallback="纯 numpy（p 值由不完全 beta 函数计算）",
                reason="单组数据与已知总体均值比较，近似正态时用参数检验。",
            )
        return Recommendation(
            test="Wilcoxon 符号秩检验",
            effect_size="rank-biserial r",
            scipy_required=True,
            fallback=None,
            reason="单组、非正态或有序数据，用符号秩检验与 0（或理论中位数）比较。",
        )

    if n_groups == 2:
        if paired:
            if normal:
                return Recommendation(
                    test="配对样本 t 检验",
                    effect_size="Cohen's d_z",
                    scipy_required=False,
                    fallback="纯 numpy（p 值由不完全 beta 函数计算）",
                    reason="同一批被试的两次测量，差值近似正态时用配对 t 检验。",
                )
            return Recommendation(
                test="Wilcoxon 符号秩检验",
                effect_size="rank-biserial r",
                scipy_required=True,
                fallback=None,
                reason="配对/重复测量且差值不正态或为有序数据，用符号秩检验。",
            )
        if normal:
            return Recommendation(
                test="Welch 独立样本 t 检验",
                effect_size="Cohen's d",
                scipy_required=False,
                fallback="纯 numpy（p 值由不完全 beta 函数计算）",
                reason="两组独立样本、近似正态；Welch 不要求方差齐性，是更稳妥的默认选择。",
            )
        return Recommendation(
            test="Mann-Whitney U 检验",
            effect_size="rank-biserial r",
            scipy_required=False,
            fallback="纯 numpy 正态近似（每组 n>=8 时较稳；小样本请装 scipy 用精确法）",
            reason="两组独立、非正态或有序数据，比较分布位置（中位数）而非均值。",
        )

    # n_groups >= 3
    if paired:
        if normal:
            return Recommendation(
                test="单因素重复测量方差分析",
                effect_size="partial η²",
                scipy_required=False,
                fallback="纯 numpy（F 检验 p 值由不完全 beta 函数计算）",
                reason="同一批被试在三个及以上条件/时间点的测量，球形性可接受时用重复测量 ANOVA。",
            )
        return Recommendation(
            test="Friedman 检验",
            effect_size="Kendall's W",
            scipy_required=True,
            fallback=None,
            reason="重复测量、非正态或有序数据，用 Friedman 秩检验比较各条件。",
        )
    if normal:
        return Recommendation(
            test="单因素方差分析（One-way ANOVA）",
            effect_size="η²",
            scipy_required=False,
            fallback="纯 numpy（p 值由不完全 beta 函数计算）",
            reason="三组及以上独立样本、近似正态且方差接近，比较组间均值。",
        )
    return Recommendation(
        test="Kruskal-Wallis H 检验",
        effect_size="ε²",
        scipy_required=True,
        fallback=None,
        reason="三组及以上独立样本、非正态或有序数据，用秩和检验比较分布。",
    )


# ---------------------------------------------------------------------------
# t 检验
# ---------------------------------------------------------------------------


def _t_result(
    test: str,
    t: float,
    p: float,
    df: float,
    n: tuple[int, ...],
    effect: float,
    effect_label: str,
    ci: tuple[float, float],
    engine: str,
    notes: Sequence[str] = (),
) -> TestResult:
    return TestResult(
        test=test,
        symbol="t",
        statistic=float(t),
        p=float(p),
        effect_size=float(effect),
        effect_label=effect_label,
        df=df,
        n=n,
        ci=ci,
        notes=list(notes),
        engine=engine,
    )


def one_sample_t(x: Iterable[float], popmean: float = 0.0) -> TestResult:
    """单样本 t 检验：样本均值是否等于给定总体均值。"""
    arr = _as_1d(x, "x")
    n = arr.size
    if _sd(arr) == 0:
        raise ValueError("数据无变异（标准差为 0），单样本 t 检验无定义")
    mean = float(np.mean(arr))
    se = _sd(arr) / math.sqrt(n)
    if HAS_SCIPY:
        t, p = _sps.ttest_1samp(arr, popmean)
        t = float(t)
        p = float(p)
        engine = "scipy"
    else:
        t = (mean - popmean) / se
        p = _t_two_sided_p(t, n - 1)
        engine = "numpy"
    d = (mean - popmean) / _sd(arr)
    tcrit = _t_critical(n - 1)
    ci = (mean - popmean - tcrit * se, mean - popmean + tcrit * se)
    return _t_result("单样本 t 检验", t, p, n - 1, (n,), d, "Cohen's d", ci, engine)


def paired_t(x: Iterable[float], y: Iterable[float]) -> TestResult:
    """配对样本 t 检验：同一批观测的两次测量差值是否显著异于 0。"""
    a = _as_1d(x, "x")
    b = _as_1d(y, "y")
    if a.size != b.size:
        raise ValueError("配对检验要求两组数据一一对应（长度相同），且顺序一致")
    diff = a - b
    if _sd(diff) == 0:
        raise ValueError("所有配对差值相同，配对 t 检验无定义")
    n = diff.size
    mean_diff = float(np.mean(diff))
    se = _sd(diff) / math.sqrt(n)
    if HAS_SCIPY:
        t, p = _sps.ttest_rel(a, b)
        t = float(t)
        p = float(p)
        engine = "scipy"
    else:
        t = mean_diff / se
        p = _t_two_sided_p(t, n - 1)
        engine = "numpy"
    dz = mean_diff / _sd(diff)
    tcrit = _t_critical(n - 1)
    ci = (mean_diff - tcrit * se, mean_diff + tcrit * se)
    return _t_result("配对样本 t 检验", t, p, n - 1, (n,), dz, "Cohen's d_z", ci, engine)


def welch_t(x: Iterable[float], y: Iterable[float]) -> TestResult:
    """Welch 独立样本 t 检验（不假设方差齐性，默认推荐）。"""
    return _independent_t(x, y, equal_var=False)


def student_t(x: Iterable[float], y: Iterable[float]) -> TestResult:
    """Student 独立样本 t 检验（假设方差齐性）。"""
    return _independent_t(x, y, equal_var=True)


def _independent_t(x: Iterable[float], y: Iterable[float], equal_var: bool) -> TestResult:
    a = _as_1d(x, "x")
    b = _as_1d(y, "y")
    n1, n2 = a.size, b.size
    m1, m2 = float(np.mean(a)), float(np.mean(b))
    s1, s2 = _sd(a), _sd(b)
    if s1 == 0 and s2 == 0:
        raise ValueError("两组数据均无变异，独立样本 t 检验无定义")
    diff = m1 - m2
    if equal_var:
        df = n1 + n2 - 2
        sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / df
        se = math.sqrt(sp2 * (1.0 / n1 + 1.0 / n2))
        test = "Student 独立样本 t 检验"
        notes: list[str] = ["假设两组方差齐；不确定时优先用 Welch 检验。"]
    else:
        se = math.sqrt(s1 * s1 / n1 + s2 * s2 / n2)
        num = (s1 * s1 / n1 + s2 * s2 / n2) ** 2
        den = (s1 * s1 / n1) ** 2 / (n1 - 1) + (s2 * s2 / n2) ** 2 / (n2 - 1)
        df = num / den if den > 0 else n1 + n2 - 2
        test = "Welch 独立样本 t 检验"
        notes = ["Welch 不要求方差齐性，df 为小数属正常。"]
    if HAS_SCIPY:
        t, p = _sps.ttest_ind(a, b, equal_var=equal_var)
        t = float(t)
        p = float(p)
        engine = "scipy"
    else:
        t = diff / se
        p = _t_two_sided_p(t, df)
        engine = "numpy"
    d = _cohens_d_pooled(a, b)
    g = _hedges_g(d, n1, n2)
    tcrit = _t_critical(df)
    ci = (diff - tcrit * se, diff + tcrit * se)
    res = _t_result(test, t, p, df, (n1, n2), d, "Cohen's d", ci, engine, notes)
    res.extra["hedges_g"] = g
    res.notes.append(f"Hedges' g = {g:.2f}")
    return res


# ---------------------------------------------------------------------------
# 非参数检验（可回退路径 / 需 scipy）
# ---------------------------------------------------------------------------


def mann_whitney(x: Iterable[float], y: Iterable[float]) -> TestResult:
    """Mann-Whitney U 检验；无 scipy 时用带并列校正的正态近似。"""
    a = _as_1d(x, "x")
    b = _as_1d(y, "y")
    n1, n2 = a.size, b.size
    if HAS_SCIPY:
        u_stat, p = _sps.mannwhitneyu(a, b, alternative="two-sided", method="auto")
        u1 = float(u_stat)
        engine = "scipy"
        notes: list[str] = []
    else:
        n = n1 + n2
        ranks = _rankdata(np.concatenate([a, b]))
        u1 = float(ranks[:n1].sum() - n1 * (n1 + 1) / 2.0)
        _, counts = np.unique(np.concatenate([a, b]), return_counts=True)
        tie_term = float(np.sum(counts.astype(float) ** 3 - counts)) / (n * (n - 1))
        sd_u = math.sqrt(n1 * n2 / 12.0 * ((n + 1) - tie_term))
        if sd_u == 0:
            raise ValueError("全部观测值相同，Mann-Whitney U 检验无定义")
        z = (abs(u1 - n1 * n2 / 2.0) - 0.5) / sd_u  # 连续性校正
        p = _normal_two_sided_p(z)
        engine = "numpy"
        notes = ["无 scipy：采用带并列校正的正态近似（每组 n>=8 时较稳）。"]
    r_rb = 2.0 * u1 / (n1 * n2) - 1.0
    return TestResult(
        test="Mann-Whitney U 检验",
        symbol="U",
        statistic=u1,
        p=float(p),
        effect_size=r_rb,
        effect_label="rank-biserial r",
        df=None,
        n=(n1, n2),
        notes=notes,
        engine=engine,
    )


def wilcoxon(x: Iterable[float], y: Iterable[float] | None = None) -> TestResult:
    """Wilcoxon 符号秩检验（精确分布来自 scipy）。

    ``y=None`` 时做单样本检验：样本中位数是否显著异于 0。
    """
    if not HAS_SCIPY:
        raise MissingScipyError("Wilcoxon 符号秩检验")
    a = _as_1d(x, "x")
    if y is None:
        target = np.zeros_like(a)
        diff = a.copy()
    else:
        target = _as_1d(y, "y")
        if a.size != target.size:
            raise ValueError("配对检验要求两组数据长度相同且顺序一致")
        diff = a - target
    nonzero = diff[diff != 0]
    if nonzero.size < 2:
        raise ValueError("非零差值少于 2 个，Wilcoxon 检验无定义")
    if np.all(nonzero > 0) or np.all(nonzero < 0):
        w_stat, p = _sps.wilcoxon(a, target) if y is not None else _sps.wilcoxon(a)
        r_rb = 1.0 if np.all(nonzero > 0) else -1.0
    else:
        w_stat, p = _sps.wilcoxon(a, target) if y is not None else _sps.wilcoxon(a)
        ranks = _rankdata(np.abs(nonzero))
        w_plus = float(ranks[nonzero > 0].sum())
        r_rb = 2.0 * w_plus / ranks.sum() - 1.0
    return TestResult(
        test="Wilcoxon 符号秩检验" if y is not None else "单样本 Wilcoxon 符号秩检验",
        symbol="W",
        statistic=float(w_stat),
        p=float(p),
        effect_size=r_rb,
        effect_label="rank-biserial r",
        n=(a.size,),
        notes=["差值中位数与 0 比较；零差值已剔除。"],
        engine="scipy",
    )


# ---------------------------------------------------------------------------
# 方差分析
# ---------------------------------------------------------------------------


def one_way_anova(groups: Sequence[Iterable[float]]) -> TestResult:
    """单因素方差分析（组间设计），纯 numpy 实现，F 的 p 值由不完全 beta 函数给出。"""
    arrs = [_as_1d(g, f"groups[{i}]") for i, g in enumerate(groups)]
    if len(arrs) < 2:
        raise ValueError("方差分析至少需要 2 组")
    k = len(arrs)
    n_total = sum(a.size for a in arrs)
    grand = float(np.concatenate(arrs).mean())
    ss_between = sum(a.size * (float(a.mean()) - grand) ** 2 for a in arrs)
    ss_within = sum(float(((a - a.mean()) ** 2).sum()) for a in arrs)
    df_b, df_w = k - 1, n_total - k
    if df_w <= 0:
        raise ValueError("每组至少需要 2 个观测值")
    if ss_within == 0:
        raise ValueError("组内无变异，方差分析无定义")
    ms_b, ms_w = ss_between / df_b, ss_within / df_w
    f_stat = ms_b / ms_w
    p = _f_sf(f_stat, df_b, df_w)
    eta2 = ss_between / (ss_between + ss_within)
    return TestResult(
        test="单因素方差分析",
        symbol="F",
        statistic=float(f_stat),
        p=float(p),
        effect_size=float(eta2),
        effect_label="η²",
        df=(float(df_b), float(df_w)),
        n=tuple(a.size for a in arrs),
        notes=["组间设计；显著后需做事后多重比较（如 Tukey HSD 或 Bonferroni 校正）。"],
        extra={"ss_between": ss_between, "ss_within": ss_within},
        engine="numpy",
    )


def repeated_measures_anova(data: Iterable[Iterable[float]]) -> TestResult:
    """单因素重复测量方差分析。

    ``data`` 为二维数组，行是被试、列是条件（各条件顺序必须一致）。
    """
    m = np.asarray(data, dtype=float)
    if m.ndim != 2:
        raise ValueError("重复测量 ANOVA 需要二维矩阵：行=被试，列=条件")
    n, k = m.shape
    if n < 2 or k < 2:
        raise ValueError("至少需要 2 名被试和 2 个条件")
    if not np.all(np.isfinite(m)):
        raise ValueError("数据含 NaN，重复测量 ANOVA 不允许缺失（请先剔除整行）")
    grand = float(m.mean())
    subj_means = m.mean(axis=1)
    cond_means = m.mean(axis=0)
    ss_total = float(((m - grand) ** 2).sum())
    ss_subj = float(k * ((subj_means - grand) ** 2).sum())
    ss_cond = float(n * ((cond_means - grand) ** 2).sum())
    ss_error = ss_total - ss_subj - ss_cond
    df_cond, df_error = k - 1, (n - 1) * (k - 1)
    if ss_error <= 0:
        raise ValueError("误差项方差为 0（各条件完全一致），无法计算 F")
    f_stat = (ss_cond / df_cond) / (ss_error / df_error)
    p = _f_sf(f_stat, df_cond, df_error)
    partial_eta2 = ss_cond / (ss_cond + ss_error)
    return TestResult(
        test="单因素重复测量方差分析",
        symbol="F",
        statistic=float(f_stat),
        p=float(p),
        effect_size=float(partial_eta2),
        effect_label="partial η²",
        df=(float(df_cond), float(df_error)),
        n=(n,),
        notes=["该实现未做球形性校正；违反球形假设时请用 Greenhouse-Geisser 校正。"],
        engine="numpy",
    )


def kruskal(groups: Sequence[Iterable[float]]) -> TestResult:
    """Kruskal-Wallis H 检验（需 scipy）。"""
    if not HAS_SCIPY:
        raise MissingScipyError("Kruskal-Wallis H 检验")
    arrs = [_as_1d(g, f"groups[{i}]") for i, g in enumerate(groups)]
    if len(arrs) < 2:
        raise ValueError("至少需要 2 组")
    h_stat, p = _sps.kruskal(*arrs)
    n_total = sum(a.size for a in arrs)
    eps2 = float(h_stat) / (n_total - 1)
    return TestResult(
        test="Kruskal-Wallis H 检验",
        symbol="H",
        statistic=float(h_stat),
        p=float(p),
        effect_size=eps2,
        effect_label="ε²",
        df=float(len(arrs) - 1),
        n=tuple(a.size for a in arrs),
        notes=["显著后需做事后成对比较（如 Dunn 检验 + Holm 校正）。"],
        engine="scipy",
    )


def friedman(groups: Sequence[Iterable[float]]) -> TestResult:
    """Friedman 检验（需 scipy），用于重复测量/配伍组设计。"""
    if not HAS_SCIPY:
        raise MissingScipyError("Friedman 检验")
    arrs = [_as_1d(g, f"groups[{i}]") for i, g in enumerate(groups)]
    if len(arrs) < 3:
        raise ValueError("Friedman 检验至少需要 3 个条件")
    sizes = {a.size for a in arrs}
    if len(sizes) != 1:
        raise ValueError("Friedman 检验要求各条件观测数相同（每名被试都有全部条件）")
    chi2, p = _sps.friedmanchisquare(*arrs)
    n = arrs[0].size
    kendall_w = float(chi2) / (n * (len(arrs) - 1))
    return TestResult(
        test="Friedman 检验",
        symbol="χ²",
        statistic=float(chi2),
        p=float(p),
        effect_size=kendall_w,
        effect_label="Kendall's W",
        df=float(len(arrs) - 1),
        n=(n,),
        notes=["显著后需做事后成对比较（如 Wilcoxon + Bonferroni 校正）。"],
        engine="scipy",
    )


# ---------------------------------------------------------------------------
# 一站式调度
# ---------------------------------------------------------------------------


def auto_test(
    x: Iterable[float],
    y: Iterable[float] | None = None,
    *,
    paired: bool = False,
    normal: bool = True,
    equal_var: bool = False,
    popmean: float = 0.0,
) -> TestResult:
    """按设计自动选择并执行检验。

    Parameters
    ----------
    x, y : 观测值序列
        ``y`` 为 None 时做单样本检验（与 ``popmean`` 比较）；``normal=False``
        时单样本走 Wilcoxon 符号秩（需 scipy）。
    paired : bool
        两组是否为配对/重复测量。
    normal : bool
        是否近似正态；False 时走非参数路径。
    equal_var : bool
        独立样本 t 检验是否假设方差齐性（默认 False = Welch）。
    popmean : float
        单样本检验的总体均值。
    """
    a = _as_1d(x, "x")
    if y is None:
        if paired:
            raise ValueError("paired=True 时必须同时提供 y")
        if normal:
            return one_sample_t(a, popmean)
        return wilcoxon(a - popmean)  # 单样本 Wilcoxon：平移后与 0 比较
    b = _as_1d(y, "y")
    if paired:
        return paired_t(a, b) if normal else wilcoxon(a, b)
    if normal:
        return welch_t(a, b) if not equal_var else student_t(a, b)
    return mann_whitney(a, b)


def auto_anova(
    groups: Sequence[Iterable[float]] | np.ndarray,
    *,
    normal: bool = True,
    repeated: bool = False,
) -> TestResult:
    """按设计自动选择多组检验。

    ``repeated=True`` 时 ``groups`` 应为行=被试、列=条件的二维矩阵。
    """
    if repeated:
        if not normal:
            data = np.asarray(groups, dtype=float)
            if data.ndim != 2:
                raise ValueError("repeated=True 且 normal=False 时请传入二维矩阵")
            return friedman([data[:, j] for j in range(data.shape[1])])
        return repeated_measures_anova(groups)
    if normal:
        return one_way_anova(groups)  # type: ignore[arg-type]
    return kruskal(groups)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 自检
# ---------------------------------------------------------------------------


def _force_utf8_stdout() -> None:
    """Windows 管道/重定向可能按 GBK 编码，打印 η² 等符号会 UnicodeEncodeError。"""
    for stream in (sys.stdout, sys.stderr):
        enc = (getattr(stream, "encoding", "") or "").lower().replace("-", "")
        if enc != "utf8" and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def _demo() -> None:
    _force_utf8_stdout()
    rng = np.random.default_rng(20261119)
    x = rng.normal(12.0, 3.0, 30)
    y = rng.normal(9.5, 3.2, 28)
    y_paired = x + rng.normal(-1.2, 1.0, 30)
    groups3 = [rng.normal(10.0, 2.0, 20), rng.normal(11.2, 2.0, 20), rng.normal(12.6, 2.0, 20)]

    print(f"[环境] numpy {np.__version__} | scipy {'已安装' if HAS_SCIPY else '未安装（自动回退纯 numpy）'}")
    print(f"[推荐] 两组独立·正态 → {recommend(2, paired=False, normal=True).test}")
    print(f"[推荐] 三组重复·非正态 → {recommend(3, paired=True, normal=False).test}")
    print(f"[独立样本] {auto_test(x, y).report()}")
    print(f"[配对样本] {auto_test(x, y_paired, paired=True).report()}")
    print(f"[三组 ANOVA] {auto_anova(groups3).report()}")
    print(f"[Mann-Whitney] {auto_test(x, y, normal=False).report()}")
    if HAS_SCIPY:
        print(f"[Wilcoxon] {auto_test(x, y_paired, paired=True, normal=False).report()}")
    else:
        try:
            auto_test(x, y_paired, paired=True, normal=False)
        except MissingScipyError as exc:  # 演示"优雅报错 + pip 提示"
            print(f"[非参数校验] 已捕获：{exc}")


if __name__ == "__main__":
    _demo()
