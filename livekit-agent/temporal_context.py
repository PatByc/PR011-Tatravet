"""Warsaw-local context for each call and time-sensitive FAQ searches."""

import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

WARSAW_TZ = ZoneInfo("Europe/Warsaw")
WEEKDAYS = (
    "poniedziałek",
    "wtorek",
    "środa",
    "czwartek",
    "piątek",
    "sobota",
    "niedziela",
)
MONTHS = (
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
)
WEEKDAY_FORMS = {
    "poniedziałek": 0,
    "poniedziałki": 0,
    "wtorek": 1,
    "wtorki": 1,
    "środę": 2,
    "środa": 2,
    "środy": 2,
    "czwartek": 3,
    "czwartki": 3,
    "piątek": 4,
    "piątki": 4,
    "sobotę": 5,
    "sobota": 5,
    "soboty": 5,
    "niedzielę": 6,
    "niedziela": 6,
    "niedziele": 6,
}
RELATIVE_DAYS = {"dziś": 0, "dzisiaj": 0, "jutro": 1, "pojutrze": 2}
DATE_WORD = re.compile(
    r"\b(?:" + "|".join([*RELATIVE_DAYS, *WEEKDAY_FORMS]) + r")\b",
    re.IGNORECASE,
)
SHORT_FOLLOWUP = re.compile(
    r"^\s*(?:a\s+)?(?:w\s+|we\s+)?(?:"
    + "|".join([*RELATIVE_DAYS, *WEEKDAY_FORMS])
    + r")\s*[?!.]?\s*$",
    re.IGNORECASE,
)
OPENING_HOURS = re.compile(
    r"\b(?:pracujecie|godziny\s+otwarcia|otwieracie|zamykacie|"
    r"(?:tatravet|klinika|przychodnia)\b.{0,35}\b(?:otwart\w*|czynn\w*))\b",
    re.IGNORECASE,
)
OPENING_HOURS_FAQ = "W jakich godzinach Tatravet jest otwarte w tygodniu, weekendy i święta?"
CALENDAR_QUESTION = re.compile(r"\b(?:jaki|jaka|który|która)\b.*\b(?:dzień|data)\b", re.IGNORECASE)
CALENDAR_RELATIVE = re.compile(r"\b(?:dziś|dzisiaj|jutro|pojutrze)\b", re.IGNORECASE)


def poland_now(now: datetime | None = None) -> datetime:
    return datetime.now(WARSAW_TZ) if now is None else now.astimezone(WARSAW_TZ)


def current_poland_context(now: datetime | None = None) -> str:
    local = poland_now(now)
    return (
        "Current date and time in Poland: "
        f"{local.strftime('%A, %Y-%m-%d, %H:%M')} "
        "(Europe/Warsaw)."
    )


def runtime_calendar_context(now: datetime | None = None) -> str:
    local = poland_now(now)
    tomorrow = local.date() + timedelta(days=1)
    after_tomorrow = local.date() + timedelta(days=2)
    return (
        f"- {current_poland_context(local)}\n"
        f"- Tomorrow in Poland: {WEEKDAYS[tomorrow.weekday()]}, {tomorrow.isoformat()}.\n"
        f"- Day after tomorrow in Poland: "
        f"{WEEKDAYS[after_tomorrow.weekday()]}, {after_tomorrow.isoformat()}."
    )


def calendar_only_answer(question: str, now: datetime | None = None) -> str | None:
    """Answer simple date questions from the Warsaw clock, without clinic retrieval."""
    if not CALENDAR_QUESTION.search(question) or not CALENDAR_RELATIVE.search(question):
        return None
    if is_opening_hours_question(question):
        return None
    target = resolved_reference_date(question, now)
    if target is None:
        return None
    word = CALENDAR_RELATIVE.search(question).group().casefold()
    label = "Pojutrze" if word == "pojutrze" else ("Jutro" if word == "jutro" else "Dzisiaj")
    verb = "jest" if label == "Dzisiaj" else "będzie"
    return (
        f"{label} {verb} {WEEKDAYS[target.weekday()]}, "
        f"{target.day} {MONTHS[target.month - 1]} {target.year} roku."
    )


def is_opening_hours_question(question: str) -> bool:
    return bool(OPENING_HOURS.search(question) or SHORT_FOLLOWUP.fullmatch(question))


def resolved_reference_date(question: str, now: datetime | None = None) -> date | None:
    match = DATE_WORD.search(question)
    if match is None:
        return None

    local = poland_now(now)
    word = match.group().casefold()
    if word in RELATIVE_DAYS:
        return local.date() + timedelta(days=RELATIVE_DAYS[word])
    return local.date() + timedelta(days=(WEEKDAY_FORMS[word] - local.weekday()) % 7)


def faq_query_with_poland_date(question: str, now: datetime | None = None) -> str:
    """Give semantic search a resolved weekday without changing the caller's words."""
    opening_hours = is_opening_hours_question(question)
    target = resolved_reference_date(question, now)
    if target is None and not opening_hours:
        return question

    topic = f"{OPENING_HOURS_FAQ} " if opening_hours else ""
    if target is None:
        return f"{topic}{question}"
    return f"{topic}Pytanie dotyczy dnia: {WEEKDAYS[target.weekday()]}, {target.isoformat()}. {question}"
