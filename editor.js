/* Bearbeiten-Modus für Kontakt-Seiten (Version 2).
   Nur aktiv mit ?bearbeiten in der Adresse. Ohne gültigen Code lässt sich nichts speichern:
   Der Code wird im Google-Skript geprüft, der GitHub-Schlüssel liegt nur dort. */
(function () {
  'use strict';
  if (!/[?&]bearbeiten\b/.test(location.search)) return;

  var API = 'https://script.google.com/macros/s/AKfycbyviB6zxo-213nQ7p0kDg2kpW34uETRu3fPE8_hHBIXoIkBXXTcni8KnKBXKUxHpvAg/exec';
  var TESTMODUS = /[?&]test\b/.test(location.search);   // nur ausprobieren, nichts speichern
  var SEITE = (location.pathname.split('/').filter(Boolean)[0] || 'lokal').toLowerCase();
  var TEXTE = '.brand-name, .brand-sub, #formView h1, #formView .lead, .section > h2, .work-title, .work-info, ' +
              '.about-text > p, .footer-brand, #successView h2, #successView .lead';
  var BILDER = '.hero img, img.portrait, .work img';

  var code = '', rohHtml = '', sichtbar = 6, geaendert = false, neueBilder = {}, gespeichert = false, speichertGerade = false;

  // ---------- Hilfen ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    e.setAttribute('data-ed-ui', '');
    return e;
  }
  function ladePunkte(text) {
    var s = el('span', 'ed-laden');
    var p = el('span', 'ed-punkte ed-punkte-klein');
    p.appendChild(el('span')); p.appendChild(el('span')); p.appendChild(el('span'));
    s.appendChild(p);
    if (text) s.appendChild(el('span', null, text));
    return s;
  }
  function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function api(daten, sekunden) {
    daten.seite = SEITE; daten.code = code;
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var uhr = setTimeout(function () { if (ctrl) ctrl.abort(); }, (sekunden || 60) * 1000);
    return fetch(API, { method: 'POST', body: JSON.stringify(daten), redirect: 'follow', credentials: 'omit',
                        cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        clearTimeout(uhr);
        try { return JSON.parse(t); } catch (e) { return { ok: false, fehler: 'antwort' }; }
      }, function () { clearTimeout(uhr); return { ok: false, fehler: 'netz' }; });
  }
  function meldung(text, rueckgaengig, laedt) {
    var alt = document.querySelector('.ed-toast'); if (alt) alt.remove();
    var t = el('div', 'ed-toast');
    if (laedt) t.appendChild(ladePunkte(text)); else t.appendChild(document.createTextNode(text));
    if (rueckgaengig) {
      var b = el('button', 'ed-toast-btn', 'Rückgängig'); b.type = 'button';
      b.addEventListener('click', function () { rueckgaengig(); t.remove(); });
      t.appendChild(b);
    }
    document.body.appendChild(t);
    if (!laedt) setTimeout(function () { if (t.parentNode) t.remove(); }, rueckgaengig ? 8000 : 4500);
  }
  function markiere() { geaendert = true; gespeichert = false; status(); }
  function editierbar(e, an) {
    if (!an) { e.setAttribute('contenteditable', 'false'); return; }
    try { e.contentEditable = 'plaintext-only'; } catch (x) { e.contentEditable = 'true'; }
    if (e.contentEditable !== 'plaintext-only') e.contentEditable = 'true';
  }
  function ladeSkript(src) {
    return new Promise(function (res) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
  }
  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'editor.css?v=4';
  document.head.appendChild(css);
  var sortierer = ladeSkript('sortable.min.js?v=1.15.2');

  // ---------- Großes Fenster: Speichern / Fertig / Fehler ----------
  var fenster = null;
  function zeigeFenster(art, titel, text, knopfText) {
    if (!fenster) {
      fenster = el('div', 'ed-fenster');
      document.body.appendChild(fenster);
    }
    fenster.innerHTML = '';
    var karte = el('div', 'ed-fenster-karte ed-fenster-' + art);
    if (art === 'laeuft') {
      var punkte = el('div', 'ed-punkte');
      punkte.appendChild(el('span')); punkte.appendChild(el('span')); punkte.appendChild(el('span'));
      karte.appendChild(punkte);
    } else {
      var symbol = el('div', 'ed-symbol');
      symbol.innerHTML = art === 'ok'
        ? '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27 l8 8 L38 18"/></svg>'
        : '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M18 18 L34 34 M34 18 L18 34"/></svg>';
      karte.appendChild(symbol);
    }
    karte.appendChild(el('h2', null, titel));
    if (text) karte.appendChild(el('p', null, text));
    if (knopfText) {
      var b = el('button', 'ed-knopf ed-knopf-haupt', knopfText); b.type = 'button';
      b.addEventListener('click', schliesseFenster);
      karte.appendChild(b);
    }
    fenster.appendChild(karte);
    fenster.classList.add('ed-sichtbar');
  }
  function schliesseFenster() { if (fenster) fenster.classList.remove('ed-sichtbar'); }

  // ---------- Anmelden ----------
  function anmeldung() {
    if (!TESTMODUS) api({ aktion: 'ping' }, 20);   // Google-Skript schon mal aufwecken
    var box = el('div', 'ed-login');
    var karte = el('form', 'ed-login-karte');
    karte.appendChild(el('h2', null, 'Seite bearbeiten'));
    karte.appendChild(el('p', null, 'Bitte geben Sie Ihren Zugangscode ein.'));
    var feld = el('input', 'ed-login-feld');
    feld.type = 'text'; feld.autocomplete = 'off'; feld.autocapitalize = 'characters'; feld.spellcheck = false;
    feld.placeholder = 'z. B. AB12-CD34-EF56';
    var fehler = el('p', 'ed-login-fehler');
    var knopf = el('button', 'ed-knopf ed-knopf-haupt', 'Anmelden'); knopf.type = 'submit';
    karte.appendChild(feld); karte.appendChild(fehler); karte.appendChild(knopf);
    if (TESTMODUS) karte.appendChild(el('p', 'ed-hinweis', 'Testmodus: Code „test“, es wird nichts gespeichert.'));
    box.appendChild(karte); document.body.appendChild(box);
    try { var alt = sessionStorage.getItem('ed-code-' + SEITE); if (alt) feld.value = alt; } catch (e) {}
    setTimeout(function () { feld.focus(); }, 50);

    karte.addEventListener('submit', function (ev) {
      ev.preventDefault();
      code = feld.value.replace(/[\s-]/g, '').toUpperCase();
      if (!code) { fehler.textContent = 'Bitte den Code eingeben.'; return; }
      knopf.disabled = true; knopf.textContent = ''; knopf.appendChild(ladePunkte('Wird geprüft')); fehler.textContent = '';
      var weiter = TESTMODUS
        ? Promise.resolve(code === 'TEST' ? { ok: true, html: null } : { ok: false, fehler: 'code' })
        : api({ aktion: 'laden' }, 40).then(function (r) {
            return (r.ok || r.fehler === 'code' || r.fehler === 'gesperrt') ? r
              : warte(1500).then(function () { return api({ aktion: 'laden' }, 40); });
          });
      weiter.then(function (r) {
        knopf.disabled = false; knopf.textContent = 'Anmelden';
        if (!r.ok) {
          fehler.textContent = r.fehler === 'code' ? 'Der Code stimmt nicht. Bitte noch einmal prüfen.'
            : r.fehler === 'gesperrt' ? 'Zu viele Versuche. Bitte in 10 Minuten erneut versuchen.'
            : 'Das hat gerade nicht geklappt. Bitte erneut versuchen.';
          return;
        }
        try { sessionStorage.setItem('ed-code-' + SEITE, feld.value); } catch (e) {}
        box.remove();
        starte(r.html);
      });
    });
  }

  // ---------- Bearbeiten ----------
  function starte(frischesHtml) {
    if (frischesHtml) {
      rohHtml = frischesHtml;
      var doc = new DOMParser().parseFromString(frischesHtml, 'text/html');
      document.body.innerHTML = doc.body.innerHTML;   // immer die neueste Fassung bearbeiten
    } else {
      rohHtml = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;   // Testmodus
    }
    document.documentElement.classList.add('ed-an');
    var vorher = document.querySelectorAll('#werkeListe > .work:not(.work--extra)').length;
    if (vorher) sichtbar = vorher;
    document.querySelectorAll('.reveal').forEach(function (s) { s.classList.add('visible'); });
    var liste = document.getElementById('werkeListe');
    if (liste) liste.classList.add('offen');
    var mehr = document.querySelector('.works-more-wrap'); if (mehr) mehr.classList.add('ed-aus');
    var ok = document.getElementById('successView'); if (ok) ok.hidden = true;

    // Links und Formular sollen beim Bearbeiten nichts auslösen
    document.addEventListener('click', function (ev) {
      if (!document.documentElement.classList.contains('ed-an')) return;
      var a = ev.target.closest('a'); if (a && !a.closest('[data-ed-ui]')) ev.preventDefault();
    }, true);
    var form = document.getElementById('contactForm');
    if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); });

    document.querySelectorAll(TEXTE).forEach(textBearbeitbar);
    document.querySelectorAll(BILDER).forEach(bildBearbeitbar);
    document.querySelectorAll('#werkeListe > .work').forEach(werkLeiste);
    plusKachel();
    bloeckeEinpacken();
    obereLeiste();
    hilfe();
    sortierer.then(ziehenEinrichten);

    window.addEventListener('beforeunload', function (ev) {
      if (geaendert && !gespeichert) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  function hilfe() {
    var h = el('div', 'ed-hilfe');
    var liste = el('div', 'ed-hilfe-liste');
    [['✏️', 'Text antippen', 'und neu schreiben'], ['📷', 'Foto antippen', 'und ein neues auswählen'],
     ['➕', 'Großes Plus', 'fügt ein neues Werk hinzu'], ['✋', 'Griff festhalten und ziehen', 'um etwas zu verschieben'],
     ['💾', 'Am Ende „Speichern“', 'dann ist alles online']].forEach(function (z) {
      var zeile = el('div', 'ed-hilfe-zeile');
      zeile.appendChild(el('span', 'ed-hilfe-symbol', z[0]));
      var t = el('span'); t.appendChild(el('strong', null, z[1])); t.appendChild(document.createTextNode(' ' + z[2]));
      zeile.appendChild(t); liste.appendChild(zeile);
    });
    var zu = el('button', 'ed-knopf ed-knopf-haupt', 'Alles klar'); zu.type = 'button';
    zu.addEventListener('click', function () { h.remove(); });
    var karte = el('div', 'ed-hilfe-karte');
    karte.appendChild(el('h2', null, 'So funktioniert’s'));
    karte.appendChild(liste); karte.appendChild(zu);
    h.appendChild(karte);
    document.body.appendChild(h);
  }

  function textBearbeitbar(e) {
    var platzhalter = e.classList.contains('work-title') ? 'Titel des Werks'
      : e.classList.contains('work-info') ? 'Technik, Größe (optional)' : 'Text eingeben';
    e.setAttribute('data-ed-platz', platzhalter);
    e.setAttribute('spellcheck', 'true');
    editierbar(e, true);
    e.classList.add('ed-text');
    e.addEventListener('input', markiere);
    e.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !e.matches('.about-text > p')) { ev.preventDefault(); e.blur(); }
    });
    e.addEventListener('paste', function (ev) {
      ev.preventDefault();
      var t = (ev.clipboardData || window.clipboardData).getData('text/plain') || '';
      document.execCommand('insertText', false, t);
    });
    e.addEventListener('blur', function () {
      var t = e.innerText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (e.textContent !== t) e.textContent = t;
    });
  }

  // ---------- Bilder ----------
  function waehleBild() {
    return new Promise(function (res) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', function () { res(inp.files && inp.files[0]); });
      inp.click();
    });
  }
  function verkleinere(datei, max) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(datei), img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (!blob) return rej();
          var fr = new FileReader();
          fr.onload = function () { res({ blob: blob, b64: String(fr.result).split(',')[1], w: w, h: h }); };
          fr.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(); };
      img.src = url;
    });
  }
  function neuesBild(art, max) {
    return waehleBild().then(function (datei) {
      if (!datei) return null;
      meldung('Foto wird vorbereitet', null, true);
      return verkleinere(datei, max).then(function (b) {
        var name = art + '-' + Date.now().toString(36) + '.jpg';
        var vorschau = URL.createObjectURL(b.blob);
        neueBilder[vorschau] = { name: name, b64: b.b64 };
        var t = document.querySelector('.ed-toast'); if (t) t.remove();
        return { src: vorschau, w: b.w, h: b.h };
      }, function () {
        meldung('Dieses Foto kann ich nicht öffnen. Bitte ein JPG- oder PNG-Foto wählen.');
        return null;
      });
    });
  }
  function bildBearbeitbar(img) {
    var halter = img.closest('.work-open') || img.closest('.hero') || img;
    var art = img.closest('.hero') ? 'hero' : img.classList.contains('portrait') ? 'portrait' : 'werk';
    var hinweis = el('span', 'ed-bild-hinweis', '📷 Foto tauschen');
    if (halter !== img) { halter.classList.add('ed-bild'); halter.appendChild(hinweis); }
    else { img.classList.add('ed-bild-einzeln'); }
    var los = function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (document.documentElement.classList.contains('ed-vorschau')) return;
      neuesBild(art, art === 'hero' ? 1920 : 1600).then(function (b) {
        if (!b) return;
        img.src = b.src; img.setAttribute('width', b.w); img.setAttribute('height', b.h);
        img.removeAttribute('srcset');
        markiere(); meldung('Foto getauscht ✓');
      });
    };
    (halter === img ? img : halter).addEventListener('click', los);
  }

  // ---------- Werke ----------
  function werkLeiste(li) {
    if (li.querySelector('.ed-werk-leiste')) return;
    var leiste = el('div', 'ed-werk-leiste');
    var griff = el('span', 'ed-griff', '✋ Ziehen'); griff.title = 'Festhalten und an eine andere Stelle ziehen';
    var weg = el('button', 'ed-weg', '🗑'); weg.type = 'button'; weg.title = 'Werk entfernen';
    weg.appendChild(el('span', 'ed-weg-text', ' Entfernen'));
    leiste.appendChild(griff); leiste.appendChild(weg);
    li.insertBefore(leiste, li.firstChild);
    weg.addEventListener('click', function () {
      var eltern = li.parentNode, danach = li.nextSibling;
      li.remove(); markiere();
      meldung('Werk entfernt.', function () { eltern.insertBefore(li, danach); markiere(); });
    });
  }
  function plusKachel() {
    var liste = document.getElementById('werkeListe'); if (!liste) return;
    var li = el('li', 'ed-plus');
    var b = el('button', 'ed-plus-knopf'); b.type = 'button';
    b.appendChild(el('span', 'ed-plus-zeichen', '+'));
    b.appendChild(el('span', null, 'Neues Werk hinzufügen'));
    li.appendChild(b); liste.appendChild(li);
    b.addEventListener('click', function () {
      neuesBild('werk', 1600).then(function (bild) {
        if (!bild) return;
        var neu = document.createElement('li'); neu.className = 'work';
        var knopf = document.createElement('button'); knopf.type = 'button'; knopf.className = 'work-open';
        var img = document.createElement('img');
        img.src = bild.src; img.width = bild.w; img.height = bild.h; img.loading = 'lazy'; img.decoding = 'async';
        knopf.appendChild(img);
        var titel = document.createElement('p'); titel.className = 'work-title';
        var info = document.createElement('p'); info.className = 'work-info';
        neu.appendChild(knopf); neu.appendChild(titel); neu.appendChild(info);
        liste.insertBefore(neu, li);
        textBearbeitbar(titel); textBearbeitbar(info); bildBearbeitbar(img); werkLeiste(neu);
        markiere();
        neu.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () { titel.focus(); }, 400);
        meldung('Werk hinzugefügt ✓ Jetzt noch den Titel eintippen.');
      });
    });
  }

  // ---------- Abschnitte: einpacken, damit man sie ziehen kann ----------
  function blockName(b) {
    if (b.classList.contains('stage')) return 'Foto & Kontaktformular';
    var h = b.querySelector('h2'); return h ? h.textContent.trim() : 'Abschnitt';
  }
  function bloeckeEinpacken() {
    var alle = Array.prototype.filter.call(document.body.children, function (c) {
      return c.matches('.stage, section.section');
    });
    if (!alle.length) return;
    var huelle = document.createElement('div');
    huelle.className = 'ed-bloecke'; huelle.setAttribute('data-ed-huelle', '');
    alle[0].parentNode.insertBefore(huelle, alle[0]);
    alle.forEach(function (b) {
      var block = document.createElement('div');
      block.className = 'ed-block'; block.setAttribute('data-ed-huelle', '');
      var l = el('div', 'ed-block-leiste');
      l.appendChild(el('span', 'ed-block-name', blockName(b)));
      var ordnen = el('button', 'ed-knopf ed-ordnen-knopf', '↕ Reihenfolge ändern'); ordnen.type = 'button';
      ordnen.addEventListener('click', reihenfolgeFenster);
      l.appendChild(ordnen);
      block.appendChild(l); block.appendChild(b); huelle.appendChild(block);
    });
  }
  function ziehenEinrichten() {
    if (!window.Sortable) return;
    var liste = document.getElementById('werkeListe');
    if (liste) Sortable.create(liste, {
      handle: '.ed-griff', draggable: '.work', animation: 180, ghostClass: 'ed-geist', chosenClass: 'ed-gewaehlt',
      forceFallback: true, fallbackTolerance: 3,
      onEnd: function (e) { if (e.oldIndex !== e.newIndex) { markiere(); meldung('Werk verschoben ✓'); } }
    });
  }

  // Abschnitte in einem kleinen Fenster ordnen: ganz einfach ziehen
  function reihenfolgeFenster() {
    var huelle = document.querySelector('.ed-bloecke'); if (!huelle) return;
    var bloecke = Array.prototype.slice.call(huelle.children);
    var f = el('div', 'ed-hilfe');
    var karte = el('div', 'ed-hilfe-karte');
    karte.appendChild(el('h2', null, 'Reihenfolge ändern'));
    karte.appendChild(el('p', 'ed-ordnen-text', 'Halten Sie einen Abschnitt fest und ziehen Sie ihn nach oben oder unten.'));
    var liste = el('ol', 'ed-ordnen-liste');
    bloecke.forEach(function (b, i) {
      var li = el('li', 'ed-ordnen-zeile');
      li.setAttribute('data-nr', i);
      li.appendChild(el('span', 'ed-ordnen-griff', '✋'));
      li.appendChild(el('span', null, blockName(b.lastElementChild)));
      li.appendChild(el('span', 'ed-ordnen-pfeile', '⇅'));
      liste.appendChild(li);
    });
    karte.appendChild(liste);
    var fertig = el('button', 'ed-knopf ed-knopf-haupt', 'Fertig'); fertig.type = 'button';
    karte.appendChild(fertig);
    f.appendChild(karte); document.body.appendChild(f);
    if (window.Sortable) Sortable.create(liste, { animation: 180, ghostClass: 'ed-geist', forceFallback: true, fallbackTolerance: 3 });
    fertig.addEventListener('click', function () {
      var neu = Array.prototype.map.call(liste.children, function (li) { return bloecke[+li.getAttribute('data-nr')]; });
      var anders = neu.some(function (b, i) { return b !== bloecke[i]; });
      neu.forEach(function (b) { huelle.appendChild(b); });
      f.remove();
      if (anders) { markiere(); meldung('Reihenfolge geändert ✓'); }
    });
  }

  // ---------- Obere Leiste: Vorschau / Speichern ----------
  var speichernKnopf, statusText;
  function obereLeiste() {
    var l = el('div', 'ed-leiste');
    var titel = el('div', 'ed-leiste-titel');
    titel.appendChild(el('strong', null, '✏️ Bearbeiten'));
    statusText = el('span', 'ed-status', 'Keine Änderungen');
    titel.appendChild(statusText);
    var hilfeKnopf = el('button', 'ed-knopf ed-knopf-rund', '?'); hilfeKnopf.type = 'button'; hilfeKnopf.title = 'Hilfe';
    var vorschau = el('button', 'ed-knopf', 'Vorschau'); vorschau.type = 'button';
    speichernKnopf = el('button', 'ed-knopf ed-knopf-haupt', '💾 Speichern'); speichernKnopf.type = 'button';
    l.appendChild(titel); l.appendChild(hilfeKnopf); l.appendChild(vorschau); l.appendChild(speichernKnopf);
    document.body.appendChild(l);
    hilfeKnopf.addEventListener('click', hilfe);
    vorschau.addEventListener('click', function () {
      var an = document.documentElement.classList.toggle('ed-vorschau');
      vorschau.textContent = an ? '✏️ Zurück zum Bearbeiten' : 'Vorschau';
      vorschau.classList.toggle('ed-zurueck-aktiv', an);
      hilfeKnopf.hidden = an;
      if (an) meldung('Vorschau: So sehen es Ihre Besucher. Oben „Zurück zum Bearbeiten“ tippen.');
      document.querySelectorAll('.ed-text').forEach(function (t) { editierbar(t, !an); });
    });
    speichernKnopf.addEventListener('click', speichern);
    status();
  }
  function status() {
    if (!speichernKnopf) return;
    speichernKnopf.disabled = !geaendert || speichertGerade;
    statusText.textContent = gespeichert ? 'Alles gespeichert ✓' : geaendert ? 'Noch nicht gespeichert' : 'Keine Änderungen';
    statusText.classList.toggle('ed-status-offen', geaendert && !gespeichert);
  }

  // ---------- Saubere Seite erzeugen ----------
  function sauberesHtml() {
    var b = document.body.cloneNode(true);
    b.querySelectorAll('[data-ed-ui], .confetti, .sortable-fallback').forEach(function (x) { x.remove(); });
    // Hüllen der Abschnitte auflösen
    b.querySelectorAll('[data-ed-huelle]').forEach(function (h) {
      while (h.firstChild) h.parentNode.insertBefore(h.firstChild, h);
      h.remove();
    });
    var dateien = [], gesehen = {};
    b.querySelectorAll('*').forEach(function (x) {
      x.removeAttribute('contenteditable'); x.removeAttribute('data-ed-platz'); x.removeAttribute('draggable');
      if (x.classList.contains('ed-text')) x.removeAttribute('spellcheck');
      Array.prototype.slice.call(x.classList).forEach(function (c) {
        if (c.indexOf('ed-') === 0 || c.indexOf('sortable-') === 0) x.classList.remove(c);
      });
      if (x.classList.contains('reveal')) x.classList.remove('visible');
      if (x.getAttribute('class') === '') x.removeAttribute('class');
      if (x.hasAttribute('style') && !x.closest('svg')) x.removeAttribute('style');
    });
    b.querySelectorAll('img').forEach(function (img) {
      var s = img.getAttribute('src'); var neu = neueBilder[s];
      if (neu) { img.setAttribute('src', neu.name); if (!gesehen[neu.name]) { gesehen[neu.name] = 1; dateien.push(neu); } }
    });
    var name = ((document.querySelector('.brand-name') || {}).textContent || '').trim();
    var liste = b.querySelector('#werkeListe');
    var werke = liste ? liste.querySelectorAll(':scope > .work') : [];
    if (liste) liste.classList.remove('offen');
    Array.prototype.forEach.call(werke, function (li, i) {
      li.classList.toggle('work--extra', i >= sichtbar);
      var knopf = li.querySelector('.work-open'), img = li.querySelector('img');
      var t = ((li.querySelector('.work-title') || {}).textContent || '').trim();
      var info = ((li.querySelector('.work-info') || {}).textContent || '').trim();
      var alt = (t || 'Werk') + (name ? ' – Werk von ' + name : '');
      if (knopf) {
        knopf.setAttribute('data-src', img ? img.getAttribute('src') : '');
        knopf.setAttribute('data-title', t); knopf.setAttribute('data-info', info);
        knopf.setAttribute('aria-label', alt + ' groß anzeigen');
      }
      if (img) img.setAttribute('alt', alt);
    });
    var mehr = b.querySelector('#worksMore'), wrap = b.querySelector('.works-more-wrap');
    if (mehr) {
      var txt = 'Alle ' + werke.length + ' Werke anzeigen';
      mehr.setAttribute('data-mehr', txt); mehr.textContent = txt; mehr.setAttribute('aria-expanded', 'false');
    }
    if (wrap) { if (werke.length > sichtbar) wrap.removeAttribute('hidden'); else wrap.setAttribute('hidden', ''); }
    var sv = b.querySelector('#successView'); if (sv) sv.setAttribute('hidden', '');
    var fv = b.querySelector('#formView'); if (fv) fv.removeAttribute('hidden');
    var ss = b.querySelector('#successSocial'); if (ss) ss.innerHTML = '';
    var lbi = b.querySelector('#lightboxImg'); if (lbi) { lbi.setAttribute('src', 'hero.jpg'); lbi.setAttribute('alt', ''); }
    ['lightboxTitle', 'lightboxInfo'].forEach(function (id) { var x = b.querySelector('#' + id); if (x) x.textContent = ''; });
    var innen = b.innerHTML.replace(/\n{3,}/g, '\n\n');
    var html = rohHtml.replace(/<body[^>]*>[\s\S]*<\/body>/i, function () { return '<body>\n' + innen.trim() + '\n</body>'; });
    return { html: html, dateien: dateien };
  }

  // Zum Vergleichen: Leerraum egal
  function kern(html) {
    var m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html || '');
    return (m ? m[1] : '').replace(/\s+/g, ' ').trim();
  }
  // Ist das, was jetzt online liegt, schon unsere Fassung?
  function istAngekommen(html) {
    return api({ aktion: 'laden' }, 40).then(function (r) { return !!(r.ok && kern(r.html) === kern(html)); });
  }

  function speichern() {
    if (speichertGerade) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var paket = sauberesHtml();
    speichertGerade = true; status();
    zeigeFenster('laeuft', 'Wird gespeichert', 'Bitte einen Moment warten …');
    var start = Date.now();

    var versuch = function (nr) {
      return api({ aktion: 'speichern', html: paket.html, dateien: paket.dateien }, 90).then(function (r) {
        if (r.ok) return r;
        if (r.fehler === 'code' || r.fehler === 'gesperrt') return r;
        // Antwort unklar: nachsehen, ob es trotzdem angekommen ist
        return istAngekommen(paket.html).then(function (da) {
          if (da) return { ok: true };
          if (nr >= 2) return r;
          return warte(2000).then(function () { return versuch(nr + 1); });
        });
      });
    };
    var fertig = TESTMODUS
      ? warte(1200).then(function () { window.__edLetztesHtml = paket.html; return { ok: true }; })
      : versuch(1);

    fertig.then(function (r) {
      return warte(Math.max(0, 900 - (Date.now() - start))).then(function () { return r; });
    }).then(function (r) {
      speichertGerade = false;
      if (r.ok) {
        rohHtml = paket.html; geaendert = false; gespeichert = true; status();
        zeigeFenster('ok', 'Gespeichert!', TESTMODUS ? 'Testmodus: Es wurde nichts online gestellt.'
          : 'In ein paar Minuten sehen es alle Besucher.');
        setTimeout(schliesseFenster, 3000);
      } else {
        status();
        zeigeFenster('fehler', 'Nicht gespeichert',
          r.fehler === 'code' ? 'Ihr Zugang ist abgelaufen. Bitte die Seite neu laden und anmelden.'
            : 'Bitte prüfen Sie Ihre Internetverbindung und tippen Sie noch einmal auf „Speichern“. Ihre Änderungen sind noch da.',
          'OK');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', anmeldung);
  else anmeldung();
})();
