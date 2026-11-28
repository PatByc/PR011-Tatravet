import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, PropertyMock, patch

for name in (
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "PR011_UPSTASH_VECTOR_REST_URL",
    "PR011_UPSTASH_VECTOR_REST_TOKEN",
):
    os.environ.setdefault(name, "test-only")

from agent import GPTLiveClientAssistant, SAFETY_CHECK_UNAVAILABLE, URGENT_REFERRAL, _sip_caller_number, _urgent_veterinary_request  # noqa: E402
from livekit import rtc  # noqa: E402
from livekit.agents import Agent  # noqa: E402


class DelegationAudioTests(unittest.IsolatedAsyncioTestCase):
    async def test_silence_instruction_is_set_before_delegation(self) -> None:
        assistant = GPTLiveClientAssistant()
        with patch.object(Agent, "duplex_session", new_callable=PropertyMock) as duplex:
            await assistant.on_enter()
            duplex.return_value.on.assert_called_once()
            instruction = duplex.return_value.append_instructions.call_args.args[0]
            self.assertIn("remain silent until the client result", instruction)

    def test_runtime_values_are_inside_context(self) -> None:
        assistant = GPTLiveClientAssistant("+48123456789")
        instructions = assistant.instructions
        context = instructions.split("# Context\n", 1)[1].split("# Capabilities", 1)[0]
        self.assertEqual(1, instructions.count("# Context\n"))
        self.assertIn("- Current date and time in Poland:", context)
        self.assertIn("- Tomorrow in Poland:", context)
        self.assertIn("- Day after tomorrow in Poland:", context)
        self.assertIn("- Lead's phone number: +48123456789", context)

    async def test_calendar_question_does_not_query_upstash(self) -> None:
        assistant = GPTLiveClientAssistant()
        delegation = SimpleNamespace(id="calendar-test", pending_transcript="A jaki jest dzień jutro?")
        with (
            patch("agent._urgent_veterinary_request", new_callable=AsyncMock, return_value=False),
            patch("agent.calendar_only_answer", return_value="Jutro będzie piątek."),
            patch("agent.query_pr011_faq", new_callable=AsyncMock) as lookup,
            patch.object(Agent, "duplex_session", new_callable=PropertyMock) as duplex,
        ):
            await assistant._resolve_delegation(delegation)
        lookup.assert_not_awaited()
        duplex.return_value.append_commentary.assert_called_once_with(
            "Jutro będzie piątek.", delegation_id="calendar-test"
        )

    async def test_urgent_delegation_uses_prompt_referral_without_faq(self) -> None:
        assistant = GPTLiveClientAssistant()
        delegation = SimpleNamespace(id="urgent-test", pending_transcript="Potrąciłam samochodem swojego psa. Co robić?")
        with (
            patch("agent._urgent_veterinary_request", new_callable=AsyncMock, return_value=True) as classify,
            patch("agent.query_pr011_faq", new_callable=AsyncMock) as lookup,
            patch.object(Agent, "duplex_session", new_callable=PropertyMock) as duplex,
        ):
            await assistant._resolve_delegation(delegation)
        lookup.assert_not_awaited()
        classify.assert_awaited_once_with(delegation.pending_transcript, "unknown")
        instruction = duplex.return_value.append_instructions.call_args.args[0]
        self.assertIn("urgent veterinary situation", instruction)
        self.assertIn("Do not use clinic FAQ facts", instruction)
        duplex.return_value.append_commentary.assert_called_once_with(
            URGENT_REFERRAL, delegation_id="urgent-test"
        )

    async def test_routine_after_hours_delegation_still_uses_faq(self) -> None:
        assistant = GPTLiveClientAssistant(clinic_status="closed")
        delegation = SimpleNamespace(id="hours-test", pending_transcript="Jesteście zamknięci. O której jutro otwieracie?")
        with (
            patch("agent._urgent_veterinary_request", new_callable=AsyncMock, return_value=False),
            patch("agent.calendar_only_answer", return_value=None),
            patch("agent.query_pr011_faq", new_callable=AsyncMock, return_value=[]) as lookup,
            patch.object(Agent, "duplex_session", new_callable=PropertyMock) as duplex,
        ):
            await assistant._resolve_delegation(delegation)
        lookup.assert_awaited_once()
        self.assertNotEqual(URGENT_REFERRAL, duplex.return_value.append_commentary.call_args.args[0])

    async def test_classifier_uses_prompt_policy_and_boolean_result(self) -> None:
        model = Mock()
        model.chat.return_value.collect = AsyncMock(return_value=SimpleNamespace(text='{"urgent": true}'))
        with patch("agent.inference.LLM", return_value=model):
            self.assertTrue(await _urgent_veterinary_request("Potrąciłam psa.", clinic_status="closed"))
        context = model.chat.call_args.kwargs["chat_ctx"].to_dict()
        self.assertIn("If the caller describes a current accident", str(context))
        self.assertIn("Clinic status: closed", str(context))

    async def test_classifier_failure_does_not_query_faq(self) -> None:
        assistant = GPTLiveClientAssistant()
        delegation = SimpleNamespace(id="unavailable-test", pending_transcript="Mój pies potrzebuje pomocy")
        with (
            patch("agent._urgent_veterinary_request", new_callable=AsyncMock, side_effect=TimeoutError),
            patch("agent.query_pr011_faq", new_callable=AsyncMock) as lookup,
            patch.object(Agent, "duplex_session", new_callable=PropertyMock) as duplex,
        ):
            await assistant._resolve_delegation(delegation)
        lookup.assert_not_awaited()
        duplex.return_value.append_commentary.assert_called_once_with(
            SAFETY_CHECK_UNAVAILABLE, delegation_id="unavailable-test"
        )

    def test_runtime_date_is_recomputed_for_each_session(self) -> None:
        with patch(
            "agent.runtime_calendar_context",
            side_effect=["- Current date and time in Poland: first", "- Current date and time in Poland: second"],
        ):
            first = GPTLiveClientAssistant().instructions
            second = GPTLiveClientAssistant().instructions
        self.assertIn("Current date and time in Poland: first", first)
        self.assertIn("Current date and time in Poland: second", second)

    def test_urgent_veterinary_instructions_and_confirmed_closed_status(self) -> None:
        instructions = GPTLiveClientAssistant(clinic_status="closed").instructions
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

    async def test_delegation_clears_queued_audio_and_drops_pending_frames(self) -> None:
        assistant = GPTLiveClientAssistant()
        output = Mock()
        output.audio = Mock()

        with (
            patch.object(Agent, "session", new_callable=PropertyMock) as session,
            patch.object(assistant, "_resolve_delegation", new_callable=AsyncMock),
        ):
            session.return_value.output = output
            assistant._on_delegation(SimpleNamespace(id="test-delegation"))
            await asyncio.sleep(0)

        output.audio.clear_buffer.assert_called_once_with()

        async def frames():
            yield "filler frame"

        blocked = [
            frame async for frame in assistant.realtime_audio_output_node(frames(), None)
        ]
        self.assertEqual([], blocked)

        assistant._pending_delegations.clear()
        allowed = [
            frame async for frame in assistant.realtime_audio_output_node(frames(), None)
        ]
        self.assertEqual(["filler frame"], allowed)


if __name__ == "__main__":
    unittest.main()
