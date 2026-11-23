# Komiks

Webová appka (PWA) na kreslení komiksů na iPadu s Apple Pencil. Je to čistě statický web
(HTML + CSS + vanilla JS, bez build kroku a bez knihoven). Nepotřebuje účet ani backend
a data zůstávají jen v iPadu (IndexedDB). Appku používá jen Katka. Jediná serverová část je
nepovinná **schránka** pro přenos exportů do noťasu (malý Cloudflare Worker ve složce `schranka/`).

Běží na **https://katka1815.github.io/komiks/**, repo **github.com/katka1815/komiks**
(veřejné, GitHub Pages z větve `main`).

Proč je co udělané, jak je, a historie změn: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Návod pro iPad

**Přidání na plochu:** v Safari otevři adresu výš, klepni na Sdílet (čtvereček se
šipkou) → „Přidat na plochu“ → Přidat. Pak appku spouštěj z ikony na ploše. Poběží přes
celou obrazovku a i bez internetu.

**Projekty:** na úvodní obrazovce založíš nový projekt (A4 na výšku, A4 na šířku, A5 na
výšku, čtverec nebo vlastní rozměr v mm). U každého projektu je Otevřít, Přejmenovat,
Duplikovat a Smazat. Všechno se ukládá samo.

**Nástroje** (lišta vlevo):
- **Pero:** volná čára. Tloušťku vybereš ze čtyř velikostí.
- **Čára:** rovná čára z bodu A do B. Do 5° od vodorovné nebo svislé se srovná.
- **Obdélník:** na rámečky panelů.
- **Text:** ťukni na místo, napiš text a dej OK. Ťuknutím na existující text ho upravíš.
  Když text smažeš celý, zmizí.
- **Posun:** chyť objekt a přesuň ho.
- **Guma** má dva režimy:
  - **Část** (tloušťka 2, 5, 10 nebo 20 mm) maže jen to, přes co přejedeš. Čára, tah
    perem nebo obdélník se v tom místě rozdělí na kousky.
  - **Celé tahy** smaže celé objekty (nebo kousky), kterých se dotkneš.
- **Barvy:** deset základních a duhové pole pro vlastní barvu.

**Horní lišta:** zpět/znovu (funguje pro všechny akce včetně práce se stránkami), přepínání
stránek a „2 / 5“, přidat, duplikovat a smazat stránku, přepínač **Jen Pencil** a Export.

**Jen Pencil** (výchozí): prst nikdy nekreslí, takže dlaň na displeji nevadí. Když je
vypnuté, kreslí i prst.

**Zoom:** dvěma prsty přibližuješ (až 8×), oddaluješ a posouváš. Se zapnutým „Jen Pencil“
posouváš stránku i jedním prstem. Po oddálení na celou stránku se stránka srovná doprostřed.

**Export a poslání mailem:** Export → vyber formát (PDF celého komiksu, PDF stránky, PNG
nebo JPG stránky) → „Sdílet / poslat“ → Mail, Gmail, Zprávy, AirDrop nebo „Uložit do
Souborů“. Když se příprava souboru protáhne, iPad chce ještě jedno klepnutí, proto se
objeví tlačítko „Sdílet soubor“. „Stáhnout“ je záložní cesta pro případ, že sdílení nejde.

**Do noťasu přes schránku:** Export → u formátu „Do schránky“. Poprvé se appka zeptá na heslo
a pak si ho pamatuje. Na noťasu otevři **https://komiks-schranka.kackaodkazyapoznamky.workers.dev**,
prohlížeč se zeptá na heslo (jméno může být cokoliv, třeba `katka`) a ukáže seznam souborů.
Kliknutím se soubor stáhne. Každý soubor tam vydrží **hodinu od nahrání**, pak se sám smaže.
Nový soubor se v seznamu může ukázat až po minutě, stránka se obnovuje sama. Heslo není
v repu, má ho jen Katka (a Cloudflare jako tajemství Workeru).

