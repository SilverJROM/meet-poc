#!/usr/bin/env python3
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from transcribe import build_lines, transcribe, label_words_with_owner  # noqa: E402


class FakeWhisperModel:
    def __init__(self, model_name: str, device: str, compute_type: str) -> None:
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type

    def transcribe(self, *_args, **_kwargs):
        words = [
            types.SimpleNamespace(word="hello", start=0.0, end=0.4, probability=0.95),
            types.SimpleNamespace(word="team", start=0.5, end=0.9, probability=0.9),
        ]
        segment = types.SimpleNamespace(words=words)
        info = types.SimpleNamespace(language="en", language_probability=0.98)
        return [segment], info


class OwnerLabelingTests(unittest.TestCase):
    def test_label_words_with_owner_never_emits_question_mark(self) -> None:
        words = [
            {"startMs": 0, "endMs": 100, "text": "hello", "confidence": 0.9},
            {"startMs": 5000, "endMs": 5100, "text": "gap", "confidence": 0.4},
            {"startMs": 12000, "endMs": 12100, "text": "world", "confidence": 0.8},
        ]
        owner = ("local", "host")
        labeled = label_words_with_owner(words, owner)
        names = {word["name"] for word in labeled}
        client_ids = {word["clientId"] for word in labeled}
        self.assertEqual(names, {"host"})
        self.assertEqual(client_ids, {"local"})
        self.assertNotIn("?", names)

    def test_build_lines_groups_owner_words_only(self) -> None:
        words = label_words_with_owner(
            [
                {"startMs": 0, "endMs": 100, "text": "one", "confidence": 0.9},
                {"startMs": 200, "endMs": 300, "text": "two", "confidence": 0.8},
            ],
            ("guest-1", "Peer2"),
        )
        lines = build_lines(words)
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["name"], "Peer2")
        self.assertEqual(lines[0]["clientId"], "guest-1")
        self.assertNotIn("?", {line["name"] for line in lines})

    def test_transcribe_skips_mixed_recording_without_writing_transcript(self) -> None:
        original_faster_whisper = sys.modules.get("faster_whisper")
        sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeWhisperModel)
        with tempfile.TemporaryDirectory() as tmp:
            try:
                audio = Path(tmp) / "mixed.webm"
                audio.write_bytes(b"fake-audio")
                stderr = StringIO()

                with redirect_stderr(stderr):
                    result = transcribe(audio, force=True, model_name="small")

                self.assertEqual(result, 0)
                self.assertIn("skipped: not a per-user recording", stderr.getvalue())
                self.assertFalse(Path(f"{audio}.transcript.local-small.json").exists())
                self.assertFalse(Path(f"{audio}.transcript.primary.json").exists())
            finally:
                if original_faster_whisper is None:
                    sys.modules.pop("faster_whisper", None)
                else:
                    sys.modules["faster_whisper"] = original_faster_whisper

    def test_transcribe_writes_versioned_owner_labeled_transcript(self) -> None:
        original_faster_whisper = sys.modules.get("faster_whisper")
        sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeWhisperModel)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                audio = Path(tmp) / "host.webm"
                audio.write_bytes(b"fake-audio")
                Path(f"{audio}.participant.json").write_text(
                    '{"isPerUser": true, "clientId": "host-1", "displayName": "Host"}',
                    encoding="utf-8",
                )

                result = transcribe(audio, force=True, model_name="small")

                transcript_path = Path(f"{audio}.transcript.local-small.json")
                self.assertEqual(result, 0)
                self.assertTrue(transcript_path.exists())
                self.assertFalse(Path(f"{audio}.transcript.json").exists())
                payload = __import__("json").loads(transcript_path.read_text(encoding="utf-8"))
                self.assertEqual(payload["provider"], "local")
                self.assertEqual(payload["model"], "small")
                self.assertEqual(payload["lines"][0]["name"], "Host")
                self.assertEqual(payload["lines"][0]["clientId"], "host-1")
                self.assertTrue(all(word["name"] == "Host" for word in payload["words"]))
                self.assertNotIn("?", {word["name"] for word in payload["words"]})
                pointer = __import__("json").loads(Path(f"{audio}.transcript.primary.json").read_text(encoding="utf-8"))
                self.assertEqual(pointer, {"provider": "local", "model": "small"})
        finally:
            if original_faster_whisper is None:
                sys.modules.pop("faster_whisper", None)
            else:
                sys.modules["faster_whisper"] = original_faster_whisper


if __name__ == "__main__":
    raise SystemExit(unittest.main())
