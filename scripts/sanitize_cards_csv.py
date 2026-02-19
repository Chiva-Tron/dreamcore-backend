import csv
import sys
from pathlib import Path

CARD_CONTENT_VERSION_ID = "3adc0dfc-f61e-49ba-9197-beddccc8b71c"

REQUIRED_COLUMNS = [
    "id",
    "card_class",
    "rarity",
    "tier",
    "name_es",
    "name_en",
    "image",
    "gold_coins",
    "red_coins",
    "life_cost",
    "additional_cost",
    "attack",
    "speed",
    "health",
    "skill1",
    "skill2",
    "skill3",
    "skill_value1",
    "skill_value2",
    "skill_value3",
    "displayed_text",
    "condition",
    "target",
    "effect1",
    "value1",
    "turn_duration1",
    "chance1",
    "priority1",
    "effect2",
    "value2",
    "turn_duration2",
    "chance2",
    "priority2",
    "effect3",
    "value3",
    "turn_duration3",
    "chance3",
    "priority3",
    "type",
    "ethereal",
    "content_version_id",
]


def to_int_or_empty(value: str) -> str:
    raw = (value or "").strip()
    if raw == "":
        return ""
    try:
        return str(int(float(raw)))
    except ValueError:
        return ""


def to_int_or_zero(value: str) -> str:
    raw = (value or "").strip()
    if raw == "":
        return "0"
    try:
        return str(int(float(raw)))
    except ValueError:
        return "0"


def to_bool_str(value: str) -> str:
    raw = (value or "").strip().lower()
    if raw in {"1", "true", "t", "yes", "y"}:
        return "true"
    return "false"


def sanitize_row(row: dict[str, str]) -> dict[str, str] | None:
    row_id = (row.get("id") or "").strip()
    name_en = (row.get("name_en") or "").strip()
    card_type = (row.get("type") or "").strip().lower()

    if not row_id.isdigit() or not name_en or card_type not in {"invocation", "hex"}:
        return None

    card_class = (row.get("card_class") or "").strip() or "no_class"
    if card_class not in {"titan", "arcane", "umbralist", "no_class"}:
        card_class = "no_class"

    rarity = (row.get("rarity") or "").strip().lower() or "common"
    if rarity not in {"common", "rare", "epic"}:
        rarity = "common"

    image = (row.get("image") or "").strip()
    if not image:
        return None

    name_es = (row.get("name_es") or "").strip() or name_en
    tier = (row.get("tier") or "").strip() or "1"

    return {
        "id": row_id,
        "card_class": card_class,
        "rarity": rarity,
        "tier": tier,
        "name_es": name_es,
        "name_en": name_en,
        "image": image,
        "gold_coins": to_int_or_zero(row.get("gold_coins") or ""),
        "red_coins": to_int_or_zero(row.get("red_coins") or ""),
        "life_cost": to_int_or_zero(row.get("life_cost") or ""),
        "additional_cost": to_int_or_zero(row.get("additional_cost") or ""),
        "attack": to_int_or_empty(row.get("attack") or ""),
        "speed": to_int_or_empty(row.get("speed") or ""),
        "health": to_int_or_empty(row.get("health") or ""),
        "skill1": (row.get("skill1") or "").strip(),
        "skill2": (row.get("skill2") or "").strip(),
        "skill3": (row.get("skill3") or "").strip(),
        "skill_value1": to_int_or_empty(row.get("skill_value1") or ""),
        "skill_value2": to_int_or_empty(row.get("skill_value2") or ""),
        "skill_value3": to_int_or_empty(row.get("skill_value3") or ""),
        "displayed_text": (row.get("displayed_text") or "").strip(),
        "condition": (row.get("condition") or "").strip(),
        "target": (row.get("target") or "").strip(),
        "effect1": (row.get("effect1") or "").strip(),
        "value1": to_int_or_empty(row.get("value1") or ""),
        "turn_duration1": to_int_or_empty(row.get("turn_duration1") or ""),
        "chance1": to_int_or_empty(row.get("chance1") or ""),
        "priority1": to_int_or_empty(row.get("priority1") or ""),
        "effect2": (row.get("effect2") or "").strip(),
        "value2": to_int_or_empty(row.get("value2") or ""),
        "turn_duration2": to_int_or_empty(row.get("turn_duration2") or ""),
        "chance2": to_int_or_empty(row.get("chance2") or ""),
        "priority2": to_int_or_empty(row.get("priority2") or ""),
        "effect3": (row.get("effect3") or "").strip(),
        "value3": to_int_or_empty(row.get("value3") or ""),
        "turn_duration3": to_int_or_empty(row.get("turn_duration3") or ""),
        "chance3": to_int_or_empty(row.get("chance3") or ""),
        "priority3": to_int_or_empty(row.get("priority3") or ""),
        "type": card_type,
        "ethereal": to_bool_str(row.get("ethereal") or ""),
        "content_version_id": CARD_CONTENT_VERSION_ID,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: sanitize_cards_csv.py <input.csv> <output.csv>")
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
