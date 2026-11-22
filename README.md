# Komiks

Webová appka (PWA) na kreslení komiksů na iPadu s Apple Pencil. Je to čistě statický web
(HTML + CSS + vanilla JS, bez build kroku a bez knihoven). Nepotřebuje účet ani backend
a data zůstávají jen v iPadu (IndexedDB).

Běží na **https://katka1815.github.io/komiks/**

## Soubory

| Soubor | Co dělá |
|---|---|
| `index.html` | obě obrazovky (seznam projektů, editor) a dialog exportu |
| `style.css` | vzhled; zamčení plátna (`touch-action`, `user-select`, safe-area) |
| `app.js` | kreslení, nástroje, zpět/znovu, stránky, projekty, ukládání do IndexedDB, export, sdílení |
| `pdf.js` | vlastní minimální PDF writer (jedna JPEG stránka = jedna strana PDF), funguje offline |
| `sw.js` | service worker, kešuje všechny soubory kvůli offline režimu |
| `manifest.json`, `*.png` | PWA manifest a ikony |
| `check_pdf.py` | ověření exportovaného PDF: `python check_pdf.py soubor.pdf POČET_STRAN ŠÍŘKA_MM VÝŠKA_MM` |

## Datový model

Všechno je v milimetrech, takže kresba sedí při každé velikosti obrazovky i při exportu.

```
Projekt { id, name, w, h, pages: [[objekt…], …], updated }
objekt  { t: 'pen' | 'line' | 'rect', c: barva, w: tloušťka, p: [x, y, x, y…] }
        { t: 'text', c: barva, s: velikost písma, p: [x, y], text }
        každý objekt může mít x: [{ t: 'erase', w: tloušťka gumy, p: [x, y…] }, …]
```

Guma má dva režimy. „Celé tahy“ smaže celé objekty, kterých se dotkne. „Část“ přidá
tah gumy do `x` každého objektu, kterého se dotkne. Objekt se pak kreslí zvlášť na
pomocnou vrstvu, kde se vygumovaná místa vyříznou (`destination-out`). Funguje to na
čáry, obdélníky i text, platí to i v exportu a díra se při posunu posune s objektem.
Verze 2 ukládala tahy gumy volně na stránku. Při otevření projektu se převedou do objektů.

Zoom: dvěma prsty se přibližuje, oddaluje a posouvá. Při zapnutém „Jen Pencil“ posouvá
stránku i jeden prst. Plátno se při zoomu znovu vykreslí z vektorů, takže zůstává ostré.

Objekty se nikdy neupravují na místě (posun vytvoří nový objekt). Proto stačí, když si
zpět/znovu pamatuje jen kopie polí stránek. Funguje to pro všechny akce včetně přidání,
duplikace a mazání stránek.

## Nasazení nové verze

1. V `sw.js` zvyš `VERSION` (např. `komiks-v2`). Bez toho by appka na ploše dál
   používala staré soubory.
2. `git commit` a `git push`. GitHub Pages to za minutu nasadí.
3. V appce se nová verze načte při příštím otevření seznamu projektů.

## Návod pro iPad

**Přidání na plochu:** v Safari otevři adresu výš, klepni na Sdílet (čtvereček se
šipkou) → „Přidat na plochu“ → Přidat. Pak appku spouštěj z ikony na ploše. Poběží přes
celou obrazovku a i bez internetu.

**Export a poslání mailem:** v editoru klepni na Export a vyber formát (PDF celého komiksu,
PDF stránky, PNG nebo JPG stránky). Pak klepni na „Sdílet / poslat“ a v nabídce vyber
Mail, Gmail, Zprávy, AirDrop nebo „Uložit do Souborů“. Když se příprava souboru protáhne,
iPad chce ještě jedno klepnutí, proto se objeví tlačítko „Sdílet soubor“.

**Záloha:** Export → „Záloha projektu (.json)“ → Sdílet / poslat → Uložit do Souborů
(nebo si ji pošli mailem). Obnova: na seznamu projektů dej „Import zálohy“ a vyber ten
soubor. Projekt se přidá jako nový, žádný stávající se nepřepíše.

Data jsou jen v tomhle iPadu a v tomhle Safari. Když smažeš data webů v nastavení Safari
nebo appku z plochy, projekty zmizí. Proto si dělej zálohy.
