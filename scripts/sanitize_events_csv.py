import csv
import json
import sys
from pathlib import Path

EVENTS_CONTENT_VERSION_ID = "928d4450-ab50-45eb-9d72-d0dc00040b48"

REQUIRED_COLUMNS = [
    "id",
    "event_class",
    "name_es",
    "name_en",
    "enemy_skill",
    "enemy_explanation",
    "deck",
    "image",
    "scene",
    "health",
    "reward_multiplier",
    "relic_reward",
    "starting_gold_coins",
    "starting_cards_in_hand",
    "cards_per_turn",
    "discards_per_turn",
    "special_conditions",
    "content_version_id",
]

VALID_EVENT_CLASSES = {
    "enemy",
    "boss",
    "rest",
    "shop",
    "sacrifice",
    "upgrade",
    "beginning",
    "exit",
    "mystery",
}


def to_int_or_zero(value: str) -> str:
    raw = (value or "").strip()
    if raw == "":
        return "0"
    try:
        return str(int(float(raw)))
    except ValueError:
        return "0"


def to_int_or_empty(value: str) -> str:
    raw = (value or "").strip()
    if raw == "":
        return ""
    try:
        return str(int(float(raw)))
    except ValueError:
        return ""


def normalize_deck(value: str) -> str:
    raw = (value or "").strip()
    if raw == "" or raw == "0":
        return "[]"

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return json.dumps(parsed, ensure_ascii=False)
        return "[]"
    except json.JSONDecodeError:
        return "[]"


def sanitize_row(row: dict[str, str]) -> dict[str, str] | None:
    row_id = (row.get("id") or "").strip()
    event_class = (row.get("event_class") or "").strip().lower()

    # Drop metadata/helper rows that are not real events
    if not row_id.isdigit() or event_class not in VALID_EVENT_CLASSES:
        return None

    name_es = (row.get("name_es") or "").strip() or f"event_{row_id}"
    name_en = (row.get("name_en") or "").strip() or name_es

    return {
        "id": row_id,
        "event_class": event_class,
        "name_es": name_es,
        "name_en": name_en,
        "enemy_skill": (row.get("enemy_skill") or "").strip(),
        "enemy_explanation": (row.get("enemy_explanation") or "").strip(),
        "deck": normalize_deck(row.get("deck") or ""),
        "image": (row.get("image") or "").strip(),
        "scene": (row.get("scene") or "").strip(),
        "health": to_int_or_zero(row.get("health") or ""),
        "reward_multiplier": to_int_or_zero(row.get("reward_multiplier") or ""),
        "relic_reward": to_int_or_empty(row.get("relic_reward") or ""),
        "starting_gold_coins": to_int_or_zero(row.get("starting_gold_coins") or ""),
        "starting_cards_in_hand": to_int_or_zero(row.get("starting_cards_in_hand") or ""),
        "cards_per_turn": to_int_or_zero(row.get("cards_per_turn") or ""),
        "discards_per_turn": to_int_or_zero(row.get("discards_per_turn") or ""),
        "special_conditions": (row.get("special_conditions") or "").strip(),
        "content_version_id": EVENTS_CONTENT_VERSION_ID,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: sanitize_events_csv.py <input.csv> <output.csv>")
        return 1

    src = Path(sys.argv[1])
    out = Path(sys.argv[2])

    with src.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        sanitized = []
        for row in reader:
            clean = sanitize_row(row)
            if clean is not None:
                sanitized.append(clean)

    dedup = {row["id"]: row for row in sanitized}
    ordered = [dedup[key] for key in sorted(dedup, key=lambda value: int(value))]

    with out.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(ordered)

    print(f"Wrote {len(ordered)} rows to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
