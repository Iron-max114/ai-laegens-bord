---
name: sundhed-dk
description: Fetch and read personal health data from sundhed.dk (Denmark's public health portal). Use when the user asks about their medications, lab results, vaccinations, appointments, referrals, GP info, diagnoses, x-rays, or any other health data from sundhed.dk.
allowed-tools: Bash(playwright-cli *), Bash(node *), Bash(mkdir *), Bash(cp *)
---

# Sundhed.dk Health Data

This skill fetches personal health data from sundhed.dk by opening a browser, letting the user log in with MitID, then intercepting the JSON API responses and parsing them into readable text.

## Quick Reference

| Section | What it contains |
|---------|-----------------|
| Medicin | Active medications, dosages, prescriptions |
| Prøvesvar | Blood tests, microbiology, pathology results |
| Journaler | Hospital records, episodes, diagnoses |
| Vaccinationer | Vaccination history |
| Aftaler | Upcoming appointments |
| Henvisninger | Referrals to specialists |
| Egen læge | GP practice info, doctors, hours |
| Røntgen | X-ray and scan descriptions |
| Diagnoser | Diagnoses from GP |
| Hjemmemålinger | Home measurements |
| Forløbsplaner | Care plans |

## Before fetching: check for existing data

Before opening a browser, check if data already exists:

```bash
node -e "
const fs = require('fs');
const db = 'data/sundhed-dk/health.db';
const parsed = 'data/sundhed-dk/parsed';
console.log('Database exists:', fs.existsSync(db));
console.log('Parsed dir exists:', fs.existsSync(parsed));
if (fs.existsSync(parsed)) {
  const files = fs.readdirSync(parsed).filter(f => f.endsWith('.md'));
  console.log('Parsed files:', files.join(', '));
}
"
```

**If data exists**, skip straight to querying or reading:
- For broad questions → read the relevant `data/sundhed-dk/parsed/<section>.md` file
- For specific/time-based questions → query `data/sundhed-dk/health.db` (see "Querying the database" below)
- Only re-fetch from sundhed.dk if the user asks for a refresh or the data is stale

## Querying the database

When `data/sundhed-dk/health.db` exists, use SQL to answer targeted questions. The database uses Node.js built-in SQLite (`node:sqlite`).

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/sundhed-dk/health.db');
const rows = db.prepare('<SQL_QUERY>').all();
rows.forEach(r => console.log(JSON.stringify(r)));
db.close();
"
```

### Common query patterns

**Trend a lab value over time:**
```sql
SELECT result_date, value, reference_text, assessment
FROM lab_results_biochemistry
WHERE analyse_name LIKE '%Urat%'
ORDER BY result_date
```

**Find all elevated lab results:**
```sql
SELECT analyse_name, result_date, value, reference_text
FROM lab_results_biochemistry
WHERE assessment = 'Forhoejet'
ORDER BY result_date DESC
```

**List active medications with duration:**
```sql
SELECT drug_name, indication, start_date,
  CAST((julianday('now') - julianday(start_date)) / 365.25 AS INT) AS years_on
FROM medications
WHERE status = 'Active'
ORDER BY start_date
```

**Search microbiology results:**
```sql
SELECT result_date, test_name, material, conclusion, finding_name, finding_interpretation
FROM lab_results_microbiology
WHERE test_name LIKE '%Chlamydia%'
ORDER BY result_date DESC
```

**Upcoming appointments:**
```sql
SELECT title, start_time, organisation, address, phone
FROM appointments
WHERE start_time > datetime('now')
ORDER BY start_time
```

**Hospital history for a diagnosis:**
```sql
SELECT diagnosis_name, diagnosis_code, hospital, department, date_from, date_to
FROM hospital_episodes
WHERE diagnosis_name LIKE '%eksem%'
ORDER BY date_from DESC
```

### Database schema reference

| Table | Key columns |
|-------|------------|
| `patient` | name, cpr |
| `medications` | drug_name, active_substance, dosage, indication, start_date, end_date, status |
| `lab_requisitions` | id, sample_time, requester, lab_area |
| `lab_results_biochemistry` | requisition_id, analyse_name, value, unit, reference_lower, reference_upper, reference_text, assessment, result_date |
| `lab_results_microbiology` | requisition_id, test_name, material, conclusion, finding_name, finding_interpretation, finding_value, clinical_info, result_date |
| `hospital_episodes` | diagnosis_name, diagnosis_code, hospital, department, sector, date_from, date_to |
| `vaccinations` | vaccine, date, effectuated_by |
| `appointments` | title, start_time, end_time, organisation, address, phone |
| `referrals` | referral_date, expiry_date, referring_clinic, receiving_clinic, specialty, clinical_notes, is_active |
| `gp_practice` | name, address, phone, website |
| `gp_doctors` | name, role, specialty (FK: practice_id) |
| `xrays` | name, date, producer |
| `diagnoses` | diagnosis_code, diagnosis_name, organisation |

**Note:** Biochemistry `analyse_name` uses full IUPAC names (e.g. `P—C-reaktivt protein; massek. = ? mg/L`). Use `LIKE '%keyword%'` for searching (e.g. `LIKE '%Urat%'`, `LIKE '%Cholesterol%'`, `LIKE '%Cobalamin%'`).

## Fetching fresh data from sundhed.dk

Only follow the steps below if data doesn't exist yet or the user wants to refresh it.

### Step 1: Open browser and log in

The browser MUST be headed (so the user can interact with MitID) and persistent (to keep the session).

```bash
playwright-cli open https://sundhed.dk --browser=chrome --headed --persistent
```

Then navigate the login flow:

1. **Dismiss cookies** - Take a snapshot, find "Nej tak" button, click it
2. **Click "Log på"** - Top-right corner
3. **Choose "Borger"** - In the login dialog
4. **MitID authentication** - Tell the user to complete MitID login in the browser. Wait for them to confirm.
5. **Verify login** - After login, the browser should be at `https://www.sundhed.dk/borger/min-side/`

```bash
playwright-cli snapshot
playwright-cli click <ref-for-nej-tak>
playwright-cli snapshot
playwright-cli click <ref-for-log-paa>
playwright-cli snapshot
playwright-cli click <ref-for-borger>
# Ask user to complete MitID login
```

### Step 2: Fetch the requested data

Navigate to the relevant page and intercept the JSON API responses. The data gets saved to `data/sundhed-dk/` via a browser download trick (since `require('fs')` is not available in the run-code context).

First ensure the data directory exists:
```bash
mkdir -p data/sundhed-dk
```

Use this pattern to intercept and save JSON for any section:

```bash
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
  await page.goto('<PAGE_URL>');
  await page.waitForTimeout(6000);
  page.removeListener('response', handler);
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

Then move the downloaded file to the data directory:
```bash
cp .playwright-cli/<FILENAME>.json data/sundhed-dk/<FILENAME>.json
```

#### Section-specific parameters

| Section | PAGE_URL | API_KEYWORD | FILENAME |
|---------|----------|-------------|----------|
| Medicin | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/medicinkortet/` | `medicinkort2borger` | `medicin` |
| Prøvesvar | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/laboratoriesvar/` | `labsvar` | `proevesvar` |
| Journaler | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/journal-fra-sygehus/` | `ejournal` | `journaler` |
| Vaccinationer | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/vaccinationer/` | `vaccination` | `vaccinationer` |
| Aftaler | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/aftaler/` | `aftaler` | `aftaler` |
| Henvisninger | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/henvisninger/` | `envisning` | `henvisninger` |
| Egen læge | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/min-laege/` | `organisation` | `egen-laege` |
| Røntgen | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/billedbeskrivelser/` | `billedbeskrivelser` | `roentgen` |
| Diagnoser | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/diagnoser/` | `diagnoser` | `diagnoser` |
| Hjemmemålinger | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/hjemmemaalinger/` | `maalinger` | `hjemmemaalinger` |
| Forløbsplaner | `https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/planer/` | `planer` | `forloebsplaner` |

### Step 3: Parse and save the data

Each section has a parser script that converts raw JSON into clean, LLM-friendly markdown. The parsers are bundled with this skill.

First ensure the parsed output directory exists:
```bash
mkdir -p data/sundhed-dk/parsed
```

Parse the JSON and save the markdown output:
```bash
node .claude/skills/sundhed-dk/parsers/parse-<section>.js < data/sundhed-dk/<section>.json > data/sundhed-dk/parsed/<section>.md
```

Available parsers:

| Parser | Input file | Output file |
|--------|-----------|-------------|
| `parsers/parse-medicin.js` | `data/sundhed-dk/medicin.json` | `data/sundhed-dk/parsed/medicin.md` |
| `parsers/parse-proevesvar.js` | `data/sundhed-dk/proevesvar.json` | `data/sundhed-dk/parsed/proevesvar.md` |
| `parsers/parse-journaler.js` | `data/sundhed-dk/journaler.json` | `data/sundhed-dk/parsed/journaler.md` |
| `parsers/parse-vaccinationer.js` | `data/sundhed-dk/vaccinationer.json` | `data/sundhed-dk/parsed/vaccinationer.md` |
| `parsers/parse-aftaler.js` | `data/sundhed-dk/aftaler.json` | `data/sundhed-dk/parsed/aftaler.md` |
| `parsers/parse-henvisninger.js` | `data/sundhed-dk/henvisninger.json` | `data/sundhed-dk/parsed/henvisninger.md` |
| `parsers/parse-egen-laege.js` | `data/sundhed-dk/egen-laege.json` | `data/sundhed-dk/parsed/egen-laege.md` |
| `parsers/parse-roentgen.js` | `data/sundhed-dk/roentgen.json` | `data/sundhed-dk/parsed/roentgen.md` |
| `parsers/parse-diagnoser.js` | `data/sundhed-dk/diagnoser.json` | `data/sundhed-dk/parsed/diagnoser.md` |
| `parsers/parse-hjemmemaalinger.js` | `data/sundhed-dk/hjemmemaalinger.json` | `data/sundhed-dk/parsed/hjemmemaalinger.md` |
| `parsers/parse-forloebsplaner.js` | `data/sundhed-dk/forloebsplaner.json` | `data/sundhed-dk/parsed/forloebsplaner.md` |

Read the parsed markdown from `data/sundhed-dk/parsed/<section>.md` and present it to the user in a clear, helpful way.

### Step 4: Build the SQLite database

After fetching JSON data, build a queryable SQLite database from all available sections:

```bash
node .claude/skills/sundhed-dk/parsers/build-db.js
```

This creates `data/sundhed-dk/health.db` with tables for all health data. The database is rebuilt fresh each time (idempotent). Use this for targeted queries across time, e.g.:

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/sundhed-dk/health.db');
const rows = db.prepare(\"SELECT result_date, value, assessment FROM lab_results_biochemistry WHERE analyse_name LIKE '%Urat%' ORDER BY result_date\").all();
rows.forEach(r => console.log(r.result_date?.split('T')[0], r.value, r.assessment));
db.close();
"
```

#### Database tables

| Table | Contents |
|-------|----------|
| `patient` | Name, CPR |
| `medications` | Drug name, substance, dosage, indication, dates, status |
| `lab_requisitions` | Sample date, requester, lab area |
| `lab_results_biochemistry` | Analyse name, value, unit, reference range, assessment, date |
| `lab_results_microbiology` | Test name, material, findings, interpretation, clinical info |
| `hospital_episodes` | Diagnosis, hospital, department, dates |
| `vaccinations` | Vaccine, date, location |
| `appointments` | Title, time, organisation, address |
| `referrals` | Referring/receiving clinic, specialty, clinical notes |
| `gp_practice` | Practice name, address, phone, website |
| `gp_doctors` | Doctor name, role, specialty |
| `xrays` | Name, date, producer |
| `diagnoses` | Code, name, organisation |

**When to use markdown vs SQLite:**
- **Markdown** (`parsed/*.md`): Dump into LLM context for broad questions ("summarize my health", "what medications am I on")
- **SQLite** (`health.db`): Targeted queries across time ("trend my CRP", "which medications have I taken longest", "show all elevated lab results")

## Important Notes

- **Data storage:** Raw JSON goes to `data/sundhed-dk/`, parsed markdown to `data/sundhed-dk/parsed/`, SQLite database to `data/sundhed-dk/health.db`. All are gitignored - personal health data never gets committed.
- **Browser downloads** land in `.playwright-cli/` and must be copied to `data/sundhed-dk/`.
- **Prøvesvar** defaults to 6 months back. To see older results, change the date filter on the page before intercepting.
- **Journaler** has full history from 1999 onwards.
- **Person selector** on most pages lets the user switch between self and family members (children under 15).
- **`page.evaluate()`** only accepts a single argument - always wrap in `{ data, fn }`.
- **Element refs** from snapshots are session-specific. Always take a fresh snapshot before clicking.
- **Session persistence:** Once logged in, the session stays active. No need to re-authenticate for subsequent navigations within the same browser session.

## Detailed API Reference

For complete endpoint documentation, JSON structures, filter options, and sorting parameters, see [navigation.md](navigation.md).
