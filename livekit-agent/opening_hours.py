"""Extract only the approved opening-hours FAQ for hours questions."""

import re
from datetime import date, time, timedelta

from temporal_context import poland_now, resolved_reference_date

SOURCE = "KB_PR011_Tatravet_v2.md"
NO_CONFIRMED_HOURS = (
    "Nie mam potwierdzonych godzin otwarcia na ten dzień. "
    "Najlepiej sprawdzić to bezpośrednio z personelem Tatravet."
)
WEEKDAY_HOURS = re.compile(
    r"od\s+poniedziałku\s+do\s+piątku\s+od\s+(\d{1,2}:\d{2})\s+do\s+(\d{1,2}:\d{2})",
    re.IGNORECASE,
)
SATURDAY_HOURS = re.compile(
    r"w\s+sobotę\s+od\s+(\d{1,2}:\d{2})\s+do\s+(\d{1,2}:\d{2})",
    re.IGNORECASE,
)
SUNDAY_HOURS = re.compile(
    r"w\s+niedzielę\s+od\s+(\d{1,2}:\d{2})\s+do\s+(\d{1,2}:\d{2})",
    re.IGNORECASE,
)
DAY_PHRASES = (
    "w poniedziałek",
    "we wtorek",
    "w środę",
    "w czwartek",
    "w piątek",
    "w sobotę",
    "w niedzielę",
)


def _easter_sunday(year: int) -> date:
    # Gregorian computus; movable Polish public holidays are Easter-based.
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    length = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * length) // 451
    month = (h + length - 7 * m + 114) // 31
    day = ((h + length - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def is_polish_public_holiday(day: date) -> bool:
    fixed = {
        (1, 1), (1, 6), (5, 1), (5, 3), (8, 15),
        (11, 1), (11, 11), (12, 25), (12, 26),
    }
    if day.year >= 2025:
        fixed.add((12, 24))
    easter = _easter_sunday(day.year)
    movable = {
        easter,
        easter + timedelta(days=1),
        easter + timedelta(days=49),
        easter + timedelta(days=60),
    }
    return (day.month, day.day) in fixed or day in movable


def opening_hours_answer(question: str, results: list[dict], now=None) -> str:
    """Return a day-specific fact from the approved FAQ, or a safe fallback."""
    target = resolved_reference_date(question, now)
    if target is not None and is_polish_public_holiday(target):
        return NO_CONFIRMED_HOURS

    body = None
    for result in results:
        metadata = result.get("metadata")
        if not isinstance(metadata, dict) or metadata.get("source") != SOURCE:
            continue
        data = result.get("data")
        if not isinstance(data, str):
            continue
        header, separator, answer = data.partition("\n\n")
        header = header.casefold()
        if not separator or "godzin" not in header or "otwart" not in header:
            continue
        if (
            WEEKDAY_HOURS.search(answer)
            and SATURDAY_HOURS.search(answer)
            and SUNDAY_HOURS.search(answer)
        ):
            body = answer.strip()
            break

    if body is None:
        return NO_CONFIRMED_HOURS
    if target is None:
        return body

    if target.weekday() < 5:
        pattern = WEEKDAY_HOURS
    elif target.weekday() == 5:
        pattern = SATURDAY_HOURS
    else:
        pattern = SUNDAY_HOURS
    match = pattern.search(body)
    if match is None:
        return NO_CONFIRMED_HOURS

    lowered = question.casefold()
    if "pojutrze" in lowered:
        when = "Pojutrze"
    elif "jutro" in lowered:
        when = "Jutro"
    else:
        when = DAY_PHRASES[target.weekday()].capitalize()
    return f"{when} Tatravet jest otwarte od {match.group(1)} do {match.group(2)}."


def current_clinic_status(results: list[dict], now=None) -> str:
    """Determine open/closed only when today's approved hours are known."""
    local = poland_now(now)
    answer = opening_hours_answer("Jakie są godziny otwarcia Tatravet dziś?", results, local)
    if answer == NO_CONFIRMED_HOURS:
        return "unknown"
    match = re.search(r"\bod\s+(\d{1,2}:\d{2})\s+do\s+(\d{1,2}:\d{2})\b", answer)
    if not match:
        return "unknown"
    try:
        opens, closes = time.fromisoformat(match.group(1)), time.fromisoformat(match.group(2))
    except ValueError:
        return "unknown"
    return "open" if opens <= local.time() < closes else "closed"
