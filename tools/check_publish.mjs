// Проверка публикуемого текста: личные данные, служебные пометки, следы рабочей переписки.
// Запуск:
//   node tools/check_publish.mjs --all            все файлы репозитория (так проверяет GitHub Actions)
//   node tools/check_publish.mjs --staged         файлы, подготовленные к коммиту (хук pre-commit)
//   node tools/check_publish.mjs --push A..B      файлы и сообщения коммитов из диапазона (хук pre-push)
//   node tools/check_publish.mjs --msg <файл>     сообщение коммита (хук commit-msg)
//   node tools/check_publish.mjs <файлы...>       указанные файлы с диска
// Нашлось что-то — список «файл:строка — что не так» и код выхода 1.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// --- правила: [название, регулярное выражение, где искать: 'all' — весь текст, 'comment' — только комментарии кода]
const RULES = [
  ['слово «пользователь»', /пользовател/i, 'all'],
  ['оборот «по просьбе»', /по просьбе/i, 'all'],
  ['слово «жалоба»', /жалоб/i, 'all'],
  ['метка инструмента', /ponytail/i, 'all'],
  ['название ИИ-инструмента', /\bclaude\b|anthropic|chatgpt|openai|copilot/i, 'all'],
  ['личный путь Windows', /\b[A-Za-z]:[\\/]Users[\\/]/i, 'all'],
  ['путь к диску D:', /\bD:[\\/]/, 'all'],
  ['адрес домашней сети', /\b192\.168\.\d{1,3}\.\d{1,3}\b|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, 'all'],
  ['адрес почты', /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/, 'all'],
  ['номер телефона', /(?:\+\d{1,3}[\s-]?)?\(?\b\d{3}\)?[\s-]\d{3}[\s-]\d{2}[\s-]?\d{2}\b/, 'all'],
  ['локальная папка notes/', /(^|[^\w.\/-])notes\//, 'all'],
  ['локальная папка qa/', /(^|[^\w.\/-])qa\//, 'all'],
  ['локальный файл заметок', /CLAUDE\.md|WORKLOG|MEMORY_update/i, 'all'],
  ['пометка версии в комментарии кода', /(?<![\/\w])v\d{1,2}\b/i, 'comment'],   // путь вида docs/v23/ — не пометка
  ['дата в комментарии кода', /\b\d{1,2}\.\d{1,2}\.(?:20)?\d{2}\b|\b20\d{2}-\d{2}-\d{2}\b/, 'comment'],
];
// Исключения: сама проверка (в ней образцы), одна строка про инструмент разработки в README
const SKIP_FILES = new Set(['tools/check_publish.mjs']);
const ALLOW = [['README.md', 'название ИИ-инструмента', /Claude Code/]];
const VENDOR = /(^|\/)three[.\-]|\.min\.js$/;   // чужие библиотеки не проверяем
const TEXT = /\.(m?js|cjs|html?|css|md|txt|py|ya?ml|json|sh|ps1|bat)$|^\.gitignore$|(^|\/)\.githooks\//i;
const CODE = /\.(m?js|cjs|html?|css|py|ya?ml|sh)$|(^|\/)\.githooks\//i;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });

// комментарии строки кода: после // (не адрес http://), # в Python/YAML/shell, внутри /* */ и <!-- -->
function commentOf(line, file, st) {
  let out = '';
  if (st.block) { const e = line.indexOf(st.block); if (e < 0) return line; out += line.slice(0, e); line = line.slice(e + st.block.length); st.block = null; }
  const hash = /\.(py|ya?ml|sh)$|(^|\/)\.githooks\//.test(file);
  for (let i = 0; i < line.length; i++) {
    const c = line[i], two = line.slice(i, i + 2);
    if (two === '//' && line[i - 1] !== ':') return out + line.slice(i + 2);
    if (hash && c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return out + line.slice(i + 1);
    if (two === '/*' || line.startsWith('<!--', i)) {
      const end = two === '/*' ? '*/' : '-->', s = i + (two === '/*' ? 2 : 4), e = line.indexOf(end, s);
      if (e < 0) { st.block = end; return out + line.slice(s); }
      out += line.slice(s, e) + ' '; i = e + end.length - 1;
    }
  }
  return out;
}

function checkText(name, text, kind = 'file') {
  const found = [], st = { block: null }, code = kind === 'file' && CODE.test(name);
  text.split(/\r?\n/).forEach((line, n) => {
    const com = code ? commentOf(line, name, st) : '';
    for (const [what, re, where] of RULES) {
      const hay = where === 'comment' ? com : line;
      if (!hay || !re.test(hay)) continue;
      if (ALLOW.some(([f, w, ok]) => f === name && w === what && ok.test(line))) continue;
      found.push(`${name}:${n + 1} — ${what}: ${line.trim().slice(0, 140)}`);
    }
  });
  return found;
}

const args = process.argv.slice(2), found = [];
const fromIndex = f => { try { return git('show', `:${f}`); } catch { return null; } };
const fromRev = (rev, f) => { try { return git('show', `${rev}:${f}`); } catch { return null; } };
const files = (list, read) => { for (const f of list) { if (!f || SKIP_FILES.has(f) || VENDOR.test(f) || !TEXT.test(f)) continue; const t = read(f); if (t != null) found.push(...checkText(f, t)); } };

if (args[0] === '--all') files(git('ls-files').split('\n'), f => (existsSync(f) ? readFileSync(f, 'utf8') : null));
else if (args[0] === '--staged') files(git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n'), fromIndex);
else if (args[0] === '--push') {
  const range = args[1], to = range.split('..')[1] || 'HEAD';
  files(git('diff', '--name-only', '--diff-filter=ACMR', range).split('\n'), f => fromRev(to, f));
  for (const sha of git('rev-list', range).split('\n').filter(Boolean)) found.push(...checkText(`коммит ${sha.slice(0, 7)}`, git('log', '-1', '--format=%B', sha), 'msg'));
} else if (args[0] === '--msg') found.push(...checkText('сообщение коммита', readFileSync(args[1], 'utf8').replace(/^#.*$/gm, ''), 'msg'));
else files(args, f => (existsSync(f) ? readFileSync(f, 'utf8') : null));

if (found.length) {
  console.error(`Проверка публикации: найдено ${found.length}. Исправьте и повторите (правила — в tools/check_publish.mjs):`);
  for (const f of found) console.error('  ' + f);
  process.exit(1);
}
console.log('Проверка публикации: чисто.');
