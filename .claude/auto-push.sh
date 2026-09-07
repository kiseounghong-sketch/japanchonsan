#!/usr/bin/env bash
# Claude Code가 턴을 마칠 때 변경분을 자동으로 커밋하고 GitHub에 push한다.
# (.claude/settings.json 의 Stop 훅에서 호출됨)

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# 변경 사항이 없으면 조용히 종료
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

ts="$(date '+%Y-%m-%d %H:%M')"

git add -A
git commit -m "auto: ${ts} Claude Code 자동 커밋

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" >/dev/null 2>&1

if git push origin HEAD >/dev/null 2>&1; then
  echo "{\"systemMessage\": \"GitHub 반영 완료 (${ts})\"}"
else
  echo "{\"systemMessage\": \"커밋됨 · push 실패 — 네트워크/GitHub 인증 확인 필요 (나중에 git push 로 재시도)\"}"
fi
exit 0
