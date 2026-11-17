/* occelatus.io shared form submit (2026-11-06).
 * Primary: Web3Forms. Fallback: FormSubmit (the form's action URL), used only if Web3Forms fails.
 * FormSubmit had repeated outages (Cloudflare 522 on Nov 3 and Nov 6 2026).
 * Usage in a page: occSubmit(form).then(r => r.json()).then(d => d.success ...) — same contract the
 * pages already used with fetch(form.action). Rejects if both services fail.
 * Field order matters for the intake parser: name, company, email, service, message.
 */
(function () {
  var W3F_KEY = '3940eb9e-cb2b-42ee-9ae7-15e3d3ab1566'; // public by design (Web3Forms access keys live in page HTML)

  /* Ad-source attribution (2026-11-16, Meta test): remember where the visitor came from (last touch,
   * 30 days, this browser only) and send it with the form as `ad_source` so leads can be credited to
   * Meta vs Google vs organic. No cookies, no third-party calls. The intake parser ignores unknown keys. */
  var SRC_KEY = 'occ_ad_source';
  function detectSource() {
    var q = new URLSearchParams(location.search);
    var utm = (q.get('utm_source') || '').toLowerCase();
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (q.get('fbclid') || /^(facebook|fb|ig|instagram|meta)$/.test(utm) || /(^|\.)(facebook|instagram)\.com$/.test(ref)) return 'meta';
    if (q.get('gclid') || q.get('gbraid') || q.get('wbraid') || utm === 'google') return 'google-ads';
    if (utm) return 'utm:' + utm;
    if (ref && ref.indexOf('occelatus.io') === -1) return 'ref:' + ref;
    return '';
  }
  try {
    var s = detectSource();
    if (s) localStorage.setItem(SRC_KEY, JSON.stringify({ s: s, p: location.pathname, t: Date.now() }));
  } catch (e) {}
  function adSource() {
    try {
      var v = JSON.parse(localStorage.getItem(SRC_KEY) || 'null');
      if (v && Date.now() - v.t < 30 * 864e5) return v.s + ' (landed ' + v.p + ', ' + new Date(v.t).toISOString().slice(0, 10) + ')';
    } catch (e) {}
    return 'direct/unknown';
  }

  function post(url, body, ms) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal
    }).then(function (r) {
      clearTimeout(t);
      return r.json().then(function (d) {
        if (r.ok && (d.success === true || d.success === 'true')) return d;
        throw new Error('submit rejected');
      });
    }, function (e) { clearTimeout(t); throw e; });
  }

  window.occSubmit = function (form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.ad_source) data.ad_source = adSource();   // appended last so field order for the parser is unchanged
    var w3 = {};
    Object.keys(data).forEach(function (k) {
      if (k === '_subject') w3.subject = data[k];
      else if (k.charAt(0) !== '_') w3[k] = data[k];   // drop FormSubmit-only options (_template, _captcha, _honey...)
    });
    w3.from_name = 'occelatus.io';
    w3.access_key = W3F_KEY;
    var primary = W3F_KEY.indexOf('REPLACE_') === 0
      ? Promise.reject(new Error('web3forms key not set'))
      : post('https://api.web3forms.com/submit', w3, 12000);
    return primary
      .catch(function () { return post(form.action, data, 15000); })
      .then(function () { return { ok: true, json: function () { return Promise.resolve({ success: true }); } }; });
  };
})();
