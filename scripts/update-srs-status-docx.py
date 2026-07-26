#!/usr/bin/env python3
"""Faith_요구사항명세서.docx 상태·하늘색(완료) 반영. 최종: Faith-office/"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from docx.table import Table, _Cell

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Faith-office" / "Faith_요구사항명세서.docx"
OUT = ROOT / "Faith-office" / "Faith_요구사항명세서.docx"

# 기존 문서와 동일
HEADER_FILL = "EEF3F8"
DONE_FILL = "EAF6FD"

# 접근까지 설계·구현 완료된 1순위만. 목업·미완은 제외.
DONE_IDS = {
    "R-01",  # 업로드·보관함·원본 등록
    "R-02",  # STT 파이프라인
    "R-04",  # 구조화 요약
    "R-05",  # 액션 아이템
    "R-06",  # 가입·로그인·세션 보호
    "R-07",  # 팀 RBAC·회의 접근
    "R-08",  # 마스킹
    "R-09",  # 팀 감사 로그 조회
    "R-10",  # 웹 UI e2e
    "R-11",  # REST API 연동
}

# 의도적으로 완료로 두지 않음
# R-03 문장 보정 전후 비교 UI 없음
# R-12 중간 저장·복구 미완


def set_kr_font(run, size=11, bold=False):
    run.font.size = Pt(size)
    run.bold = bold
    run.font.name = "Apple SD Gothic Neo"
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), "Apple SD Gothic Neo")


def set_cell_fill(cell: _Cell, fill: str | None):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:shd")):
        tcPr.remove(old)
    if not fill:
        return
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def set_cell_text(cell: _Cell, text: str, *, bold: bool = False):
    # 기존 문단 스타일 유지하며 텍스트만 교체
    if cell.paragraphs:
        p = cell.paragraphs[0]
        for r in list(p.runs):
            r._element.getparent().remove(r._element)
        run = p.add_run(text)
        set_kr_font(run, bold=bold)
        for extra in cell.paragraphs[1:]:
            extra._element.getparent().remove(extra._element)
    else:
        p = cell.add_paragraph()
        run = p.add_run(text)
        set_kr_font(run, bold=bold)


def replace_paragraph_text(doc: Document, contains: str, new_text: str) -> bool:
    for p in doc.paragraphs:
        if contains in p.text:
            for r in list(p.runs):
                r._element.getparent().remove(r._element)
            run = p.add_run(new_text)
            set_kr_font(run)
            return True
    return False


def find_req_table(doc: Document) -> Table | None:
    for table in doc.tables:
        if not table.rows:
            continue
        headers = [c.text.strip() for c in table.rows[0].cells]
        if headers[:5] == ["ID", "기능", "요구 (shall)", "수용 기준", "상태"]:
            return table
    return None


def find_meta_table(doc: Document) -> Table | None:
    for table in doc.tables:
        if not table.rows:
            continue
        cells = [c.text.strip() for c in table.rows[0].cells]
        if "문서 ID" in cells and "버전" in cells:
            return table
    return None


def find_history_table(doc: Document) -> Table | None:
    for table in doc.tables:
        if not table.rows:
            continue
        headers = [c.text.strip() for c in table.rows[0].cells]
        if headers[:3] == ["일자", "버전", "요약"]:
            return table
    return None


def main():
    doc = Document(str(SRC))

    meta = find_meta_table(doc)
    if meta and len(meta.rows) >= 2:
        # row0: 문서 ID | Faith-SRS | 버전 | v1.9
        set_cell_text(meta.rows[0].cells[3], "v2.0")
        set_cell_fill(meta.rows[0].cells[0], HEADER_FILL)
        set_cell_fill(meta.rows[0].cells[2], HEADER_FILL)
        # row1: 기준일 | ... | 상태 | ...
        set_cell_text(meta.rows[1].cells[1], "2026-07-25")
        set_cell_fill(meta.rows[1].cells[0], HEADER_FILL)
        set_cell_fill(meta.rows[1].cells[2], HEADER_FILL)

    req = find_req_table(doc)
    if not req:
        raise SystemExit("기능 요구사항 표를 찾지 못했습니다.")

    for row in req.rows[1:]:
        rid = row.cells[0].text.strip()
        if not rid.startswith("R-"):
            continue
        done = rid in DONE_IDS
        set_cell_text(row.cells[4], "완료" if done else row.cells[4].text.strip())
        # 미완은 기존 상태 유지하되, 잘못 칠해진 하늘색은 제거
        if done:
            set_cell_text(row.cells[4], "완료")
            for cell in row.cells:
                set_cell_fill(cell, DONE_FILL)
        else:
            # R-03, R-12 등: 상태 텍스트 유지(미착수/UI목업), 배경 제거
            status = row.cells[4].text.strip()
            if status == "완료":
                # 이전에 완료였다가 이번 기준에서 빠진 경우 없음
                pass
            for cell in row.cells:
                set_cell_fill(cell, None)

    # R-03, R-12 명시 (표에서 상태가 이미 맞는지 재확인)
    for row in req.rows[1:]:
        rid = row.cells[0].text.strip()
        if rid == "R-03":
            set_cell_text(row.cells[4], "미착수")
            for cell in row.cells:
                set_cell_fill(cell, None)
        elif rid == "R-12":
            set_cell_text(row.cells[4], "미착수")
            for cell in row.cells:
                set_cell_fill(cell, None)
        elif rid in DONE_IDS:
            set_cell_text(row.cells[4], "완료")
            for cell in row.cells:
                set_cell_fill(cell, DONE_FILL)

    # 표 헤더는 기존 헤더색 유지
    for cell in req.rows[0].cells:
        set_cell_fill(cell, HEADER_FILL)

    done_list = ", ".join(sorted(DONE_IDS, key=lambda x: int(x.split("-")[1])))
    summary = (
        f"완료(하늘색): {done_list}. "
        "실제 로그인, API, 파이프라인으로 접근, 검수 가능한 항목만 완료로 둔다. "
        "R-03 문장 보정 전후 비교, R-12 중간 저장, 복구는 미착수. "
        "목록에 섞인 mock 샘플은 완료 판정에 넣지 않는다."
    )
    replace_paragraph_text(doc, "완료: R-08 마스킹", summary) or replace_paragraph_text(
        doc, "완료(하늘색):", summary
    )

    impl_body = (
        "업로드→STT→구조화 요약, 액션→마스킹→회의 상세, "
        "인증, 팀 RBAC, 팀 감사 로그, REST API까지 접근 가능하다. "
        "문장 보정 전후 비교(R-03), 녹음 중간 저장, 복구(R-12)는 미착수다. "
        "감사 화면의 보안 추이 차트 등 mock 지표는 완료에 포함하지 않는다."
    )
    # 8.1 본문만 교체 (제목 문단은 유지)
    for p in doc.paragraphs:
        if p.text.startswith("웹 UI(R-10)") or (
            "업로드→STT" in p.text and "R-03" in p.text
        ):
            for r in list(p.runs):
                r._element.getparent().remove(r._element)
            set_kr_font(p.add_run(impl_body))
            break

    hist = find_history_table(doc)
    if hist:
        for cell in hist.rows[0].cells:
            set_cell_fill(cell, HEADER_FILL)
        last = hist.rows[-1]
        last_date = last.cells[0].text.strip()
        note = (
            "실제 접근, 구현 완료 항목만 하늘색 완료로 반영 "
            "(R-01,R-02,R-04~R-11). R-03,R-12 미착수 유지. mock 제외."
        )
        if last_date == "2026-07-25":
            set_cell_text(last.cells[1], "v2.0")
            set_cell_text(last.cells[2], note)
        else:
            row = hist.add_row()
            set_cell_text(row.cells[0], "2026-07-25")
            set_cell_text(row.cells[1], "v2.0")
            set_cell_text(row.cells[2], note)

    replace_paragraph_text(
        doc,
        "상태 기준일 2026-07-20",
        "각 항목에 수용 기준이 있다. 상태 기준일 2026-07-25. 하늘색은 완료.",
    )
    replace_paragraph_text(
        doc,
        "하늘색(EAF6FD)은 완료",
        "각 항목에 수용 기준이 있다. 상태 기준일 2026-07-25. 하늘색은 완료.",
    )

    doc.save(str(OUT))
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
