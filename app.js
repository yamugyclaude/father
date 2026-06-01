// ==================== 설정 ====================
const VAPID_PUBLIC_KEY = 'BNuEAuNgIkzajN84NKpVKYKdHhVJZ0E9dgPPFPjbOqfYy7DJDysTUmlZ2vFTAaFmi4dGdNp4ZJ5LZONod7dCJ38';
const GITHUB_REPO     = 'yamugyclaude/father';   // GitHub 저장소
const SCHEDULE_PATH   = 'schedule.json';           // 저장 경로

// ==================== 데이터 구조 ====================
const TIME_LABELS = {
  morning: { label: '아침',    icon: '☀️',  defaultTime: '08:00' },
  lunch:   { label: '점심',    icon: '🌤️', defaultTime: '12:00' },
  dinner:  { label: '저녁',    icon: '🌙',  defaultTime: '18:00' },
  sleep:   { label: '취침 전', icon: '😴',  defaultTime: '21:00' }
};
const TIME_ORDER = ['morning', 'lunch', 'dinner', 'sleep'];

// ==================== 상태 ====================
let medications    = [];
let records        = {};
let editingId      = null;
let deleteTargetId = null;
let alarmCheckInterval = null;
let snoozeTimeout  = null;

function getNotifPermission() {
  try { return (typeof Notification !== 'undefined') ? Notification.permission : 'denied'; }
  catch { return 'denied'; }
}

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  registerSW();
  renderAll();
  startAlarmEngine();
  updateDateDisplay();
  setInterval(updateDateDisplay, 60000);
  checkMidnightReset();

  // 알람 설정 탭 — 저장된 토큰 표시
  const savedToken = localStorage.getItem('github_token');
  if (savedToken) {
    document.getElementById('githubToken').value = '●'.repeat(20);
    updateAlarmSetupStatus(true);
  }
});

// ==================== Service Worker ====================
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('[SW] 등록 완료');

    // 기존 구독 확인
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      window._pushSubscription = sub;
      console.log('[SW] 기존 Push 구독 있음');
    }
  } catch (e) {
    console.warn('[SW] 등록 실패:', e.message);
  }
}

