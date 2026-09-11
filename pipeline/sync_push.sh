#!/usr/bin/env bash
# Workflow-ların ortaq "commit + push" addımı — paralel işlər bir-birinin dəyişikliyini silməsin.
#   pipeline/sync_push.sh "<commit mesajı>" <repo> <git add yolları...>
# Toqquşma olanda: content/data/status.json JSON səviyyəsində birləşdirilir (merge_status.py),
# docs/data.json birləşmiş vəziyyətdən yenidən yaradılır (panel.ts). 5 cəhd.
set -e
MSG="$1"; REPO="$2"; shift 2
git config user.name "yukaz-agent"
git config user.email "actions@github.com"
for p in "$@"; do git add "$p" 2>/dev/null || true; done
git commit -m "$MSG" || echo "dəyişiklik yoxdur"

for i in 1 2 3 4 5; do
  if ! git pull --rebase --autostash origin main; then
    if git diff --name-only --diff-filter=U | grep -q "content/data/status.json"; then
      python pipeline/merge_status.py && git add content/data/status.json
    fi
    if git diff --name-only --diff-filter=U | grep -q "docs/data.json"; then
      git checkout --theirs docs/data.json 2>/dev/null || git checkout --ours docs/data.json || true
      git add docs/data.json
    fi
    # başqa toqquşan fayl qalıbsa öz versiyamızı saxla
    for f in $(git diff --name-only --diff-filter=U); do git checkout --theirs "$f" 2>/dev/null || true; git add "$f"; done
    GIT_EDITOR=true git rebase --continue || { git rebase --abort; sleep 5; continue; }
  fi
  # panel həmişə birləşmiş vəziyyətdən
  npx tsx pipeline/panel.ts x "$REPO" >/dev/null 2>&1 && git add docs/data.json && (git commit -q -m "panel: $MSG" || true)
  if git push origin HEAD:main; then echo "push OK"; exit 0; fi
  sleep $((RANDOM % 8 + 3))
done
echo "push alınmadı"; exit 1
