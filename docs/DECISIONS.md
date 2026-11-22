# Rozhodnutí a historie změn

Nejnovější nahoře. Ke každé změně: co, proč a co zůstává otevřené.

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
