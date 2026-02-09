# Sundhed.dk Navigation Guide

## Browser Setup

- Must use `--headed` flag so the user can interact with MitID login
- Must use `--persistent` flag to preserve login session across commands
- Browser: Chrome

```bash
playwright-cli open https://sundhed.dk --browser=chrome --headed --persistent
```

## Login Flow

### Step 1: Dismiss cookie banner

The landing page shows a cookie consent banner. Decline it.

- Button: "Nej tak"

```bash
playwright-cli snapshot
# Find the "Nej tak" button ref in the snapshot
playwright-cli click <ref>
```

### Step 2: Click "Log på"

Top-right corner of the page.

- Button: "Log på"

```bash
playwright-cli snapshot
# Find the "Log på" button ref
playwright-cli click <ref>
```

### Step 3: Choose "Borger" (citizen) login

A dialog appears with two options: "Borger" and "Fagperson". Choose Borger.

- Button: "Borger" inside the dialog

```bash
playwright-cli snapshot
# Find the "Borger" button inside the dialog
playwright-cli click <ref>
```

### Step 4: MitID authentication

The browser redirects to `https://nemlog-in.mitid.dk/login/mitid`.

1. Click "FORTSÆT TIL LOGIN"
2. Enter MitID user ID
3. Approve on MitID app

**This step requires manual user interaction** - credentials cannot be entered programmatically.

### Step 5: After login

After successful MitID authentication, the browser redirects back to `https://www.sundhed.dk/borger/min-side/` (Min Side dashboard).

## Post-Login: Min Side Dashboard

URL: `https://www.sundhed.dk/borger/min-side/`

The dashboard has a **person selector** dropdown that allows switching between the logged-in user and family members (children under 15, people who granted fuldmagt/power of attorney).

### Person Selector API

```
GET /app/personvaelgerportal/api/v1/GetPersonSelection
```

Returns: `{ personDelegationData: [...], selectedPerson: {...} }` with CPR, name, and relationType for each person.

---

## Health Data Sections

### 1. Medicin (Medication)

**Page URL:** `/borger/min-side/min-sundhedsjournal/medicinkortet/`
**Redirects to:** `/borger/min-side/min-sundhedsjournal/medicinkortet/medicinkort/aktuel?orderBy=StartDate&sortBy=desc`

**App base path:** `/app/medicinkort2borger/api/v1/`

#### Tabs on page
- Medicinkortet (active medications) - default tab
- Recepter (prescriptions)
- Receptfornyelse (prescription renewal)
- Status for medicinkortet
- Øvrige (other)

#### Key API endpoints

**Active medications (current medicine card):**
```
GET /app/medicinkort2borger/api/v1/ordinations/?orderBy=StartDate&sortBy=desc&status=active
```
Returns array of ordinations. Each item:
```json
{
  "OrdinationId": "305286822",
  "StartDate": "2025-12-11T00:00:00",
  "EndDate": null,
  "DrugMedication": "Ovison (Mometason)",
  "Form": "creme",
  "Strength": "1 mg/g",
  "Dosage": "1 påsmøring daglig.\nBemærk: i 2 uger, så 2 gange ugentligt",
  "Cause": "mod eksem",
  "ActiveSubstance": "Mometason",
  "Status": { "EnumStr": "Active" },
  "IsVkaDrug": false,
  "IsDoseDispensing": false
}
```

**Ended/stopped medications:**
```
GET /app/medicinkort2borger/api/v1/ordinations/?orderBy=EndDate&sortBy=desc&status=ended
```
Triggered by checking "Vis afsluttet medicin" checkbox. Shows medications from the last 2 years.

**Overview counts:**
```
GET /app/medicinkort2borger/api/v1/ordinations/overview/
```
Returns: `{ NumberOfActive, NumberOfTemporarilyStopped, NumberOfStopped, ... }`

**Open prescriptions (connected to ordination):**
```
GET /app/medicinkort2borger/api/v1/prescriptions/?connected=true&status=open
```
Each item:
```json
{
  "OrdinationId": "305286822",
  "PrescriptionId": "503156892812104",
  "Drug": "Ovison (Mometason)",
  "Form": "creme",
  "Strength": "1 mg/g",
  "Dosage": "...",
  "Status": "åben",
  "RemainingUnits": "200 g",
  "ValidFromDate": "2025-12-11T00:00:00",
  "ValidToDate": "2027-12-11T00:00:00"
}
```

**Unconnected prescriptions:**
```
GET /app/medicinkort2borger/api/v1/prescriptions/?connected=false&status=open
```

