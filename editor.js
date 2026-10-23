/* Bearbeiten-Modus für Kontakt-Seiten.
   Nur aktiv mit ?bearbeiten in der Adresse. Ohne gültigen Code lässt sich nichts speichern:
   Der Code wird im Google-Skript geprüft, der GitHub-Schlüssel liegt nur dort. */
(function () {
  'use strict';
  if (!/[?&]bearbeiten\b/.test(location.search)) return;

  var API = 'https://script.google.com/macros/s/AKfycbyviB6zxo-213nQ7p0kDg2kpW34uETRu3fPE8_hHBIXoIkBXXTcni8KnKBXKUxHpvAg/exec';                 // Web-App-Adresse des Skripts "Kontaktseiten Editor"
  var TESTMODUS = API.indexOf('https://') !== 0; // ohne Adresse: nur ausprobieren, nichts speichern
  var SEITE = (location.pathname.split('/').filter(Boolean)[0] || 'lokal').toLowerCase();
  var TEXTE = '.brand-name, .brand-sub, #formView h1, #formView .lead, .section > h2, .work-title, .work-info, ' +
              '.about-text > p, .footer-brand, #successView h2, #successView .lead';
  var BILDER = '.hero img, img.portrait, .work img';

  var code = '', rohHtml = '', sichtbar = 6, geaendert = false, neueBilder = {}, gespeichert = false;

  // ---------- Hilfen ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    e.setAttribute('data-ed-ui', '');
    return e;
  }
  function api(daten) {
    daten.seite = SEITE; daten.code = code;
    return fetch(API, { method: 'POST', body: JSON.stringify(daten), redirect: 'follow', credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: false, fehler: 'antwort' }; } },
            function () { return { ok: false, fehler: 'netz' }; });
  }
  function meldung(text, rueckgaengig) {
    var alt = document.querySelector('.ed-toast'); if (alt) alt.remove();
    var t = el('div', 'ed-toast'); t.appendChild(document.createTextNode(text));
    if (rueckgaengig) {
      var b = el('button', 'ed-toast-btn', 'Rückgängig'); b.type = 'button';
      b.addEventListener('click', function () { rueckgaengig(); t.remove(); });
      t.appendChild(b);
    }
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, rueckgaengig ? 8000 : 4500);
  }
  function markiere() { geaendert = true; gespeichert = false; status(); }
  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'editor.css?v=1';
  document.head.appendChild(css);

  // ---------- Anmelden ----------
  function anmeldung() {
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
      knopf.disabled = true; knopf.textContent = 'Einen Moment …'; fehler.textContent = '';
      var weiter = TESTMODUS
        ? Promise.resolve(code === 'TEST' ? { ok: true, html: null } : { ok: false, fehler: 'code' })
        : api({ aktion: 'laden' });
      weiter.then(function (r) {
        knopf.disabled = false; knopf.textContent = 'Anmelden';
        if (!r.ok) {
          fehler.textContent = r.fehler === 'code' ? 'Der Code stimmt nicht. Bitte noch einmal prüfen.'
            : r.fehler === 'gesperrt' ? 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.'
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
    bloeckeLeisten();
    obereLeiste();

    window.addEventListener('beforeunload', function (ev) {
      if (geaendert && !gespeichert) { ev.preventDefault(); ev.returnValue = ''; }
    });
    meldung('Tippen Sie auf einen Text oder ein Bild, um es zu ändern.');
  }

  function textBearbeitbar(e) {
    var platzhalter = e.classList.contains('work-title') ? 'Titel des Werks'
      : e.classList.contains('work-info') ? 'Technik, Größe (optional)' : 'Text eingeben';
    e.setAttribute('data-ed-platz', platzhalter);
    e.setAttribute('spellcheck', 'true');
    try { e.contentEditable = 'plaintext-only'; } catch (x) { e.contentEditable = 'true'; }
    if (e.contentEditable !== 'plaintext-only') e.contentEditable = 'true';
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
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp,image/heic,image/*';
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
      meldung('Bild wird vorbereitet …');
      return verkleinere(datei, max).then(function (b) {
        var name = art + '-' + Date.now().toString(36) + '.jpg';
        var vorschau = URL.createObjectURL(b.blob);
        neueBilder[vorschau] = { name: name, b64: b.b64 };
        var t = document.querySelector('.ed-toast'); if (t) t.remove();
        return { src: vorschau, w: b.w, h: b.h };
      }, function () {
        meldung('Dieses Bild kann ich nicht öffnen. Bitte ein JPG- oder PNG-Foto wählen.');
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
        markiere(); meldung('Foto getauscht. Zum Übernehmen auf „Speichern“ tippen.');
      });
    };
    (halter === img ? img : halter).addEventListener('click', los);
  }

  // ---------- Werke ----------
  function werkLeiste(li) {
    if (li.querySelector('.ed-werk-leiste')) return;
    var leiste = el('div', 'ed-werk-leiste');
    var links = el('button', 'ed-mini', '◀'); links.type = 'button'; links.title = 'Nach vorne';
    var rechts = el('button', 'ed-mini', '▶'); rechts.type = 'button'; rechts.title = 'Nach hinten';
    var weg = el('button', 'ed-mini ed-mini-weg', '🗑'); weg.type = 'button'; weg.title = 'Werk entfernen';
    leiste.appendChild(links); leiste.appendChild(rechts); leiste.appendChild(weg);
    li.insertBefore(leiste, li.firstChild);
    links.addEventListener('click', function () {
      var vor = li.previousElementSibling;
      if (vor && vor.classList.contains('work')) { li.parentNode.insertBefore(li, vor); markiere(); }
    });
    rechts.addEventListener('click', function () {
      var nach = li.nextElementSibling;
      if (nach && nach.classList.contains('work')) { li.parentNode.insertBefore(nach, li); markiere(); }
    });
    weg.addEventListener('click', function () {
      var eltern = li.parentNode, danach = li.nextSibling;
      li.remove(); markiere();
      meldung('Werk entfernt.', function () { eltern.insertBefore(li, danach); });
    });
  }
  function plusKachel() {
    var liste = document.getElementById('werkeListe'); if (!liste) return;
    var li = el('li', 'ed-plus');
    var b = el('button', 'ed-plus-knopf'); b.type = 'button';
    b.appendChild(el('span', 'ed-plus-zeichen', '+'));
    b.appendChild(el('span', null, 'Werk hinzufügen'));
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
        meldung('Werk hinzugefügt. Jetzt noch den Titel eintippen.');
      });
    });
  }

  // ---------- Blöcke verschieben ----------
  function bloecke() {
    return Array.prototype.filter.call(document.body.children, function (c) {
      return c.matches('.stage, section.section');
    });
  }
  function blockName(b) {
    if (b.classList.contains('stage')) return 'Foto & Kontaktformular';
    var h = b.querySelector('h2'); return h ? h.textContent.trim() : 'Abschnitt';
  }
  function bloeckeLeisten() {
    document.querySelectorAll('.ed-block-leiste').forEach(function (x) { x.remove(); });
    var alle = bloecke();
    alle.forEach(function (b, i) {
      var l = el('div', 'ed-block-leiste');
      l.appendChild(el('span', 'ed-block-name', blockName(b)));
      var hoch = el('button', 'ed-knopf', '▲ Nach oben'); hoch.type = 'button'; hoch.disabled = i === 0;
      var runter = el('button', 'ed-knopf', '▼ Nach unten'); runter.type = 'button'; runter.disabled = i === alle.length - 1;
      l.appendChild(hoch); l.appendChild(runter);
      b.parentNode.insertBefore(l, b);
      hoch.addEventListener('click', function () { tausche(alle[i - 1], b); });
      runter.addEventListener('click', function () { tausche(b, alle[i + 1]); });
    });
  }
  function tausche(oben, unten) {
    oben.parentNode.insertBefore(unten, oben);
    bloeckeLeisten(); markiere();
    unten.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Obere Leiste: Vorschau / Speichern ----------
  var speichernKnopf, statusText;
  function obereLeiste() {
    var l = el('div', 'ed-leiste');
    var titel = el('div', 'ed-leiste-titel');
    titel.appendChild(el('strong', null, 'Bearbeiten'));
    statusText = el('span', 'ed-status', 'Keine Änderungen');
    titel.appendChild(statusText);
    var vorschau = el('button', 'ed-knopf', 'Vorschau'); vorschau.type = 'button';
    speichernKnopf = el('button', 'ed-knopf ed-knopf-haupt', 'Speichern'); speichernKnopf.type = 'button';
    l.appendChild(titel); l.appendChild(vorschau); l.appendChild(speichernKnopf);
    document.body.appendChild(l);
    vorschau.addEventListener('click', function () {
      var an = document.documentElement.classList.toggle('ed-vorschau');
      vorschau.textContent = an ? 'Weiter bearbeiten' : 'Vorschau';
      document.querySelectorAll('.ed-text').forEach(function (t) {
        if (an) t.setAttribute('contenteditable', 'false');
        else { try { t.contentEditable = 'plaintext-only'; } catch (x) { t.contentEditable = 'true'; } }
      });
    });
    speichernKnopf.addEventListener('click', speichern);
    status();
  }
  function status() {
    if (!speichernKnopf) return;
    speichernKnopf.disabled = !geaendert;
    statusText.textContent = gespeichert ? 'Gespeichert ✓' : geaendert ? 'Nicht gespeicherte Änderungen' : 'Keine Änderungen';
  }

  // ---------- Saubere Seite erzeugen ----------
  function sauberesHtml() {
    var b = document.body.cloneNode(true);
    b.querySelectorAll('[data-ed-ui], .confetti').forEach(function (x) { x.remove(); });
    var dateien = [], gesehen = {};
    b.querySelectorAll('*').forEach(function (x) {
      x.removeAttribute('contenteditable'); x.removeAttribute('data-ed-platz');
      if (x.classList.contains('ed-text')) x.removeAttribute('spellcheck');
      Array.prototype.slice.call(x.classList).forEach(function (c) { if (c.indexOf('ed-') === 0) x.classList.remove(c); });
      if (x.classList.contains('reveal')) x.classList.remove('visible');
      if (x.getAttribute('class') === '') x.removeAttribute('class');
      if (x.hasAttribute('style') && !x.closest('svg')) x.removeAttribute('style');
    });
    b.querySelectorAll('img').forEach(function (img) {
      var s = img.getAttribute('src'); var neu = neueBilder[s];
      if (neu) { img.setAttribute('src', neu.name); if (!gesehen[neu.name]) { gesehen[neu.name] = 1; dateien.push(neu); } }
    });
    var name = (document.querySelector('.brand-name') || {}).textContent || '';
    name = name.trim();
    var liste = b.querySelector('#werkeListe');
    var werke = liste ? liste.querySelectorAll(':scope > .work') : [];
    if (liste) liste.classList.remove('offen');
    Array.prototype.forEach.call(werke, function (li, i) {
      li.classList.toggle('work--extra', i >= sichtbar);
      var knopf = li.querySelector('.work-open'), img = li.querySelector('img');
      var t = (li.querySelector('.work-title') || {}).textContent || '';
      var info = (li.querySelector('.work-info') || {}).textContent || '';
      t = t.trim(); info = info.trim();
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

  function speichern() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var paket = sauberesHtml();
    speichernKnopf.disabled = true; speichernKnopf.textContent = 'Speichert …';
    var fertig = TESTMODUS
      ? new Promise(function (res) {
          window.__edLetztesHtml = paket.html;
          setTimeout(function () { res({ ok: true, test: true }); }, 600);
        })
      : api({ aktion: 'speichern', html: paket.html, dateien: paket.dateien });
    fertig.then(function (r) {
      speichernKnopf.textContent = 'Speichern';
      if (r.ok) {
        rohHtml = paket.html; geaendert = false; gespeichert = true; status();
        meldung(r.test ? 'Testmodus: alles bereit, aber nichts gespeichert.'
                       : 'Gespeichert! In wenigen Minuten sehen es alle Besucher.');
      } else {
        status();
        meldung(r.fehler === 'code' ? 'Ihr Zugang ist abgelaufen. Bitte die Seite neu laden und anmelden.'
          : 'Speichern hat nicht geklappt. Bitte gleich noch einmal versuchen.');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', anmeldung);
  else anmeldung();
})();
