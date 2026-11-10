# ParkSmart – Asistent Parcări cu Plată

Aplicație web pentru găsirea și rezervarea locurilor de parcare cu plată, afișate pe o hartă interactivă. Șoferii pot căuta parcări, vedea disponibilitatea în timp real și rezerva un loc pentru 30 de minute. Administratorii se autentifică și pot adăuga sau șterge parcări și pot consulta un dashboard financiar.

Proiectul este format dintr-un **backend ASP.NET Core 8 (Web API)** care servește și **frontend-ul static** (HTML/CSS/JS) din `wwwroot`. Nu există pas de build pentru frontend.

---

## Cuprins

1. [Funcționalități](#funcționalități)
2. [Tehnologii](#tehnologii)
3. [Structura proiectului](#structura-proiectului)
4. [Cerințe](#cerințe)
5. [Rulare](#rulare)
6. [Cont de administrator](#cont-de-administrator)
7. [Referință API](#referință-api)
8. [Model de date](#model-de-date)
9. [Cum funcționează rezervările](#cum-funcționează-rezervările)
10. [Frontend – detalii](#frontend--detalii)
11. [Configurare](#configurare)
12. [Baza de date și migrări](#baza-de-date-și-migrări)
13. [Securitate – ce trebuie știut](#securitate--ce-trebuie-știut)
14. [Probleme frecvente](#probleme-frecvente)
15. [Idei de dezvoltare](#idei-de-dezvoltare)

---

## Funcționalități

### Pentru șoferi (fără cont)
- **Hartă interactivă** (Leaflet + OpenStreetMap) cu pini colorați după disponibilitate: verde (disponibil), portocaliu (sub 50% locuri libere), roșu (plin). Numărul de pe pin arată locurile libere.
- **Listă de parcări** cu bară de ocupare, preț pe oră, adresă și etichetă de stare.
- **Căutare** după nume sau adresă și **sortare** după preț (crescător/descrescător), locuri libere sau distanță.
- **Filtre rapide:** Toate, Cu locuri, Ieftine (până la 6 RON/h), Favorite.
- **Favorite:** marchezi parcările preferate cu ♡ (salvate în browser).
- **Lângă mine:** butonul 📍 cere locația, o marchează pe hartă și afișează distanța până la fiecare parcare.
- **Rezervare:** introduci numărul de înmatriculare și durata estimată a parcării; vezi costul estimat. Locul este ținut 30 de minute, cu cronometru.
- **Rezervările mele:** panou cu rezervările active, cronometru și buton „Eliberează". La expirare, locul se eliberează automat.
- **Navigare** către parcare prin Google Maps.
- **Temă luminoasă / întunecată**, salvată în browser, cu hartă întunecată în tema dark.
- **Actualizare automată** a datelor la fiecare 15 secunde.
- **Design responsive** (pe telefon harta stă sus, lista jos).

### Pentru administratori
- **Autentificare** cu email și parolă (JWT).
- **Adăugare parcare:** click pe hartă, apoi completezi numele, adresa, numărul de locuri și prețul.
- **Ștergere parcare** cu confirmare.
- **Dashboard financiar (Statistici):** încasări estimate pe parcare, indicatori (număr de parcări, locuri totale, grad de ocupare, parcări pline) și grafic de ocupare.
- Sesiunea se păstrează după reîncărcarea paginii; un token expirat te deconectează automat.

---

## Tehnologii

| Zonă | Tehnologie |
|---|---|
| Backend | ASP.NET Core 8 Web API, C# |
| Bază de date | SQLite prin Entity Framework Core 8 |
| Autentificare | ASP.NET Core Identity + JWT Bearer |
| Documentare API | Swagger (Swashbuckle) – doar în Development |
| Frontend | HTML, CSS, JavaScript vanilla (fără framework) |
| Hartă | Leaflet 1.9.4, plăci OpenStreetMap |
| Grafice | Chart.js |
| Font | Inter (Google Fonts) |

Pachete NuGet: `Microsoft.AspNetCore.Authentication.JwtBearer`, `Microsoft.AspNetCore.Identity.EntityFrameworkCore`, `Microsoft.EntityFrameworkCore.Sqlite`, `Microsoft.EntityFrameworkCore.Design`, `Swashbuckle.AspNetCore`.

Leaflet, Chart.js și fonturile se încarcă de pe CDN, deci frontend-ul are nevoie de conexiune la internet.

---

## Structura proiectului

```
ParkingProject/
├── README.md
└── ParkingApi/
    ├── Program.cs                 # configurare servicii, JWT, Identity, seed admin, pipeline
    ├── ParkingApi.csproj
    ├── appsettings.json           # setări JWT (Issuer, Audience, Key)
    ├── parkings.db                # baza de date SQLite
    ├── Controllers/
    │   ├── AuthController.cs      # POST /api/auth/login
    │   └── ParkingsController.cs  # CRUD parcări + rezervare/eliberare
    ├── Models/
    │   └── Parking.cs             # entitatea Parking
    ├── Data/
    │   └── ParkingContext.cs      # DbContext (IdentityDbContext + C_Parkings)
    ├── Migrations/                # migrări EF Core
    ├── Properties/launchSettings.json
    ├── ParkingApi.http            # exemple de cereri HTTP
    └── wwwroot/                   # frontend static
        ├── index.html             # structura paginii și modalele
        ├── style.css              # stiluri, teme, responsive
        └── script.js              # toată logica clientului
```

---

## Cerințe

- **.NET SDK 8.0** (testat cu 8.0.427)
- Un browser modern (Chrome, Edge, Firefox)
- Conexiune la internet (hartă, grafice, fonturi)

---

## Rulare

Din folderul `ParkingApi`:

```bash
dotnet run --launch-profile https
```

Apoi deschide **https://localhost:7222**.

`Program.cs` setează explicit adresele `http://localhost:5222` și `https://localhost:7222`, iar `UseHttpsRedirection` redirecționează HTTP către HTTPS. Practic, aplicația se folosește pe adresa HTTPS.

### Certificatul HTTPS de dezvoltare

La prima rulare browserul poate afișa „Not secure". Se rezolvă o singură dată:

```bash
dotnet dev-certs https --trust
```

Acceptă dialogul Windows, apoi repornește complet browserul. Verificare: `dotnet dev-certs https --check --trust`.

### Alte adrese utile
- **Swagger UI:** https://localhost:7222/swagger (doar în Development)
- **API:** https://localhost:7222/api/parkings

La prima pornire baza de date poate fi goală. Adaugă parcări ca administrator (click pe hartă) sau prin API.

---

## Cont de administrator

La pornire, `Program.cs` creează rolul `Admin` și un utilizator administrator, dacă nu există deja:

- **Email:** `cabaandrei@gmail.com`
- **Parolă:** `Andrei123!`

Politica de parole din Identity cere minimum 6 caractere, fără alte restricții.

---

## Referință API

Prefix: `/api`. Datele circulă ca JSON.

### Autentificare

| Metodă | Rută | Descriere |
|---|---|---|
| POST | `/api/auth/login` | Autentificare; întoarce `{ token, expiration }` |

Corp cerere:
```json
{ "email": "cabaandrei@gmail.com", "password": "Andrei123!" }
```
- `200` – token JWT valabil 3 ore (conține rolurile utilizatorului).
- `401` – credențiale greșite sau utilizatorul nu are rolul `Admin`.

### Parcări

| Metodă | Rută | Descriere | Răspunsuri |
|---|---|---|---|
| GET | `/api/parkings` | Lista tuturor parcărilor | `200` |
| POST | `/api/parkings` | Adaugă o parcare | `201` |
| DELETE | `/api/parkings/{id}` | Șterge o parcare | `204`, `404` |
| PUT | `/api/parkings/{id}/reserve` | Rezervă un loc | `200`, `400` (plină), `404` |
| PUT | `/api/parkings/{id}/release` | Eliberează un loc | `200`, `404` |

Exemplu `POST /api/parkings`:
```json
{
  "name": "Parcare Piața Unirii",
  "address": "Piața Unirii 1, București",
  "latitude": 44.4268,
  "longitude": 26.1025,
  "totalSpots": 120,
  "availableSpots": 85,
  "pricePerHour": 8
}
```

Pentru rutele protejate, frontend-ul trimite antetul `Authorization: Bearer <token>`.

---

## Model de date

Entitatea `Parking` (tabela `C_Parkings`):

| Câmp | Tip | Descriere |
|---|---|---|
| `Id` | int | Cheie primară |
| `Name` | string | Numele parcării |
| `Address` | string | Adresa |
| `Latitude` / `Longitude` | double | Coordonate |
| `TotalSpots` | int | Număr total de locuri |
| `AvailableSpots` | int | Locuri libere |
| `PricePerHour` | double | Preț în RON pe oră |
| `ReservationTime` | DateTime? | Ora ultimei rezervări (UTC) sau `null` |

Utilizatorii și rolurile sunt în tabelele standard ASP.NET Identity (`AspNetUsers`, `AspNetRoles` etc.), în aceeași bază de date.

---

## Cum funcționează rezervările

Backend-ul păstrează o singură `ReservationTime` pentru fiecare parcare (ora ultimei rezervări) și un contor `AvailableSpots`. Nu există tabelă cu rezervări pe utilizator și nu se eliberează nimic automat.

Frontend-ul completează aceste lipsuri:

1. La rezervare, serverul scade `AvailableSpots` cu 1 și setează `ReservationTime`.
2. Browserul salvează rezervarea ta (parcare, număr de înmatriculare, ora) în `localStorage`.
3. Cronometrul de 30 de minute se calculează local.
4. La expirare (sau la apăsarea „Eliberează") browserul apelează `PUT /api/parkings/{id}/release`, care crește `AvailableSpots` la loc.

Consecințe:
- Rezervările sunt legate de **browserul** care le-a făcut, nu de un cont.
- Dacă închizi browserul, rezervarea expiră abia când redeschizi aplicația.
- Serverul trimite uneori `ReservationTime` fără sufixul `Z`; frontend-ul îl tratează ca UTC.

---

## Frontend – detalii

Toată logica este în `wwwroot/script.js`, organizată pe secțiuni: stare, hartă, utilitare, rezervări, date, randare, rezervare, ștergere, adăugare, admin/login, statistici.

**Stocare locală (`localStorage`):**

| Cheie | Conținut |
|---|---|
| `jwt_token` | Token-ul de administrator |
| `my_reservations` | Rezervările active din acest browser |
| `favorites` | ID-urile parcărilor favorite |
| `theme` | `light` sau `dark` |

**Alte detalii:**
- Textele din baza de date sunt escapate înainte de afișare (protecție împotriva injectării de HTML).
- Evenimentele de pe carduri folosesc delegare, fără `onclick` în HTML-ul generat.
- Pinii de pe hartă se actualizează în loc, fără să se recreeze la fiecare reîmprospătare.
- Tema se controlează prin atributul `data-theme` și variabile CSS definite în `:root`.

---

## Configurare

`appsettings.json`:

```json
"Jwt": {
  "Issuer": "ParkingApi",
  "Audience": "ParkingClient",
  "Key": "<cheie secretă de minim 32 de caractere>"
}
```

Dacă `Jwt:Key` lipsește, codul folosește o cheie implicită scrisă în `Program.cs` și `AuthController.cs`. Baza de date este `parkings.db` în folderul proiectului (`Data Source=parkings.db`).

---

## Baza de date și migrări

Se folosesc migrări Entity Framework Core (folderul `Migrations`). Comenzi utile, rulate din `ParkingApi`:

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add NumeMigrare
dotnet ef database update
```

`Program.cs` nu aplică automat migrările la pornire. Dacă pornești cu o bază de date nouă, rulează mai întâi `dotnet ef database update`.

---

## Securitate – ce trebuie știut

Proiectul este potrivit pentru dezvoltare și demonstrații. Înainte de a-l publica pe internet, rezolvă următoarele:

1. **Rutele de administrare nu sunt protejate.** În `ParkingsController.cs`, atributele `[Authorize(Roles = "Admin")]` de la `POST` și `DELETE` sunt comentate. Oricine poate adăuga sau șterge parcări direct prin API, chiar dacă interfața le arată doar adminului. Decomentează-le pentru a impune autentificarea.
2. **Credențiale în cod.** Parola administratorului este scrisă în `Program.cs`, iar cheia JWT în `appsettings.json`. Mută-le în variabile de mediu sau User Secrets și schimbă parola.
3. **`release` și `reserve` sunt publice**, fără limită de cereri; oricine poate elibera sau ocupa locuri.
4. **Certificat HTTPS real** pentru producție (certificatul de dezvoltare funcționează doar local).
5. Pentru producție restrânge `AllowedHosts` și dezactivează Swagger (acum e activ doar în Development).

---

## Probleme frecvente

| Problemă | Soluție |
|---|---|
| „Not secure" / `ERR_CERT_AUTHORITY_INVALID` | `dotnet dev-certs https --trust`, apoi repornește browserul |
| Pagina se redirecționează spre `https://localhost:7222` | Comportament normal (`UseHttpsRedirection`); folosește adresa HTTPS |
| Harta arată „API KEY REQUIRED" | Fișier `script.js` vechi în cache; Ctrl+Shift+R |
| Nu apare nicio parcare | Baza de date e goală; adaugă parcări ca admin (click pe hartă) |
| Login eșuat | Email exact `cabaandrei@gmail.com`, parolă `Andrei123!`; `admin@parking.com` din formular este doar exemplu |
| `Failed to bind to address` | Portul 5222/7222 e ocupat de o altă instanță; oprește-o |
| Harta nu se încarcă | Verifică conexiunea la internet (plăcile vin de pe OpenStreetMap) |
| Geolocația nu merge | Permite accesul la locație în browser; funcționează pe `localhost`/HTTPS |

---

## Idei de dezvoltare

- Tabelă de rezervări legată de utilizatori, cu expirare pe server (job de fundal).
- Conturi pentru șoferi și istoric de rezervări.
- Editarea parcărilor (endpoint `PUT`) și tarife pe intervale orare.
- Plată online integrată.
- Grupare de pini (clustering) pentru multe parcări.
- Teste automate pentru API și pentru logica din frontend.
- Mutarea secretelor în configurare sigură și activarea `[Authorize]`.
