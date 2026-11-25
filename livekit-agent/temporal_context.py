"""Warsaw-local context for each call and time-sensitive FAQ searches."""

import re
from datetime import datetime, timedelta
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
WEEKDAY_FORMS = {
    "poniedziałek": 0,
    "wtorek": 1,
    "środę": 2,
    "środa": 2,
    "czwartek": 3,
    "piątek": 4,
    "sobotę": 5,
    "sobota": 5,
    "niedzielę": 6,
    "niedziela": 6,
}
RELATIVE_DAYS = {"dziś": 0, "dzisiaj": 0, "jutro": 1, "pojutrze": 2}
DATE_WORD = re.compile(
    r"\b(?:dziś|dzisiaj|jutro|pojutrze|poniedziałek|wtorek|środę|środa|"
    r"czwartek|piątek|sobotę|sobota|niedzielę|niedziela)\b",
    re.IGNORECASE,
)
SHORT_FOLLOWUP = re.compile(
    r"^\s*(?:a\s+)?(?:dziś|dzisiaj|jutro|pojutrze)\s*[?!.]?\s*$",
    re.IGNORECASE,
)


def poland_now(now: datetime | None = None) -> datetime:
    return datetime.now(WARSAW_TZ) if now is None else now.astimezone(WARSAW_TZ)


def current_poland_context(now: datetime | None = None) -> str:
    local = poland_now(now)
    return (
        "Current date and time in Poland: "
        f"{local.strftime('%A, %Y-%m-%d, %H:%M')} "
        "(Europe/Warsaw)."
    )


def faq_query_with_poland_date(question: str, now: datetime | None = None) -> str:
    """Give semantic search a resolved weekday without changing the caller's words."""
    match = DATE_WORD.search(question)
    if match is None:
        return question

    local = poland_now(now)
    word = match.group().casefold()
    if word in RELATIVE_DAYS:
        target = local.date() + timedelta(days=RELATIVE_DAYS[word])
    else:
        target = local.date() + timedelta(days=(WEEKDAY_FORMS[word] - local.weekday()) % 7)

    weekday = WEEKDAYS[target.weekday()]
    topic = "Godziny otwarcia Tatravet. " if SHORT_FOLLOWUP.fullmatch(question) else ""
    return f"{topic}Pytanie dotyczy dnia: {weekday}, {target.isoformat()}. {question}"
