/* Keismey Studio — bouton retour du téléphone (même fichier dans chaque jeu du hub).

   Le jeu appelle KSBack.init({ back, lang }) :
   - back() est appelé à chaque retour (bouton ou geste retour du téléphone, touche Échap).
     Il ferme la fenêtre ouverte, revient à l'écran précédent, met en pause ou ouvre une
     confirmation. Il renvoie 'hub' quand le joueur doit quitter le jeu pour le hub.
   - lang() renvoie 'fr' ou 'en' : la langue du hub qui s'ouvre.
   KSBack.toHub() quitte vers le hub (par exemple après une confirmation du joueur).

   Le navigateur ne connaît que l'historique de l'onglet. À chaque toucher, on empile
   quelques entrées « tampon » sur la page du jeu (Chrome ignore celles créées sans action
   du joueur) ; chaque retour en consomme une et le jeu décide quoi faire.
   Pour quitter : si on vient du hub, on y revient comme avec un retour normal (position
   de défilement gardée) ; sinon le hub remplace le jeu dans l'historique, et un retour de
   plus ramène là d'où le joueur venait. */
(function () {
  'use strict';
  var N = 10;             // retours d'affilée possibles sans toucher l'écran
  var cfg = null, idx = 0, fromHub = false, leaving = false, resetting = false, timer = 0;

  function state() { try { return history.state; } catch (e) { return null; } }
  function depth(s) { return s && typeof s.ksb === 'number' ? s.ksb : 0; }
  function refIsHub() {
    try {
      var r = new URL(document.referrer);
      return r.origin === location.origin && (r.pathname === '/' || r.pathname === '/index.html');
    } catch (e) { return false; }
  }
  function mark(k) { var s = {}, o = state(); if (o && typeof o === 'object') for (var p in o) s[p] = o[p]; s.ksb = k; s.ksh = fromHub ? 1 : 0; return s; }

  // changement de langue ou rechargement par le jeu : on se souvient qu'on venait du hub
  var dir = location.pathname.split('/')[1] || '';
  function sameGameRef() {
    try { var r = new URL(document.referrer); return r.origin === location.origin && r.pathname.split('/')[1] === dir; } catch (e) { return false; }
  }
  function memo(v) { try { if (v === undefined) return sessionStorage.getItem('ks-hub:' + dir) === '1'; sessionStorage.setItem('ks-hub:' + dir, v ? '1' : '0'); } catch (e) { return false; } }

  (function boot() {
    var s = state();
    fromHub = !!(s && s.ksh) || refIsHub() || (sameGameRef() && memo());
    memo(fromHub);
    idx = depth(s);
    if (idx > 0) {
      // page rechargée (mise à jour, glisser pour actualiser) sur une entrée tampon :
      // on redescend à l'entrée de base pour repartir proprement.
      resetting = true;
      try { history.go(-idx); } catch (e) { resetting = false; }
      return;
    }
    try { history.replaceState(mark(0), ''); } catch (e) {}
  })();

  function topUp(e) {
    if (!cfg || leaving || resetting) return;
    // seulement un vrai geste du joueur : un clic simulé par le jeu (button.click()) créerait des
    // entrées sans action du joueur, que Chrome saute ensuite au retour… et le joueur sortirait du jeu.
    if (e && e.isTrusted === false) return;
    try { if (navigator.userActivation && !navigator.userActivation.isActive) return; } catch (err) {}
    idx = depth(state());
    try { while (idx < N) { idx++; history.pushState(mark(idx), ''); } } catch (e) {}
  }

  function finish() {
    var url = '/' + (cfg && cfg.lang && cfg.lang() === 'en' ? '?lang=en' : '');
    if (fromHub) {
      history.back();
      // filet de sécurité si aucune page ne précède le jeu
      timer = setTimeout(function () { location.replace(url); }, 700);
    } else {
      location.replace(url);
    }
  }

  function toHub() {
    if (leaving) return;
    leaving = true;
    var k = depth(state());
    if (k > 0) history.go(-k); else finish();
  }

  function back(fromKey) {
    var r;
    try { r = cfg.back(); } catch (e) { r = null; if (window.console) console.error(e); }
    if (r === 'hub' && !fromKey) toHub();
  }

  window.addEventListener('popstate', function (e) {
    var k = depth(e.state);
    if (resetting) { if (k === 0) { resetting = false; idx = 0; } return; }
    if (leaving) { if (k === 0) finish(); return; }
    if (!cfg) { idx = k; return; }
    if (k >= idx) { idx = k; return; }   // bouton « suivant » : rien à faire
    idx = k;
    back(false);
  });

  // chaque action du joueur réarme les entrées tampon
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(function (t) {
    window.addEventListener(t, topUp, true);
  });

  // touche Échap sur ordinateur : même effet, sauf quitter le jeu
  window.addEventListener('keydown', function (e) {
    if (!cfg || e.key !== 'Escape' || e.repeat || e.defaultPrevented) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    back(true);
  });

  window.addEventListener('pagehide', function () { clearTimeout(timer); });
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;            // page revenue depuis le cache du navigateur
    clearTimeout(timer); leaving = false; resetting = false; idx = depth(state());
  });

  window.KSBack = {
    init: function (o) { cfg = o; },
    toHub: toHub,
    fromHub: function () { return fromHub; }
  };
})();
