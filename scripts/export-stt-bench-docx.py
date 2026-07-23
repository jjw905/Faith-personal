#!/usr/bin/env python3
"""STT 모델 벤치 결과 DOCX. 최종 저장: Faith-office/"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / ".data" / "stt-bench"
CHART_DIR = BENCH / "report"
OFFICE = ROOT / "Faith-office"
OUT_DOCX = OFFICE / "Faith_STT_모델벤치결과_2026-07-22.docx"

_FONT = Path("/System/Library/Fonts/AppleSDGothicNeo.ttc")
if _FONT.exists():
    font_manager.fontManager.addfont(str(_FONT))
    plt.rcParams["font.family"] = "Apple SD Gothic Neo"
plt.rcParams["axes.unicode_minus"] = False

MODEL_ORDER = [
    "whisper-1",
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
    "gpt-4o-transcribe-diarize",
]
MODEL_SHORT = {
    "whisper-1": "whisper-1",
    "gpt-4o-transcribe": "4o-transcribe",
    "gpt-4o-mini-transcribe": "4o-mini",
    "gpt-4o-transcribe-diarize": "4o-diarize",
}

# 그래프 색 (차분한 구분)
C_RAW = "#2F6B9F"
C_CORR = "#C47A3A"
C_ASM = "#2F6B9F"
C_ASM2 = "#2F7A5B"
C_KTV = "#C47A3A"
C_SPEAKERS = ["#2F6B9F", "#2F7A5B", "#C47A3A", "#7A5C8A", "#8A6A28", "#5C6570", "#8A4A4A"]

# 표·범례용 쉬운 표기
LABEL_RAW = "STT 직후"
LABEL_CORR = "재작성(구방식)"
HEADER_RAW = "STT 직후 %"
HEADER_CORR = "재작성 %"

# 샘플 표시명 (회차 숫자 대신 내용 기준)
SAMPLE_NAME = {
    "assembly": "추경 의결",
    "assembly2": "인사청문 일정",
    "ktv": "KTV 브리핑",
}
SAMPLE_DESC = {
    "assembly": "환노위, 2025-04-25, 18.5분, 속기 CER",
    "assembly2": "환노위, 2025-07-04, 12.6분, 속기 CER",
    "ktv": "2025-12-31, 11.7분, 오프닝 텍스트 커버리지",
}


def set_kr_font(run, size=11, bold=False, color: RGBColor | None = None):
    run.font.size = Pt(size)
    run.bold = bold
    run.font.name = "Apple SD Gothic Neo"
    if color is not None:
        run.font.color.rgb = color
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), "Apple SD Gothic Neo")


def add_heading(doc: Document, text: str, level: int = 1):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        set_kr_font(run, size=16 if level == 1 else 13, bold=True)


def add_bullets(doc: Document, items: list[str], bold_prefix: bool = False):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        if bold_prefix and ":" in item:
            head, rest = item.split(":", 1)
            r1 = p.add_run(f"{head}:")
            set_kr_font(r1, size=11, bold=True)
            r2 = p.add_run(rest)
            set_kr_font(r2, size=11)
        else:
            set_kr_font(p.add_run(item), size=11)


def add_body(doc: Document, text: str, bold: bool = False):
    p = doc.add_paragraph()
    set_kr_font(p.add_run(text), size=11, bold=bold)
    return p


def style_axes(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", linestyle="-", linewidth=0.4, alpha=0.35)
    ax.set_axisbelow(True)


def get_row(results, sample_id, model, corrected):
    return next(
        r
        for r in results
        if r["sampleId"] == sample_id
        and r["model"] == model
        and r["corrected"] is corrected
    )


def place_legend_outside(ax, ncol: int = 2):
    """범례를 플롯 위쪽 바깥에 두어 막대와 겹치지 않게."""
    ax.legend(
        frameon=False,
        loc="lower center",
        bbox_to_anchor=(0.5, 1.02),
        ncol=ncol,
        fontsize=9,
        handlelength=1.2,
        columnspacing=1.2,
    )


def chart_accuracy(results, sample_id: str, path: Path, title: str):
    models, raw_vals, corr_vals = [], [], []
    for model in MODEL_ORDER:
        raw = get_row(results, sample_id, model, False)
        corr = get_row(results, sample_id, model, True)
        models.append(MODEL_SHORT[model])
        raw_vals.append(raw["accuracyPct"])
        corr_vals.append(corr["accuracyPct"])

    fig, ax = plt.subplots(figsize=(8.2, 4.6))
    x = range(len(models))
    w = 0.36
    ax.bar([i - w / 2 for i in x], raw_vals, width=w, label=LABEL_RAW, color=C_RAW)
    ax.bar([i + w / 2 for i in x], corr_vals, width=w, label=LABEL_CORR, color=C_CORR)
    ax.set_xticks(list(x))
    ax.set_xticklabels(models)
    ax.set_ylim(0, 112)
    ax.set_ylabel("정확도 (%)")
    ax.set_title(title, fontweight="bold", pad=28)
    style_axes(ax)
    place_legend_outside(ax, ncol=2)
    for i, (a, b) in enumerate(zip(raw_vals, corr_vals)):
        ax.text(
            i - w / 2,
            a + 1.5,
            f"{a:.1f}",
            ha="center",
            va="bottom",
            fontsize=8,
            fontweight="bold",
            color=C_RAW,
        )
        ax.text(
            i + w / 2,
            b + 1.5,
            f"{b:.1f}",
            ha="center",
            va="bottom",
            fontsize=8,
            fontweight="bold",
            color=C_CORR,
        )
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def chart_latency(results, path: Path):
    labels = [MODEL_SHORT[m] for m in MODEL_ORDER]
    series = [
        ("assembly", SAMPLE_NAME["assembly"], C_ASM),
        ("assembly2", SAMPLE_NAME["assembly2"], C_ASM2),
        ("ktv", SAMPLE_NAME["ktv"], C_KTV),
    ]
    fig, ax = plt.subplots(figsize=(8.6, 4.8))
    x = list(range(len(MODEL_ORDER)))
    n = len(series)
    w = 0.22
    for si, (sid, name, color) in enumerate(series):
        vals = [get_row(results, sid, m, False)["sttMs"] / 1000 for m in MODEL_ORDER]
        offset = (si - (n - 1) / 2) * w
        ax.bar([i + offset for i in x], vals, width=w, label=name, color=color)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("STT 소요 (초)")
    ax.set_title("모델별 STT 처리 시간", fontweight="bold", pad=28)
    style_axes(ax)
    place_legend_outside(ax, ncol=3)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def chart_chars_compare(results, path: Path):
    """국회 2샘플 원본 출력 길이 vs 속기."""
    refs = {"assembly": 7681, "assembly2": 4070}
    fig, axes = plt.subplots(1, 2, figsize=(9.2, 4.2))
    for ax, sid, title in [
        (axes[0], "assembly", SAMPLE_NAME["assembly"]),
        (axes[1], "assembly2", SAMPLE_NAME["assembly2"]),
    ]:
        vals = [get_row(results, sid, m, False)["textChars"] for m in MODEL_ORDER]
        labels = [MODEL_SHORT[m] for m in MODEL_ORDER]
        colors = [C_RAW, C_CORR, C_ASM2, "#7A5C8A"]
        bars = ax.bar(labels, vals, color=colors)
        ref = refs[sid]
        ymax = max(max(vals), ref) * 1.18
        ax.set_ylim(0, ymax)
        ax.axhline(ref, color="#5C6570", linestyle="--", linewidth=1.2)
        ax.set_title(f"{title} 출력 길이", fontweight="bold")
        ax.set_ylabel("문자 수")
        style_axes(ax)
        for bar, v in zip(bars, vals):
            # 속기 점선과 가까우면 막대 안쪽에 라벨
            if abs(v - ref) / max(ref, 1) < 0.04:
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    v - ymax * 0.06,
                    str(v),
                    ha="center",
                    va="top",
                    fontsize=8,
                    fontweight="bold",
                    color="white",
                )
            else:
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    v + ymax * 0.015,
                    str(v),
                    ha="center",
                    fontsize=8,
                    fontweight="bold",
                )
        ax.text(
            0.02,
            0.98,
            f"점선=속기 {ref}자",
            transform=ax.transAxes,
            ha="left",
            va="top",
            fontsize=8,
            color="#5C6570",
            fontweight="bold",
        )
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def speaker_counts(path: Path) -> dict[str, int]:
    if not path.exists():
        return {}
    c: Counter[str] = Counter()
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\[([^\]]+)\]", line.strip())
        if m:
            c[m.group(1)] += 1
    return dict(c)


def chart_diarize_speakers(path: Path):
    datasets = [
        ("assembly", SAMPLE_NAME["assembly"]),
        ("assembly2", SAMPLE_NAME["assembly2"]),
        ("ktv", SAMPLE_NAME["ktv"]),
    ]
    fig, axes = plt.subplots(1, 3, figsize=(10.4, 3.8))
    for ax, (sid, title) in zip(axes, datasets):
        data = speaker_counts(BENCH / f"{sid}__gpt-4o-transcribe-diarize__diarized.txt")
        labels = list(data.keys())
        vals = list(data.values())
        colors = [C_SPEAKERS[i % len(C_SPEAKERS)] for i in range(len(labels))]
        ymax = max(vals) * 1.22 if vals else 1
        ax.set_ylim(0, ymax)
        ax.bar(labels, vals, color=colors)
        ax.set_title(f"{title} 화자 구간", fontweight="bold")
        ax.set_xlabel("AI 라벨")
        ax.set_ylabel("구간 수")
        style_axes(ax)
        for i, v in enumerate(vals):
            ax.text(
                i,
                v + ymax * 0.02,
                str(v),
                ha="center",
                fontsize=8,
                fontweight="bold",
                color="#2a2e35",
            )
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def chart_full_cer_overview(results, path: Path):
    """속기 CER 샘플 2개 원본 정확도 한눈에."""
    sids = [
        ("assembly", SAMPLE_NAME["assembly"]),
        ("assembly2", SAMPLE_NAME["assembly2"]),
    ]
    fig, ax = plt.subplots(figsize=(8.4, 4.6))
    x = list(range(len(MODEL_ORDER)))
    w = 0.36
    for si, (sid, name) in enumerate(sids):
        vals = [get_row(results, sid, m, False)["accuracyPct"] for m in MODEL_ORDER]
        offset = -w / 2 if si == 0 else w / 2
        color = C_ASM if si == 0 else C_ASM2
        ax.bar([i + offset for i in x], vals, width=w, label=name, color=color)
        for i, v in enumerate(vals):
            ax.text(
                i + offset,
                v + 1.2,
                f"{v:.1f}",
                ha="center",
                fontsize=8,
                fontweight="bold",
                color=color,
            )
    ax.set_xticks(x)
    ax.set_xticklabels([MODEL_SHORT[m] for m in MODEL_ORDER])
    ax.set_ylim(0, 112)
    ax.set_ylabel("CER 정확도 (%)")
    ax.set_title("국회 속기 대비 STT 직후 정확도", fontweight="bold", pad=28)
    style_axes(ax)
    place_legend_outside(ax, ncol=2)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def chart_semantic(semantic: dict, path: Path):
    rows = semantic["results"]
    metrics = [
        ("factCoverage", "사실"),
        ("speakerAttribution", "화자"),
        ("decisionCapture", "결정"),
        ("actionCapture", "액션"),
        ("overall", "종합"),
    ]
    names = [r["sampleName"] for r in rows]
    colors = [C_ASM, C_ASM2, C_KTV]
    fig, ax = plt.subplots(figsize=(8.8, 4.8))
    x = list(range(len(metrics)))
    n = len(rows)
    w = 0.24
    for si, row in enumerate(rows):
        vals = [row[m[0]] for m in metrics]
        offset = (si - (n - 1) / 2) * w
        ax.bar(
            [i + offset for i in x],
            vals,
            width=w,
            label=names[si],
            color=colors[si % len(colors)],
        )
        for i, v in enumerate(vals):
            ax.text(
                i + offset,
                v + 1.2,
                str(v),
                ha="center",
                fontsize=7,
                fontweight="bold",
                color=colors[si % len(colors)],
            )
    ax.set_xticks(x)
    ax.set_xticklabels([m[1] for m in metrics])
    ax.set_ylim(0, 112)
    ax.set_ylabel("점수 (0~100)")
    ax.set_title("의미 보정 평가 (속기 대비, CER 아님)", fontweight="bold", pad=28)
    style_axes(ax)
    place_legend_outside(ax, ncol=3)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def chart_semantic_vs_rewrite(results, semantic: dict, path: Path):
    """구방식 재작성 CER vs 의미 보정 종합 점수."""
    # assembly/assembly2 only for CER
    sids = ["assembly", "assembly2"]
    names = [SAMPLE_NAME[s] for s in sids]
    rewrite_cer = [
        get_row(results, sid, "gpt-4o-transcribe-diarize", True)["accuracyPct"]
        for sid in sids
    ]
    sem_map = {r["sampleId"]: r["overall"] for r in semantic["results"]}
    sem_scores = [sem_map[sid] for sid in sids]

    fig, ax = plt.subplots(figsize=(7.6, 4.4))
    x = list(range(len(names)))
    w = 0.34
    ax.bar([i - w / 2 for i in x], rewrite_cer, width=w, label="재작성 CER", color=C_CORR)
    ax.bar([i + w / 2 for i in x], sem_scores, width=w, label="의미 보정 종합", color=C_ASM2)
    ax.set_xticks(x)
    ax.set_xticklabels(names)
    ax.set_ylim(0, 112)
    ax.set_ylabel("점수")
    ax.set_title("구방식 재작성 vs 의미 보정", fontweight="bold", pad=28)
    style_axes(ax)
    place_legend_outside(ax, ncol=2)
    for i, (a, b) in enumerate(zip(rewrite_cer, sem_scores)):
        ax.text(i - w / 2, a + 1.5, f"{a:.1f}", ha="center", fontsize=8, fontweight="bold", color=C_CORR)
        ax.text(i + w / 2, b + 1.5, str(b), ha="center", fontsize=8, fontweight="bold", color=C_ASM2)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def add_table(doc: Document, headers: list[str], rows: list[list[str]]):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        set_kr_font(cell.paragraphs[0].add_run(h), size=10, bold=True)
    for r_i, row in enumerate(rows):
        for c_i, val in enumerate(row):
            cell = table.rows[r_i + 1].cells[c_i]
            cell.text = ""
            set_kr_font(cell.paragraphs[0].add_run(val), size=10, bold=(c_i == 0))
    doc.add_paragraph()


def main():
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    OFFICE.mkdir(parents=True, exist_ok=True)
    data = json.loads((BENCH / "results.json").read_text(encoding="utf-8"))
    results = data["results"]
    semantic = json.loads(
        (BENCH / "semantic-structure-results.json").read_text(encoding="utf-8"),
    )
    chunked = json.loads(
        (BENCH / "chunked-continue-results.json").read_text(encoding="utf-8"),
    )

    p_overview = CHART_DIR / "chart-cer-overview.png"
    p_sem = CHART_DIR / "chart-semantic.png"
    p_chars = CHART_DIR / "chart-chars.png"

    chart_full_cer_overview(results, p_overview)
    chart_semantic(semantic, p_sem)
    chart_chars_compare(results, p_chars)

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_kr_font(title.add_run("STT 모델 벤치 요약"), size=20, bold=True)
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_kr_font(sub.add_run("2026-07-22"), size=11)

    add_heading(doc, "1. 샘플", 1)
    add_bullets(
        doc,
        [
            "추경 의결 18.5분, 인사청문 12.6분 (속기 CER)",
            "KTV 브리핑 11.7분 (오프닝 커버리지)",
        ],
    )

    add_heading(doc, "2. 목표 메커니즘", 1)
    add_bullets(
        doc,
        [
            "STT: 길이 확인 → N분 청크 → API 이어전사(직전 문맥 prompt) → 연결·중복 제거",
            "화자: (A) 4o-diarize 일체형 또는 (B) 자체/오픈소스 분리 후 구간 정렬",
            "보정: 요약·타임라인·결정·액션 (단어 CER 교정 제외)",
        ],
        bold_prefix=True,
    )
    add_body(doc, "화자 구분: 우리가 못 만드는 것 아님. 별도 모듈로 가능.", bold=True)
    add_bullets(
        doc,
        [
            "예: pyannote.audio 등 → API $0, GPU/서버 운영비",
            "핵심 난이도: STT 시계열과 화자 구간 정렬",
            "OpenAI diarize는 STT+화자 묶음(편의·운영 단순, 분당 단가 2배급)",
        ],
    )

    add_heading(doc, "3. STT CER (속기)", 1)
    add_body(
        doc,
        "추경 4o / 4o-mini = 청크 이어쓰기 반영. 나머지 = 통째 1회.",
        bold=True,
    )
    doc.add_picture(str(p_overview), width=Inches(6.0))
    add_table(
        doc,
        ["모델", "추경", "인사청문", "비고"],
        [
            [
                MODEL_SHORT[m],
                str(get_row(results, "assembly", m, False)["accuracyPct"]),
                str(get_row(results, "assembly2", m, False)["accuracyPct"]),
                (
                    "청크이어"
                    if get_row(results, "assembly", m, False).get("pipeline")
                    == "chunked-continue"
                    else "통째"
                ),
            ]
            for m in MODEL_ORDER
        ],
    )
    doc.add_picture(str(p_chars), width=Inches(6.0))

    add_heading(doc, "4. 추경 4o 이어쓰기 (통째 → 청크)", 1)
    add_bullets(
        doc,
        [
            "방식: 5분×4청크, 직전 끝문맥 prompt",
            "prompt만(통째): 효과 거의 없음",
        ],
        bold_prefix=True,
    )
    add_table(
        doc,
        ["모델", "통째 CER", "prompt만", "청크이어", "문자"],
        [
            [
                str(r["model"]).replace("gpt-", ""),
                f"{r['baselineAccuracyPct']}%",
                f"{r['promptOnlyAccuracyPct']}%",
                f"{r['accuracyPct']}%",
                f"{r['baselineTextChars']}→{r['textChars']}",
            ]
            for r in chunked["results"]
        ],
    )
    add_bullets(
        doc,
        [
            "통째: 개의~전반 의결만",
            "청크이어: 정혜경·비정규직·후반 질의·산회 직전 포함",
        ],
        bold_prefix=True,
    )

    add_heading(doc, "5. 비용 타산 (메커니즘 조건)", 1)
    add_body(doc, "총비용 ≈ STT(분당×길이) + 의미보정(~$0.01/건). 청크는 품질용, 총액은 길이.", bold=True)
    mech = json.loads((BENCH / "mechanism-cost.json").read_text(encoding="utf-8"))
    add_table(
        doc,
        ["파이프라인", "화자", "18.5분", "1시간"],
        [
            [
                p["name"],
                {"self": "자체", "none": "없음", "openai-diarize": "API일체"}[
                    p["speakers"]
                ],
                f"${p['costs']['추경 18.5분']['total']}",
                f"${p['costs']['1시간']['total']}",
            ]
            for p in mech["pipelines"]
        ],
    )
    add_bullets(
        doc,
        [
            "mini+자체화자: 1시간 $0.19 (STT $0.18 + 의미 $0.01)",
            "diarize 일체형: 1시간 $0.37",
            "자체 화자 API비 $0, 대신 인프라비(여기 표에는 미포함)",
        ],
        bold_prefix=True,
    )

    add_heading(doc, "6. 의미 보정", 1)
    add_bullets(
        doc,
        [
            "정의: 요약, 타임라인(누가/무엇을), 결정, 액션",
            "제외: 원음 단어 교정(CER)",
        ],
        bold_prefix=True,
    )
    doc.add_picture(str(p_sem), width=Inches(6.0))
    add_table(
        doc,
        ["샘플", "사실", "결정", "액션", "종합"],
        [
            [
                r["sampleName"],
                str(r["factCoverage"]),
                str(r["decisionCapture"]),
                str(r["actionCapture"]),
                str(r["overall"]),
            ]
            for r in semantic["results"]
        ],
    )
    add_bullets(
        doc,
        [
            "재작성 CER(추경) 54.6 vs 의미 보정 종합 88 → 축이 다름",
        ],
    )

    add_heading(doc, "7. 권장", 1)
    add_bullets(
        doc,
        [
            "비용+화자: mini 청크이어 + 자체 화자",
            "운영 단순+화자: 4o-diarize 일체형",
            "보정: 의미 정리만",
        ],
        bold_prefix=True,
    )

    doc.save(OUT_DOCX)
    print(OUT_DOCX)


if __name__ == "__main__":
    main()
