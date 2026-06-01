// =====================================================
// 아버지 약 관리 — Cloudflare Worker
// Cloudflare 대시보드에서 이 파일 내용을 붙여넣으세요
// =====================================================
// 환경 변수 (Cloudflare Workers → Settings → Variables 에서 설정):
//   ONESIGNAL_APP_ID   : OneSignal App ID
//   ONESIGNAL_REST_KEY : OneSignal REST API Key
//   KV                 : KV Namespace 바인딩 이름
// =====================================================

const TIME_LABELS = {
  morning: '아침',
  lunch:   '점심',
  dinner:  '저녁',
  sleep:   '취침 전'
};

export default {

  // ── HTTP 요청 처리 ──────────────────────────────────
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // POST /schedule  →  약 스케줄 저장
    if (request.method === 'POST' && url.pathname === '/schedule') {
      try {
        const { playerId, medications } = await request.json();
        if (!playerId || !medications) {
          return new Response(
            JSON.stringify({ error: '필수 필드 없음' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        await env.KV.put(`schedule:${playerId}`, JSON.stringify({ playerId, medications }));
        return new Response(
          JSON.stringify({ ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // GET /  →  상태 확인
    return new Response('💊 아버지 약 알람 서버 정상 작동 중', { headers: corsHeaders });
  },

  // ── Cron 스케줄러 (15분마다 실행) ──────────────────
  async scheduled(event, env) {
    // Cloudflare는 UTC 기준 → KST = UTC + 9시간
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const hh   = String(now.getUTCHours()).padStart(2, '0');
    const mm   = String(now.getUTCMinutes()).padStart(2, '0');
    const hhmm = `${hh}:${mm}`;

    console.log(`[알람체크] KST ${hhmm}`);

    // 저장된 모든 스케줄 가져오기
    const list = await env.KV.list({ prefix: 'schedule:' });

    for (const key of list.keys) {
      const data = await env.KV.get(key.name, 'json');
      if (!data) continue;

      const { playerId, medications } = data;
      const dueMeds = [];

      for (const med of medications) {
        if (!med.active) continue;
        for (const timeKey of (med.times || [])) {
          const alarmTime = med.alarmTimes?.[timeKey];
          if (alarmTime === hhmm) {
            dueMeds.push(`${med.name} (${TIME_LABELS[timeKey] || timeKey})`);
          }
        }
      }

      if (dueMeds.length === 0) continue;

      const bodyText = dueMeds.join(', ') + ' 드실 시간이에요!';
      console.log(`[알람전송] ${playerId} → ${bodyText}`);

      // OneSignal 알림 전송
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${env.ONESIGNAL_REST_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_id:             env.ONESIGNAL_APP_ID,
          include_player_ids: [playerId],
          headings:  { ko: '💊 약 드실 시간이에요!', en: '💊 Time for your medicine!' },
          contents:  { ko: bodyText, en: bodyText },
          priority:  10,
          ttl:       3600,   // 1시간 안에 못 받으면 만료
        }),
      });

      const json = await res.json();
      console.log(`[OneSignal 응답]`, JSON.stringify(json));
    }
  }
};
