import unittest
from datetime import datetime, timezone

from opening_hours import NO_CONFIRMED_HOURS, opening_hours_answer
from temporal_context import (
    current_poland_context,
    faq_query_with_poland_date,
    is_opening_hours_question,
)

HOURS_RESULT = {
    "metadata": {"source": "KB_PR011_Tatravet_v2.md"},
    "data": (
        "Kontakt i godziny\nW jakich godzinach Tatravet jest otwarte w tygodniu, weekendy i święta?\n\n"
        "Tatravet jest otwarte od poniedziałku do piątku od 08:00 do 20:00, "
        "w sobotę od 10:00 do 15:00, a w niedzielę od 10:00 do 13:00. "
        "Godziny świąteczne wymagają potwierdzenia."
    ),
}
UNRELATED_RESULT = {
    "metadata": {"source": "KB_PR011_Tatravet_v2.md"},
    "data": "Badania krwi\nCzy wykonujecie badania krwi w weekend?\n\nNie wykonujemy badań krwi w weekend.",
}


class TemporalContextTests(unittest.TestCase):
    def test_session_context_uses_warsaw_time(self) -> None:
        instant = datetime(2026, 3, 28, 23, 30, tzinfo=timezone.utc)
        self.assertIn("Sunday, 2026-03-29, 00:30", current_poland_context(instant))

    def test_tomorrow_and_followup_resolve_from_polish_date(self) -> None:
        tuesday = datetime(2026, 11, 24, 10, 0, tzinfo=timezone.utc)
        self.assertIn(
            "środa, 2026-11-25",
            faq_query_with_poland_date("Jak pracujecie jutro?", tuesday),
        )
        followup = faq_query_with_poland_date("A pojutrze?", tuesday)
        self.assertIn("W jakich godzinach Tatravet jest otwarte", followup)
        self.assertIn("czwartek, 2026-11-26", followup)

    def test_named_weekday_and_no_date(self) -> None:
        tuesday = datetime(2026, 11, 24, 10, 0, tzinfo=timezone.utc)
        self.assertIn(
            "czwartek, 2026-11-26",
            faq_query_with_poland_date("Jak pracujecie w czwartek?", tuesday),
        )
        self.assertEqual(
            "Czy wykonujecie USG?",
            faq_query_with_poland_date("Czy wykonujecie USG?", tuesday),
        )

    def test_friday_opening_hours_ignore_unrelated_top_result(self) -> None:
        thursday = datetime(2026, 11, 26, 10, 0, tzinfo=timezone.utc)
        question = "Jak pracujecie jutro?"
        query = faq_query_with_poland_date(question, thursday)
        self.assertIn("W jakich godzinach Tatravet jest otwarte", query)
        self.assertIn("piątek, 2026-11-27", query)
        self.assertEqual(
            "Jutro Tatravet jest otwarte od 08:00 do 20:00.",
            opening_hours_answer(question, [UNRELATED_RESULT, HOURS_RESULT], thursday),
        )
        self.assertEqual(
            NO_CONFIRMED_HOURS,
            opening_hours_answer(question, [UNRELATED_RESULT], thursday),
        )

    def test_weekly_friday_and_holiday_guard(self) -> None:
        thursday = datetime(2026, 11, 26, 10, 0, tzinfo=timezone.utc)
        self.assertTrue(is_opening_hours_question("Jak pracujecie w piątki?"))
        self.assertIn(
            "piątek, 2026-11-27",
            faq_query_with_poland_date("Jak pracujecie w piątki?", thursday),
        )
        self.assertEqual(
            NO_CONFIRMED_HOURS,
            opening_hours_answer(
                "Jak pracujecie jutro?",
                [HOURS_RESULT],
                datetime(2026, 12, 23, 10, 0, tzinfo=timezone.utc),
            ),
        )


if __name__ == "__main__":
    unittest.main()
