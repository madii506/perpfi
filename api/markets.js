// Live Hyperliquid perp markets (main dex + builder-deployed dexes for stocks/commodities), cached 10 s at the edge.
const HL = 'https://api.hyperliquid.xyz/info';
async function info(body) {
  const r = await fetch(HL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('hl ' + r.status);
  return r.json();
}
function rows(meta, ctxs, dex) {
  const out = [];
  (meta.universe || []).forEach((u, i) => {
    const c = ctxs[i] || {};
    if (u.isDelisted) return;
    const px = Number(c.markPx || c.midPx || 0), prev = Number(c.prevDayPx || 0);
    if (!px) return;
    out.push({
      name: u.name, dex: dex || '', maxLev: u.maxLeverage || 0,
      px, chg: prev ? (px / prev - 1) * 100 : 0,
      funding: Number(c.funding || 0) * 100,            // % per hour
      oi: Number(c.openInterest || 0) * px,              // USD
      vol: Number(c.dayNtlVlm || 0),                     // USD, 24 h
    });
  });
  return out;
}
module.exports = async (req, res) => {
  try {
    const [main, dexes] = await Promise.all([
      info({ type: 'metaAndAssetCtxs' }),
      info({ type: 'perpDexs' }).catch(() => []),
    ]);
    let list = rows(main[0], main[1], '');
    const names = (dexes || []).filter((d) => d && d.name).map((d) => d.name).slice(0, 6);
    const extra = await Promise.all(names.map((n) => info({ type: 'metaAndAssetCtxs', dex: n }).then((m) => rows(m[0], m[1], n)).catch(() => [])));
    extra.forEach((e) => { list = list.concat(e); });
    list.sort((a, b) => b.vol - a.vol);
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.json({ at: Date.now(), markets: list.slice(0, 60) });
  } catch (e) {
    res.status(502).json({ error: 'Hyperliquid is not answering right now.' });
  }
};
