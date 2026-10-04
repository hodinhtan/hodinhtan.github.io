export const $ = (id) => document.getElementById(id);

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function getPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const AREA = { personal: 'Cá nhân', corp: 'Tập đoàn' };
export const AREA_OPTIONS = Object.entries(AREA);
export const areaOf = (item, fallback = 'personal') => (item.area in AREA ? item.area : fallback);
export const badge = (area) => el('span', { class: `badge ${area}`, text: AREA[area] });

export function safeUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch {
    return '';
  }
}

export function linkify(text) {
  return String(text ?? '')
    .split(/(https?:\/\/[^\s<>"']+)/g)
    .map((part, i) => {
      if (i % 2 === 0) return document.createTextNode(part);
      const href = safeUrl(part);
      return href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: part }) : part;
    });
}

export const externalLink = (href, text, cls) =>
  el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls, text });

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dateKey(new Date());
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const daysBetween = (aKey, bKey) => Math.round((parseKey(bKey) - parseKey(aKey)) / 86400000);
export const toDate = (ts) => ts?.toDate?.() ?? null;

export function dueLabel(due) {
  if (!due) return '';
  const n = daysBetween(todayKey(), due);
  if (n < 0) return `Quá hạn ${-n} ngày`;
  if (n === 0) return 'Hôm nay';
  if (n === 1) return 'Ngày mai';
  return parseKey(due).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export const fmtDateTime = (d) =>
  d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtTime = (d) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export const fmtDayHeading = (d) =>
  d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });

export const empty = (text) => el('p', { class: 'empty muted', text });

export function openForm({ title, fields, values = {}, onSave, onDelete }) {
  const dlg = $('form-dialog');
  const form = $('form');
  const err = $('form-err');
  $('form-title').textContent = title;
  err.hidden = true;

  const inputs = {};
  const rows = fields.map((f) => {
    let input;
    if (f.type === 'textarea') {
      input = el('textarea', { rows: 10, maxlength: f.max, placeholder: f.placeholder });
    } else if (f.type === 'select') {
      input = el('select', {}, f.options.map(([value, label]) => el('option', { value, text: label })));
    } else {
      input = el('input', { type: f.type ?? 'text', maxlength: f.max, placeholder: f.placeholder, list: f.list });
    }
    if (f.required) input.required = true;
    input.value = values[f.name] ?? f.default ?? '';
    inputs[f.name] = input;
    return el('label', { class: 'field' }, el('span', { class: 'field-label', text: f.label }), input);
  });
  $('form-fields').replaceChildren(...rows);

  const read = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
  const snapshot = JSON.stringify(read());
  const del = $('form-delete');
  del.hidden = !onDelete;

  const buttons = () => form.querySelectorAll('button');
  async function run(action) {
    buttons().forEach((b) => (b.disabled = true));
    err.hidden = true;
    try {
      await action();
      dlg.close();
    } catch (e) {
      err.textContent = 'Lỗi: ' + (e.code || e.message);
      err.hidden = false;
    } finally {
      buttons().forEach((b) => (b.disabled = false));
    }
  }
  function tryClose() {
    if (JSON.stringify(read()) !== snapshot && !confirm('Bỏ các thay đổi chưa lưu?')) return;
    dlg.close();
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    run(() => onSave(read()));
  };
  del.onclick = () => {
    if (confirm(`Xoá “${inputs.title?.value ?? ''}”?`)) run(onDelete);
  };
  $('form-cancel').onclick = tryClose;
  dlg.oncancel = (e) => {
    e.preventDefault();
    tryClose();
  };
  dlg.showModal();
  (inputs[fields.find((f) => f.type !== 'select')?.name] ?? Object.values(inputs)[0])?.focus();
}
