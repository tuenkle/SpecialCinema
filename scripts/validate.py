#!/usr/bin/env python3
"""theaters.json 스키마·정합성 검사.

공식 페이지 지점 수와의 대조는 사람이 한다 — 이 스크립트는 포맷별 카운트를
출력해 그 대조를 쉽게 만들 뿐, 목록의 완전성까지 보장하지 못한다
(data/DATA_SOURCES.md의 체크리스트 참고).
"""
import json
import sys
from pathlib import Path

FORMATS = ("IMAX", "ScreenX", "DolbyCinema")
REQUIRED_THEATER_KEYS = {"id", "chain", "name", "address", "lat", "lng", "auditoriums"}
REQUIRED_AUD_KEYS = {"format", "name", "screen", "projection", "sound", "seats", "notes"}


def main() -> int:
    path = Path(__file__).resolve().parent.parent / "data" / "theaters.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = []

    ids = [t.get("id") for t in data]
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"중복 id: {dup}")

    counts = dict.fromkeys(FORMATS, 0)
    for t in data:
        name = t.get("name", "<이름 없음>")
        missing = REQUIRED_THEATER_KEYS - t.keys()
        if missing:
            errors.append(f"{name}: 누락 필드 {sorted(missing)}")
            continue
        if not (33 < t["lat"] < 39 and 124 < t["lng"] < 132):
            errors.append(f"{name}: 좌표가 한국 범위를 벗어남 ({t['lat']}, {t['lng']})")
        if not t["auditoriums"]:
            errors.append(f"{name}: 특별관이 하나도 없음")
        for a in t["auditoriums"]:
            missing = REQUIRED_AUD_KEYS - a.keys()
            if missing:
                errors.append(f"{name}: 상영관 누락 필드 {sorted(missing)}")
            if a.get("format") not in FORMATS:
                errors.append(f"{name}: 알 수 없는 format {a.get('format')!r}")
            else:
                counts[a["format"]] += 1

    print(f"지점 {len(data)}개")
    for f in FORMATS:
        print(f"  {f}: {counts[f]}개관 — 공식 페이지 지점 수와 직접 대조할 것")

    if errors:
        print("\n오류:")
        for e in errors:
            print("  -", e)
        return 1
    print("\n스키마 검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
