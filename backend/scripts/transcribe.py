#!/usr/bin/env python3
import argparse
import json
import os
import re
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


def participant_path_for(audio_path: Path) -> Path:
    return Path(f"{audio_path}.participant.json")


def read_participant_owner(audio_path: Path) -> tuple[str, str] | None:
    meta_path = participant_path_for(audio_path)
    if not meta_path.exists():
        return None
    try:
        with meta_path.open("r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        if not isinstance(parsed, dict) or parsed.get("isPerUser") is not True:
            return None
        client_id = parsed.get("clientId")
        display_name = parsed.get("displayName")
        if isinstance(client_id, str) and client_id and isinstance(display_name, str) and display_name.strip():
            return client_id, display_name.strip()
    except Exception as exc:
        print(f"warning: participant sidecar unreadable for {audio_path.name}: {exc}", file=sys.stderr)
    return None


def label_words_with_owner(
    words: list[dict[str, Any]],
    owner: tuple[str, str],
) -> list[dict[str, Any]]:
    client_id, name = owner
    labeled: list[dict[str, Any]] = []
    for word in words:
        labeled.append(
            {
                **word,
                "clientId": client_id,
                "name": name,
            }
        )
    return labeled


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


VALID_MODELS = {"small", "medium", "large-v3"}


def sanitize_model_for_filename(model: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", model).strip("-")
    return (safe[:80] or "model")


def transcript_version_path(audio_path: Path, provider: str, model: str) -> Path:
    return Path(f"{audio_path}.transcript.{provider}-{sanitize_model_for_filename(model)}.json")


def primary_pointer_path(audio_path: Path) -> Path:
    return Path(f"{audio_path}.transcript.primary.json")


def ensure_primary_if_unset(audio_path: Path, provider: str, model: str) -> None:
    pointer = primary_pointer_path(audio_path)
    if pointer.exists():
        return
    pointer.write_text(json.dumps({"provider": provider, "model": model}, indent=2) + "\n", encoding="utf-8")


def selected_model(cli_model: str | None) -> str:
    candidate = (cli_model or os.environ.get("WHISPER_MODEL") or "medium").strip()
    if candidate not in VALID_MODELS:
        print(f"invalid whisper model '{candidate}', falling back to medium", file=sys.stderr)
        return "medium"
    return candidate


def transcribe(audio_path: Path, force: bool, model_name: str, provider: str = "local") -> int:
    transcript_path = transcript_version_path(audio_path, provider, model_name)
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

    owner = read_participant_owner(audio_path)
    if owner is None:
        print(f"skipped: not a per-user recording ({audio_path.name})", file=sys.stderr)
        return 0

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
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
            words.append(
                {
                    "startMs": start_ms,
                    "endMs": max(end_ms, start_ms),
                    "text": text,
                    "confidence": round(float(getattr(raw_word, "probability", 0.0)), 4),
                }
            )

    words = label_words_with_owner(words, owner)

    payload = {
        "schemaVersion": 1,
        "transcribedAtIso": iso_now(),
        "audioFile": audio_path.name,
        "provider": provider,
        "language": getattr(info, "language", None),
        "languageProbability": round(float(getattr(info, "language_probability", 0.0)), 4),
        "model": model_name,
        "lines": build_lines(words),
        "words": words,
    }
    tmp_path = Path(f"{transcript_path}.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp_path, transcript_path)
    ensure_primary_if_unset(audio_path, provider, model_name)
    print(f"transcribed: {transcript_path.name} lines={len(payload['lines'])} words={len(words)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe a meeting recording with faster-whisper.")
    parser.add_argument("audio_file_path")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--model", default=None)
    parser.add_argument("--provider", choices=["local"], default="local")
    args = parser.parse_args()
    model_name = selected_model(args.model)
    return transcribe(Path(args.audio_file_path).expanduser().resolve(), args.force, model_name, args.provider)


if __name__ == "__main__":
    raise SystemExit(main())
