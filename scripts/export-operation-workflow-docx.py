#!/usr/bin/env python3
"""Faith 동작 워크플로우 DOCX. 최종 저장: Faith-office/"""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Faith-office" / "Faith_동작워크플로우_2026-07-25.docx"


def set_kr_font(run, size=11, bold=False):
    run.font.size = Pt(size)
    run.bold = bold
    run.font.name = "Apple SD Gothic Neo"
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), "Apple SD Gothic Neo")


def h(doc: Document, text: str, level: int = 1):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        set_kr_font(run, size=16 if level == 1 else 13, bold=True)


def body(doc: Document, text: str, bold: bool = False):
    p = doc.add_paragraph()
    set_kr_font(p.add_run(text), size=11, bold=bold)


def bullets(doc: Document, items: list[str]):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        set_kr_font(p.add_run(item), size=11)


def flow(doc: Document, steps: list[str]):
    """워크플로우 단계. A > B > C 형태."""
    for i, step in enumerate(steps, start=1):
        p = doc.add_paragraph(style="List Number")
        set_kr_font(p.add_run(step), size=11)


def main():
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Apple SD Gothic Neo"
    style.font.size = Pt(11)
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), "Apple SD Gothic Neo")

    h(doc, "Faith 동작 워크플로우")
    body(doc, "날짜: 2026-07-25")
    body(doc, "범위: 제품이 실제로 돌아가는 흐름만. 인프라, 비밀키, 서버 사양 제외.")
    body(doc, "표기: 팀원 / 팀장 / 팀 대표")

    h(doc, "1. 전체 구조", 1)
    bullets(
        doc,
        [
            "계정 로그인 후 개인 워크스페이스 또는 팀 워크스페이스를 고른다.",
            "개인: 기록 시작, 업로드로 내 회의록을 만든다.",
            "팀: 초대로 모이고, 온라인 음성으로 모인 뒤, 권한이 있을 때만 기록을 켠다.",
            "기록이 끝나면 STT, 구조화, 마스킹을 거쳐 회의 기록이 된다.",
        ],
    )

    h(doc, "2. 가입, 로그인", 1)
    flow(
        doc,
        [
            "이메일 가입 또는 Google, 네이버, X로 로그인",
            "세션 발급",
            "대시보드 진입, 개인 워크스페이스가 기본",
        ],
    )

    h(doc, "3. 워크스페이스 전환", 1)
    flow(
        doc,
        [
            "왼쪽 메뉴에서 개인 또는 팀 선택",
            "팀이 없으면 팀 안내, 플랜 유도 화면",
            "팀이 있으면 팀 이름 메뉴로 진입, 역할에 맞는 화면 표시",
        ],
    )
    bullets(
        doc,
        [
            "팀 설정은 개인 공간에 적용되지 않는다.",
            "개인 설정으로 팀 보안을 약화할 수 없다.",
        ],
    )

    h(doc, "4. 개인 회의 기록", 1)
    h(doc, "4-1. 기록 시작, 업로드", 2)
    flow(
        doc,
        [
            "홈에서 기록 시작 또는 파일 업로드, 보관함 선택",
            "회의 항목 생성, 처리 중 표시",
            "STT 전사",
            "구조화: 요약, 키워드, 타임라인, 대화, 결정, 액션",
            "개인정보 마스킹",
            "회의 기록 목록, 상세에 반영",
        ],
    )
    h(doc, "4-2. 다시보기", 2)
    flow(
        doc,
        [
            "회의 기록에서 항목 선택",
            "요약, 참석자, 타임라인, 첨부 확인",
            "타임라인 구간 선택 시 해당 대화로 이동",
            "가려진 값은 정책, 권한에 따라 원문 확인 가능",
        ],
    )

    h(doc, "5. 팀 구성", 1)
    h(doc, "5-1. 팀 만들기", 2)
    flow(
        doc,
        [
            "팀 플랜, 팀 시작으로 팀 생성",
            "생성자가 팀 대표가 됨",
            "팀 이름, 정책 초기값 설정",
            "멤버 초대 가능 상태",
        ],
    )
    h(doc, "5-2. 초대, 수락, 거절", 2)
    flow(
        doc,
        [
            "팀 대표 또는 권한이 있는 팀장이 핸들, 초대 코드로 초대",
            "초대 알림 수신",
            "수락: 팀 멤버 합류, 역할 부여",
            "거절: 사유 선택 가능, 합류하지 않음",
            "초대 만료 시 무효",
        ],
    )
    bullets(
        doc,
        [
            "역할: 팀원, 팀장, 팀 대표",
            "역할만으로 회의 참가, 기록 열람이 자동 열리지 않음",
            "회의 초대 또는 기록 접근이 따로 있어야 함",
            "팀장 임명, 감사 로그는 팀 대표만",
        ],
    )

    h(doc, "6. 팀 일정", 1)
    h(doc, "6-1. 일정 생성", 2)
    flow(
        doc,
        [
            "권한이 있는 멤버가 온라인 음성 일정 생성",
            "제목, 시작, 소요 시간, 주최자, 초대 참가자 필수, 백업 호스트 선택",
            "시간 겹침이면 생성 차단, 바로 이어지는 일정은 허용",
            "초대자에게 미확인 알림 발송",
        ],
    )
    h(doc, "6-2. 미확인, 확인", 2)
    flow(
        doc,
        [
            "알림 센터와 팀 메인에 미확인 표시",
            "어느 쪽이든 확인하면 양쪽에서 사라짐",
            "다가오는 예정 회의 목록에는 남음",
            "확인은 일정 인지이며 참석 수락이 아님",
        ],
    )
    h(doc, "6-3. 변경, 취소", 2)
    flow(
        doc,
        [
            "일정 변경 또는 취소",
            "알림 센터로 변경, 취소 안내",
            "취소 시 다가오는 목록에서 제거",
            "주요 변경은 감사 로그에 남을 수 있음",
        ],
    )

    h(doc, "7. 팀 온라인 회의", 1)
    h(doc, "7-1. 입장", 2)
    flow(
        doc,
        [
            "시작 10분 전부터 참가 가능",
            "참가 전 마이크, 입력 장치, 입력 레벨 확인",
            "음성 방에 입장",
            "기본 상태는 기록 전, 음성만 연결, STT 미사용",
        ],
    )
    h(doc, "7-2. 기록 켜기, 끄기", 2)
    flow(
        doc,
        [
            "방에 있는 주최자 또는 이어받은 백업 호스트가 기록 시작",
            "전원에게 기록 중 표시",
            "선택한 STT가 동작하는 구간만 할당량 집계",
            "주최자, 백업 호스트가 기록 중지 가능",
            "회의에 참가하지 않은 팀 대표는 원격으로 기록을 켤 수 없음",
        ],
    )
    bullets(
        doc,
        [
            "팀 대표가 주최자 전 기록 기본값과 잠금을 정함",
            "잠금이 없으면 팀장이 회의별로 바꿀 수 있음",
        ],
    )
    h(doc, "7-3. 주최자 부재, 이전", 2)
    flow(
        doc,
        [
            "지정 백업이 방에 있으면 자동으로 주최자 이전",
            "없으면 팀 대표에게 알림",
            "팀 대표는 이미 초대, 권한이 있는 참가자만 대체 지정",
            "시작 후 주최자, 유효 백업이 없으면 경고 후 방 종료",
            "이때 퇴장만으로 미참가로 표시되지 않음",
        ],
    )
    h(doc, "7-4. 종료 후", 2)
    flow(
        doc,
        [
            "회의 종료",
            "기록이 켜졌던 구간은 처리 파이프라인으로 회의록 생성",
            "기록 열람 권한이 있는 멤버만 열람",
            "종료 후 기록 생성 알림은 보내지 않음",
        ],
    )

    h(doc, "8. 알림", 1)
    flow(
        doc,
        [
            "이벤트 발생: 초대, 일정, 변경, 취소, 미참가, 충돌, 주최자 부재, 공지 등",
            "알림 센터에 쌓임, 종류에 따라 팀 메인에도 표시",
            "사용자 확인 또는 조건 해소 시 화면에서 정리",
            "보존 기간이 지나면 삭제",
        ],
    )

    h(doc, "9. 마스킹", 1)
    flow(
        doc,
        [
            "회의록 처리 중 개인정보 패턴 감지",
            "기본은 가려진 상태로 저장, 표시",
            "권한이 있으면 원문 확인",
            "팀에서는 팀 마스킹, 언마스크 정책이 개인보다 우선할 수 있음",
        ],
    )

    h(doc, "10. 공지", 1)
    flow(
        doc,
        [
            "팀 대표 또는 팀장이 공지 작성",
            "팀 화면에 표시",
            "읽음 처리, 제목 흐림 또는 확인 후 숨김은 팀 정책",
            "화면에서 닫아도 필요한 서버 이력은 남을 수 있음",
        ],
    )

    h(doc, "11. 권한 한 줄 요약", 1)
    bullets(
        doc,
        [
            "팀원: 초대받은 회의 참가, 공지 확인, 예정 확인",
            "팀장: 일정, 공지, 위임된 관리, 잠금 없는 회의별 기록 정책",
            "팀 대표: 팀 이름, 멤버, 역할, 정책, 할당, 감사, 팀장 임명",
            "회의 참가, 기록 열람은 역할과 별도로 초대, 접근 권한이 필요",
        ],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
