"""出版级 Matplotlib 样式（slug: pub-figure-mpl）。

只依赖 matplotlib。提供一套可直接套用的 rcParams：

* 字体回退：SimHei / Microsoft YaHei / Noto Sans CJK SC … → DejaVu Sans；
  设置了 ``axes.unicode_minus=False``，中文标题里的负号不会变成方块。
* 300 DPI 导出、去掉上/右边框、TrueType 嵌入（PDF 投稿要求）。
* 色盲友好配色（Okabe–Ito 8 色），默认 ``axes.prop_cycle`` 直接生效。
* 字号层级：正文 9pt、轴标签 9pt、刻度 8pt、轴标题 11pt、图标题 13pt。

用法
----
>>> from pub_style import apply_style, save
>>> apply_style()
>>> fig, ax = plt.subplots(figsize=(3.5, 2.6))
>>> ax.plot(x, y, label="实验组")
>>> ax.set_xlabel("时间 / s")
>>> save(fig, "figures/fig1.png")   # 自动建目录，300 DPI
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Iterable, Sequence

import matplotlib as mpl
from cycler import cycler

__all__ = [
    "PALETTE",
    "CJK_FONTS",
    "FALLBACK_FONT",
    "font_available",
    "resolve_fonts",
    "apply_style",
    "save",
    "despine",
    "panel_label",
    "current_style",
]

# Okabe–Ito 色盲友好配色，顺序按白底可读性排：蓝、朱红、绿、紫、天蓝、橙、黄、黑
PALETTE: tuple[str, ...] = (
    "#0072B2",
    "#D55E00",
    "#009E73",
    "#CC79A7",
    "#56B4E9",
    "#E69F00",
    "#F0E442",
    "#000000",
)

# 中文字体候选，按“常见程度 + 字形质量”排序；Windows 上前两个通常可用
CJK_FONTS: tuple[str, ...] = (
    "SimHei",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    "Source Han Sans SC",
    "PingFang SC",
    "WenQuanYi Zen Hei",
)

FALLBACK_FONT = "DejaVu Sans"

_FONT_CACHE: dict[str, bool] = {}


def font_available(name: str) -> bool:
    """判断某个字体族是否已安装（结果缓存）。"""
    if name in _FONT_CACHE:
        return _FONT_CACHE[name]
    from matplotlib import font_manager

    try:
        font_manager.findfont(
            font_manager.FontProperties(family=name), fallback_to_default=False
        )
        ok = True
    except (ValueError, RuntimeError):
        ok = False
    _FONT_CACHE[name] = ok
    return ok


def resolve_fonts(extra: Iterable[str] = ()) -> list[str]:
    """返回当前机器实际可用的字体列表，末尾一定带 DejaVu Sans 兜底。

    ``extra`` 里的字体会排在最前面（例如期刊指定 Arial 时传 ``["Arial"]``）。
    """
    ordered: list[str] = []
    seen: set[str] = set()
    for name in (*extra, *CJK_FONTS, FALLBACK_FONT):
        if name in seen:
            continue
        seen.add(name)
        if name == FALLBACK_FONT or font_available(name):
            ordered.append(name)
    if FALLBACK_FONT not in ordered:  # 理论上不会发生
        ordered.append(FALLBACK_FONT)
    return ordered


def _style_settings(
    base_size: float,
    dpi: int,
    fonts: Sequence[str],
    palette: Sequence[str],
    grid: bool,
) -> dict[str, Any]:
    """构造 rcParams 覆盖字典（集中在一处，方便按期刊微调）。"""
    return {
        # ---- 字体 ---------------------------------------------------------
        "font.family": "sans-serif",
        "font.sans-serif": list(fonts),
        "font.size": base_size,
        "axes.titlesize": base_size + 2,
        "axes.labelsize": base_size,
        "xtick.labelsize": base_size - 1,
        "ytick.labelsize": base_size - 1,
        "legend.fontsize": base_size - 1,
        "legend.title_fontsize": base_size - 1,
        "figure.titlesize": base_size + 4,
        "axes.unicode_minus": False,
        "mathtext.fontset": "dejavusans",
        # ---- 尺寸与导出 ---------------------------------------------------
        "figure.dpi": 120,
        "figure.facecolor": "white",
        "savefig.dpi": dpi,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.02,
        "savefig.facecolor": "white",
        "savefig.transparent": False,
        "pdf.fonttype": 42,  # TrueType，避免投稿系统缺字体
        "ps.fonttype": 42,
        # ---- 坐标轴与边框 -------------------------------------------------
        "axes.linewidth": 0.8,
        "axes.labelpad": 3.0,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": grid,
        "axes.axisbelow": True,
        "axes.prop_cycle": cycler(color=list(palette)),
        "axes.titleweight": "normal",
        "axes.titlepad": 6.0,
        # ---- 刻度 ---------------------------------------------------------
        "xtick.direction": "out",
        "ytick.direction": "out",
        "xtick.major.size": 3.5,
        "ytick.major.size": 3.5,
        "xtick.major.width": 0.8,
        "ytick.major.width": 0.8,
        "xtick.major.pad": 3.0,
        "ytick.major.pad": 3.0,
        # ---- 线、图例、网格 -----------------------------------------------
        "lines.linewidth": 1.2,
        "lines.markersize": 5.0,
        "patch.linewidth": 0.8,
        "legend.frameon": False,
        "legend.handlelength": 1.6,
        "legend.borderaxespad": 0.4,
        "errorbar.capsize": 2.5,
        "grid.linewidth": 0.6,
        "grid.alpha": 0.35,
        "grid.linestyle": "-",
        "image.cmap": "viridis",
    }


def apply_style(
    *,
    base_size: float = 9.0,
    dpi: int = 300,
    font_family: Sequence[str] | None = None,
    palette: Sequence[str] = PALETTE,
    grid: bool = False,
) -> dict[str, Any]:
    """套用出版级样式，返回本次写入的 rcParams 字典。

    Parameters
    ----------
    base_size : float
        正文字号（pt）。双栏期刊常用 7–9，单栏 9–10。
    dpi : int
        导出分辨率；PNG/TIFF 生效，PDF/SVG 为矢量不受影响。
    font_family : Sequence[str] | None
        优先使用的字体列表；None 时自动在 CJK_FONTS 里挑可用的。
    palette : Sequence[str]
        颜色循环，默认 Okabe–Ito。
    grid : bool
        是否默认打开网格（科研配图一般关闭）。
    """
    if base_size <= 0:
        raise ValueError("base_size 必须为正")
    if dpi <= 0:
        raise ValueError("dpi 必须为正")
    fonts = resolve_fonts(font_family or ())
    settings = _style_settings(base_size, int(dpi), fonts, palette, grid)
    mpl.rcParams.update(settings)
    return settings


def current_style() -> dict[str, Any]:
    """当前生效的关键参数快照，方便在脚本里打印核对。"""
    keys = (
        "font.sans-serif",
        "font.size",
        "savefig.dpi",
        "axes.spines.top",
        "axes.spines.right",
        "axes.unicode_minus",
    )
    return {k: mpl.rcParams[k] for k in keys}


def save(
    fig: "mpl.figure.Figure",
    path: str | os.PathLike[str],
    *,
    dpi: int | None = None,
    transparent: bool = False,
    close: bool = False,
) -> Path:
    """保存图片：自动补扩展名、建父目录，默认使用 rcParams 里的 300 DPI。"""
    target = Path(path).expanduser()
    if not target.suffix:
        target = target.with_suffix(".png")
    if target.suffix.lower() not in {".png", ".pdf", ".svg", ".jpg", ".jpeg", ".tif", ".tiff", ".eps"}:
        raise ValueError(f"不支持的图片格式：{target.suffix}")
    target = target.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(
        target,
        dpi=dpi if dpi is not None else float(mpl.rcParams["savefig.dpi"]),
        transparent=transparent,
        bbox_inches=mpl.rcParams["savefig.bbox"],
        pad_inches=float(mpl.rcParams["savefig.pad_inches"]),
    )
    if close:
        import matplotlib.pyplot as plt

        plt.close(fig)
    return target


def despine(ax: "mpl.axes.Axes", *, keep: Sequence[str] = ("left", "bottom"), grid_axis: str | None = None) -> None:
    """手动去掉多余边框（rcParams 已默认去掉上/右，这里用于已有 axes）。"""
    valid = {"left", "right", "top", "bottom"}
    unknown = set(keep) - valid
    if unknown:
        raise ValueError(f"未知的边框：{sorted(unknown)}")
    for side in valid:
        ax.spines[side].set_visible(side in keep)
    if grid_axis:
        ax.grid(True, axis=grid_axis, alpha=0.35, linewidth=0.6)


def panel_label(
    ax: "mpl.axes.Axes",
    label: str,
    *,
    x: float = -0.14,
    y: float = 1.04,
    fontsize: float | None = None,
    weight: str = "bold",
) -> None:
    """在子图左上角加 A/B/C 分图标签（期刊拼图常用）。"""
    ax.text(
        x,
        y,
        label,
        transform=ax.transAxes,
        fontsize=fontsize if fontsize is not None else float(mpl.rcParams["axes.titlesize"]),
        fontweight=weight,
        ha="left",
        va="bottom",
    )


def _demo() -> None:
    """自检：套用样式 → 双面板图 → 导出 PNG 到临时目录。"""
    import matplotlib

    matplotlib.use("Agg", force=True)
    import matplotlib.pyplot as plt
    import numpy as np

    style = apply_style(base_size=9, dpi=300)
    fonts = list(style["font.sans-serif"])
    has_cjk = bool(fonts) and fonts[0] != FALLBACK_FONT
    print(f"[字体] 使用 {fonts[0]}（CJK 可用：{'是' if has_cjk else '否，已回退 DejaVu Sans'}）")
    print(f"[样式] 300 DPI | 去上/右边框 | {len(PALETTE)} 色色盲友好循环 | 基准 9pt")

    rng = np.random.default_rng(42)
    x = np.linspace(0.0, 10.0, 60)
    fig, axes = plt.subplots(1, 2, figsize=(7.0, 2.8), constrained_layout=True)
    for i in range(3):
        y = np.sin(x + i * 0.6) * (1 + 0.1 * i) + rng.normal(0, 0.05, x.size)
        axes[0].plot(x, y, label=f"Group {i + 1}")
    axes[0].set_xlabel("时间 / s" if has_cjk else "Time / s")
    axes[0].set_ylabel("响应幅值" if has_cjk else "Response")
    axes[0].set_title("中文标题渲染正常" if has_cjk else "Style smoke test")
    axes[0].legend(loc="upper right")

    bars = axes[1].bar(["A", "B", "C"], [3.2, 4.1, 2.7], yerr=[0.3, 0.4, 0.2], capsize=2.5)
    for patch, color in zip(bars, PALETTE):
        patch.set_color(color)
    axes[1].set_xlabel("条件" if has_cjk else "Condition")
    axes[1].set_ylabel("均值 ± SE" if has_cjk else "Mean ± SE")
    axes[1].set_title("误差棒与配色" if has_cjk else "Bars and palette")
    panel_label(axes[0], "A", weight="normal")  # SimHei 无粗体字形，显式用 normal 避免 findfont 警告
    panel_label(axes[1], "B", weight="normal")

    out = save(fig, Path(tempfile.gettempdir()) / "pub_style_demo" / "figure.png")
    size_kb = out.stat().st_size / 1024
    print(f"[导出] {out}（{size_kb:.0f} KB，{int(mpl.rcParams['savefig.dpi'])} DPI）")
    plt.close(fig)


if __name__ == "__main__":
    _demo()
