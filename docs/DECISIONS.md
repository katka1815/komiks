# Rozhodnutí a historie změn

Nejnovější nahoře. Ke každé změně: co, proč a co zůstává otevřené.

## 2026-11-24: Jemné vyhlazení tahů a kyblík (`komiks-v8`)

- **Vyhlazení:** Katka chtěla jen velmi jemné, aby se vyrovnalo chvění Pencilu. Je to
  Gaussův průměr podél tahu se šířkou 1,2 CSS px (v mm podle zoomu při kreslení), takže při
  každém zoomu vyhladí stejně málo. Konce zůstávají přesně na místě. Kostrbatost klesne
  asi na třetinu a tah se posune nejvýš o 0,17 mm. Nastavení síly vyhlazení appka nemá,
  Katka o něj nežádala.
- K hranatosti přispíval i pevný krok záznamu 0,15 mm, který byl při zoomu 8× vidět jako
  zuby. Body se teď zaznamenávají po půl pixelu obrazovky.
- **Kyblík:** výplň je rastrová maska (PNG v `m`). Vektorový obrys výplně (trasování
  hranice včetně děr) by byl mnohem víc kódu a výsledek pod čarou vypadá stejně.
  Rozlišení 6 px/mm drží masky malé (jednotky kB) a výplň A4 trvá asi 150 ms.
- Výplně jsou vždycky pod čarami a textem, takže jejich okraj čáry zakryjí. Hranice se
  počítá bez ostatních výplní, takže přebarvení vloží novou výplň nad starou.
- Ikona kyblíku je vlastní SVG. Emoji 🪣 se na Windows nezobrazí a na starších iOS taky ne.

## 2026-11-23: Plynulá tloušťka pera a gumy od 0,1 mm (`komiks-v7`)

- Místo čtyř pevných velikostí je teď posuvník s tlačítky − a + a číslem v mm. Pero, čára
  a obdélník jdou od 0,1 do 10 mm, guma od 0,1 do 40 mm. Velikosti textu zůstaly jako
  tlačítka.
- 0,1 mm je zhruba 1 pixel exportu ve 200 DPI (0,127 mm). Tloušťka je pořád v mm, ne
  v pixelech obrazovky, aby kresba seděla při každém zoomu i v exportu.
- Posuvník je logaritmický, takže tenké velikosti zabírají většinu jeho délky.
  Tloušťky si appka pamatuje v `localStorage`.
- Puntík ukazuje skutečnou tloušťku při aktuálním zoomu, nejméně ale 2 px, aby byl vidět.
- Tenká guma by se starým výpočtem (kroky podle šířky gumy) dělila velmi pomalu. Proto:
  - dotyk se počítá úsečka proti úsečce,
  - jemné vzorkování je jen v okolí gumy,
  - kousky se zjednoduší (Douglas–Peucker). Bez toho měla čára po 0,1mm gumě přes
    2000 bodů, teď má 2.
- Guma tenčí než čára čáru nerozdělí, ale dá na ni ořez. Rozdělení by tam nechalo dva
  kulaté konce vedle sebe a čára by vypadala přiškrcená.
- Dokument (`touch-action`) blokoval posun prstem na posuvníku, proto je `input`
  vyjmutý z blokování.

## 2026-11-23: Heslo u každého souboru zvlášť (`komiks-v6`)

- Při „Do schránky“ se appka zeptá na heslo k tomu jednomu souboru. Prázdné pole znamená
  soubor bez hesla. Společné heslo schránky (tajemství `HESLO`) je zrušené.
- Seznam na noťasu je teď vidět bez hesla, zamčené soubory mají 🔒 a před stažením chtějí
  svoje heslo. Názvy zamčených souborů jsou v seznamu vidět. Katka bere, že soubor tam je
  jen hodinu a nikdo ho nenajde.
- Ukládá se jen SHA-256 otisk hesla s klíčem souboru.
- Nahrávání je bez společného hesla otevřené. Proti zaplnění je strop 50 souborů najednou.
  Horší než chybová hláška „schránka je plná“ to být nemůže, free plán se sám nezpoplatní.

## 2026-11-23: Schránka pro přenos do noťasu (`komiks-v5`)

- V Exportu přibylo u každého formátu tlačítko „Do schránky“. Soubor se nahraje do
  Workeru `komiks-schranka` a na noťasu se do hodiny stáhne z
  komiks-schranka.kackaodkazyapoznamky.workers.dev.
- **Proč vlastní Worker a ne služba typu tmpfiles nebo litterbox:** soubory zůstanou na
  Katčině účtu, je tam heslo, a cizí služby obvykle nepovolují nahrávání přímo z jiné
  webové stránky (CORS). Cloudflare free plán a KV se automatickým mazáním po hodině
  (`expirationTtl`) stojí nula a nic se nehromadí.
- **Proč KV a ne R2:** R2 by bylo okamžitě konzistentní, ale jeho zapnutí chce platební
  kartu. KV na free plánu stačí, cenou je zpoždění seznamu až o minutu.
