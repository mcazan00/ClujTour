# Cluj cu Noi Doi (Local-first PWA)

Aplicație mobilă statică pentru un traseu narativ interactiv în Cluj-Napoca, cu progres local, provocări și deblocare pe bază de proximitate GPS.

## Tehnologii

- HTML + CSS + JavaScript (fără framework)
- PWA: `manifest.webmanifest` + `sw.js`
- Date locale JSON: `data/stops.json`, `data/config.json`
- Persistență: `localStorage`
- Panou intern read-only: listare setări, locații și palate/clădiri indexate

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

Notă: pe unele configurații iOS, geolocația pe HTTP poate fi restricționată. Dacă se întâmplă, activează `Mod Manual (fără GPS)` din aplicație.

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
  - textul fiecărui capitol
  - coordonate
  - provocări și hint-uri
  - rază de deblocare (`unlockRadiusMeters`)
  - lista `landmarks` pentru indexarea palatelor/clădirilor în Admin
- Modifică `data/config.json` pentru:
  - titlu/subtitlu
  - mesaj final
  - interval refresh GPS
  - etichete pentru view-ul Admin (`config.admin`)

## Story / Admin

- În interfață ai comutator vizibil `Story | Admin`.
- `Story` = experiența de traseu.
- `Admin` = doar listare date locale, fără editare din UI.

## Funcții incluse

- Poveste pe capitole
- Deblocare stop după proximitate GPS
- Fallback complet manual
- Challenge cu variante (quiz)
- Butoane cerute: `Reveal story`, `I found it`, `Give me a hint`, `Next stop`
- Mod `Date` + mod `Istorie+`
- View `Admin` read-only (setări, locații, palate/clădiri deduplicate)
- Progres salvat local
- Ecran final la Cetățuie
- Service worker pentru funcționare offline după prima încărcare
