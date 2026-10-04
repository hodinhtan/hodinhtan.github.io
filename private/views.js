import {
  el, AREA, AREA_OPTIONS, areaOf, badge, safeUrl, linkify, externalLink, dueLabel,
  todayKey, toDate, fmtDateTime, openForm, empty,
} from './ui.js';
import { calendarView, todayCard } from './calendar.js';

const visible = (ctx, items, fields, fallback = 'personal') =>
  items.filter(
    (i) =>
      (ctx.area === 'all' || areaOf(i, fallback) === ctx.area) &&
      (!ctx.q || fields.map((f) => i[f] ?? '').join('\n').toLowerCase().includes(ctx.q)),
  );

const newest = (a, b) => (toDate(b.updatedAt) ?? 0) - (toDate(a.updatedAt) ?? 0);
const defaultArea = (ctx) => (ctx.area === 'all' ? 'personal' : ctx.area);
const head = (title, ...actions) =>
  el('div', { class: 'card-head' }, el('h2', { text: title }), el('div', { class: 'head-actions' }, actions));
const addButton = (label, onclick) => el('button', { class: 'primary small', type: 'button', text: label, onclick });
const smallButton = (label, onclick) => el('button', { class: 'small', type: 'button', text: label, onclick });

/* ---------- Công việc ---------- */

const STATUS = [['todo', 'Cần làm'], ['doing', 'Đang làm'], ['done', 'Đã xong']];
const STATUS_ORDER = { doing: 0, todo: 1, done: 2 };

function sortTasks(a, b) {
  const da = a.due || '9999-12-31';
  const db = b.due || '9999-12-31';
  return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (da < db ? -1 : da > db ? 1 : 0) || newest(a, b);
}

const taskData = (t, patch = {}) => ({
  title: t.title.trim(),
  area: areaOf(t),
  status: t.status,
  due: t.due || '',
  link: t.link || '',
  ...patch,
});

function taskForm(ctx, t) {
  openForm({
    title: t ? 'Sửa công việc' : 'Thêm công việc',
    fields: [
      { name: 'title', label: 'Tiêu đề', required: true, max: 200 },
      { name: 'area', label: 'Lĩnh vực', type: 'select', options: AREA_OPTIONS },
      { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS },
      { name: 'due', label: 'Hạn', type: 'date' },
      { name: 'link', label: 'Liên kết', type: 'url', max: 2000, placeholder: 'https://…' },
    ],
    values: t ?? { area: defaultArea(ctx), status: 'todo' },
    onSave: (v) => ctx.save('tasks', t?.id, taskData(v)),
    onDelete: t && (() => ctx.remove('tasks', t.id)),
  });
}

function taskRow(ctx, t) {
  const done = t.status === 'done';
  const overdue = !done && t.due && t.due < todayKey();
  const link = safeUrl(t.link);
  return el(
    'div',
    { class: `row${done ? ' done' : ''}` },
    el('input', {
      type: 'checkbox',
      'aria-label': `Hoàn thành: ${t.title}`,
      checked: done,
      onchange: () => ctx.save('tasks', t.id, taskData(t, { status: done ? 'todo' : 'done' })).catch(ctx.fail),
    }),
    el(
      'div',
      { class: 'row-main' },
      el('div', { class: 'row-title', text: t.title }),
      el(
        'div',
        { class: 'row-meta' },
        badge(areaOf(t)),
        t.status === 'doing' && el('span', { class: 'chip', text: 'Đang làm' }),
        t.due && el('span', { class: overdue ? 'due over' : 'due', text: dueLabel(t.due) }),
        link && externalLink(link, 'Liên kết'),
      ),
    ),
    smallButton('Sửa', () => taskForm(ctx, t)),
  );
}

function quickAdd(ctx) {
  const input = el('input', {
    id: 'quick-add',
    type: 'text',
    maxlength: 200,
    placeholder: `Thêm việc (Enter) — ${AREA[defaultArea(ctx)]}`,
    'aria-label': 'Thêm việc nhanh',
  });
  input.addEventListener('keydown', (e) => {
    const title = input.value.trim();
    if (e.key !== 'Enter' || !title) return;
    input.value = '';
    ctx
      .save('tasks', null, taskData({ title, area: defaultArea(ctx), status: 'todo' }))
      .catch((err) => {
        input.value = title;
        ctx.fail(err);
      });
  });
  return input;
}

function tasksView(ctx) {
  const all = visible(ctx, ctx.store.tasks, ['title', 'link']).sort(sortTasks);
  const open = all.filter((t) => t.status !== 'done');
  const done = all.filter((t) => t.status === 'done');
  const card = el('section', { class: 'card' }, head('Công việc', addButton('+ Thêm', () => taskForm(ctx, null))));
  card.append(quickAdd(ctx));
  card.append(open.length ? el('div', { class: 'list' }, open.map((t) => taskRow(ctx, t))) : empty('Không có việc đang mở.'));
  if (done.length) {
    card.append(
      smallButton(ctx.showDone ? 'Ẩn việc đã xong' : `Hiện việc đã xong (${done.length})`, () => {
        ctx.showDone = !ctx.showDone;
        ctx.rerender();
      }),
    );
    if (ctx.showDone) card.append(el('div', { class: 'list' }, done.map((t) => taskRow(ctx, t))));
  }
  return card;
}

