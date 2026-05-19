#!/usr/bin/env python3
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_metadata(audio_path: Path) -> dict[str, Any] | None:
    meta_path = Path(f"{audio_path}.meta.json")
    if not meta_path.exists():
        print(f"warning: metadata sidecar missing for {audio_path.name}", file=sys.stderr)
        return None
    try:
        with meta_path.open("r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        if isinstance(parsed, dict):
            return parsed
    except Exception as exc:
        print(f"warning: metadata sidecar unreadable for {audio_path.name}: {exc}", file=sys.stderr)
    return None


def participant_names(metadata: dict[str, Any] | None) -> dict[str, str]:
    names: dict[str, str] = {}
    participants = metadata.get("participants") if metadata else None
    if not isinstance(participants, list):
        return names
    for participant in participants:
        if not isinstance(participant, dict):
            continue
        client_id = participant.get("clientId")
        display_name = participant.get("displayName")
        if isinstance(client_id, str) and isinstance(display_name, str) and display_name.strip():
            names[client_id] = display_name.strip()
    return names


def speaker_for_ms(metadata: dict[str, Any] | None, names: dict[str, str], start_ms: int) -> tuple[str | None, str]:
    segments = metadata.get("segments") if metadata else None
    if not isinstance(segments, list):
        return None, "?"
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        seg_start = to_int(segment.get("startMs"))
        seg_end = to_int(segment.get("endMs"))
        if seg_start is None or seg_end is None:
            continue
        if seg_start <= start_ms <= seg_end:
            client_id = segment.get("clientId")
            if isinstance(client_id, str) and client_id:
                return client_id, names.get(client_id, "?")
            return None, "?"
    return None, "?"


def to_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def clean_word_text(value: str) -> str:
    return " ".join(value.strip().split())


def join_words(values: list[str]) -> str:
    text = " ".join(values)
    for token in [".", ",", "?", "!", ":", ";", "%"]:
        text = text.replace(f" {token}", token)
    return " ".join(text.split())


def average_confidence(words: list[dict[str, Any]]) -> float:
    confidences = [word["confidence"] for word in words if isinstance(word.get("confidence"), (int, float))]
    if not confidences:
        return 0.0
    return round(sum(confidences) / len(confidences), 4)


def build_lines(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    current_client: str | None = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        lines.append(
            {
                "startMs": current[0]["startMs"],
                "endMs": current[-1]["endMs"],
                "clientId": current_client,
                "name": current[0]["name"],
                "text": join_words([str(word["text"]) for word in current]),
                "confidence": average_confidence(current),
            }
        )
        current = []

    for word in words:
        client_id = word.get("clientId")
        if current and client_id != current_client:
            flush()
        current_client = client_id if isinstance(client_id, str) else None
        current.append(word)
    flush()
    return lines


def transcribe(audio_path: Path, force: bool) -> int:
    transcript_path = Path(f"{audio_path}.transcript.json")
    if transcript_path.exists() and not force:
        print(f"already transcribed: {transcript_path.name}")
        return 0

    if not audio_path.exists():
        print(f"audio file not found: {audio_path}", file=sys.stderr)
        return 2

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(f"failed to import faster_whisper: {exc}", file=sys.stderr)
        return 3

    metadata = read_metadata(audio_path)
    names = participant_names(metadata)
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(audio_path),
        language=None,
        task="transcribe",
        word_timestamps=True,
        vad_filter=True,
        initial_prompt="Tagalog and English conversation between meeting participants.",
    )

    words: list[dict[str, Any]] = []
    for segment in segments:
        segment_words = getattr(segment, "words", None) or []
        for raw_word in segment_words:
            text = clean_word_text(str(getattr(raw_word, "word", "")))
            if not text:
                continue
            start_ms = int(round(float(getattr(raw_word, "start", 0.0)) * 1000))
            end_ms = int(round(float(getattr(raw_word, "end", getattr(raw_word, "start", 0.0))) * 1000))
            client_id, name = speaker_for_ms(metadata, names, start_ms)
            words.append(
                {
                    "startMs": start_ms,
                    "endMs": max(end_ms, start_ms),
                    "text": text,
                    "clientId": client_id,
                    "name": name,
                    "confidence": round(float(getattr(raw_word, "probability", 0.0)), 4),
                }
            )

    payload = {
        "schemaVersion": 1,
        "transcribedAtIso": iso_now(),
        "audioFile": audio_path.name,
        "language": getattr(info, "language", None),
        "languageProbability": round(float(getattr(info, "language_probability", 0.0)), 4),
        "model": "medium",
        "lines": build_lines(words),
        "words": words,
    }
    tmp_path = Path(f"{transcript_path}.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp_path, transcript_path)
    print(f"transcribed: {transcript_path.name} lines={len(payload['lines'])} words={len(words)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe a meeting recording with faster-whisper.")
    parser.add_argument("audio_file_path")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    return transcribe(Path(args.audio_file_path).expanduser().resolve(), args.force)


if __name__ == "__main__":
    raise SystemExit(main())