**Prescription overview:**
```
GET /app/medicinkort2borger/api/v1/prescriptions/overview/
```
Returns: `{ NumTotal, NumOpen, NumClosed, NumFuture, NumUnconnected, NumDispensings }`

**Identity/access:**
```
GET /app/medicinkort2borger/api/v1/identity/selectedname
GET /app/medicinkort2borger/api/v1/identity/hasWriteAccess
```

#### Sorting options
- `orderBy`: StartDate, EndDate
- `sortBy`: desc, asc
- Columns are clickable for sort: Startdato, Lægemiddel/form/styrke, Årsag

#### Filters/settings
- Checkbox: "Vis afsluttet medicin" - toggles ended medications view
- Person selector dropdown - switch between self and family members
- PDF export button: "Udskriftvenlig version (PDF)"

---

### 2. Prøvesvar (Lab Results)

**Page URL:** `/borger/min-side/min-sundhedsjournal/laboratoriesvar/`

**App base path:** `/api/labsvar/`

#### Key API endpoints

**Lab results overview (main data):**
```
GET /api/labsvar/svaroversigt?fra=2025-08-09T00:00:00&til=2026-02-09T23:59:59&omraade=Alle&
```
Returns grouped lab results by category (Patologi, Mikrobiologi, Klinisk biokemi, etc.) with test values in a grid format.

Response structure:
```json
{
  "Svaroversigt": {
    "Analysetypegrupper": [
      { "Id": "Patologi", "Laboratorieomraade": "Patologi", "Titel": "Patologi" },
      { "Id": "5", "Laboratorieomraade": "KliniskBiokemi", "Titel": "Hæmatologi" },
      { "Id": "10", "Laboratorieomraade": "KliniskBiokemi", "Titel": "Væske- og elektrolytbalance" },
      { "Id": "25", "Laboratorieomraade": "KliniskBiokemi", "Titel": "Organmarkører" },
      { "Id": "45", "Laboratorieomraade": "KliniskBiokemi", "Titel": "Immunologi og inflammation" },
      { "Id": "65", "Laboratorieomraade": "KliniskBiokemi", "Titel": "Sporstoffer og vitaminer" }
    ]
  }
}
```

**Sort preference:**
```
GET /api/labsvar/sortering/valgtsortering
```

**Admin messages:**
```
GET /api/labsvar/adminbeskeder
```

**Saved filters:**
```
GET /api/labsvar/filter
```

**Selected person:**
```
GET /api/personvaelger/valgtperson
```

#### Filters/settings
- **Date range:** "Dato fra" / "Dato til" fields (format: dd.mm.åååå). Default: 6 months back from today.
- **Laboratorieområde:** Dropdown with options: Alle (default), Patologi, Mikrobiologi, Klinisk biokemi og immunologi
- **Søg button:** Applies the filters
- **Toggle:** "Vis filtre" to show/hide filter panel
- **View modes:** Dato view (default), Skema view
- **Buttons:** Udskriv alt (print all), Symbolforklaring, Vælg udskrift, Grafvisning (graph view)

#### Important: Extending date range
Default is only 6 months. To see older results, change the "Dato fra" field to an earlier date and click "Søg". The API accepts any date range.

---

### 3. Journaler (Health Records)

**Page URL:** `/borger/min-side/min-sundhedsjournal/journal-fra-sygehus/`

**App base path:** `/app/ejournalportalborger/api/ejournal/`

#### Key API endpoints

**Journal entries (paginated):**
```
GET /app/ejournalportalborger/api/ejournal/forloebsoversigt?Side=1&Sortering=updated&SortDesc=true&ItemsPerPage=10
```
Returns:
```json
{
  "NumberOfForloeb": 17,
  "HarSpaerretForloeb": true,
  "Forloeb": [
    {
      "AntalEpikriser": 1,
      "AntalNotater": 0,
      "AntalDiagnoser": 1,
      "Sektor": "Speciallæge",
      "SygehusNavn": "Speciallægepraksis - Dermatologi-venerologi",
      "AfdelingNavn": "Danielsen, Straus..."
    }
  ]
}
```

**Hospital/department filter options:**
```
GET /app/ejournalportalborger/api/ejournal/filtervalg
```
Returns list of hospitals (Sygehuse) with their departments (Afdelinger), each with a name and code.

**Date range:**
```
GET /app/ejournalportalborger/api/ejournal/datofiltrering
```
Returns: `{ FraDato: "1999-12-02T23:00:00Z", TilDato: "2026-02-09T..." }` - the full available date range.

**Value override check:**
```
GET /app/ejournalportalborger/api/ejournal/vaerdispringcheck
```

