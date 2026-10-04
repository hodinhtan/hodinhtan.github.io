#!/usr/bin/env node
// Đẩy các mục cập nhật (từ portal/AD) lên Firestore collection "feed".
// Dùng:  node push-feed.mjs items.json [--dry-run]
// Cần:   GOOGLE_APPLICATION_CREDENTIALS=<đường dẫn khoá service account, để NGOÀI repo>
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PRESS = /báo\s*chí|bao\s*chi|\bpress\b|\bmedia\s*monitoring\b/i;
const MAX = { title: 300, body: 5000, source: 60, tag: 40 };

function usage() {
  console.error('Dùng: node push-feed.mjs items.json [--dry-run]');
  process.exit(2);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) usage();

const items = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(items)) {
  console.error('File phải chứa một mảng JSON các mục.');
  process.exit(2);
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const httpUrl = (v) => {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
};

function toDoc(item) {
  const tags = (Array.isArray(item.tags) ? item.tags : []).map((t) => str(t, MAX.tag)).filter(Boolean);
  const title = str(item.title, MAX.title);
  if (!title) return { skip: 'thiếu title' };
  const haystack = [item.title, item.source, item.category, ...tags].filter(Boolean).join('\n');
  if (PRESS.test(haystack)) return { skip: 'nội dung báo chí' };
  const ts = new Date(item.ts ?? Date.now());
  if (Number.isNaN(ts.getTime())) return { skip: 'ts không hợp lệ' };
  const source = str(item.source, MAX.source);
  const key = item.id ?? `${source}|${title}|${item.url ?? ''}`;
  return {
    id: createHash('sha1').update(String(key)).digest('hex'),
    doc: {
      title,
      body: str(item.body, MAX.body),
      url: httpUrl(item.url),
      source,
      area: item.area === 'personal' ? 'personal' : 'corp',
      ts,
    },
  };
}

const ready = [];
const skipped = [];
for (const item of items) {
  const r = toDoc(item);
  if (r.skip) skipped.push(`${str(item?.title, 60) || '(không tiêu đề)'} — ${r.skip}`);
  else ready.push(r);
}

console.log(`${ready.length} mục hợp lệ, ${skipped.length} mục bị bỏ qua.`);
for (const s of skipped) console.log('  bỏ qua:', s);

if (dryRun || !ready.length) {
  if (dryRun) console.log('(dry-run: không ghi gì lên Firestore)');
  process.exit(0);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

for (let i = 0; i < ready.length; i += 400) {
  const batch = db.batch();
  for (const { id, doc } of ready.slice(i, i + 400)) {
    batch.set(db.collection('feed').doc(id), { ...doc, ts: Timestamp.fromDate(doc.ts) });
  }
  await batch.commit();
}
console.log(`Đã ghi ${ready.length} mục lên Firestore.`);
