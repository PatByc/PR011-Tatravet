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

from agent import GPTLiveClientAssistant, _sip_caller_number  # noqa: E402
from livekit import rtc  # noqa: E402
from livekit.agents import Agent  # noqa: E402


class DelegationAudioTests(unittest.IsolatedAsyncioTestCase):
    def test_runtime_values_are_inside_context(self) -> None:
        assistant = GPTLiveClientAssistant("+48123456789")
        instructions = assistant.instructions
        context = instructions.split("# Context\n", 1)[1].split("# Capabilities", 1)[0]
        self.assertEqual(1, instructions.count("# Context\n"))
        self.assertIn("- Current date and time in Poland:", context)
        self.assertIn("- Lead's phone number: +48123456789", context)

    def test_runtime_date_is_recomputed_for_each_session(self) -> None:
        with patch(
            "agent.current_poland_context",
            side_effect=["Current date and time in Poland: first", "Current date and time in Poland: second"],
        ):
            first = GPTLiveClientAssistant().instructions
            second = GPTLiveClientAssistant().instructions
        self.assertIn("Current date and time in Poland: first", first)
        self.assertIn("Current date and time in Poland: second", second)

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