**Záloha:** Export → „Záloha projektu (.json)“ → Sdílet / poslat → Uložit do Souborů (nebo
si ji pošli mailem). Obnova: na seznamu projektů dej „Import zálohy“ a vyber ten soubor.
Projekt se přidá jako nový, žádný stávající se nepřepíše.

Data jsou jen v tomhle iPadu a v tomhle Safari. Když smažeš data webů v nastavení Safari
nebo appku z plochy, projekty zmizí. Proto si dělej zálohy.

## Soubory

| Soubor | Co dělá |
|---|---|
| `index.html` | obě obrazovky (seznam projektů, editor), dialog exportu |
| `style.css` | vzhled, zamčení plátna (`touch-action`, `user-select`), safe-area |
| `app.js` | kreslení, nástroje, guma, zoom, zpět/znovu, stránky, projekty, IndexedDB, export, sdílení, import |
| `pdf.js` | vlastní minimální PDF writer (jeden JPEG obrázek na stranu), funguje offline |
| `sw.js` | service worker: kešuje všechny soubory kvůli offline režimu, `VERSION` řídí aktualizace |
| `manifest.json`, `*.png` | PWA manifest a ikony (`apple-touch-icon.png` pro iOS) |
| `schranka/worker.js`, `schranka/wrangler.toml` | schránka: příjem souborů z iPadu, stránka se seznamem pro noťas |
| `check_pdf.py` | ověření exportovaného PDF: `python check_pdf.py soubor.pdf POČET_STRAN ŠÍŘKA_MM VÝŠKA_MM` |
| `docs/DECISIONS.md` | rozhodnutí a historie změn |

## Datový model

Všechno je v milimetrech, takže kresba sedí při každé velikosti obrazovky i při exportu.

```
Projekt { id, name, w, h, v: 4, pages: [[objekt…], …], updated }
objekt  { t: 'pen' | 'line' | 'rect', c: barva, w: tloušťka, p: [x, y, x, y…] }
        { t: 'poly', c, w, p: [x, y, x, y…] }   kousek rozdělené čáry (rovné úseky)
        { t: 'text', c: barva, s: velikost písma, p: [x, y], text }
        kterýkoli může mít x: [{ t: 'erase', c, w: tloušťka gumy, p: [x, y…] }, …]
```

- Objekty se nikdy neupravují na místě (posun i guma vytvoří nové objekty). Proto stačí,
  když si zpět/znovu pamatuje jen kopie polí stránek (až 200 kroků).
- `x` jsou pixelové ořezy. Vznikají jen u textu a tam, kde guma čáru škrtne po okraji.
  Takový objekt se kreslí na pomocnou vrstvu `scratch`, ořez se vyřízne
  (`destination-out`) a výsledek se zkopíruje. Je to pomalejší, proto se ořezy používají
  co nejméně.
- `v: 4` znamená, že projekt je v aktuálním formátu. Starší projekty se při otevření
  jednou převedou (`upgradePage`).
- Záloha `.json` obsahuje `{ app: 'komiks', v: 1, name, w, h, pages }`. Import kontroluje
  každé pole (`validProject`), protože soubor přichází zvenku.

## Jak funguje

- **Vykreslování:** dvě plátna přes celou plochu editoru. `base` drží stránku, `live`
  ukazuje rozdělaný tah. Bílý papír je `div#paper` pod nimi. Pohled je `scale` (CSS px
  na mm) a posun `ox`, `oy`. Při zoomu se všechno znovu vykreslí z vektorů, takže to zůstává
  ostré. Při otočení iPadu se pohled vrátí na celou stránku (`fit`).
- **Vstup:** pointer events + `getCoalescedEvents`. Pero, tužka i myš kreslí. Prst
  (`pointerType 'touch'`) jde do gest (`gestureMove`), pokud je zapnuté „Jen Pencil“ nebo
  jsou na displeji dva prsty.
- **Guma „Část“** (`eraseFrom`): tvar se převede na hustou středovou čáru (`centerline`,
  krok 0,3 mm). U každého bodu se kontroluje střed a oba okraje čáry. Úsek, který guma
  přejede přes celou šířku, zmizí a konce se zkrátí o půl tloušťky, aby kulatý konec
  nezasahoval do mezery. Úsek, který guma jen škrtne, dostane ořez `x`.