/* ---------- Ghi chú ---------- */

function noteForm(ctx, n) {
  openForm({
    title: n ? 'Sửa ghi chú' : 'Thêm ghi chú',
    fields: [
      { name: 'title', label: 'Tiêu đề', required: true, max: 200 },
      { name: 'area', label: 'Lĩnh vực', type: 'select', options: AREA_OPTIONS },
      { name: 'body', label: 'Nội dung', type: 'textarea', max: 100000 },
    ],
    values: n ? { ...n, area: areaOf(n) } : { area: defaultArea(ctx) },
    onSave: (v) => ctx.save('notes', n?.id, { title: v.title.trim(), body: v.body, area: v.area }),
    onDelete: n && (() => ctx.remove('notes', n.id)),
  });
}

function noteCard(ctx, n) {
  const copy = smallButton('Sao chép', async () => {
    try {
      await navigator.clipboard.writeText(n.body ?? '');
      copy.textContent = 'Đã chép';
    } catch {
      copy.textContent = 'Lỗi';
    }
    setTimeout(() => (copy.textContent = 'Sao chép'), 1500);
  });
  const date = toDate(n.updatedAt);
  return el(
    'article',
    { class: 'card note' },
    el(
      'div',
      { class: 'note-head' },
      el('h3', { text: n.title }),
      el('div', { class: 'head-actions' }, copy, smallButton('Sửa', () => noteForm(ctx, n))),
    ),
    el('p', { class: 'note-body' }, linkify(n.body)),
    el('div', { class: 'row-meta' }, badge(areaOf(n)), date && el('span', { class: 'muted', text: 'Cập nhật ' + fmtDateTime(date) })),
  );
}

function notesView(ctx) {
  const list = visible(ctx, ctx.store.notes, ['title', 'body']).sort(newest);
  return el(
    'div',
    {},
    el('section', { class: 'card' }, head('Ghi chú', addButton('+ Thêm', () => noteForm(ctx, null)))),
    list.length
      ? el('div', { class: 'stack' }, list.map((n) => noteCard(ctx, n)))
      : empty(ctx.store.notes.length ? 'Không tìm thấy kết quả.' : 'Chưa có ghi chú nào.'),
  );
}

/* ---------- Liên kết ---------- */

function linkForm(ctx, l) {
  openForm({
    title: l ? 'Sửa liên kết' : 'Thêm liên kết',
    fields: [
      { name: 'title', label: 'Tên', required: true, max: 200 },
      { name: 'url', label: 'Địa chỉ', type: 'url', required: true, max: 2000, placeholder: 'https://…' },
      { name: 'area', label: 'Lĩnh vực', type: 'select', options: AREA_OPTIONS },
      { name: 'group', label: 'Nhóm', max: 60, placeholder: 'Ví dụ: Portal, Tài chính, Báo cáo', list: 'link-groups' },
    ],
    values: l ? { ...l, area: areaOf(l) } : { area: defaultArea(ctx) },
    onSave: (v) =>
      ctx.save('links', l?.id, { title: v.title.trim(), url: v.url.trim(), area: v.area, group: v.group.trim() }),
    onDelete: l && (() => ctx.remove('links', l.id)),
  });
}

function linksView(ctx) {
  const list = visible(ctx, ctx.store.links, ['title', 'url', 'group']);
  const groups = new Map();
  for (const l of list) {
    const g = l.group || 'Khác';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(l);
  }
  const names = [...new Set(ctx.store.links.map((l) => l.group).filter(Boolean))];
  const datalist = el('datalist', { id: 'link-groups' }, names.map((g) => el('option', { value: g })));
  const root = el('div', {}, el('section', { class: 'card' }, head('Liên kết', addButton('+ Thêm', () => linkForm(ctx, null)))), datalist);
  if (!list.length) {
    root.append(empty(ctx.store.links.length ? 'Không tìm thấy kết quả.' : 'Chưa có liên kết nào. Thêm các trang portal, tài liệu, báo cáo bạn hay dùng.'));
    return root;
  }
  for (const [name, items] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'vi'))) {
    root.append(
      el(
        'section',
        { class: 'card' },
        el('h3', { class: 'group-title', text: name }),
        el(
          'div',
          { class: 'list' },
          items
            .sort((a, b) => a.title.localeCompare(b.title, 'vi'))
            .map((l) => {
              const href = safeUrl(l.url);
              return el(
                'div',
                { class: 'row' },
                el(
                  'div',
                  { class: 'row-main' },
                  el('div', { class: 'row-title' }, href ? externalLink(href, l.title) : l.title),
                  el('div', { class: 'row-meta' }, badge(areaOf(l)), href && el('span', { class: 'muted', text: new URL(href).host })),
                ),
                smallButton('Sửa', () => linkForm(ctx, l)),
              );
            }),
        ),
      ),
    );
  }
  return root;
}

