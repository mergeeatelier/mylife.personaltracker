// ส่งการแจ้งเตือนรายงาน + สรุปงานตอนเช้า (รันโดย GitHub Actions ทุก 5 นาที)
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = admin.firestore(), fcm = admin.messaging();

const BAD = /registration-token-not-registered|invalid-registration-token|invalid-argument/;
const WINDOW = 6 * 3600e3;
const fmtDate = (ds, th) => { const [y, m, d] = ds.split("-").map(Number); return th ? `${d}/${m}/${y + 543}` : `${d}/${m}/${y}`; };
const timesOf = (t) => (Array.isArray(t.remindAts) ? t.remindAts : t.remindAt ? [t.remindAt] : []);
const localNow = (tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

async function send(tokens, bad, { title, body, link, tag, icon }) {
  const res = await fcm.sendEachForMulticast({ tokens, webpush: { notification: { title, body, icon, tag }, ...(link ? { fcmOptions: { link } } : {}) } });
  res.responses.forEach((r, i) => { if (!r.success && BAD.test((r.error && r.error.code) || "")) bad.add(tokens[i]); });
}

(async () => {
  const now = Date.now();
  const snap = await db.collection("users").get();
  let sentCount = 0;
  for (const doc of snap.docs) {
    const u = doc.data();
    const tokens = u.pushTokens || [];
    if (!tokens.length) continue;
    const tasks = (u.data && u.data.tasks) || [];
    const prefs = (u.data && u.data.prefs) || {};
    const th = (u.pushLang || "th") === "th";
    const base = (u.appUrl || "").replace(/[^/]*$/, "");
    const icon = base ? base + "icons/icon-192.png" : undefined;
    const bad = new Set();
    const upd = {};

    // การเตือนรายงาน
    const sent = u.pushSent || {};
    const nextSent = {};
    const ids = new Set(tasks.map((t) => t.id));
    Object.keys(sent).forEach((k) => { if (ids.has(k) && Array.isArray(sent[k])) nextSent[k] = sent[k].filter((x) => x > now - WINDOW * 4); });
    const seen = new Set();
    let changed = false;
    for (const t of tasks) {
      if (t.status === "done") continue;
      for (const at of timesOf(t)) {
        if (at > now || at <= now - WINDOW || (nextSent[t.id] || []).includes(at)) continue;
        nextSent[t.id] = [...(nextSent[t.id] || []), at]; changed = true;
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const when = t.time ? `${fmtDate(t.due, th)} ${t.time}` : fmtDate(t.due, th);
        await send(tokens, bad, { title: t.title, body: th ? `ครบกำหนด ${when}` : `Due ${when}`, tag: t.id, icon, link: base && base + "?task=" + encodeURIComponent(t.id) });
        sentCount++;
      }
    }
    if (changed) upd.pushSent = nextSent;

    // สรุปงานตอนเช้า
    const dg = prefs.digest || {};
    if (dg.on) {
      const tz = prefs.tz || "Asia/Bangkok", hour = dg.hour ?? 8, ln = localNow(tz);
      if (u.digestSent !== ln.date && ln.hour >= hour && ln.hour < hour + 4) {
        upd.digestSent = ln.date;
        const open = tasks.filter((t) => t.status !== "done" && t.due);
        const today = open.filter((t) => t.due === ln.date).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
        const over = dg.overdue === false ? [] : open.filter((t) => t.due < ln.date);
        if (today.length || over.length) {
          const head = th ? `วันนี้มี ${today.length} งาน${over.length ? ` · เลยกำหนด ${over.length}` : ""}` : `${today.length} today${over.length ? ` · ${over.length} overdue` : ""}`;
          const names = [...today, ...over].map((t) => (t.time ? `${t.title} ${t.time}` : t.title));
          const list = names.slice(0, 3).join(", ") + (names.length > 3 ? (th ? ` และอีก ${names.length - 3} งาน` : ` +${names.length - 3} more`) : "");
          await send(tokens, bad, { title: th ? "สรุปงานวันนี้" : "Today's summary", body: `${head}\n${list}`, tag: "digest", icon, link: base && base + "?view=today" });
          sentCount++;
        }
      }
    }

    if (bad.size) upd.pushTokens = tokens.filter((x) => !bad.has(x));
    if (!u.pushBeat || now - u.pushBeat > 30 * 6e4) upd.pushBeat = now; // ให้แอปรู้ว่าระบบยังทำงาน
    if (Object.keys(upd).length) await doc.ref.update(upd);
  }
  console.log(`done · sent ${sentCount}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
