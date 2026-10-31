"""Generate narration MP3s from content/species/*.json with edge-tts.

Output: public/audio/<lang>/<id>.<section>.mp3 ; hashes in public/audio/.hashes.json
Usage: python scripts/audio/generate.py [--content content/species] [--out public/audio]
"""
import argparse
import asyncio
import hashlib
import json
import pathlib
from dataclasses import dataclass

SECTIONS = ("behavior", "anatomy", "huntingOrDefense", "discovery")
VOICES = {"vi": "vi-VN-HoaiMyNeural", "en": "en-US-GuyNeural"}
RATE = "-5%"
HASHES = ".hashes.json"


@dataclass
class Job:
    lang: str
    text: str
    path: pathlib.Path
    digest: str


def _digest(lang, text):
    return hashlib.sha256(f"{VOICES[lang]}|{RATE}|{text}".encode("utf-8")).hexdigest()


def plan_jobs(content_dir, out_dir):
    jobs = []
    for f in sorted(pathlib.Path(content_dir).glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for lang in VOICES:
            for sec in SECTIONS:
                text = data["sections"][sec][lang]
                jobs.append(Job(lang, text, pathlib.Path(out_dir) / lang / f"{data['id']}.{sec}.mp3", _digest(lang, text)))
    return jobs


def _load_hashes(out_dir):
    p = pathlib.Path(out_dir) / HASHES
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def pending(jobs, out_dir):
    known = _load_hashes(out_dir)
    return [j for j in jobs if known.get(j.path.relative_to(out_dir).as_posix()) != j.digest or not j.path.exists()]


def save_hashes(jobs, out_dir):
    known = _load_hashes(out_dir)
    for j in jobs:
        if j.path.exists():
            known[j.path.relative_to(out_dir).as_posix()] = j.digest
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / HASHES).write_text(json.dumps(known, indent=2, sort_keys=True), encoding="utf-8")


async def _synth(job):
    import edge_tts
    job.path.parent.mkdir(parents=True, exist_ok=True)
    await edge_tts.Communicate(job.text, VOICES[job.lang], rate=RATE).save(str(job.path))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--content", default="content/species")
    ap.add_argument("--out", default="public/audio")
    a = ap.parse_args()
    jobs = plan_jobs(a.content, a.out)
    todo = pending(jobs, a.out)
    print(f"{len(todo)} to generate, {len(jobs) - len(todo)} unchanged")
    for j in todo:
        asyncio.run(_synth(j))
        save_hashes([j], a.out)
        print("wrote", j.path)


if __name__ == "__main__":
    main()