#### Filters/settings
- **Pagination:** `Side` (page number), `ItemsPerPage` (default 10)
- **Sorting:** `Sortering=updated`, `SortDesc=true/false`
- **Hospital filter:** Filter by specific hospital/department using codes from filtervalg
- **Date range:** Full history available (from 1999 to present)

---

### 4. Røntgen og scanning (X-ray and Scans)

**Page URL:** `/borger/min-side/min-sundhedsjournal/billedbeskrivelser/`

**App base path:** `/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/`

#### Key API endpoints

**Image descriptions (paginated):**
```
GET /app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/?Fra=2012-01-01&Til=2026-02-09&Direction=desc&SortColumn=1&ItemsPerPage=10&CurrentPage=1
```
Returns:
```json
{
  "Svar": [
    {
      "Id": "REGH13879168...",
      "UdgivelsesDato": "2019-03-19T04:13:00+01:00",
      "Navn": "RU knæ, højre",
      "Producent": { "Navn": "Region Hovedstaden" }
    }
  ]
}
```

**Config:**
```
GET /app/billedbeskrivelserborger/api/v1/billedbeskrivelser/config/
```
Returns: `{ MaxYearsToFetch: null }` (no limit on history)

#### Filters/settings
- **Date range:** `Fra` / `Til` parameters
- **Pagination:** `CurrentPage`, `ItemsPerPage`
- **Sorting:** `Direction` (desc/asc), `SortColumn`

---

### 5. Vaccinationer (Vaccinations)

**Page URL:** `/borger/min-side/min-sundhedsjournal/vaccinationer/`

**App base path:** `/app/vaccination/api/v1/`

#### Key API endpoints

**Vaccination list:**
```
GET /app/vaccination/api/v1/effectuatedvaccinations/?onlyDeletedVaccines=false&orderBy=desc&sortBy=EffectuatedDateTime
```
Returns array:
```json
[
  {
    "VaccinationIdentifier": 32190068532,
    "EffectuatedDateTime": "2023-10-03T00:00:00+02:00",
    "Vaccine": "Gardasil 9 mod Papillomavirus",
    "EffectuatedBy": "Lægerne Nyberg, Hoppe og Rosenstand",
    "NegativeConsent": false,
    "ActiveStatus": true,
    "IsEditable": false,
    "SelfCreated": false
  }
]
```

**Overview counts:**
```
GET /app/vaccination/api/v1/overview
```
Returns: `{ NumberOfEffectuatedVaccinations, NumberOfPlannedVaccinations, NumberOfOverdueVaccinations, ... }`

**Deleted vaccines:**
```
GET /app/vaccination/api/v1/effectuatedvaccinations/?onlyDeletedVaccines=true&orderBy=desc&sortBy=EffectuatedDateTime
```

#### Sorting
- `orderBy`: desc/asc
- `sortBy`: EffectuatedDateTime

---

### 6. Aftaler (Appointments)

**Page URL:** `/borger/min-side/min-sundhedsjournal/aftaler/`

**App base path:** `/app/aftalerborger/api/v1/`

#### Key API endpoints

**Appointments list:**
```
GET /app/aftalerborger/api/v1/aftaler/cpr
```
Returns:
```json
{
  "appointments": [
    {
      "documentId": "9c8ddaee-...",
      "title": "Aftale med den praktiserende læge",
      "startTime": "2026-04-07T08:45:00+02:00",
      "startTimeDetailed": {
        "weekNo": 15,
        "timeFormatted": "07.04.2026 - kl. 08:45",
        "dateFormatted": "07.04.2026"
      },
      "endTime": "2026-04-07T09:00:00+02:00"
    }
  ]
}
```

---

### 7. Diagnoser (Diagnoses)

**Page URL:** `/borger/min-side/min-sundhedsjournal/diagnoser/`

**App base path:** `/app/diagnoserborger/api/v1/`

#### Key API endpoints

**Diagnoses list:**
```
GET /app/diagnoserborger/api/v1/diagnoser
```
Returns:
```json
{
  "isLiveData": false,
  "organization": "Lægehuset Amagerport",
  "diagnoser": []
}
```

---

### 8. Henvisninger (Referrals)

**Page URL:** `/borger/min-side/min-sundhedsjournal/henvisninger/`

**App base path:** `/app/DenNationaleHenvisningsformidling/api/v1/`

#### Key API endpoints

**Referrals list:**
```
GET /app/DenNationaleHenvisningsformidling/api/v1/henvisninger
```
Returns:
```json
{
  "aktiveHenvisninger": [
    {
      "henvisningsDato": "2025-11-10T12:24:36.259Z",
      "udloebsDato": "2026-05-11T00:00:00Z",
      "henvisendeKlinik": "Lægehuset Amagerport, Christina Hoppe",
      "specialeNavn": "Dermatologi-venerologi",
      "detaljer": {
        "henvisningsType": "Speciallægehenvisning",
        "henvisningsKode": "Ref06"
      }
    }
  ]
}
```

