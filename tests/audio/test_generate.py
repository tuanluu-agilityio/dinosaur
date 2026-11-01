import importlib.util
import json
import pathlib
import tempfile

spec = importlib.util.spec_from_file_location(
    "generate", pathlib.Path(__file__).parents[2] / "scripts/audio/generate.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


def _setup(tmp):
    cdir = pathlib.Path(tmp) / "content"
    cdir.mkdir()
    for sid in ("alpha", "beta"):
        sections = {s: {"vi": f"{sid} {s} vi", "en": f"{sid} {s} en"} for s in gen.SECTIONS}
        (cdir / f"{sid}.json").write_text(json.dumps({"id": sid, "sections": sections}), encoding="utf-8")
    return cdir, pathlib.Path(tmp) / "audio"


def test_paths_list():
    with tempfile.TemporaryDirectory() as tmp:
        cdir, out = _setup(tmp)
        jobs = gen.plan_jobs(cdir, out)
        assert len(jobs) == 2 * 2 * len(gen.SECTIONS)
        paths = {j.path for j in jobs}
        assert out / "vi" / "alpha.behavior.mp3" in paths
        assert out / "en" / "beta.discovery.mp3" in paths


def test_unchanged_skipped():
    with tempfile.TemporaryDirectory() as tmp:
        cdir, out = _setup(tmp)
        jobs = gen.plan_jobs(cdir, out)
        assert len(gen.pending(jobs, out)) == len(jobs)
        for j in jobs:
            j.path.parent.mkdir(parents=True, exist_ok=True)
            j.path.write_bytes(b"x")
        gen.save_hashes(jobs, out)
        assert gen.pending(jobs, out) == []
        # change one text
        f = cdir / "alpha.json"
        d = json.loads(f.read_text(encoding="utf-8"))
        d["sections"]["behavior"]["en"] = "changed"
        f.write_text(json.dumps(d), encoding="utf-8")
        again = gen.pending(gen.plan_jobs(cdir, out), out)
        assert [j.path.name for j in again] == ["alpha.behavior.mp3"]
