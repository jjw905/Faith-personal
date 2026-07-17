#!/usr/bin/env python3
"""
음성(STT) 기준 한국 PII 합성 라벨 생성.

전제:
- 음성 인식 결과라 특수문자(-, @, . 등)가 거의 없다.
- 숫자는 띄어 말하거나(공백), 한글 숫자(공일공…)로 나온다.
- 조사/군말/재발화("어", "그", "다시")가 많아 문장이 지저분하다.
- 은행명 전·후치, '이고/입니다/으로', 이메일 '골뱅이/점/닷' 등 구어 표현.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SURNAMES = list("김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우류전민")
GIVEN = [
    "민수", "서연", "지훈", "수빈", "하은", "도윤", "예진", "준호", "채원", "시우",
    "유진", "현우", "소율", "지아", "건우", "서준", "하준", "지안", "수아", "연우",
    "민재", "지우", "예은", "다은", "성민", "재현", "태영", "나경", "승현", "소희",
]

# 은행 별칭(구어/축약 포함)
BANKS = [
    "신한", "신한은행", "국민", "국은", "국민은행", "케이비", "우리", "우은", "우리은행",
    "하나", "하나은행", "농협", "엔에이치", "NH", "카뱅", "카카오뱅크", "카카오",
    "토뱅", "토스", "토스뱅크", "케뱅", "케이뱅크", "기업", "기은", "기업은행",
    "우체국", "새마을", "새마을금고", "부산은행", "대구은행", "수협", "신협",
]

HANGUL_DIGITS = "공일이삼사오육칠팔구"
# STT에서 흔한 숫자 발음 변이
ZERO_ALT = ["공", "영", "제로"]
ONE_ALT = ["일", "하나"]  # 전화에선 일이 정상, 하나는 STT 변형
SIX_ALT = ["육", "륙"]
SEP_ALT = ["에", "에", " ", "-", "다시", "하이픈"]
DOT_WORDS = ["점", "쩜", "닷", "도트"]
AT_WORDS = ["골뱅이", "골뱅 이", "앳", "엣", "at"]

# 철자 발음 (에이 비 씨 …)
LETTER_SPELL = {
    "a": "에이", "b": "비", "c": "씨", "d": "디", "e": "이", "f": "에프",
    "g": "지", "h": "에이치", "i": "아이", "j": "제이", "k": "케이", "l": "엘",
    "m": "엠", "n": "엔", "o": "오", "p": "피", "q": "큐", "r": "알", "s": "에스",
    "t": "티", "u": "유", "v": "브이", "w": "더블유", "x": "엑스", "y": "와이",
    "z": "제트",
}
PASSPORT_PREFIX_SPOKEN = {
    "M": ["엠", "엠이"],
    "S": ["에스", "에쓰"],
    "R": ["알", "아르"],
    "G": ["지", "쥐"],
}

# 재발화·군말 (문장 앞/중간/뒤에 삽입)
FILLERS_PRE = ["어", "그", "저기", "음", "네", "자", "그러면", "일단", "우선", "참고로"]
FILLERS_MID = ["어", "그", "다시", "그러니까", "뭐", "이제", "그게"]
FILLERS_POST = ["요", "입니다", "이에요", "예요", "네", "말씀드립니다", "부탁드려요"]

MAIL_PROVIDERS = [
    ("gmail", ["지메일", "쥐메일", "지 메일", "지멜", "구글메일"]),
    ("naver", ["네이버"]),
    ("daum", ["다음"]),
    ("hanmail", ["한메일"]),
    ("kakao", ["카카오", "카카오메일"]),
    ("hotmail", ["핫메일"]),
    ("yahoo", ["야후"]),
    ("outlook", ["아웃룩", "아웃룩메일"]),
    ("icloud", ["아이클라우드"]),
    ("nate", ["네이트"]),
    ("proton", ["프로톤", "프로톤메일"]),
    ("live", ["라이브"]),
]
DOT_WORDS = ["점", "쩜", "닷", "도트"]
AT_WORDS = ["골뱅이", "골뱅 이", "앳", "엣", "at"]
TLD_WORDS = [
    ("com", ["컴", "콤"]),
    ("net", ["넷"]),
    ("org", ["오알지"]),
    ("io", ["아이오"]),
    ("dev", ["데브"]),
    ("me", ["미"]),
    ("kr", ["케이알"]),
    ("co.kr", ["씨오케이알", "코닷케이알"]),
]


def spell_local(local: str) -> str:
    out = []
    for ch in local:
        if ch.lower() in LETTER_SPELL:
            out.append(LETTER_SPELL[ch.lower()])
        elif ch.isdigit():
            out.append(HANGUL_DIGITS[int(ch)])
        else:
            out.append(ch)
    return " ".join(out)


def to_hangul_digits(num: str) -> str:
    out = []
    for ch in num:
        if ch.isdigit():
            d = int(ch)
            if d == 0:
                out.append(random.choice(ZERO_ALT))
            elif d == 1 and random.random() < 0.15:
                out.append(random.choice(ONE_ALT))
            elif d == 6:
                out.append(random.choice(SIX_ALT))
            else:
                out.append(HANGUL_DIGITS[d])
        else:
            out.append(ch)
    return "".join(out)


def spoken_number(num: str) -> str:
    """숫자열을 음성풍으로: 공백/한글숫자/구분자/붙임 랜덤."""
    style = random.random()
    if style < 0.25:
        return num
    if style < 0.45:
        return " ".join(num)
    if style < 0.60:
        chunks = []
        i = 0
        while i < len(num):
            step = random.choice([3, 4])
            chunks.append(num[i : i + step])
            i += step
        return " ".join(chunks)
    if style < 0.75:
        return to_hangul_digits(num)
    if style < 0.88:
        # 구분자 발음 (에/다시/하이픈)
        mid = len(num) // 2
        sep = random.choice(SEP_ALT)
        return f"{to_hangul_digits(num[:mid])}{sep}{to_hangul_digits(num[mid:])}"
    cut = min(3, len(num))
    return to_hangul_digits(num[:cut]) + " " + " ".join(num[cut:])


def rand_phone() -> str:
    mid = f"{random.randint(1000, 9999)}"
    last = f"{random.randint(1000, 9999)}"
    head = random.choice(["010", "010", "011", "016", "017", "018", "019"])
    body = head + mid + last
    style = random.random()
    if style < 0.20:
        return f"{head}-{mid}-{last}"
    if style < 0.35:
        return f"{head} {mid} {last}"
    if style < 0.50:
        return body
    if style < 0.65:
        sep = random.choice(["에", "에", "다시", "하이픈"])
        return f"{to_hangul_digits(head)}{sep} {mid}{sep} {last}"
    if style < 0.80:
        return to_hangul_digits(body)
    return spoken_number(body)


def rand_email() -> str:
    user_pool = "abcdefghijklmnopqrstuvwxyz0123456789"
    user = "".join(random.choices(user_pool, k=random.randint(3, 9)))
    short = "".join(random.choices("abcdefghijklmnopqrstuvwxyz", k=random.randint(2, 5)))
    eng, spoken_list = random.choice(MAIL_PROVIDERS)
    style = random.random()

    # 로컬파트: 영문 또는 한글숫자 발음
    if random.random() < 0.25:
        local = to_hangul_digits(f"{random.randint(1000, 9999)}")
    else:
        local = user

    if style < 0.25:
        # ascii 완성형
        tld = {"gmail": "gmail.com", "naver": "naver.com", "daum": "daum.net",
               "hanmail": "hanmail.net", "kakao": "kakao.com", "hotmail": "hotmail.com",
               "yahoo": "yahoo.com", "outlook": "outlook.com", "nate": "nate.com",
               "icloud": "icloud.com", "proton": "proton.me", "live": "live.com"}[eng]
        return f"{user}@{tld}"
    if style < 0.45:
        # @ + 붙인 구어 도메인
        prov = random.choice(spoken_list).replace(" ", "")
        dot = random.choice(DOT_WORDS)
        _, tld_spoken = random.choice(TLD_WORDS)
        tld = random.choice(tld_spoken)
        return f"{user}@{prov}{dot}{tld}"
    if style < 0.65:
        # 철자 발음 로컬 (큐는 build_single 이 부여)
        at = random.choice(AT_WORDS)
        prov = random.choice(spoken_list)
        dot = random.choice(DOT_WORDS)
        _, tld_spoken = random.choice(TLD_WORDS)
        tld = random.choice(tld_spoken)
        return f"{spell_local(short)} {at} {prov} {dot} {tld}"
    # 골뱅이/앳 완전 구어
    at = random.choice(AT_WORDS)
    prov = random.choice(spoken_list)
    dot = random.choice(DOT_WORDS)
    _, tld_spoken = random.choice(TLD_WORDS)
    tld = random.choice(tld_spoken)
    return f"{local} {at} {prov} {dot} {tld}"


def rand_rrn() -> str:
    yy = random.randint(60, 99)
    mm = random.randint(1, 12)
    dd = random.randint(1, 28)
    sex = random.choice([1, 2, 3, 4])
    rest = random.randint(100000, 999999)
    body = f"{yy:02d}{mm:02d}{dd:02d}"
    tail = f"{sex}{rest}"
    r = random.random()
    if r < 0.4:
        return f"{body}-{tail}"
    if r < 0.65:
        return f"{body}{tail}"
    if r < 0.8:
        return f"{body} {tail}"
    return to_hangul_digits(body + tail)


def rand_foreign_id() -> str:
    yy = random.randint(80, 99)
    mm = random.randint(1, 12)
    dd = random.randint(1, 28)
    sex = random.choice([5, 6, 7, 8])
    rest = random.randint(100000, 999999)
    body = f"{yy:02d}{mm:02d}{dd:02d}"
    if random.random() < 0.5:
        return f"{body}-{sex}{rest}"
    return f"{body}{sex}{rest}"


def rand_card() -> str:
    parts = [f"{random.randint(1000, 9999)}" for _ in range(4)]
    r = random.random()
    if r < 0.35:
        return "".join(parts)
    if r < 0.6:
        return " ".join(parts)
    if r < 0.75:
        return to_hangul_digits("".join(parts))
    return "-".join(parts)


def rand_account() -> str:
    style = random.choice(["shinhan", "kakao", "nh", "woori", "toss", "kb", "plain"])
    if style == "shinhan":
        groups = [f"{random.randint(100, 999)}", f"{random.randint(100, 999)}", f"{random.randint(100000, 999999)}"]
    elif style == "kakao":
        groups = ["3333", f"{random.randint(10, 99)}", f"{random.randint(1000000, 9999999)}"]
    elif style == "nh":
        groups = ["301", f"{random.randint(1000, 9999)}", f"{random.randint(1000, 9999)}", f"{random.randint(10, 99)}"]
    elif style == "woori":
        groups = ["1002", f"{random.randint(100, 999)}", f"{random.randint(100000, 999999)}"]
    elif style == "toss":
        groups = [f"{random.randint(100, 999)}", f"{random.randint(100, 999)}", f"{random.randint(100000, 999999)}"]
    elif style == "kb":
        groups = [f"{random.randint(100000, 999999)}", f"{random.randint(10, 99)}", f"{random.randint(100000, 999999)}"]
    else:
        return spoken_number(str(random.randint(10**10, 10**13 - 1)))

    r = random.random()
    if r < 0.35:
        return "-".join(groups)
    if r < 0.6:
        return " ".join(groups)
    if r < 0.78:
        return "".join(groups)
    return to_hangul_digits("".join(groups))


def rand_name() -> str:
    return random.choice(SURNAMES) + random.choice(GIVEN)


SIDO = ["서울", "서울특별시", "부산", "부산광역시", "대구", "대구광역시", "인천",
        "인천광역시", "광주", "대전", "대전광역시", "울산", "세종", "경기", "경기도",
        "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
GU = ["강남구", "서초구", "마포구", "송파구", "유성구", "해운대구", "수성구",
      "연수구", "분당구", "일산동구", "남구", "북구", "중구", "동구", "서구"]
ROADS = ["테헤란로", "월드컵북로", "판교역로", "센텀중앙로", "대학로", "컨벤시아대로",
         "달구벌대로", "종로", "강남대로", "올림픽로", "가로수길", "봉은사로", "역삼로"]


def rand_address() -> str:
    sido = random.choice(SIDO)
    gu = random.choice(GU)
    road = random.choice(ROADS)
    num = random.randint(1, 400)
    r = random.random()
    detail = ""
    if r < 0.4:
        detail = f" {random.randint(1, 25)}층 {random.randint(100, 2500)}호"
    elif r < 0.55:
        detail = f" {random.randint(1, 25)}층"
    elif r < 0.7:
        detail = f" {random.randint(101, 2500)}호"
    # 번지 표현 변이
    b = random.random()
    if b < 0.5:
        return f"{sido} {gu} {road} {num}{detail}"
    if b < 0.7:
        return f"{sido} {gu} {road} {num}번지{detail}"
    if b < 0.85:
        # 번지 없이 층/호만
        return f"{sido} {gu} {road}{detail or ' ' + str(random.randint(1,20)) + '층'}"
    return f"{sido} {gu} {road} {num}-{random.randint(1, 30)}{detail}"


def rand_passport() -> str:
    prefix = random.choice(list("MSRG"))
    num = random.randint(10000000, 99999999)
    if random.random() < 0.35:
        spoken = random.choice(PASSPORT_PREFIX_SPOKEN[prefix])
        return f"{spoken} {num}"
    return f"{prefix}{num}"


def rand_driver_license() -> str:
    region = random.choice([str(i) for i in range(11, 29)])
    year = random.randint(10, 25)
    serial = random.randint(100000, 999999)
    check = random.randint(10, 99)
    r = random.random()
    if r < 0.30:
        return f"{region}{year:02d}{serial}{check}"
    if r < 0.50:
        return f"{region} {year:02d} {serial} {check}"
    if r < 0.70:
        sep = random.choice(["에", "다시", "-"])
        return f"{region}{sep}{year:02d}{sep}{serial}{sep}{check}"
    return f"{region}-{year:02d}-{serial}-{check}"


def rand_biz_no() -> str:
    a, b, c = random.randint(100, 999), random.randint(10, 99), random.randint(10000, 99999)
    r = random.random()
    if r < 0.35:
        return f"{a}{b}{c}"
    if r < 0.6:
        return f"{a} {b} {c}"
    return f"{a}-{b}-{c}"


def rand_corp_no() -> str:
    a, b = random.randint(100000, 999999), random.randint(1000000, 9999999)
    r = random.random()
    if r < 0.4:
        return f"{a}{b}"
    if r < 0.6:
        return f"{a} {b}"
    return f"{a}-{b}"


def rand_vehicle() -> str:
    hangul = random.choice(list("가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주하허호바사아자"))
    r = random.random()
    if r < 0.45:
        n1 = random.randint(10, 999)
        n2 = random.randint(1000, 9999)
        return f"{n1}{hangul}{n2}"
    if r < 0.7:
        region = random.choice(["서울", "경기", "부산", "인천", "대구", "광주", "대전"])
        return f"{region}{random.randint(10, 99)}{hangul}{random.randint(1000, 9999)}"
    # 띄어 말한 경우
    return f"{random.randint(10, 99)}{hangul} {random.randint(1000, 9999)}"


def rand_health_id() -> str:
    if random.random() < 0.4:
        a = random.randint(10000, 99999999)
        b = random.randint(1000, 99999999)
        joiner = random.choice(["하고", " 하고 ", "하고요"])
        return f"{a}{joiner}{b}"
    num = str(random.randint(10**9, 10**12 - 1))
    if random.random() < 0.4:
        return spoken_number(num)
    return num


def rand_secret() -> str:
    style = random.choice(["openai", "aws", "github", "bearer", "env"])
    if style == "openai":
        return "sk-" + "".join(random.choices("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=48))
    if style == "aws":
        return "AKIA" + "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=16))
    if style == "github":
        return "ghp_" + "".join(random.choices("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=36))
    if style == "bearer":
        return "Bearer " + "".join(random.choices("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._", k=32))
    return "api_key=" + "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=24))


def rand_ip() -> str:
    return ".".join(str(random.randint(1, 255)) for _ in range(4))


def rand_emp_id() -> str:
    prefix = random.choice(["EMP", "F", "A", "KR", ""])
    num = random.randint(10000, 999999)
    if prefix:
        return f"{prefix}-{num}" if random.random() < 0.5 else f"{prefix}{num}"
    return str(num)


# 라벨(문맥어) 변이 — 음성에서 다양한 표현
CUES = {
    "phone": ["연락처는", "번호는", "전화번호가", "핸드폰은", "휴대폰 번호는", "전번은", "제 번호는", "연락은"],
    "email": ["이메일은", "메일은", "메일 주소는", "이메일 주소가", "메일로는", "메일 주소가", "이멜은"],
    "rrn": ["주민번호는", "주민등록번호가", "주민등록번호는", "주민번호가", "생년월일 포함 주민번호는"],
    "foreign_id": ["외국인등록번호는", "외국인번호가", "등록번호는", "외국인등록은"],
    "card": ["카드번호는", "카드는", "결제 카드가", "신용카드 번호는"],
    "account": ["계좌는", "계좌번호는", "입금 계좌는", "이체할 계좌가", "통장번호는", "송금 계좌는"],
    "bank": [""],
    "name": ["담당자는", "이름은", "성함은", "고객명은", "참석자는", "작성자는", "담당은"],
    "address": ["주소는", "방문 주소는", "집 주소가", "배송지는", "소재지는", "주소가"],
    "passport": ["여권번호는", "여권은", "여권 번호가", "패스포트는"],
    "driver_license": ["운전면허는", "면허번호는", "면허가", "운전면허 번호는", "면허는"],
    "biz_no": ["사업자번호는", "사업자등록번호가", "사업자 번호는", "사업자는"],
    "corp_no": ["법인번호는", "법인등록번호가", "법인은"],
    "vehicle": ["차량번호는", "차량은", "차 번호가", "번호판은", "주차 차량은"],
    "health_id": ["건강보험번호는", "건보는", "건보번호가", "가입자번호는", "건강보험증 번호는"],
    "ip": ["아이피는", "IP는", "아이피 주소가", "아이피주소는"],
    "emp_id": ["사번은", "직원번호는", "사원번호가"],
    "secret": ["api 키는", "비밀키는", "시크릿키가", "액세스 토큰은", "인증키는"],
}

TAILS = ["", "", " 입니다", " 이에요", " 예요", " 요", " 이고요", " 라고 하네요",
         " 맞습니다", " 이야", " 인데요", " 로 부탁드려요"]

# 은행-계좌 조합 문형 (음성)
ACCOUNT_BANK_TEMPLATES = [
    "{cue} {bank} {account}{tail}",
    "{cue} {account} 이고 {bank}{tail}",
    "{account} {bank}으로 보내주세요",
    "{bank} {account} 으로 이체할게요",
    "입금은 {account} 이고요 은행은 {bank}이에요",
    "{cue} {bank}은행 {account}{tail}",
    "{account} {bank}",
]


def wrap_filler(text: str) -> str:
    """앞/중간/뒤 군말 삽입 (STT 지저분함 재현)."""
    if random.random() < 0.5:
        text = f"{random.choice(FILLERS_PRE)} {text}"
    if random.random() < 0.25:
        parts = text.split(" ")
        if len(parts) > 3:
            pos = random.randint(1, len(parts) - 2)
            parts.insert(pos, random.choice(FILLERS_MID))
            text = " ".join(parts)
    if random.random() < 0.3:
        text = f"{text} {random.choice(FILLERS_POST)}"
    return text


def build_single(field: str, value: str) -> str:
    cue = random.choice(CUES[field])
    tail = random.choice(TAILS)
    if cue:
        return f"{cue} {value}{tail}"
    return f"{value}{tail}"


def make_example() -> dict:
    """단일/복합 문장 랜덤 생성 후 엔티티 span 추출."""
    mode = random.random()

    used: dict[str, str] = {}
    text = ""

    if mode < 0.15:
        # 계좌+은행 조합
        account = rand_account()
        bank = random.choice(BANKS)
        used["account"] = account
        used["bank"] = bank
        tmpl = random.choice(ACCOUNT_BANK_TEMPLATES)
        text = tmpl.format(cue=random.choice(CUES["account"]), bank=bank,
                           account=account, tail=random.choice(TAILS))
    elif mode < 0.75:
        # 단일 필드
        field = random.choice([
            "phone", "email", "rrn", "foreign_id", "card", "account", "name",
            "address", "passport", "driver_license", "biz_no", "corp_no",
            "vehicle", "health_id", "ip", "emp_id", "secret",
        ])
        value = FIELD_BUILDERS[field]()
        used[field] = value
        text = build_single(field, value)
    else:
        # 복합 2~3개
        fields = random.sample(
            ["phone", "email", "name", "account", "address", "rrn", "card",
             "vehicle", "biz_no", "health_id", "passport", "emp_id"],
            k=random.randint(2, 3),
        )
        segs = []
        for f in fields:
            v = FIELD_BUILDERS[f]()
            used[f] = v
            segs.append(build_single(f, v))
            if f == "account" and random.random() < 0.6:
                bank = random.choice(BANKS)
                used["bank"] = bank
                segs[-1] = segs[-1] + f" {bank}"
        joiner = random.choice([", ", " ", " 그리고 ", " / ", " 어 "])
        text = joiner.join(segs)

    text = wrap_filler(text)

    entities: list[dict] = []
    for key, val in used.items():
        entities.extend(find_spans(text, val, LABEL_MAP[key]))

    # 겹침 제거 (긴 것 우선)
    entities.sort(key=lambda e: (-(e["end"] - e["start"]), e["start"]))
    kept: list[dict] = []
    for e in entities:
        if any(e["start"] < k["end"] and k["start"] < e["end"] for k in kept):
            continue
        kept.append(e)
    kept.sort(key=lambda e: e["start"])
    return {"text": text, "entities": kept}


def find_spans(text: str, value: str, label: str) -> list[dict]:
    if not value:
        return []
    spans = []
    start = 0
    while True:
        i = text.find(value, start)
        if i < 0:
            break
        spans.append({"start": i, "end": i + len(value), "label": label})
        start = i + len(value)
    return spans


FIELD_BUILDERS = {
    "phone": rand_phone,
    "email": rand_email,
    "rrn": rand_rrn,
    "foreign_id": rand_foreign_id,
    "card": rand_card,
    "account": rand_account,
    "bank": lambda: random.choice(BANKS),
    "name": rand_name,
    "address": rand_address,
    "passport": rand_passport,
    "driver_license": rand_driver_license,
    "biz_no": rand_biz_no,
    "corp_no": rand_corp_no,
    "vehicle": rand_vehicle,
    "health_id": rand_health_id,
    "ip": rand_ip,
    "emp_id": rand_emp_id,
    "secret": rand_secret,
}

LABEL_MAP = {
    "phone": "PHONE",
    "email": "EMAIL",
    "rrn": "RRN",
    "foreign_id": "FOREIGN_ID",
    "card": "CARD",
    "account": "ACCOUNT",
    "bank": "BANK",
    "name": "NAME",
    "address": "ADDRESS",
    "passport": "PASSPORT",
    "driver_license": "DRIVER_LICENSE",
    "biz_no": "BIZ_NO",
    "corp_no": "CORP_NO",
    "vehicle": "VEHICLE",
    "health_id": "HEALTH_ID",
    "ip": "IP",
    "emp_id": "EMP_ID",
    "secret": "SECRET",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=int, default=3000)
    parser.add_argument("--valid", type=int, default=400)
    parser.add_argument("--out", type=Path, default=ROOT / "data")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    random.seed(args.seed)

    for split, n in [("train", args.train), ("valid", args.valid)]:
        rows = [make_example() for _ in range(n)]
        path = args.out / f"{split}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        from collections import Counter

        c: Counter[str] = Counter()
        for r in rows:
            for e in r["entities"]:
                c[e["label"]] += 1
        print(f"wrote {path} ({n}) labels={dict(c)}")


if __name__ == "__main__":
    main()
