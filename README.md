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
- **Pero:** volná čára. Tloušťku nastavíš posuvníkem od 0,1 mm (asi 1 pixel v exportu) do
  10 mm. Tlačítky − a + ji jemně doladíš. Puntík nad posuvníkem ukazuje tloušťku tak, jak
  vypadá při aktuálním zoomu, pod ním je číslo v mm. Čára a Obdélník používají stejnou
  tloušťku. Appka si ji pamatuje. Tahy se jemně vyhlazují (asi o 1 pixel obrazovky), aby
  zmizelo chvění, konce tahu zůstanou přesně tam, kde jsi začala a skončila.
- **Čára:** rovná čára z bodu A do B. Do 5° od vodorovné nebo svislé se srovná.
- **Obdélník:** na rámečky panelů.
- **Text:** ťukni na místo, napiš text a dej OK. Ťuknutím na existující text ho upravíš.
  Když text smažeš celý, zmizí.
- **Posun:** chyť objekt a přesuň ho.
- **Guma** má dva režimy:
  - **Část** (tloušťka posuvníkem od 0,1 do 40 mm) maže jen to, přes co přejedeš. Čára, tah
    perem nebo obdélník se v tom místě rozdělí na kousky.
  - **Celé tahy** smaže celé objekty (nebo kousky), kterých se dotkneš.
- **Kyblík:** ťukni do ohraničeného místa a vyplní se aktuální barvou. Výplň je vždy pod
  čarami a textem. Ťuknutím do vyplněného místa jinou barvou ho přebarvíš. Ťuknutím mimo
  všechno obarvíš pozadí. Když je v ohraničení mezera, barva proteče ven, pak dej Zpět,
  dokresli mezeru a zkus to znovu. Výplň jde posunout, smazat gumou i vrátit přes Zpět.
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

**Do noťasu přes schránku:** Export → u formátu „Do schránky“. Appka se zeptá na heslo
k tomuhle souboru. Můžeš ho vyplnit, nebo nechat prázdné a soubor bude bez hesla. Na noťasu
otevři **https://komiks-schranka.kackaodkazyapoznamky.workers.dev**. Seznam souborů je
vidět bez hesla. Soubor bez hesla stáhneš kliknutím. U souboru se zámkem 🔒 nejdřív zadáš
jeho heslo. Každý soubor tam vydrží **hodinu od nahrání**, pak se sám smaže. Nový soubor se
v seznamu může ukázat až po minutě, stránka se obnovuje sama.

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
        { t: 'fill', c: barva, p: [x0, y0, x1, y1], m: 'data:image/png;base64,…' }   výplň kyblíkem
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
- **Guma „Část“** (`eraseFrom`):
  - Jestli se guma objektu dotkne, zjistí `touches_` porovnáním úseček gumy s úsečkami
    objektu. Je to rychlé i pro 0,1mm gumu.
  - Tvar se převede na středovou čáru (`centerline`). V okolí gumy má jemné kroky (třetina
    menší z tlouštěk, nejvýš 0,3 mm), jinde hrubé.
  - U každého bodu se kontroluje střed a oba okraje čáry. Úsek, který guma přejede přes
    celou šířku, zmizí. Konce se zkrátí o půl tloušťky (měřeno po délce čáry), aby kulatý
    konec nezasahoval do mezery.
  - Kousky se zjednoduší (`simplify`, Douglas–Peucker s odchylkou 0,01 mm), takže rovný
    kousek má zase jen 2 body.
  - Úsek, který guma jen škrtne, text a guma tenčí než čára dostanou ořez `x`. U tenké gumy
    přes silnou čáru by dva kulaté konce vedle sebe vypadaly jako přiškrcení.
- **Vyhlazení tahu** (`smooth`): Gaussův průměr podél tahu se šířkou 1,2 CSS px přepočtenou
  na mm podle zoomu při kreslení. U konců se okno zmenšuje, takže začátek a konec tahu se
  nepohnou. Body se zaznamenávají po půl pixelu obrazovky, takže kreslení při velkém zoomu
  není hranaté. Živý náhled ukazuje už vyhlazený tah.
- **Kyblík** (`bucket`): stránka bez ostatních výplní se vykreslí do pomocného plátna
  v 6 px/mm (asi 150 DPI). Z místa ťuknutí se vyplní všechny sousední pixely, které nejsou
  čára. Výplň se pak o 2 px rozšíří pod okolní čáry, aby u kraje nezůstal bílý lem.
  Výsledná maska se uloží jako PNG (už obarvené) jen v rozsahu výplně a vloží se nad
  ostatní výplně, ale pod všechno ostatní. Obrázky výplní se dekódují jednou a pamatují se
  (`fillCache`). Export a náhledy na ně počkají (`fillsReady`). Zásah posunem a gumou
  „Celé tahy“ se pozná podle průhlednosti masky.
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

- `POST /upload?name=…` se souborem v těle a volitelnou hlavičkou `X-Heslo` (heslo
  zakódované přes `encodeURIComponent`, protože hlavička neunese diakritiku). Uloží se jen
  SHA-256 otisk hesla s klíčem souboru, ne heslo samotné. Limit 25 MB (strop hodnoty v KV).
- Nahrávání je otevřené komukoli, kdo zná adresu. Proti zaplnění je strop 50 souborů
  najednou, a protože se soubory po hodině mažou, víc se nenahromadí.
- `GET /` vypíše seznam (názvy jsou vidět i u zamčených souborů). `GET /f/<klíč>` stáhne
  soubor bez hesla. U zamčeného ukáže formulář a `POST /f/<klíč>` s heslem vrátí soubor.
  Hesla se porovnávají v konstantním čase.
- KV `list` je jen „časem konzistentní“, proto se nový soubor může v seznamu ukázat se
  zpožděním až minutu.
- Limity free plánu: 1000 nahrání denně, 1 GB místa. Na tohle použití to stačí s velkou rezervou.

Nasazení (ve složce `schranka/`): `npx wrangler deploy`. Worker nepotřebuje žádné tajemství.

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

1. V `sw.js` zvyš `VERSION` (teď `komiks-v8`). Bez toho by appka na ploše dál používala
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
- Výplň kyblíkem má rozlišení asi 150 DPI. Okraj se schová pod čáru, ale u tenké čáry
  (pod 0,3 mm) může být při velkém zoomu nebo v exportu vidět lehce zubatý kraj.
- Kyblík nezavírá mezery v čarách: i malá mezera nechá barvu protéct.
- Okraje mezery po gumě jsou kulaté jako konec čáry, ne podle tvaru gumy.
- Čára 0,1 mm je při celé stránce na displeji jen slabě vidět (je tenčí než pixel displeje).
  Po přiblížení i v exportu je vidět normálně.