- Heslo i hodina dohromady: Katka navrhla jedno nebo druhé, obojí stojí stejně málo kódu.
- Přetažení souboru z webu rovnou do složky Firefox neumí, proto se soubor stahuje
  kliknutím.
- Původní zadání chtělo appku bez backendu. Schránka je nepovinná, zbytek appky dál
  funguje bez ní i offline.

## 2026-11-22: Guma rozděluje tvary (`komiks-v4`)

- Guma „Část“ teď čáru, tah perem nebo obdélník rozdělí na kousky (`poly`). Vygumovaný
  úsek zmizí a nic navíc se neukládá.
- **Proč:** Katka bude gumovat často. Pixelové ořezy z verze 3 se hromadily a každý objekt
  s ořezem se kreslí přes pomocnou vrstvu, takže by se stránka časem zpomalovala.
- Pixelový ořez (`x`) zůstává jen tam, kde rozdělení nejde. Jde o text a o místa, kde guma
  čáru jen škrtne po okraji (čára by se musela zúžit, ne přerušit).
- Konce kousků se zkrátí o půl tloušťky čáry. Bez toho kulatý konec zasahoval do mezery
  a u 2,8mm čáry byla mezera po 5mm gumě jen asi 2,6 mm.
- Starší projekty (verze 2 i 3) se při otevření jednou převedou (`upgradePage`, `v: 4`).
- Chyba nalezená při testu: `through ||= full[j++]` po prvním `true` přestal zvyšovat `j`,
  takže převod starého projektu skončil v nekonečné smyčce. Opraveno před nasazením.

## 2026-11-22: Vygumované místo patří objektu (`komiks-v3`)

- Ve verzi 2 byl tah gumy samostatný objekt na stránce. Když se pak objekt posunul, díra
  zůstala na původním místě a na novém místě se objevila vygumovaná část.
- Oprava: tah gumy se uložil do `x` každého zasaženého objektu a posouvá se s ním.
  Rychlý tah gumy má body daleko od sebe, proto se kontroluje celá dráha gumy
  (`touches_`), ne jen body.
- Ve verzi 4 to nahradilo rozdělování, ořez zůstal jen jako záloha.

## 2026-11-22: Guma po částech a zoom prsty (`komiks-v2`)

- Guma má dva režimy: „Část“ s tloušťkou 2, 5, 10 nebo 20 mm a „Celé tahy“ (původní
  chování). Režim se pamatuje v `localStorage`.
- Zoom a posun dvěma prsty. Se zapnutým „Jen Pencil“ posouvá i jeden prst. Rozsah zoomu
  je od celé stránky do 8×. Bod pod prsty zůstává na místě.
- **Proč plátno přes celou plochu a ne CSS zoom:** CSS zvětšení by kresbu rozmazalo
  a plátno velikosti zvětšené stránky by přesáhlo limit iOS (16,7 Mpx). Proto se při zoomu
  všechno znovu vykreslí z vektorů do plátna o velikosti obrazovky.
- Plátno už není úplně zamčené, jak chtělo původní zadání. Prohlížeč pořád nezoomuje celou
  stránku, zoom řídí appka sama (`touch-action: none`, `gesturestart` je zablokovaný).

## 2026-11-22: První verze (`komiks-v1`)

- Statický web bez build kroku a bez knihoven, GitHub Pages, data v IndexedDB.
  `navigator.storage.persist()` při startu.
- **Kresba jako objekty v mm**, ne jako pixely. Sedí při každé velikosti obrazovky
  i v exportu.
- **Neměnné objekty:** zpět/znovu jsou jen mělké kopie polí stránek. Je to levné
  a pokrývá to všechny akce včetně stránek.
- **Vlastní PDF writer místo jsPDF:** asi 40 řádků a žádný vendorovaný soubor. JPEG
  obrázky zůstávají jako Bloby, takže export 20 a víc stran nedrží všechno v paměti.
  Test: 25 stran A4 za 3,8 s, 1,3 MB.
- **Export v 200 DPI** se snížením DPI nad 15 Mpx a s uvolněním každého plátna hned po
  použití. Spolehlivost exportu je hlavní důvod, proč appka existuje.
- **Sdílení:** `navigator.share` se volá hned po přípravě souboru. Když iOS odmítne kvůli
  prošlému gestu, appka ukáže tlačítko „Sdílet soubor“ pro další klepnutí.
- **Service worker** kešuje všechny soubory, cache je verzovaná přes `VERSION`. Nová verze
  se načte až na seznamu projektů, nikdy uprostřed kreslení.
- Horní lišta zůstává v jednom řádku i na výšku (iPad mini 744 px), zkracuje se jen název.
- Text se kreslí v desetinásobné velikosti a zmenší se, protože Safari malá písma na plátně
  kreslí nepěkně.
- Vynechané: štětce, bubliny, vrstvy, otáčení. Zadání je nechtělo.