// ==================== Push 구독 ====================
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('이 브라우저는 Push 알림을 지원하지 않아요', 'red');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.ready;

    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('알림 권한이 필요해요', 'red');
      return null;
    }

    // 기존 구독 해제 후 재구독
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    window._pushSubscription = sub;
    console.log('[Push] 구독 완료');
    return sub;
  } catch (e) {
    console.error('[Push] 구독 실패:', e.message);
    showToast('알림 설정에 실패했어요: ' + e.message, 'red');
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding  = '='.repeat((4 - base64String.length % 4) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// ==================== GitHub API 동기화 ====================
async function syncToGitHub() {
  const token = localStorage.getItem('github_token');
  if (!token) return false;

  const sub = window._pushSubscription;
  const payload = JSON.stringify({
    subscription: sub ? sub.toJSON() : null,
    medications:  medications
  }, null, 2);

  try {
    // 현재 파일 SHA 조회 (업데이트에 필요)
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${SCHEDULE_PATH}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    );
    let sha = undefined;
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }

    // 파일 업데이트(또는 생성)
    const body = {
      message: '약 스케줄 업데이트 🔄',
      content: btoa(unescape(encodeURIComponent(payload)))
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${SCHEDULE_PATH}`,
      {
        method:  'PUT',
        headers: {
          Authorization:  `Bearer ${token}`,
          Accept:         'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (putRes.ok) {
      console.log('[GitHub] schedule.json 동기화 완료');
      return true;
    } else {
      const err = await putRes.json();
      console.error('[GitHub] 동기화 실패:', err.message);
      return false;
    }
  } catch (e) {
    console.error('[GitHub] 네트워크 오류:', e.message);
    return false;
  }
}

// ==================== 알람 설정 저장 ====================
async function saveAlarmSetup() {
  const tokenInput = document.getElementById('githubToken').value.trim();

  // 새 토큰 입력된 경우만 저장 (●●● 표시는 기존 토큰)
  if (tokenInput && !tokenInput.startsWith('●')) {
    localStorage.setItem('github_token', tokenInput);
    document.getElementById('githubToken').value = '●'.repeat(20);
  }

  const token = localStorage.getItem('github_token');
  if (!token) {
    showToast('GitHub 토큰을 먼저 입력해 주세요', 'red');
    return;
  }

  showToast('⏳ 알람 설정 중...', '');

  // Push 구독
  const sub = await subscribePush();
  if (!sub) return;

  // GitHub 동기화
  const ok = await syncToGitHub();
  if (ok) {
    updateAlarmSetupStatus(true);
    showToast('✅ 알람 설정 완료! 이제 화면이 꺼져도 알림이 와요', 'green');
  } else {
    showToast('❌ GitHub 연동 실패. 토큰을 확인해 주세요', 'red');
    updateAlarmSetupStatus(false);
  }
}

function updateAlarmSetupStatus(connected) {
  const el = document.getElementById('alarmSetupStatus');
  if (!el) return;
  el.innerHTML = connected
    ? '<span style="color:#2e7d32;font-weight:700;">✅ 알람 연결됨 — 화면이 꺼져도 알림이 와요</span>'
    : '<span style="color:#c62828;font-weight:700;">❌ 아직 알람 설정이 안 됐어요</span>';
}

// ==================== 날짜 ====================
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function updateDateDisplay() {
  const d    = new Date();
  const days = ['일','월','화','수','목','금','토'];
  document.getElementById('headerDate').textContent =
    `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function checkMidnightReset() {
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 10, 0);
  setTimeout(() => { renderTodayTab(); checkMidnightReset(); }, tomorrow - now);
}

// ==================== 로컬 스토리지 ====================
function saveData() {
  localStorage.setItem('aboji_meds', JSON.stringify(medications));
  localStorage.setItem('aboji_records', JSON.stringify(records));
}

function loadData() {
  try {
    const m = localStorage.getItem('aboji_meds');
    const r = localStorage.getItem('aboji_records');
    medications = m ? JSON.parse(m) : getDefaultMedications();
    records     = r ? JSON.parse(r) : {};
  } catch {
    medications = getDefaultMedications();
    records     = {};
  }
  if (!records[todayStr()]) records[todayStr()] = {};
}

function getDefaultMedications() {
  return [
    { id: uid(), name: '혈압약', times: ['morning'], alarmTimes: { morning: '08:00' }, memo: '밥 먹고 바로', active: true },
    { id: uid(), name: '당뇨약', times: ['morning', 'dinner'], alarmTimes: { morning: '08:00', dinner: '18:00' }, memo: '식후 30분', active: true }
  ];
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ==================== 렌더링 ====================
function renderAll() {
  renderTodayTab();
  renderSettingsTab();
  renderAlarmTab();
  renderRecordsTab();
}

// ---- 오늘 약 탭 ----
function renderTodayTab() {
  const container = document.getElementById('todayContainer');
  const today     = todayStr();
  if (!records[today]) records[today] = {};

  const activeMeds = medications.filter(m => m.active);
  if (activeMeds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💊</div>
        <p>등록된 약이 없어요.<br>'약 설정' 탭에서 약을 추가해 주세요.</p>
      </div>`;
    return;
  }

  let html = '';
  TIME_ORDER.forEach(timeKey => {
    const medsForTime = activeMeds.filter(m => m.times.includes(timeKey));
    if (medsForTime.length === 0) return;

    const info      = TIME_LABELS[timeKey];
    const alarmTime = medsForTime[0].alarmTimes?.[timeKey] || info.defaultTime;

    const cardsHtml = medsForTime.map(med => {
      const key    = `${med.id}_${timeKey}`;
      const entry  = records[today][key] || {};
      const taken  = entry.taken  || false;
      const takenAt = entry.takenAt || '';
      return `
        <div class="med-card ${taken ? 'taken' : ''}" id="card_${key}">
          <div class="med-info">
            <div class="med-name">${escHtml(med.name)}</div>
            ${med.memo ? `<div class="med-memo">${escHtml(med.memo)}</div>` : ''}
            ${taken && takenAt ? `<div class="med-taken-time">✅ ${takenAt}에 복용</div>` : ''}
          </div>
          <button class="check-btn ${taken ? 'taken' : 'not-taken'}"
                  onclick="toggleTaken('${med.id}','${timeKey}')">
            ${taken ? '✅ 먹었어요' : '❌ 안 먹음'}
          </button>
        </div>`;
    }).join('');

    html += `
      <div class="time-section">
        <div class="time-section-header">
          <span class="time-section-icon">${info.icon}</span>
          <span class="time-section-label">${info.label}</span>
          <span class="time-section-clock">${alarmTime}</span>
        </div>
        ${cardsHtml}
      </div>`;
  });

  container.innerHTML = html;
}

function toggleTaken(medId, timeKey) {
  const today = todayStr();
  if (!records[today]) records[today] = {};
  const key   = `${medId}_${timeKey}`;
  const entry = records[today][key] || {};
  const wasTaken = entry.taken || false;

  if (wasTaken) {
    records[today][key] = { taken: false, takenAt: '' };
    showToast('복용 취소했어요', 'red');
  } else {
    const now  = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    records[today][key] = { taken: true, takenAt: time };
    showToast('✅ 약을 드셨군요! 잘하셨어요!', 'green');
  }

  saveData();
  renderTodayTab();
  renderRecordsTab();
}

// ---- 약 설정 탭 ----
function renderSettingsTab() {
  const container = document.getElementById('settingsContainer');
  if (medications.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">➕</div>
        <p>위의 '+ 약 추가' 버튼을 눌러<br>약을 등록해 주세요.</p>
      </div>`;
    return;
  }

  container.innerHTML = medications.map(med => {
    const timeLabels  = med.times.map(t => TIME_LABELS[t].label).join(', ');
    const alarmTimes  = med.times.map(t => med.alarmTimes?.[t] || TIME_LABELS[t].defaultTime).join(' / ');
    return `
      <div class="settings-med-card">
        <div class="settings-med-header">
          <div class="settings-med-info">
            <div class="settings-med-name">${escHtml(med.name)}</div>
            <div class="settings-med-detail">⏰ ${timeLabels} — ${alarmTimes}</div>
            ${med.memo ? `<div class="settings-med-detail">📝 ${escHtml(med.memo)}</div>` : ''}
          </div>
          <div class="settings-actions">
            <button class="edit-btn"   onclick="openEditModal('${med.id}')">✏️ 수정</button>
            <button class="delete-btn" onclick="confirmDelete('${med.id}')">🗑️ 삭제</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ---- 알람 설정 탭 ----
function renderAlarmTab() {
  const token     = localStorage.getItem('github_token');
  const connected = !!token && !!window._pushSubscription;
  const statusHtml = connected
    ? '<span style="color:#2e7d32;font-weight:700;">✅ 알람 연결됨 — 화면이 꺼져도 알림이 와요</span>'
    : '<span style="color:#c62828;font-weight:700;">❌ 아직 설정 안 됨</span>';

  document.getElementById('alarmSetupStatus').innerHTML = statusHtml;
}

// ---- 기록 탭 ----
function renderRecordsTab() {
  const container = document.getElementById('recordsContainer');
  const dates     = Object.keys(records).sort().reverse();

  if (dates.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>아직 기록이 없어요.</p></div>`;
    return;
  }

  let totalEntries = 0, takenEntries = 0;
  const last7 = dates.slice(0, 7);
  last7.forEach(date => {
    Object.values(records[date] || {}).forEach(e => {
      totalEntries++;
      if (e.taken) takenEntries++;
    });
  });
  const rate = totalEntries > 0 ? Math.round(takenEntries / totalEntries * 100) : 0;

  let html = `
    <div class="record-summary">
      <div class="record-stat">
        <div class="record-stat-num">${rate}%</div>
        <div class="record-stat-label">최근 7일<br>복용률</div>
      </div>
      <div class="record-stat">
        <div class="record-stat-num">${takenEntries}</div>
        <div class="record-stat-label">최근 7일<br>복용 횟수</div>
      </div>
      <div class="record-stat">
        <div class="record-stat-num">${totalEntries - takenEntries}</div>
        <div class="record-stat-label">최근 7일<br>누락 횟수</div>
      </div>
    </div>`;

  dates.forEach(date => {
    const dayRecords = records[date] || {};
    const keys = Object.keys(dayRecords);
    if (keys.length === 0) return;

    const taken = keys.filter(k => dayRecords[k].taken).length;
    const total = keys.length;
    const dayRate = total > 0 ? Math.round(taken / total * 100) : 0;

    const [y, mo, d] = date.split('-');
    const dateObj   = new Date(+y, +mo-1, +d);
    const days      = ['일','월','화','수','목','금','토'];
    const dateLabel = `${mo}월 ${d}일 (${days[dateObj.getDay()]})`;

    const items = keys.map(key => {
      const [medId, timeKey] = key.split('_');
      const med     = medications.find(m => m.id === medId);
      const medName = med ? med.name : '(삭제된 약)';
      const timeLabel = TIME_LABELS[timeKey]?.label || timeKey;
      const entry   = dayRecords[key];
      return `
        <div class="record-item">
          <div class="record-item-dot ${entry.taken ? 'taken' : 'missed'}"></div>
          <div class="record-item-name">${escHtml(medName)} (${timeLabel})</div>
          <div class="record-item-status ${entry.taken ? 'taken' : 'missed'}">
            ${entry.taken ? `✅ ${entry.takenAt}` : '❌ 누락'}
          </div>
        </div>`;
    }).join('');

    html += `
      <div class="record-day">
        <div class="record-day-header">
          <span>${dateLabel}</span>
          <span class="record-day-rate">${taken}/${total} 복용 (${dayRate}%)</span>
        </div>
        ${items}
      </div>`;
  });

  container.innerHTML = html;
}

// ==================== 모달 ====================
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = '➕ 새 약 추가';
  document.getElementById('medName').value = '';
  document.getElementById('medMemo').value = '';
  TIME_ORDER.forEach(t => {
    document.getElementById(`cb_${t}`).checked = false;
    document.getElementById(`alarm_${t}`).value = TIME_LABELS[t].defaultTime;
    document.getElementById(`alarmRow_${t}`).style.display = 'none';
  });
  openModal();
}

function openEditModal(id) {
  const med = medications.find(m => m.id === id);
  if (!med) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = '✏️ 약 정보 수정';
  document.getElementById('medName').value = med.name;
  document.getElementById('medMemo').value = med.memo || '';
  TIME_ORDER.forEach(t => {
    const checked = med.times.includes(t);
    document.getElementById(`cb_${t}`).checked = checked;
    document.getElementById(`alarm_${t}`).value = med.alarmTimes?.[t] || TIME_LABELS[t].defaultTime;
    document.getElementById(`alarmRow_${t}`).style.display = checked ? 'flex' : 'none';
  });
  openModal();
}

function openModal()  { document.getElementById('modalOverlay').classList.add('open'); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function onTimeCheck(timeKey) {
  const checked = document.getElementById(`cb_${timeKey}`).checked;
  document.getElementById(`alarmRow_${timeKey}`).style.display = checked ? 'flex' : 'none';
}

async function saveMed() {
  const name = document.getElementById('medName').value.trim();
  if (!name) { showToast('약 이름을 입력해 주세요', 'red'); return; }

  const times = TIME_ORDER.filter(t => document.getElementById(`cb_${t}`).checked);
  if (times.length === 0) { showToast('복용 시간을 하나 이상 선택해 주세요', 'red'); return; }

  const alarmTimes = {};
  times.forEach(t => {
    alarmTimes[t] = document.getElementById(`alarm_${t}`).value || TIME_LABELS[t].defaultTime;
  });

  const memo = document.getElementById('medMemo').value.trim();

  if (editingId) {
    const idx = medications.findIndex(m => m.id === editingId);
    if (idx !== -1) medications[idx] = { ...medications[idx], name, times, alarmTimes, memo };
    showToast('✅ 수정했어요', 'green');
  } else {
    medications.push({ id: uid(), name, times, alarmTimes, memo, active: true });
    showToast('✅ 약을 추가했어요', 'green');
  }

  saveData();
  closeModal();
  renderAll();

  // GitHub 동기화 (백그라운드)
  syncToGitHub().then(ok => {
    if (ok) console.log('[동기화] 완료');
  });
}

// ==================== 삭제 ====================
function confirmDelete(id) {
  const med = medications.find(m => m.id === id);
  if (!med) return;
  deleteTargetId = id;
  document.getElementById('confirmMedName').textContent = med.name;
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
  deleteTargetId = null;
}

async function doDelete() {
  if (!deleteTargetId) return;
  medications = medications.filter(m => m.id !== deleteTargetId);
  saveData();
  closeConfirm();
  renderAll();
  showToast('🗑️ 삭제했어요', 'red');
  syncToGitHub();
}

// ==================== 인앱 알람 엔진 (앱 열려있을 때) ====================
function startAlarmEngine() {
  if (alarmCheckInterval) clearInterval(alarmCheckInterval);
  alarmCheckInterval = setInterval(checkAlarms, 30000);
  checkAlarms();
}

function checkAlarms() {
  const now   = new Date();
  const hhmm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const today = todayStr();
  if (!records[today]) records[today] = {};

  medications.filter(m => m.active).forEach(med => {
    med.times.forEach(timeKey => {
      const alarmTime = med.alarmTimes?.[timeKey] || TIME_LABELS[timeKey].defaultTime;
      if (alarmTime === hhmm) {
        const key   = `${med.id}_${timeKey}`;
        const entry = records[today][key] || {};
        if (!entry.taken) {
          triggerInAppAlarm(med.name, TIME_LABELS[timeKey].label);
        }
      }
    });
  });
}

function triggerInAppAlarm(medName, timeLabel) {
  showAlarmBanner(`💊 ${timeLabel} 약을 드실 시간이에요!`, medName);
  playAlarmSound();

  // SW 통해 알림 표시
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'IN_APP_ALARM',
      body: `${timeLabel} — ${medName}`
    });
  }
}

function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880,0],[1100,.35],[880,.7]].forEach(([freq,start]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.3);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime  + start + 0.3);
    });
  } catch {}
}

