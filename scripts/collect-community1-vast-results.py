#!/usr/bin/env python3
"""Audit and optionally import a completed Vast.ai Community-1 baseline batch."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
QA_ROOT = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
)
DEFAULT_DESTINATION = QA_ROOT / "hypotheses"
MODEL_ID = "pyannote/speaker-diarization-community-1"
MODEL_REVISION = "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_result(
    path: Path, session: dict[str, Any], model_sha256: str
) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"missing result: {path}"]
    result = load_json(path)
    source = result.get("source") or {}
    model = result.get("modelArtifact") or {}
    outputs = result.get("outputs") or {}
    regular = outputs.get("regular") or {}
    exclusive = outputs.get("exclusive") or {}
    contract = result.get("outputContract") or {}
    checks = {
        "status": result.get("status") == "completed",
        "model": result.get("model") == MODEL_ID,
        "revision": result.get("modelVersion") == MODEL_REVISION,
        "session": result.get("sessionId") == session.get("sessionId"),
        "source hash": source.get("sourceSha256") == session.get("sourceSha256"),
        "input hash": source.get("inputAudioSha256") == session.get("inputAudioSha256"),
        "model hash": model.get("archiveSha256") == model_sha256,
        "overlap-inclusive contract": contract.get("overlapInclusiveMain") is True,
        "regular output": regular.get("outputType") == "speaker_diarization"
        and isinstance(regular.get("segments"), list),
        "exclusive output": exclusive.get("outputType")
        == "exclusive_speaker_diarization"
        and isinstance(exclusive.get("segments"), list),
    }
    errors.extend(name for name, passed in checks.items() if not passed)
    duration = float(session.get("sourceDurationSec") or 0)
    for output_name, output in (("regular", regular), ("exclusive", exclusive)):
        for index, segment in enumerate(output.get("segments") or []):
            try:
                start = float(segment["startSec"])
                end = float(segment["endSec"])
                speaker = str(segment["speaker"])
            except (KeyError, TypeError, ValueError):
                errors.append(f"{output_name}[{index}] malformed")
                continue
            if start < 0 or end <= start or end > duration + 0.1 or not speaker:
                errors.append(f"{output_name}[{index}] outside source bounds")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--destination", default=str(DEFAULT_DESTINATION))
    parser.add_argument("--import-results", action="store_true")
    args = parser.parse_args()

    manifest_path = Path(args.manifest).expanduser().resolve()
    results_dir = Path(args.results_dir).expanduser().resolve()
    destination = Path(args.destination).expanduser().resolve()
    manifest = load_json(manifest_path)
    if manifest.get("schemaVersion") != "community1-vast-batch.v1":
        raise ValueError("unsupported manifest schema")
    summary_path = results_dir / "batch-summary.json"
    summary = load_json(summary_path)
    if summary.get("status") != "PASS":
        raise RuntimeError(f"batch summary is not PASS: {summary.get('status')}")
    model_sha256 = str((manifest.get("model") or {}).get("archiveSha256") or "")

    reports: list[dict[str, Any]] = []
    for session in manifest.get("sessions") or []:
        source = results_dir / "hypotheses" / f"{session['sessionId']}.community1.v2.json"
        errors = validate_result(source, session, model_sha256)
        reports.append(
            {
                "sessionId": session["sessionId"],
                "path": str(source),
                "sha256": sha256_file(source) if source.is_file() else None,
                "errors": errors,
            }
        )
    failures = [item for item in reports if item["errors"]]
    if failures:
        print(json.dumps({"status": "FAILED", "reports": reports}, ensure_ascii=False))
        return 1

    imported: list[str] = []
    if args.import_results:
        destination.mkdir(parents=True, exist_ok=True)
        for report in reports:
            source = Path(report["path"])
            target = destination / source.name
            if target.exists():
                if sha256_file(target) != report["sha256"]:
                    raise RuntimeError(f"refusing to overwrite different hypothesis: {target}")
            else:
                temporary = target.with_suffix(target.suffix + ".tmp")
                shutil.copy2(source, temporary)
                temporary.replace(target)
            imported.append(str(target))

    result = {
        "status": "PASS",
        "manifestSha256": sha256_file(manifest_path),
        "summarySha256": sha256_file(summary_path),
        "sessionCount": len(reports),
        "reports": reports,
        "imported": imported,
        "goldPromotion": False,
        "nextAction": "generate review cards, complete human labels, then evaluate DER/JER",
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
