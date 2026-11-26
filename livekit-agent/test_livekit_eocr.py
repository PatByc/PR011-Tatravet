import json
import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from livekit_eocr import _analyse, _gave_urgent_referral, _turns, deliver_session_report


def report():
    history = SimpleNamespace(to_dict=lambda exclude_timestamp: {"items": [
        {"type": "message", "role": "user", "content": ["Synthetic question"], "created_at": 1004.5},
        {"type": "message", "role": "assistant", "content": ["Synthetic answer"], "created_at": 1008.0},
        {"type": "agent_config_update", "instructions": "Ignored"},
    ]})
    return SimpleNamespace(
        room_id="RM_Synthetic", job_id="AJ_Synthetic", started_at=1000.0,
        timestamp=1070.0, chat_history=history,
        events=[SimpleNamespace(type="close", reason="participant_disconnected")],
        audio_recording_path=Path("/tmp/synthetic-audio.oga"),
    )


class LivekitEocrTest(unittest.IsolatedAsyncioTestCase):
    def test_emergency_referral_is_a_fallback_urgency_signal(self):
        self.assertTrue(_gave_urgent_referral([{
            "role": "assistant",
            "text": "Nie mogę ocenić stanu zwierzęcia. Proszę skontaktować się z całodobową lecznicą weterynaryjną.",
        }]))
        self.assertFalse(_gave_urgent_referral([{
            "role": "assistant", "text": "Godziny otwarcia są podane na stronie kliniki.",
        }]))

    async def test_post_call_analysis_reads_urgency_without_losing_other_fields(self):
        response = SimpleNamespace(text=json.dumps({
            "summary": "Nagły wypadek zwierzęcia.",
            "contactReason": "animal_health",
            "callbackNumber": None,
            "urgent": True,
        }))
        with patch("livekit_eocr.inference.LLM") as model:
            model.return_value.chat.return_value.collect = AsyncMock(return_value=response)
            result = await _analyse([{"role": "user", "text": "Wypadek", "secondsFromStart": 1}])
        self.assertEqual(result, ("Nagły wypadek zwierzęcia.", "animal_health", None, True, True))

        response.text = json.dumps({"summary": "Informacja o godzinach.", "contactReason": "clinic_info"})
        with patch("livekit_eocr.inference.LLM") as model:
            model.return_value.chat.return_value.collect = AsyncMock(return_value=response)
            result = await _analyse([{"role": "user", "text": "Godziny?", "secondsFromStart": 1}])
        self.assertEqual(result, ("Informacja o godzinach.", "clinic_info", None, False, True))

    def test_extracts_timed_speech_without_agent_configuration(self):
        self.assertEqual(_turns(report()), [
            {"role": "user", "text": "Synthetic question", "secondsFromStart": 4.5},
            {"role": "assistant", "text": "Synthetic answer", "secondsFromStart": 8.0},
        ])

    async def test_browser_room_is_not_delivered(self):
        with patch.dict(os.environ, {"LIVEKIT_EOCR_INCLUDE_BROWSER": "false"}), \
             patch("livekit_eocr._deliver", new_callable=AsyncMock) as deliver:
            await deliver_session_report(report(), caller=None, is_sip=False, agent_name="pr011-tatravet")
            deliver.assert_not_called()

    async def test_sip_report_is_queued_before_delivery(self):
        required = {
            "LIVEKIT_EOCR_URL": "http://dashboard.railway.internal:3000/api/webhooks/livekit",
            "LIVEKIT_EOCR_SECRET": "x" * 32,
            "AWS_ENDPOINT_URL": "https://example.invalid",
            "AWS_S3_BUCKET_NAME": "synthetic",
            "AWS_DEFAULT_REGION": "eu-west-1",
            "AWS_ACCESS_KEY_ID": "synthetic",
            "AWS_SECRET_ACCESS_KEY": "synthetic",
        }
        calls = []
        def queue(key, body):
            calls.append(("queued", key, json.loads(body)))
        def remove(key):
            calls.append(("removed", key))
        async def deliver(body):
            calls.append(("delivered", json.loads(body)))
            return True
        with patch.dict(os.environ, required), \
             patch("livekit_eocr._analyse", new=AsyncMock(return_value=("Synthetic summary", "appointment", None, True, True))), \
             patch("livekit_eocr._upload_audio", return_value=("calls/livekit/RM_Synthetic/audio.oga", 1200)), \
             patch("livekit_eocr._put_outbox", side_effect=queue), \
             patch("livekit_eocr._delete_outbox", side_effect=remove), \
             patch("livekit_eocr._deliver", side_effect=deliver):
            await deliver_session_report(report(), caller="+48123456789", is_sip=True, agent_name="pr011-tatravet")
        self.assertEqual([entry[0] for entry in calls], ["queued", "delivered", "removed"])
        self.assertEqual(calls[0][2]["caller"], "+48123456789")
        self.assertIs(calls[0][2]["urgent"], True)
        self.assertEqual(calls[0][2]["recording"]["state"], "ARCHIVED")


if __name__ == "__main__":
    unittest.main()