---

### 9. Hjemmemålinger (Home Measurements)

**Page URL:** `/borger/min-side/min-sundhedsjournal/hjemmemaalinger/`

**App base path:** `/app/hjemmemaalingerborger/api/v1/`

#### Key API endpoints

**Measurements list:**
```
GET /app/hjemmemaalingerborger/api/v1/maalinger
```
Returns: `{ documents: [], groupings: [], hasErrors: false }`

---

### 10. Oplysninger om egen læge (GP Information)

**Page URL:** `/borger/min-side/min-sundhedsjournal/min-laege/`

**App base path:** `/api/` (uses core API)

#### Key API endpoints

**GP organization ID:**
```
GET /api/minlaegeorganization/
```
Returns: `{ OrganizationId: 54917 }`

**Full GP details:**
```
GET /api/core/organisation/54917
```
Returns full organization details:
```json
{
  "Organizations": [
    {
      "Name": "Lægehuset Amagerport",
      "InformationsUnderkategori": "Praktiserende læge",
      "Street": "Under Elmene",
      "HouseNumberFrom": "11",
      "ZipCode": 2300,
      "City": "København S"
    }
  ]
}
```

**E-services links:**
```
GET /api/eserviceslink/54917
```
Returns: `{ ConsultationUrl, PrescriptionRenewalUrl }`

---

### 11. Forløbsplaner (Care Plans)

**Page URL:** `/borger/min-side/min-sundhedsjournal/planer/`

**App base path:** `/app/planerportalborger/api/v1/`

#### Key API endpoints

**Plans list:**
```
GET /app/planerportalborger/api/v1/plans/
```
Returns: `{ plans: [], isLiveData: true, hasConsentData: false }`

---

## All Page URLs

| Section | URL | Data API |
|---------|-----|----------|
| Min Side (dashboard) | `/borger/min-side/` | - |
| Medicin | `/borger/min-side/min-sundhedsjournal/medicinkortet/` | `/app/medicinkort2borger/api/v1/` |
| Prøvesvar | `/borger/min-side/min-sundhedsjournal/laboratoriesvar/` | `/api/labsvar/` |
| Journaler | `/borger/min-side/min-sundhedsjournal/journal-fra-sygehus/` | `/app/ejournalportalborger/api/ejournal/` |
| Røntgen og scanning | `/borger/min-side/min-sundhedsjournal/billedbeskrivelser/` | `/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/` |
| Vaccinationer | `/borger/min-side/min-sundhedsjournal/vaccinationer/` | `/app/vaccination/api/v1/` |
| Aftaler | `/borger/min-side/min-sundhedsjournal/aftaler/` | `/app/aftalerborger/api/v1/` |
| Diagnoser | `/borger/min-side/min-sundhedsjournal/diagnoser/` | `/app/diagnoserborger/api/v1/` |
| Henvisninger | `/borger/min-side/min-sundhedsjournal/henvisninger/` | `/app/DenNationaleHenvisningsformidling/api/v1/` |
| Hjemmemålinger | `/borger/min-side/min-sundhedsjournal/hjemmemaalinger/` | `/app/hjemmemaalingerborger/api/v1/` |
| Oplysninger om egen læge | `/borger/min-side/min-sundhedsjournal/min-laege/` | `/api/minlaegeorganization/` + `/api/core/organisation/<id>` |
| Forløbsplaner | `/borger/min-side/min-sundhedsjournal/planer/` | `/app/planerportalborger/api/v1/` |

## Intercepting and Saving JSON Data

The APIs require authentication cookies from the browser session. You cannot call them directly with `fetch` from outside the page context. Instead, use Playwright's response interception.

### Pattern: Intercept and return JSON

```javascript
// Intercept API responses and return them
playwright-cli run-code "async page => {
  const responses = [];
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/') && response.headers()['content-type']?.includes('json')) {
      try {
        const body = await response.json();
        responses.push({ url, body });
      } catch(e) {}
    }
  });
  await page.goto('<TARGET_URL>');
  await page.waitForTimeout(5000);
  return responses.filter(r => r.url.includes('<API_KEYWORD>'));
}"
```

### Pattern: Intercept and save JSON to file

Since `require('fs')` and dynamic `import()` are not available in the run-code context, use a browser download trick. The file gets saved to `.playwright-cli/<filename>`.

