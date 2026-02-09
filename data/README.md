# Data

This directory stores personal health data fetched from sundhed.dk. All files here are gitignored and will never be committed to the repository.

## Structure

```
data/
  sundhed-dk/          # Raw JSON from sundhed.dk API responses
    medicin.json       # Active medications, prescriptions
    proevesvar.json    # Lab results (blood tests, microbiology, pathology)
    journaler.json     # Hospital records and episodes
    vaccinationer.json # Vaccination history
    aftaler.json       # Upcoming appointments
    henvisninger.json  # Referrals to specialists
    egen-laege.json    # GP practice information
    roentgen.json      # X-ray and scan descriptions
    diagnoser.json     # Diagnoses from GP
    hjemmemaalinger.json # Home measurements
    forloebsplaner.json  # Care plans
```

## How data gets here

When you use the sundhed.dk skill, it logs into sundhed.dk via your browser, intercepts the JSON API responses, and saves them here. You can then run the parser scripts to get a clean, readable summary:

```bash
node scripts/parsers/parse-medicin.js < data/sundhed-dk/medicin.json
node scripts/parsers/parse-proevesvar.js < data/sundhed-dk/proevesvar.json
# etc.
```

## Privacy

This is YOUR personal health data. It stays on YOUR machine. Never share these files or commit them to git.