/* ---------- Cập nhật (portal / AD) ---------- */

function feedCard(ctx, f) {
  const href = safeUrl(f.url);
  const date = toDate(f.ts);
  const body = el('p', { class: 'feed-body', text: f.body ?? '' });
  if (f.body) body.addEventListener('click', () => body.classList.toggle('expanded'));
  return el(
    'article',
    { class: 'card feed' },
    el(
      'div',
      { class: 'note-head' },
      el('h3', {}, href ? externalLink(href, f.title) : f.title),
      smallButton('Xoá', () => confirm(`Xoá “${f.title}”?`) && ctx.remove('feed', f.id).catch(ctx.fail)),
    ),
    f.body && body,
    el(
      'div',
      { class: 'row-meta' },
      badge(areaOf(f, 'corp')),
      f.source && el('span', { class: 'chip', text: f.source }),
      date && el('span', { class: 'muted', text: fmtDateTime(date) }),
    ),
  );
}

function feedView(ctx) {
  const list = visible(ctx, ctx.store.feed, ['title', 'body', 'source'], 'corp');
  return el(
    'div',
    {},
    el('section', { class: 'card' }, head('Cập nhật từ portal / AD')),
    list.length
      ? el('div', { class: 'stack' }, list.map((f) => feedCard(ctx, f)))
      : empty(
          ctx.store.feed.length
            ? 'Không tìm thấy kết quả.'
            : 'Chưa có cập nhật nào. Dữ liệu từ portal/AD được đẩy lên bằng script trong thư mục _tools (xem _firebase/README.md).',
        ),
  );
}

/* ---------- Tổng quan ---------- */

function tile(href, value, label, tone) {
  return el('a', { class: `tile${tone ? ' ' + tone : ''}`, href }, el('div', { class: 'tile-value', text: String(value) }), el('div', { class: 'tile-label', text: label }));
}

function overviewView(ctx) {
  const tasks = visible(ctx, ctx.store.tasks, ['title']);
  const open = tasks.filter((t) => t.status !== 'done');
  const today = todayKey();
  const overdue = open.filter((t) => t.due && t.due < today);
  const attention = [...open].sort(sortTasks).slice(0, 8);
  const feed = visible(ctx, ctx.store.feed, ['title', 'body', 'source'], 'corp');
  const weekAgo = Date.now() - 7 * 86400000;
  const recentFeed = feed.filter((f) => (toDate(f.ts) ?? 0) >= weekAgo);
  const notes = visible(ctx, ctx.store.notes, ['title', 'body']).sort(newest).slice(0, 3);

  const attentionCard = el(
    'section',
    { class: 'card' },
    head('Việc cần làm', el('a', { href: '#/tasks', text: 'Tất cả' })),
    quickAdd(ctx),
    attention.length ? el('div', { class: 'list' }, attention.map((t) => taskRow(ctx, t))) : empty('Không có việc đang mở.'),
  );
  const feedCardEl = el(
    'section',
    { class: 'card' },
    head('Cập nhật mới', el('a', { href: '#/feed', text: 'Tất cả' })),
    feed.length
      ? el(
          'div',
          { class: 'list' },
          feed.slice(0, 5).map((f) => {
            const href = safeUrl(f.url);
            return el(
              'div',
              { class: 'row' },
              el('div', { class: 'row-main' }, el('div', { class: 'row-title' }, href ? externalLink(href, f.title) : f.title), el('div', { class: 'row-meta' }, badge(areaOf(f, 'corp')), f.source && el('span', { class: 'chip', text: f.source }))),
            );
          }),
        )
      : empty('Chưa có cập nhật nào.'),
  );
  const notesCard = el(
    'section',
    { class: 'card' },
    head('Ghi chú gần đây', el('a', { href: '#/notes', text: 'Tất cả' })),
    notes.length
      ? el('div', { class: 'list' }, notes.map((n) => el('div', { class: 'row' }, el('div', { class: 'row-main' }, el('div', { class: 'row-title', text: n.title }), el('div', { class: 'row-meta' }, badge(areaOf(n)))))))
      : empty('Chưa có ghi chú nào.'),
  );

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'tiles' },
      tile('#/tasks', open.length, 'Việc đang mở'),
      tile('#/tasks', overdue.length, 'Quá hạn', overdue.length ? 'danger' : ''),
      tile('#/feed', recentFeed.length, 'Cập nhật 7 ngày'),
      tile('#/notes', visible(ctx, ctx.store.notes, ['title', 'body']).length, 'Ghi chú'),
    ),
    el('div', { class: 'grid' }, el('div', { class: 'stack' }, attentionCard, notesCard), el('div', { class: 'stack' }, todayCard(ctx), feedCardEl)),
  );
}

export const views = {
  overview: overviewView,
  tasks: tasksView,
  calendar: calendarView,
  notes: notesView,
  links: linksView,
  feed: feedView,
};