function showAlarmBanner(title, sub) {
  document.getElementById('alarmBannerTitle').textContent = title;
  document.getElementById('alarmBannerSub').textContent   = sub;
  document.getElementById('alarmBanner').classList.add('show');
}

function closeAlarmBanner() {
  document.getElementById('alarmBanner').classList.remove('show');
}

function scheduleSnooze() {
  closeAlarmBanner();
  if (snoozeTimeout) clearTimeout(snoozeTimeout);
  showToast('⏰ 5분 후에 다시 알려드릴게요', '');
  snoozeTimeout = setTimeout(() => {
    playAlarmSound();
    showAlarmBanner('💊 아직 약을 안 드셨어요!', '지금 드세요!');
  }, 5 * 60 * 1000);
}

// ==================== 알림 권한 ====================
function requestNotifPermission() {
  if (typeof Notification === 'undefined') {
    showToast('이 브라우저는 알림을 지원하지 않아요', 'red');
    return;
  }
  Notification.requestPermission().then(p => {
    if (p === 'granted') showToast('✅ 알림을 허용했어요!', 'green');
    else showToast('알림을 허용하지 않았어요', 'red');
    renderTodayTab();
  });
}

// ==================== 탭 전환 ====================
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el  => el.classList.remove('active'));
  document.getElementById(`tab_${tabName}`).classList.add('active');
  document.getElementById(`content_${tabName}`).classList.add('active');
}

// ==================== 유틸 ====================
function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('modalOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
