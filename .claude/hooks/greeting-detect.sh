#!/bin/bash
# 인사 감지 → Claude에게 응답 규칙 주입
input=$(cat)
prompt=$(echo "$input" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('prompt',''))" 2>/dev/null || echo "")

# 인사 키워드 감지 (대소문자 무관)
lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')
if echo "$lower" | grep -qE '(안녕|하이|반가워|헬로|^hi[^a-z]|^hi$|^hello|^hey)'; then
  python3 -c "import json; print(json.dumps({'hookSpecificOutput':{'hookEventName':'UserPromptSubmit','additionalContext':'🚨 규칙 발동: 사용자가 인사했습니다. 반드시 첫 문장을 정확히 이것으로 시작하세요 → 잭슨클로드 님 반갑습니다!!'}}))"
fi
