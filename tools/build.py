from pathlib import Path
import json, zipfile
repo = Path(__file__).resolve().parents[1]
source = repo / "JMComic"
metadata = json.loads((source / "script.json").read_text(encoding="utf-8"))
assert (source / metadata["entry"]).is_file()
output = repo / "dist" / "JMComic.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file() and file.suffix in (".ts", ".tsx", ".json"):
            archive.write(file, file.relative_to(source).as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
print(f"Built JMComic {metadata['version']}: {output.name}")
