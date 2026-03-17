# Tur istoric Cluj (Local-first PWA)

Aplicație mobilă statică pentru un traseu istoric informativ în Cluj-Napoca, cu progres local și deblocare pe bază de proximitate GPS.

## Tehnologii

- HTML + CSS + JavaScript (fără framework)
- PWA: `manifest.webmanifest` + `sw.js`
- Date locale JSON: `data/stops.json`, `data/config.json`
- Persistență: `localStorage`
- Panou intern read-only: listare setări, locații, rezumat informativ și palate/clădiri indexate

## Structura proiectului

```text
.
├── assets/
│   └── icons/
├── data/
│   ├── config.json
│   └── stops.json
├── src/
│   ├── app.js
│   ├── geo.js
│   ├── storage.js
│   └── ui.js
├── styles/
│   └── main.css
├── index.html
├── manifest.webmanifest
└── sw.js
```

## Rulare locală pe macOS

1. Deschide terminalul în folderul proiectului.
2. Pornește un server static:

```bash
python3 -m http.server 8080
```

3. Deschide în browser:

```text
http://localhost:8080
```

## Instalare pe iPhone (Home Screen)

1. Asigură-te că iPhone-ul și Mac-ul sunt în aceeași rețea Wi-Fi.
2. Rulează serverul:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

3. Află IP-ul Mac-ului:

```bash
ipconfig getifaddr en0
```

4. Pe iPhone, deschide `http://IP_MAC:8080` în Safari.
5. Safari -> Share -> **Add to Home Screen**.

Notă: pe unele configurații iOS, geolocația pe HTTP poate fi restricționată. Dacă se întâmplă, activează `Test mode (fără deplasare)` din aplicație.

## Publicare pe GitHub Pages (HTTPS)

1. Creezi un repo nou pe GitHub (fără README inițial).
2. Inițializezi git local și faci push:

```bash
git init
git checkout -b main
git add .
git commit -m "Initial ClujTour PWA"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

3. În GitHub: `Settings -> Pages -> Build and deployment -> Source = GitHub Actions`.
4. Aștepți workflow-ul `Deploy Static Site to GitHub Pages`.
5. Linkul final va fi:

```text
https://<user>.github.io/<repo>/
```

## Cum editezi traseul fără cod

- Modifică doar `data/stops.json`:
  - textul fiecărui capitol informativ
  - imaginea fiecărei opriri (`image.src`, `image.alt`, `image.caption`)
  - coordonate
  - micro-povestea fiecărei opriri (`povesteScurta`, `ceVeziAici`, `firCronologic`)
  - rază de deblocare (`unlockRadiusMeters`)
  - lista `landmarks` pentru indexarea palatelor/clădirilor în datele traseului
- Modifică `data/config.json` pentru:
  - titlu
  - mesaj final
  - interval refresh GPS

## Story / Meniu

- În interfață ai un meniu hamburger cu 3 secțiuni: `Story`, `Hartă`, `Setări`.
- `Story` = experiența principală, cu hartă compactă fixă pe oprirea curentă + 3 blocuri narative: `Povestea locului`, `Ce vezi aici`, `Cum continuă povestea`.
- `Hartă` = OpenStreetMap overview cu markere numerotate pentru toate opririle.
- `Setări` = `Test mode (fără deplasare)` + `Reset traseu`.

## Test mode

- Activează `Test mode (fără deplasare)` din meniul `Setări`.
- Când e activ, poți parcurge story fără validare GPS.
- În secțiunea `Hartă`, popup-urile markerelor permit `Setează ca oprire curentă` doar în Test mode.

## Funcții incluse

- Ghid istoric pe capitole (fără quiz/provocări)
- Deblocare stop după proximitate GPS
- Fallback complet manual
- Butoane Story: `Reveal story`, `I found it`, `Navighează la următorul punct`, `Next stop`
- Meniu hamburger vertical simplu (`Story`, `Hartă`, `Setări`)
- Progres salvat local
- Ecran final la Cetățuia
- Service worker pentru funcționare offline după prima încărcare
