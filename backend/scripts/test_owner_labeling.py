#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from transcribe import build_lines, label_words_with_owner  # noqa: E402


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


if __name__ == "__main__":
    raise SystemExit(unittest.main())