- **Export:** každá stránka se vykreslí do pomocného plátna v 200 DPI. Když by měla víc
  než 15 Mpx (limit iOS Safari je asi 16,7 Mpx), DPI se sníží. Plátno se hned uvolní
  (`width = 0`). JPEG obrázky jdou do `pdf.js` jako Bloby, takže ani 25 stran nezahltí
  paměť. Název souboru: `název_strana-3.pdf`, `název.pdf`, `název_strana-3.png`.
- **Sdílení:** `navigator.share({ files, title })` po kontrole `canShare`. Když iOS
  odmítne kvůli prošlému gestu (`NotAllowedError`), objeví se tlačítko „Sdílet soubor“.
  Bez sdílení se soubor stáhne přes blob URL a `<a download>`.

## Schránka (`schranka/`)

Cloudflare Worker `komiks-schranka` na Katčině účtu (stejném jako Rozcestník), free plán.
Soubory ukládá do KV namespace `SCHRANKA` s `expirationTtl` 3600 s, takže je KV po hodině
samo smaže a nic se nehromadí.

- `POST /upload?name=…` s hlavičkou `Authorization: Bearer <heslo>` a souborem v těle.
  CORS je otevřený pro všechny, chrání to heslo. Limit 25 MB (strop hodnoty v KV).
- `GET /` vypíše seznam a `GET /f/<klíč>` soubor stáhne. Obojí chrání HTTP Basic auth,
  heslo se porovnává v konstantním čase.
- KV `list` je jen „časem konzistentní“, proto se nový soubor může v seznamu ukázat se
  zpožděním až minutu.
- Limity free plánu: 1000 nahrání denně, 1 GB místa. Na tohle použití to stačí s velkou rezervou.

Nasazení a heslo (ve složce `schranka/`):

```
npx wrangler deploy
npx wrangler secret put HESLO      # změna hesla; pak ho zadej znovu v appce
```

Když se heslo změní, appka při dalším nahrání dostane odpověď „špatné heslo“, zapomene
staré heslo a zeptá se na nové.

## Lokální testování

```
python -m http.server 8765
```

Pak otevři http://localhost:8765/. Service worker kešuje soubory, takže **po každé změně
kódu** v DevTools smaž cache a odregistruj SW (Application → Clear site data). Jinak
prohlížeč pustí starou verzi a test ověřuje něco jiného, než si myslíš.

Pro iPad nastav v DevTools velikost okna 1180 × 820 (na šířku) a 820 × 1180 (na výšku).
Exportované PDF ověříš přes `check_pdf.py` (potřebuje `pip install pypdf`).

Chromium na Windows nemá systémové sdílení souborů, takže tam „Sdílet / poslat“ skončí
tlačítkem „Sdílet soubor“. Opravdové sdílení se dá vyzkoušet jen na iPadu.

## Nasazení nové verze

1. V `sw.js` zvyš `VERSION` (teď `komiks-v4`). Bez toho by appka na ploše dál používala
   staré soubory.
2. `git commit` a `git push`. GitHub Pages to asi za minutu nasadí.
3. V appce se nová verze načte, až se vrátíš na seznam projektů. Uprostřed kreslení se
   appka nikdy nepřenačte.
4. Zapiš změnu do `docs/DECISIONS.md`.

## Známá omezení

- Schránka potřebuje internet. Bez něj appka napíše „schránka není dostupná“, ostatní
  exporty fungují dál offline.
- Testované jen v desktopovém Chromiu s rozměry iPadu. Na skutečném iPadu s Apple
  Pencil zatím ne.
- „Stáhnout“ v appce spuštěné z plochy může iOS blokovat. Spolehlivá cesta je
  „Sdílet / poslat“ → Uložit do Souborů.
- Text a čáry jen škrtnuté gumou po okraji si nesou pixelový ořez. Když jich je na stránce
  hodně, kreslení a zoom se můžou zpomalit.
- Okraje mezery po gumě jsou kulaté jako konec čáry, ne podle tvaru gumy.
