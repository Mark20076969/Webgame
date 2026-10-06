TÚLÉLŐJÁTÉK – NETLIFY PROJEKT
=============================

Mappák
  public/                    a weboldal (index.html, game.js, ide jön a survival_models.glb)
  netlify/functions/game.mjs a szerveroldali rész: fiókok és mentések (Netlify Blobs)
  tools/build_model_library.py  Blenderben futtatva elkészíti a modelleket és a GLB-t
  netlify.toml, package.json beállítások

Lépések
  1. Blender: Scripting fül -> Open -> tools/build_model_library.py -> Run Script.
     Ez a home mappába menti a survival_models.glb fájlt.
  2. Másold a survival_models.glb fájlt a public/ mappába (az index.html mellé).
  3. A projekt gyökerében futtasd:   npm install
  4. Feltöltés Netlify-ra (Git összekötéssel, vagy a Netlify CLI-vel):
        npm install -g netlify-cli
        netlify login
        netlify deploy --prod
  5. Nyisd meg az oldalt: írj be egy nevet és jelszót (új név = új fiók), kattints kétszer.

Helyi tesztelés (a belépés is működik):   netlify dev

Irányítás
  WASD mozgás, Shift futás, Szóköz ugrás
  Bal egér: fa kidöntése / kő törése (3 ütés)
  Jobb egér: bogyó, gomba, rönk, kődarab felvétele
  1-9: hotbar rekesz kijelölése

Megjegyzések
  - A játék csak szerverről fut (http/https), file:// címen nem.
  - Elfelejtett jelszóra nincs visszaállítás.
  - A jelszavas próbálkozások száma nincs korlátozva (éles használat előtt érdemes pótolni).
