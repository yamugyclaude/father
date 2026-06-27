#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SKILL_DIR="$CLAUDE_PROJECT_DIR/.claude/skills"
if [ -d "$SKILL_DIR" ]; then
  skills=""
  for skill in "$SKILL_DIR"/*/; do
    name=$(basename "$skill")
    if ! grep -q "retired: true" "$skill/SKILL.md" 2>/dev/null; then
      skills="${skills}${name}, "
    fi
  done
  skills="${skills%, }"
  echo "📋 본부 지침 읽어옴 | 적용 스킬: $skills"
fi
