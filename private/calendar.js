import { el, externalLink, safeUrl, parseKey, dateKey, todayKey, fmtTime, fmtDayHeading, empty } from './ui.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_KEY = 'gcal_token';
const API_URL = 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=hodinhtangithubio';
const FETCH_DAYS = 31;
const CACHE_MS = 60_000;

class CalendarError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function loadToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    return t && t.exp > Date.now() ? t.token : null;
  } catch {
    return null;
  }
}

function saveToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + 55 * 60_000 }));
  } catch {}
}

let cache = null;

export function disconnectCalendar() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  cache = null;
}

export const calendarConnected = () => !!loadToken();

export async function connectCalendar(ctx) {
  const provider = new ctx.fa.GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ login_hint: ctx.user.email });
  const result = await ctx.fa.reauthenticateWithPopup(ctx.user, provider);
  const token = ctx.fa.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Không nhận được quyền truy cập lịch');
  saveToken(token);
  cache = null;
}

async function api(path, params) {
  const token = loadToken();
  if (!token) throw new CalendarError('auth', 'Chưa kết nối Google Calendar.');
  const url = new URL('https://www.googleapis.com/calendar/v3' + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res.json();
  if (res.status === 401) {
    disconnectCalendar();
    throw new CalendarError('auth', 'Phiên kết nối lịch đã hết hạn, hãy kết nối lại.');
  }
  let message = '';
  try {
    message = (await res.json()).error?.message ?? '';
  } catch {}
  if (res.status === 403 && /has not been used|is disabled/i.test(message)) {
    throw new CalendarError('api-disabled', 'Google Calendar API chưa được bật cho dự án Firebase.');
  }
  throw new CalendarError('http', `Google Calendar trả về lỗi ${res.status}.`);
}

function normalize(e, cal) {
  const allDay = !!e.start?.date;
  return {
    id: `${cal.id}/${e.id}`,
    title: e.summary || '(Không có tiêu đề)',
    allDay,
    start: allDay ? parseKey(e.start.date) : new Date(e.start.dateTime),
    link: safeUrl(e.htmlLink),
    meet: safeUrl(e.hangoutLink),
    location: e.location ?? '',
    calendar: cal.summaryOverride || cal.summary || '',
    color: /^#[0-9a-f]{3,8}$/i.test(cal.backgroundColor ?? '') ? cal.backgroundColor : '',
  };
}

async function loadEvents() {
  const list = await api('/users/me/calendarList', { minAccessRole: 'reader', maxResults: 50 });
  const cals = (list.items ?? []).filter((c) => c.selected || c.primary).slice(0, 10);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + FETCH_DAYS * 86400000);
  const perCalendar = await Promise.all(
    cals.map(async (cal) => {
      const r = await api(`/calendars/${encodeURIComponent(cal.id)}/events`, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: 100,
      });
      return (r.items ?? []).filter((e) => e.status !== 'cancelled' && e.start).map((e) => normalize(e, cal));
    }),
  );
  return perCalendar
    .flat()
    .sort((a, b) => dayKeyOf(a).localeCompare(dayKeyOf(b)) || b.allDay - a.allDay || a.start - b.start);
}

export function getEvents() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), promise: loadEvents() };
    cache.promise.catch(() => {});
  }
  return cache.promise;
}

const dayKeyOf = (ev) => {
  const today = todayKey();
  const k = dateKey(ev.start);
  return k < today ? today : k;
};

function eventRow(ev) {
  return el(
    'div',
    { class: 'evt' },
    el('div', { class: 'evt-time', text: ev.allDay ? 'Cả ngày' : fmtTime(ev.start) }),
    el(
      'div',
      { class: 'evt-main' },
      el(
        'div',
        { class: 'evt-title' },
        el('span', { class: 'dot', style: ev.color ? `background:${ev.color}` : null }),
        ev.link ? externalLink(ev.link, ev.title) : ev.title,
      ),
      el(
        'div',
        { class: 'evt-meta muted' },
        [ev.calendar, ev.location].filter(Boolean).join(' · '),
        ev.meet && [' · ', externalLink(ev.meet, 'Tham gia họp')],
      ),
    ),
  );
}

