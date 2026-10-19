/* Keismey Studio — outils communs aux jeux du hub (même fichier dans chaque jeu).

   KS.support()                      ouvre la page de soutien (Ko-fi) dans un nouvel onglet
   KS.bug(jeu, lang)                 ouvre le formulaire du hub, type « Bug », titre prérempli avec le nom du jeu
   KS.saveDialog({ jeu, keys, lang })
                                     fenêtre « Sauvegarde » : exporter (code à copier ou fichier) et importer.
                                     keys = clés localStorage de la partie ; la première est la sauvegarde principale.
   Au premier toucher, le jeu demande au navigateur de garder ses données (stockage persistant).

   Import : le code est rangé, la page se recharge, et ce fichier l'écrit dans le stockage AVANT
   que le jeu ne démarre (le jeu ne peut donc pas l'écraser en sauvegardant au moment de quitter). */
(function () {
  'use strict';
  var DIR = location.pathname.split('/')[1] || '';
  var PENDING = 'ks-import:' + DIR;

  // 1. import en attente : appliqué avant le jeu
  try {
    var p = sessionStorage.getItem(PENDING);
    if (p) {
      sessionStorage.removeItem(PENDING);
      var d = JSON.parse(p);
      Object.keys(d).forEach(function (k) {
        if (d[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, d[k]);
      });
    }
  } catch (e) {}

  // 2. stockage persistant, demandé une fois au premier geste du joueur
  var asked = false;
  function persist(e) {
    if (asked || (e && e.isTrusted === false)) return;
    asked = true;
    try {
      if (navigator.storage && navigator.storage.persist && navigator.storage.persisted)
        navigator.storage.persisted().then(function (ok) { if (!ok) navigator.storage.persist().catch(function () {}); }).catch(function () {});
    } catch (err) {}
  }
  window.addEventListener('pointerup', persist, true);
  window.addEventListener('keydown', persist, true);

  // 3. textes
  var TX = {
    fr: { title: 'Sauvegarde', intro: 'Garde ce code ou le fichier en lieu sûr : il permet de retrouver ta partie sur un autre appareil ou après avoir effacé les données du navigateur.',
      copy: 'Copier le code', copied: 'Code copié', file: 'Télécharger le fichier', load: 'Charger une partie',
      paste: 'Colle un code de sauvegarde, ou choisis un fichier.', pick: 'Choisir un fichier', go: 'Charger',
      confirm: 'Remplacer ta partie actuelle par celle-ci ? Ta partie actuelle sera perdue.', yes: 'Oui, remplacer', no: 'Annuler',
      bad: 'Code invalide, ou code d’un autre jeu.', close: 'Fermer', empty: 'Aucune partie à sauvegarder pour l’instant.' },
    en: { title: 'Save', intro: 'Keep this code or the file somewhere safe: it lets you get your game back on another device or after clearing your browser data.',
      copy: 'Copy the code', copied: 'Code copied', file: 'Download the file', load: 'Load a game',
      paste: 'Paste a save code, or choose a file.', pick: 'Choose a file', go: 'Load',
      confirm: 'Replace your current game with this one? Your current game will be lost.', yes: 'Yes, replace', no: 'Cancel',
      bad: 'Invalid code, or a code from another game.', close: 'Close', empty: 'No game to save yet.' }
  };

  // 4. code de sauvegarde : KS1.<jeu>.<base64 du JSON>
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s) { return decodeURIComponent(escape(atob(s))); }
  function makeCode(keys) {
    var d = {}, any = false;
    keys.forEach(function (k) { var v = null; try { v = localStorage.getItem(k); } catch (e) {} d[k] = v; if (v !== null) any = true; });
    return any ? 'KS1.' + DIR + '.' + b64e(JSON.stringify(d)) : '';
  }
  function readCode(txt, keys) {
    try {
      var m = String(txt || '').replace(/\s+/g, '').match(/^KS1\.([^.]*)\.(.+)$/);
      if (!m || m[1] !== DIR) return null;
      var d = JSON.parse(b64d(m[2]));
      if (!d || typeof d !== 'object' || typeof d[keys[0]] !== 'string') return null;
      var out = {};
      keys.forEach(function (k) { out[k] = typeof d[k] === 'string' ? d[k] : null; });
      return out;
    } catch (e) { return null; }
  }

  // 5. fenêtre commune (neutre, sur fond sombre ; la police est celle du jeu)
  var CSS = '#ks-dlg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.66);font:inherit;color:#f3ecdf}' +
    '#ks-dlg .kb{width:min(100%,380px);max-height:calc(100% - 32px);overflow:auto;background:#1d1a22;border:2px solid var(--ks-accent,#c9a45c);border-radius:14px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
    '#ks-dlg h2{margin:0 0 8px;font-size:20px}#ks-dlg p{margin:0 0 10px;font-size:14px;line-height:1.4;opacity:.9}' +
    '#ks-dlg textarea{width:100%;box-sizing:border-box;height:84px;margin:0 0 8px;background:#0f0d12;color:#f3ecdf;border:1px solid #4a4452;border-radius:8px;padding:8px;font:12px/1.3 monospace;resize:none}' +
    '#ks-dlg button{display:block;width:100%;margin:0 0 8px;padding:11px 10px;border-radius:10px;border:0;font:inherit;font-weight:700;font-size:15px;background:#3a3442;color:#f3ecdf;cursor:pointer}' +
    '#ks-dlg button.ks-main{background:var(--ks-accent,#c9a45c);color:#16121a}#ks-dlg hr{border:0;border-top:1px solid #3a3442;margin:12px 0}' +
    '#ks-dlg .ks-err{color:#ff8f7a}';

  function saveDialog(o) {
    var L = TX[o.lang === 'en' ? 'en' : 'fr'], keys = o.keys;
    if (document.getElementById('ks-dlg')) return;
    if (!document.getElementById('ks-css')) { var st = document.createElement('style'); st.id = 'ks-css'; st.textContent = CSS; document.head.appendChild(st); }
    if (o.save) try { o.save(); } catch (e) {}
    var code = makeCode(keys);
    var d = document.createElement('div'); d.id = 'ks-dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    if (o.accent) d.style.setProperty('--ks-accent', o.accent);
    d.innerHTML = '<div class="kb"><h2>' + L.title + '</h2>' +
      (code ? '<p>' + L.intro + '</p><textarea readonly id="ks-out"></textarea><button class="ks-main" id="ks-copy">' + L.copy + '</button><button id="ks-file">' + L.file + '</button>' : '<p>' + L.empty + '</p>') +
      '<hr><h2>' + L.load + '</h2><p>' + L.paste + '</p><textarea id="ks-in" autocomplete="off" spellcheck="false" placeholder="KS1…"></textarea>' +
      '<button id="ks-pick">' + L.pick + '</button><button class="ks-main" id="ks-go">' + L.go + '</button><p class="ks-err" id="ks-msg" hidden></p>' +
      '<hr><button id="ks-close">' + L.close + '</button><input type="file" id="ks-f" accept=".txt,text/plain" hidden></div>';
    document.body.appendChild(d);
    var $ = function (id) { return d.querySelector('#' + id); };
    var close = function () { d.remove(); };
    if (code) {
      $('ks-out').value = code;
      $('ks-copy').onclick = function () {
        var done = function () { $('ks-copy').textContent = L.copied; };
        try { navigator.clipboard.writeText(code).then(done, function () { $('ks-out').select(); document.execCommand('copy'); done(); }); }
        catch (e) { $('ks-out').select(); try { document.execCommand('copy'); done(); } catch (err) {} }
      };
      $('ks-file').onclick = function () {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
        a.download = (o.file || DIR) + '-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      };
    }
    $('ks-pick').onclick = function () { $('ks-f').click(); };
    $('ks-f').onchange = function () {
      var f = $('ks-f').files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { $('ks-in').value = String(r.result).trim(); }; r.readAsText(f);
    };
    $('ks-go').onclick = function () {
      var data = readCode($('ks-in').value, keys), msg = $('ks-msg');
      if (!data) { msg.textContent = L.bad; msg.hidden = false; return; }
      if ($('ks-go').dataset.sure !== '1') {
        msg.textContent = L.confirm; msg.hidden = false;
        $('ks-go').textContent = L.yes; $('ks-go').dataset.sure = '1';
        return;
      }
      try { sessionStorage.setItem(PENDING, JSON.stringify(data)); } catch (e) { return; }
      location.reload();
    };
    $('ks-close').onclick = close;
    d.addEventListener('pointerdown', function (e) { if (e.target === d) close(); });
    d.ksClose = close;
  }

  window.KS = {
    SUPPORT_URL: 'https://ko-fi.com/keismey',
    support: function () { window.open('https://ko-fi.com/keismey', '_blank', 'noopener'); },
    bugUrl: function (jeu, lang) { return '/?contact=bug&jeu=' + encodeURIComponent(jeu || '') + (lang === 'en' ? '&lang=en' : '&lang=fr'); },
    bug: function (jeu, lang) { location.assign(window.KS.bugUrl(jeu, lang)); },
    saveDialog: saveDialog,
    // pour le bouton retour : la fenêtre « Sauvegarde » est-elle ouverte ? la ferme si oui.
    closeDialog: function () { var d = document.getElementById('ks-dlg'); if (!d) return false; d.remove(); return true; }
  };
})();
