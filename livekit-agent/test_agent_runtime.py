import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

for name in (
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "PR011_UPSTASH_VECTOR_REST_URL",
    "PR011_UPSTASH_VECTOR_REST_TOKEN",
):
    os.environ.setdefault(name, "test-only")

from agent import (  # noqa: E402
    GPTLiveAssistant,
    GPT_LIVE_BACKEND_ADDENDUM,
    _sip_caller_number,
    variant,
)
from livekit import rtc  # noqa: E402


class AgentRuntimeTests(unittest.TestCase):
    def test_responses_delegation_has_faq_tool_and_safety_instructions(self) -> None:
        assistant = GPTLiveAssistant()
        self.assertEqual("responses", variant["delegation"])
        self.assertEqual("gpt-5.4-mini", variant["backend_model"])
        self.assertEqual(["search_pr011_faq"], [tool.info.name for tool in assistant.tools])
        self.assertIn("do not call any tool", GPT_LIVE_BACKEND_ADDENDUM)
        self.assertIn("Vector similarity alone does not establish relevance", GPT_LIVE_BACKEND_ADDENDUM)
        self.assertIn("najbliższą całodobową lecznicą weterynaryjną", assistant.instructions)

    def test_runtime_values_are_inside_context(self) -> None:
        assistant = GPTLiveAssistant("+48123456789")
        instructions = assistant.instructions
        context = instructions.split("# Context\n", 1)[1].split("# Capabilities", 1)[0]
        self.assertEqual(1, instructions.count("# Context\n"))
        self.assertIn("- Current date and time in Poland:", context)
        self.assertIn("- Tomorrow in Poland:", context)
        self.assertIn("- Day after tomorrow in Poland:", context)
        self.assertIn("- Lead's phone number: +48123456789", context)

    def test_runtime_date_is_recomputed_for_each_session(self) -> None:
        with patch(
            "agent.runtime_calendar_context",
            side_effect=["- Current date and time in Poland: first", "- Current date and time in Poland: second"],
        ):
            first = GPTLiveAssistant().instructions
            second = GPTLiveAssistant().instructions
        self.assertIn("Current date and time in Poland: first", first)
        self.assertIn("Current date and time in Poland: second", second)

    def test_urgent_veterinary_instructions_and_confirmed_closed_status(self) -> None:
        instructions = GPTLiveAssistant(clinic_status="closed").instructions
        urgent_section = instructions.split("## Safety priority: urgent veterinary situations", 1)[1].split("## 1. Greeting", 1)[0]
        self.assertIn("Tatravet status at call start, based on approved opening hours: closed", instructions)
        self.assertIn("najbliższą całodobową lecznicą weterynaryjną", urgent_section)
        self.assertIn("Never claim that you will transfer the call, alert a doctor", urgent_section)
        self.assertIn("Dziękujemy za kontakt z Tatravet. Do widzenia.", urgent_section)
        self.assertNotIn("Recepcja oddzwoni", urgent_section)
        self.assertNotIn("sto dwanaście", instructions)

    def test_sip_number_uses_validated_attribute_or_identity(self) -> None:
        sip_kind = rtc.ParticipantKind.PARTICIPANT_KIND_SIP
        self.assertEqual(
            "+48123456789",
            _sip_caller_number(
                SimpleNamespace(
                    kind=sip_kind,
                    identity="sip_+48123456789",
                    attributes={"sip.phoneNumber": "invalid"},
                )
            ),
        )
        self.assertIsNone(
            _sip_caller_number(
                SimpleNamespace(
                    kind=rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD,
                    identity="sip_+48123456789",
                    attributes={},
                )
            )
        )


if __name__ == "__main__":
    unittest.main()