function agenda(events, days) {
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  const limitKey = dateKey(new Date(limit.getTime() + days * 86400000));
  const byDay = new Map();
  for (const ev of events) {
    const k = dayKeyOf(ev);
    if (k >= limitKey) continue;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(ev);
  }
  if (!byDay.size) return empty(days === 1 ? 'Hôm nay không có sự kiện.' : 'Không có sự kiện trong khoảng này.');
  const today = todayKey();
  return el(
    'div',
    { class: 'agenda' },
    [...byDay].map(([k, list]) =>
      el(
        'section',
        {},
        days > 1 &&
          el('h3', { class: 'day-head', text: (k === today ? 'Hôm nay · ' : '') + fmtDayHeading(parseKey(k)) }),
        list.map(eventRow),
      ),
    ),
  );
}

function problem(ctx, e, rerender) {
  if (e.kind === 'api-disabled') {
    return el(
      'p',
      { class: 'err', role: 'alert' },
      e.message + ' ',
      externalLink(API_URL, 'Bật Calendar API'),
      ' rồi thử lại sau vài phút.',
    );
  }
  return el(
    'div',
    {},
    el('p', { class: 'err', role: 'alert', text: e.message }),
    e.kind === 'auth' && connectButton(ctx, rerender),
  );
}

function connectButton(ctx, rerender) {
  return el('button', {
    class: 'primary',
    type: 'button',
    text: 'Kết nối Google Calendar',
    onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        await connectCalendar(ctx);
      } catch (e) {
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') ctx.fail(e);
      }
      rerender();
    },
  });
}

function loadInto(ctx, box, days) {
  box.replaceChildren(el('p', { class: 'muted', text: 'Đang tải lịch…' }));
  getEvents().then(
    (events) => box.isConnected && box.replaceChildren(agenda(events, days)),
    (e) => box.isConnected && box.replaceChildren(problem(ctx, e, ctx.rerender)),
  );
}

export function todayCard(ctx) {
  const box = el('div');
  if (calendarConnected()) {
    loadInto(ctx, box, 1);
  } else {
    box.append(
      el('p', { class: 'muted', text: 'Kết nối Google Calendar để xem lịch hôm nay ngay tại đây.' }),
      connectButton(ctx, ctx.rerender),
    );
  }
  return el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: 'Lịch hôm nay' }), el('a', { href: '#/calendar', text: 'Xem lịch' })), box);
}

let range = 7;

export function calendarView(ctx) {
  const body = el('div');
  const root = el('section', { class: 'card' });
  const head = el('div', { class: 'card-head' }, el('h2', { text: 'Lịch' }));
  root.append(head, body);

  if (!calendarConnected()) {
    body.append(
      el('p', {
        class: 'muted',
        text: 'Kết nối để xem sự kiện Google Calendar của bạn (chỉ đọc). Phiên kết nối kéo dài khoảng 1 giờ.',
      }),
      connectButton(ctx, ctx.rerender),
    );
    return root;
  }

  const seg = el(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Khoảng thời gian' },
    [[1, 'Hôm nay'], [7, '7 ngày'], [30, '30 ngày']].map(([d, label]) =>
      el('button', {
        type: 'button',
        text: label,
        'aria-pressed': String(d === range),
        onclick: () => {
          range = d;
          ctx.rerender();
        },
      }),
    ),
  );
  head.append(
    el(
      'div',
      { class: 'head-actions' },
      seg,
      el('button', {
        class: 'small',
        type: 'button',
        text: 'Làm mới',
        onclick: () => {
          cache = null;
          ctx.rerender();
        },
      }),
      externalLink('https://calendar.google.com/calendar/u/0/r', 'Mở Google Calendar', 'btn small'),
      el('button', {
        class: 'small',
        type: 'button',
        text: 'Ngắt kết nối',
        onclick: () => {
          disconnectCalendar();
          ctx.rerender();
        },
      }),
    ),
  );
  loadInto(ctx, body, range);
  return root;
}
