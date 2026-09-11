"""
content/data/status.json üçün 3 tərəfli JSON birləşdirmə (rebase toqquşmasında).
Hər ID ayrı açar: bir tərəfin dəyişdiyi açar götürülür; hər ikisi dəyişibsə, yenidən oynadılan
(bizim) commit üstün tutulur. Beləcə paralel "silindi"/"yayımlandı" yazıları itmir.
"""
import json
import subprocess

PATH = "content/data/status.json"


def stage(n):
    try:
        out = subprocess.run(["git", "show", f":{n}:{PATH}"], capture_output=True, check=True).stdout
        return json.loads(out.decode("utf-8") or "{}")
    except Exception:
        return {}


base, upstream, mine = stage(1), stage(2), stage(3)   # rebase-də :2 = üstümüzə gələn (origin), :3 = bizim commit
merged = dict(upstream)
for k, v in mine.items():
    if k not in upstream or upstream[k] == base.get(k) or mine[k] != base.get(k):
        merged[k] = v
for k in list(merged):
    if k in base and k not in mine and k in upstream and upstream[k] == base[k]:
        merged.pop(k)   # bizim tərəf silibsə
with open(PATH, "w", encoding="utf-8") as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)
print(f"status.json merged: {len(merged)} IDs")
