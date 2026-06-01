/**
 * 아버지 약 관리 — 알람 스케줄러
 * GitHub Actions 에서 15분마다 실행됩니다.
 *
 * 필요한 GitHub Secrets:
 *   VAPID_PUBLIC_KEY  — VAPID 공개키
 *   VAPID_PRIVATE_KEY — VAPID 비밀키
 *   VAPID_EMAIL       — 연락용 이메일 (mailto:xxx@xxx.com 형식)
 */

const webpush = require('web-push');
const fs      = require('fs');
const path    = require('path');

// ── 환경변수 확인 ──────────────────────────────────────
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) {
  console.error('❌ VAPID 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── 스케줄 파일 읽기 ────────────────────────────────────
const schedulePath = path.join(__dirname, 'schedule.json');
if (!fs.existsSync(schedulePath)) {
  console.log('ℹ️  schedule.json 없음 — 아직 약이 등록되지 않았습니다.');
  process.exit(0);
}

let schedule;
try {
  schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
} catch (e) {
  console.error('❌ schedule.json 파싱 실패:', e.message);
  process.exit(1);
}

const { subscription, medications } = schedule;
if (!subscription || !medications || medications.length === 0) {
  console.log('ℹ️  구독 정보 또는 약 목록이 없습니다.');
  process.exit(0);
}

// ── 현재 KST 시각 ────────────────────────────────────────
// GitHub Actions 는 UTC 기준 → KST = UTC + 9
const now  = new Date(Date.now() + 9 * 60 * 60 * 1000);
const hhmm = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
console.log(`⏰ 현재 KST: ${hhmm}`);

// ── 복용 시간대 레이블 ────────────────────────────────────
const TIME_LABELS = {
  morning: '아침',
  lunch:   '점심',
  dinner:  '저녁',
  sleep:   '취침 전'
};

// ── 알람 대상 약 확인 ─────────────────────────────────────
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

if (dueMeds.length === 0) {
  console.log('✅ 이 시각에 알람 없음');
  process.exit(0);
}

const bodyText = dueMeds.join(', ') + ' 드실 시간이에요!';
console.log(`💊 알람 전송: ${bodyText}`);

// ── Web Push 전송 ─────────────────────────────────────────
const payload = JSON.stringify({
  title: '💊 약 드실 시간이에요!',
  body:  bodyText,
  icon:  '/father/icon-192.png',
  badge: '/father/icon-192.png',
  tag:   'med-alarm',
  requireInteraction: true,
  vibrate: [300, 100, 300, 100, 300],
  data:  { url: 'https://yamugyclaude.github.io/father/' }
});

webpush.sendNotification(subscription, payload, { TTL: 3600 })
  .then(() => {
    console.log('✅ 알림 전송 성공!');
  })
  .catch(err => {
    console.error('❌ 알림 전송 실패:', err.statusCode, err.body);
    // 구독이 만료된 경우 (410 Gone) — 정상적인 상황
    if (err.statusCode === 410) {
      console.log('ℹ️  구독이 만료되었습니다. 앱을 다시 열어 알림을 재설정해 주세요.');
    }
    process.exit(1);
  });