```javascript
playwright-cli run-code "async page => {
  const responses = [];
  const handler = async response => {
    const rUrl = response.url();
    if (rUrl.includes('/api/') && rUrl.includes('<API_KEYWORD>') && response.headers()['content-type']?.includes('json')) {
      try {
        const body = await response.json();
        responses.push({ url: rUrl, status: response.status(), body });
      } catch(e) {}
    }
  };
  page.on('response', handler);
  await page.goto('<TARGET_URL>');
  await page.waitForTimeout(6000);
  page.removeListener('response', handler);

  // Save to file via browser download (lands in .playwright-cli/)
  const json = JSON.stringify(responses, null, 2);
  await page.evaluate((opts) => {
    const blob = new Blob([opts.data], {type: 'application/json'});
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = opts.fn;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(u);
  }, { data: json, fn: '<FILENAME>.json' });
  await page.waitForTimeout(1000);
  return { count: responses.length };
}"
```

**Important notes on saving JSON:**
- `page.evaluate()` can only accept a single argument object (wrap multiple args in `{ data, fn }`)
- Downloads land in `.playwright-cli/` directory
- Copy them to `data/sundhed-dk/` with `cp .playwright-cli/<file> data/sundhed-dk/<file>`
- `require()`, `Buffer`, and dynamic `import()` are NOT available in run-code context

### Data Storage

All personal health data is stored in `data/sundhed-dk/`. This directory is gitignored and must never be committed. Downloads from the browser land in `.playwright-cli/` and should be copied to `data/sundhed-dk/`.

```bash
# After downloading via browser trick, move to data directory:
cp .playwright-cli/<filename>.json data/sundhed-dk/<filename>.json
```

| File | Section |
|------|---------|
| `data/sundhed-dk/medicin.json` | Medications, prescriptions, identity |
| `data/sundhed-dk/proevesvar.json` | Lab results |
| `data/sundhed-dk/journaler.json` | Health records/journals |
| `data/sundhed-dk/roentgen.json` | X-ray and scan descriptions |
| `data/sundhed-dk/vaccinationer.json` | Vaccination records |
| `data/sundhed-dk/aftaler.json` | Appointments |
| `data/sundhed-dk/diagnoser.json` | Diagnoses |
| `data/sundhed-dk/henvisninger.json` | Referrals |
| `data/sundhed-dk/hjemmemaalinger.json` | Home measurements |
| `data/sundhed-dk/egen-laege.json` | GP information |
| `data/sundhed-dk/forloebsplaner.json` | Care plans |

### Parser Scripts

Each JSON file has a corresponding parser bundled with the sundhed-dk skill that converts raw API JSON into clean, agent-readable markdown text.

```bash
# Usage: pipe the raw JSON through the parser
node .claude/skills/sundhed-dk/parsers/parse-medicin.js < data/sundhed-dk/medicin.json
node .claude/skills/sundhed-dk/parsers/parse-proevesvar.js < data/sundhed-dk/proevesvar.json
node .claude/skills/sundhed-dk/parsers/parse-journaler.js < data/sundhed-dk/journaler.json
node .claude/skills/sundhed-dk/parsers/parse-vaccinationer.js < data/sundhed-dk/vaccinationer.json
node .claude/skills/sundhed-dk/parsers/parse-aftaler.js < data/sundhed-dk/aftaler.json
node .claude/skills/sundhed-dk/parsers/parse-henvisninger.js < data/sundhed-dk/henvisninger.json
node .claude/skills/sundhed-dk/parsers/parse-egen-laege.js < data/sundhed-dk/egen-laege.json
node .claude/skills/sundhed-dk/parsers/parse-roentgen.js < data/sundhed-dk/roentgen.json
node .claude/skills/sundhed-dk/parsers/parse-diagnoser.js < data/sundhed-dk/diagnoser.json
node .claude/skills/sundhed-dk/parsers/parse-hjemmemaalinger.js < data/sundhed-dk/hjemmemaalinger.json
node .claude/skills/sundhed-dk/parsers/parse-forloebsplaner.js < data/sundhed-dk/forloebsplaner.json
```

## Notes

- Element refs (e.g., e159, e20) are session-specific and will change. Always take a snapshot and locate elements by their label/role.
- The persistent profile stores data in: `~/Library/Caches/ms-playwright/daemon/*/ud-default-chrome`
- After login, session cookies persist so subsequent navigations within the same browser session won't require re-authentication.
- Prøvesvar defaults to 6 months back - change date filters to see older results.
- Journaler has full history from 1999 onwards.
- Medicin "Vis afsluttet medicin" shows ended medications from the last 2 years.
- Person selector is available on most pages to view family members' data.
