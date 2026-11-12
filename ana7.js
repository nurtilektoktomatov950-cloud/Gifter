// Бот-аналитика профиля: inline-режим. Пишешь @бот в любом чате и выбираешь «Моя аналитика».
// Переменные: BOT_TOKEN (секрет), WEBHOOK_SECRET (секрет). Необязательно: STAR_USD (цена звезды в долларах, по умолчанию 0.0145).

async function tg(env, method, body) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e) }; }
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nameOf = (u) => ((u.first_name || '') + (u.last_name ? ' ' + u.last_name : '')).trim() || (u.username ? '@' + u.username : 'id' + u.id);
const num = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

// Примерный возраст аккаунта по ID. Telegram дату регистрации не отдаёт, это оценка по тому, как росли номера.
const ANCHORS = [
  [1e6, '2013'], [1.5e7, '2014'], [1e8, '2015'], [2.2e8, '2016'], [4e8, '2017'], [6.5e8, '2018'], [9e8, '2019'],
  [1.3e9, '2020'], [1.9e9, '2021'], [5e9, '2022'], [6.2e9, '2023'], [7.2e9, '2024'], [8.2e9, '2025'], [9.5e9, '2026'],
];
function regYear(id) {
  if (id < 1e6) return 'до 2013 (самый старый аккаунт)';
  for (let i = 0; i < ANCHORS.length; i++) if (id < ANCHORS[i][0]) return '≈ ' + (i ? ANCHORS[i][1] : '2013') + ' год';
  return '≈ 2026 год или позже';
}

async function loadGifts(env, uid) {
  const all = [];
  let off = '', pages = 0, total = null;
  do {
    const r = await tg(env, 'getUserGifts', { user_id: uid, limit: 100, offset: off });
    if (!r.ok) return { error: r.description || 'ошибка' };
    all.push(...(r.result.gifts || []));
    total = r.result.total_count;
    off = r.result.next_offset || '';
    pages++;
  } while (off && pages < 8);
  return { gifts: all, total };
}

function analyse(gifts, env) {
  const rate = Number(env.STAR_USD) || 0.0145;
  const reg = new Map(); const nft = [];
  let stars = 0, regCount = 0;
  for (const g of gifts) {
    if (g.type === 'unique' && g.gift) { nft.push(g); continue; }
    if (!g.gift) continue;
    const st = g.gift.star_count || 0, em = (g.gift.sticker && g.gift.sticker.emoji) || '🎁', key = g.gift.id || em + st;
    const cur = reg.get(key) || { em, st, n: 0 };
    cur.n++; reg.set(key, cur); stars += st; regCount++;
  }
  const lines = [...reg.values()].sort((a, b) => b.st * b.n - a.st * a.n);
  return { stars, usd: stars * rate, regCount, lines, nft, rate };
}

async function profileText(env, user, forSelf) {
  const head = '📊 <b>Аналитика: ' + esc(nameOf(user)) + (user.username ? ' (@' + esc(user.username) + ')' : '') + '</b>';
  const info = ['📅 Регистрация: ' + regYear(user.id) + ' <i>(по ID, примерно)</i>'];
  if (typeof user.is_premium === 'boolean') info.push('⭐ Telegram Premium: ' + (user.is_premium ? 'да' : 'нет'));
  const g = await loadGifts(env, user.id);
  if (g.error) return head + '\n' + info.join('\n') + '\n\n🎁 Подарки получить не удалось: ' + esc(g.error);
  const a = analyse(g.gifts, env);
  const build = (capReg, capNft) => {
    const out = [head, info.join('\n'), ''];
    if (!a.regCount) out.push('🎁 <b>Обычные подарки:</b> ничего нет');
    else {
      out.push('🎁 <b>Обычные подарки:</b> ' + a.regCount + ' шт');
      out.push('Стоимость: <b>' + num(a.stars) + ' ⭐</b> ≈ <b>$' + (a.usd >= 100 ? num(a.usd) : a.usd.toFixed(2)) + '</b>');
      for (const l of a.lines.slice(0, capReg)) out.push(l.em + ' ' + l.n + ' × ' + num(l.st) + ' ⭐ = ' + num(l.n * l.st) + ' ⭐');
      if (a.lines.length > capReg) out.push('и ещё ' + (a.lines.length - capReg) + ' видов');
    }
    out.push('');
    if (!a.nft.length) out.push('💎 <b>NFT-подарки:</b> нет NFT');
    else {
      out.push('💎 <b>NFT-подарки:</b> ' + a.nft.length + ' шт');
      let resale = 0, any = false;
      a.nft.forEach((n, i) => {
        const u = n.gift, price = u.resale_star_count || 0;
        if (price) { resale += price; any = true; }
        if (i < capNft) out.push('• ' + esc(u.base_name || u.name || 'NFT') + (u.number ? ' #' + u.number : '') + (u.model && u.model.name ? ' · ' + esc(u.model.name) : '') + (price ? ' · ' + num(price) + ' ⭐' : ''));
      });
      if (a.nft.length > capNft) out.push('и ещё ' + (a.nft.length - capNft) + ' шт');
      out.push(any ? 'Выставлены на продажу на ' + num(resale) + ' ⭐ ≈ $' + (resale * a.rate).toFixed(2) : '<i>Рыночную цену NFT Telegram не отдаёт, она зависит от спроса на маркетплейсах.</i>');
    }
    out.push('', '<i>1 ⭐ ≈ $' + a.rate + '</i>');
    return out.join('\n');
  };
  for (const [r, n] of [[999, 999], [60, 60], [40, 40], [25, 25], [15, 15], [8, 8]]) {
    const t = build(r, n);
    if (t.length <= 3900) return t;
  }
  return build(5, 5);
}

