"""정책브리핑에서 평가용 음성과 정답 대본을 함께 받아온다.

왜 이 출처인가:
- 브리핑 전문이 발표문뿐 아니라 기자 질의응답까지 거의 말한 그대로 적혀 있다.
  국회 속기록은 군말을 걷어낸 정리본이라 정답으로 쓰면 모델이 정확히 받을수록
  오히려 틀린 것으로 잡힌다. 브리핑 전문은 그 왜곡이 훨씬 적다.
- 화자가 여럿이고 <질문> <답변> 표시가 있어 화자분리 채점에도 쓸 수 있다.
- 기자 질문은 마이크를 안 쓰는 경우가 많아 실제 회의장 잡음에 가깝다.
- 본문은 공공누리 제1유형이라 출처만 밝히면 상업적 이용에 걸리지 않는다.
  다만 영상 자체는 저작권이 별도일 수 있어 내부 평가용으로만 쓴다.

사용:
  python3 scripts/fetch-briefing-fixture.py 156735924 [별칭]
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

OUT_DIR = Path(".data/stt-bench/fixtures")
PAGE = "https://www.korea.kr/briefing/policyBriefingView.do?newsId={}"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.korea.kr/"}

# 마이크를 안 써서 안 들린 부분. 정답에 없으니 채점에서 빼야 한다.
INAUDIBLE = "***"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def strip_tags(fragment: str) -> str:
    fragment = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"</p>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return html.unescape(fragment)


# 브리핑이 끝난 뒤 붙는 안내문이다. 발화가 아니므로 정답에서 뺀다.
TAIL_MARKS = ("<끝>", "공공누리 출처표시", "<자료출처=", "이전다음기사")
# 전사가 아니라 편집자가 붙인 표시다.
NOTE_LINE = re.compile(r"^(\[질문·답변\]|※.*)$")


def extract_body(page: str) -> str:
    m = re.search(r'class="view_cont"(.*?)(?:<div class="(?:view_bottom|share)|</article)', page, re.S)
    chunk = m.group(1) if m else page
    text = strip_tags(chunk)

    cut = min((text.find(mark) for mark in TAIL_MARKS if text.find(mark) > 0), default=-1)
    if cut > 0:
        text = text[:cut]

    lines = [re.sub(r"[ \t\u00a0]+", " ", ln).strip() for ln in text.split("\n")]
    keep = [ln for ln in lines if ln and len(ln) > 1 and not NOTE_LINE.match(ln)]
    return "\n".join(keep)


def split_turns(body: str) -> list[dict]:
    """<질문> <답변> 표시를 화자 경계로 삼아 발언 단위로 끊는다."""
    marked = re.sub(r"<\s*(질문|답변)\s*>", r"\n\1\t", body)
    turns: list[dict] = []
    for line in marked.split("\n"):
        line = line.strip()
        if not line:
            continue
        if "\t" in line:
            role, text = line.split("\t", 1)
        else:
            role, text = "발표", line
        text = text.strip()
        if text:
            turns.append({"role": role, "text": text})
    return turns


def video_url(page: str) -> str | None:
    m = re.search(r'<source src="(https://[^"]+\.mp4)"', page)
    return m.group(1) if m else None


def meta_of(page: str) -> dict:
    def pick(pattern: str) -> str:
        m = re.search(pattern, page, re.S)
        return re.sub(r"\s+", " ", strip_tags(m.group(1))).strip() if m else ""

    title = pick(r"<title>(.*?)</title>").split(" - ")[0]
    return {
        "title": title,
        "date": pick(r'class="date"[^>]*>(.*?)<'),
        "speaker": pick(r'class="[^"]*speaker[^"]*"[^>]*>(.*?)</'),
    }


def to_mp3(url: str, dst: Path, minutes: int) -> None:
    """영상은 안 받고 소리만 뽑는다.

    브리핑 원본은 720p라 한 시간짜리가 900MB에 가깝다. 우리는 소리만 필요하니
    ffmpeg가 주소에서 바로 읽어 변환하게 한다. 길이도 잘라서 앞부분만 쓴다.
    """
    subprocess.run(
        ["ffmpeg", "-y",
         "-user_agent", HEADERS["User-Agent"],
         "-headers", f"Referer: {HEADERS['Referer']}\r\n",
         "-i", url,
         "-t", str(minutes * 60),
         "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", str(dst)],
        check=True, capture_output=True,
    )


def probe_seconds(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("newsId를 넘겨라. 예: 156735924")
    news_id = sys.argv[1]
    alias = sys.argv[2] if len(sys.argv) > 2 else f"briefing-{news_id}"
    minutes = int(sys.argv[3]) if len(sys.argv) > 3 else 15

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    page = get(PAGE.format(news_id)).decode("utf-8", "replace")

    body = extract_body(page)
    turns = split_turns(body)
    src = video_url(page)
    if not src:
        raise SystemExit("영상 주소를 못 찾았다. 영상 없는 브리핑일 수 있다.")

    mp3 = OUT_DIR / f"{alias}.mp3"
    to_mp3(src, mp3, minutes)

    ref = OUT_DIR / f"{alias}.reference.txt"
    ref.write_text(
        "\n".join(f"[{t['role']}] {t['text']}" for t in turns) + "\n",
        encoding="utf-8",
    )

    chars = sum(len(t["text"]) for t in turns)
    info = {
        **meta_of(page),
        "newsId": news_id,
        "sourceUrl": PAGE.format(news_id),
        "videoUrl": src,
        "license": "공공누리 제1유형 (본문 텍스트). 영상은 별도 저작권 확인 필요",
        "durationSec": round(probe_seconds(mp3), 1),
        "turns": len(turns),
        "questions": sum(1 for t in turns if t["role"] == "질문"),
        "refChars": chars,
        "inaudibleMarks": body.count(INAUDIBLE),
    }
    (OUT_DIR / f"{alias}.meta.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"{alias}: {info['title']}")
    print(f"  길이 {info['durationSec']}초, 발언 {info['turns']}개 "
          f"(질문 {info['questions']}개), 정답 {chars}자, 안 들림 {info['inaudibleMarks']}곳")


if __name__ == "__main__":
    main()
