import unittest
from datetime import datetime, timezone

from temporal_context import current_poland_context, faq_query_with_poland_date


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
        self.assertIn("Godziny otwarcia Tatravet", followup)
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


if __name__ == "__main__":
    unittest.main()