// --- база пользователей (D1, таблица a_users): кто запускал бота или пользовался им ---
let dbReady = false;
async function saveUser(env, u) {
  if (!env.DB || !u || u.is_bot) return;
  try {
    if (!dbReady) { await env.DB.exec('CREATE TABLE IF NOT EXISTS a_users (id INTEGER PRIMARY KEY, username TEXT, name TEXT, ts INTEGER)'); await env.DB.exec('CREATE INDEX IF NOT EXISTS a_users_un ON a_users(username)'); dbReady = true; }
    await env.DB.prepare('INSERT INTO a_users (id, username, name, ts) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET username=?2, name=?3, ts=?4')
      .bind(u.id, u.username ? u.username.toLowerCase() : null, nameOf(u), Date.now()).run();
  } catch (e) { console.log('db save', e && e.message); }
}
async function findUser(env, username) {
  if (!env.DB) return null;
  try {
    if (!dbReady) { await env.DB.exec('CREATE TABLE IF NOT EXISTS a_users (id INTEGER PRIMARY KEY, username TEXT, name TEXT, ts INTEGER)'); await env.DB.exec('CREATE INDEX IF NOT EXISTS a_users_un ON a_users(username)'); dbReady = true; }
    const r = await env.DB.prepare('SELECT id, username, name FROM a_users WHERE username = ?1').bind(username.toLowerCase()).first();
    return r ? { id: r.id, username: r.username, first_name: r.name } : null;
  } catch (e) { console.log('db find', e && e.message); return null; }
}

function kb(env) {
  const bot = env.BOT_USERNAME || 'GiftAnalyticRobot';
  return { inline_keyboard: [
    [{ text: '📊 Узнать свою в боте', url: 'https://t.me/' + bot + '?start=me' }],
    [{ text: '💬 Узнать свою в чате', switch_inline_query_current_chat: '' }],
    [{ text: '🔎 Узнать аналитику другого', switch_inline_query_current_chat: '@' }],
  ] };
}

async function onInline(env, q) {
  await saveUser(env, q.from);
  const text = (q.query || '').trim();
  const results = [];
  const me = await profileText(env, q.from, true);
  results.push({ type: 'article', id: 'me', title: '📊 Моя аналитика', description: 'Профиль, подарки и NFT', input_message_content: { message_text: me, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }, reply_markup: kb(env) });
  const m = /@?([A-Za-z][A-Za-z0-9_]{3,31})|(\d{5,12})/.exec(text);
  if (m) {
    let target = null;
    if (m[2]) target = { id: Number(m[2]), first_name: 'id' + m[2] };
    else { target = await findUser(env, m[1]); if (!target) { const c = await tg(env, 'getChat', { chat_id: '@' + m[1] }); if (c.ok && c.result.type === 'private') target = c.result; } }
    if (target && target.id !== q.from.id) {
      const t = await profileText(env, target, false);
      results.push({ type: 'article', id: 'u' + target.id, title: '📊 Аналитика ' + (target.username ? '@' + target.username : 'id' + target.id), description: 'Профиль, подарки и NFT', input_message_content: { message_text: t, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }, reply_markup: kb(env) });
    } else if (!target) {
      results.push({ type: 'article', id: 'nf', title: 'Не нашёл ' + (m[1] ? '@' + m[1] : 'пользователя'), description: 'Он должен сначала запустить этого бота', input_message_content: { message_text: 'Не нашёл такого пользователя. Чтобы я его увидел, ему нужно один раз запустить этого бота.' } });
    }
  }
  const body = { inline_query_id: q.id, results, cache_time: 20, is_personal: true };
  if (me.includes('Подарки получить не удалось')) body.button = { text: '▶️ Нажми Старт в боте, чтобы увидеть аналитику', start_parameter: 'me' };
  return tg(env, 'answerInlineQuery', body);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('no', { status: 403 });
      let u; try { u = await req.json(); } catch (e) { return new Response('ok'); }
      try {
        if (u.inline_query) await onInline(env, u.inline_query);
        else if (u.message && u.message.chat.type === 'private') {
          const fr = u.message.from; await saveUser(env, fr); const txt = await profileText(env, fr, true);
          await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: txt, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: '📤 Отправить это в чат', switch_inline_query: '' }], [{ text: '🔎 Узнать про другого (@ник)', switch_inline_query_current_chat: '@' }]] } });
        }
      } catch (e) { console.log('error', e && e.stack || e); }
      return new Response('ok');
    }
    if (url.pathname === '/setup') {
      if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const out = { webhook: await tg(env, 'setWebhook', { url: url.origin + '/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'inline_query'], drop_pending_updates: true }) };
      return new Response(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('Бот-аналитика: работает');
  },
};
