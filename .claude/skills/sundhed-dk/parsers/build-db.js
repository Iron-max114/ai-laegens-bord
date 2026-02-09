#!/usr/bin/env node
// Builds a SQLite database from sundhed.dk JSON data files.
// Usage: node build-db.js [data-dir]
// Default data-dir: data/sundhed-dk
// Output: data/sundhed-dk/health.db

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dataDir = process.argv[2] || 'data/sundhed-dk';
const dbPath = path.join(dataDir, 'health.db');

// Remove existing DB to rebuild fresh
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new DatabaseSync(dbPath);

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode=WAL');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE patient (
    id INTEGER PRIMARY KEY,
    name TEXT,
    cpr TEXT
  );

  CREATE TABLE medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordination_id TEXT,
    drug_name TEXT,
    active_substance TEXT,
    form TEXT,
    strength TEXT,
    dosage TEXT,
    indication TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT,
    is_dose_dispensing INTEGER,
    latest_effectuation_date TEXT
  );

  CREATE TABLE lab_requisitions (
    id TEXT PRIMARY KEY,
    patient_name TEXT,
    sample_time TEXT,
    answer_time TEXT,
    requester TEXT,
    requester_org TEXT,
    sender TEXT,
    lab_area TEXT
  );

  CREATE TABLE lab_results_biochemistry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_id TEXT,
    analyse_type_id TEXT,
    analyse_name TEXT,
    value TEXT,
    value_type TEXT,
    unit TEXT,
    reference_lower REAL,
    reference_upper REAL,
    reference_text TEXT,
    assessment TEXT,
    result_date TEXT,
    producer TEXT,
    FOREIGN KEY (requisition_id) REFERENCES lab_requisitions(id)
  );

  CREATE TABLE lab_results_microbiology (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_id TEXT,
    test_name TEXT,
    material TEXT,
    producer TEXT,
    conclusion TEXT,
    finding_name TEXT,
    finding_interpretation TEXT,
    finding_value TEXT,
    clinical_info TEXT,
    comment TEXT,
    result_date TEXT,
    FOREIGN KEY (requisition_id) REFERENCES lab_requisitions(id)
  );

  CREATE TABLE hospital_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diagnosis_name TEXT,
    diagnosis_code TEXT,
    hospital TEXT,
    department TEXT,
    sector TEXT,
    date_from TEXT,
    date_to TEXT,
    date_updated TEXT,
    num_epicrises INTEGER,
    num_notes INTEGER,
    num_diagnoses INTEGER,
    num_procedures INTEGER,
    is_hidden INTEGER
  );

  CREATE TABLE vaccinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vaccination_id TEXT,
    date TEXT,
    vaccine TEXT,
    effectuated_by TEXT,
    is_active INTEGER
  );

  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    start_time TEXT,
    end_time TEXT,
    organisation TEXT,
    unit TEXT,
    address TEXT,
    phone TEXT,
    appointment_type TEXT
  );

  CREATE TABLE referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referral_date TEXT,
    expiry_date TEXT,
    referring_clinic TEXT,
    receiving_clinic TEXT,
    specialty TEXT,
    clinical_notes TEXT,
    is_active INTEGER
  );

  CREATE TABLE gp_practice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT,
    clinic_type TEXT,
    address TEXT,
    zipcode TEXT,
    city TEXT,
    phone TEXT,
    website TEXT
  );

  CREATE TABLE gp_doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    practice_id INTEGER,
    name TEXT,
    role TEXT,
    specialty TEXT,
    since_year TEXT,
    FOREIGN KEY (practice_id) REFERENCES gp_practice(id)
  );

  CREATE TABLE xrays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    name TEXT,
    producer TEXT
  );

  CREATE TABLE diagnoses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisation TEXT,
    is_live_data INTEGER,
    diagnosis_code TEXT,
    diagnosis_name TEXT,
    date TEXT
  );

  -- Indexes for common queries
  CREATE INDEX idx_lab_bio_date ON lab_results_biochemistry(result_date);
  CREATE INDEX idx_lab_bio_name ON lab_results_biochemistry(analyse_name);
  CREATE INDEX idx_lab_micro_date ON lab_results_microbiology(result_date);
  CREATE INDEX idx_medications_status ON medications(status);
  CREATE INDEX idx_medications_start ON medications(start_date);
  CREATE INDEX idx_hospital_date ON hospital_episodes(date_from);
  CREATE INDEX idx_vaccinations_date ON vaccinations(date);
  CREATE INDEX idx_appointments_start ON appointments(start_time);
`);

// ─── Helper ───────────────────────────────────────────────────────────────────

function loadJson(filename) {
  const filepath = path.join(dataDir, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function isoDate(d) {
  if (!d) return null;
  return d.split('T')[0];
}

function htmlToText(html) {
  if (!html) return null;
  return html.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').trim();
}

// Node's built-in SQLite rejects undefined - wrap prepare to auto-sanitize
const _prepare = db.prepare.bind(db);
db.prepare = function(sql) {
  const stmt = _prepare(sql);
  const _run = stmt.run.bind(stmt);
  stmt.run = function(...args) {
    const clean = args.map(v => v === undefined ? null : v);
    return _run(...clean);
  };
  return stmt;
};

// ─── Import: Patient identity ─────────────────────────────────────────────────

function importPatient() {
  // Try to find patient info from any available file
  const medicin = loadJson('medicin.json');
  if (medicin) {
    const identity = medicin.find(r => r.url.includes('/identity/selectedname'));
    if (identity?.body?.Full) {
      db.prepare('INSERT INTO patient (name) VALUES (?)').run(identity.body.Full);
      return;
    }
  }
  // Fallback: from lab results
  const proevesvar = loadJson('proevesvar.json');
  if (proevesvar) {
    const sv = proevesvar.find(r => r.url.includes('svaroversigt'));
    const rek = sv?.body?.Svaroversigt?.Rekvisitioner?.[0];
    if (rek) {
      db.prepare('INSERT INTO patient (name, cpr) VALUES (?, ?)').run(rek.PatientNavn, rek.PatientCpr);
      return;
    }
  }
}

// ─── Import: Medications ──────────────────────────────────────────────────────

function importMedicin() {
  const data = loadJson('medicin.json');
  if (!data) return 0;

  const ordinations = data.find(r => r.url.includes('/ordinations/') && !r.url.includes('overview'));
  if (!ordinations?.body || !Array.isArray(ordinations.body)) return 0;

  const stmt = db.prepare(`INSERT INTO medications
    (ordination_id, drug_name, active_substance, form, strength, dosage, indication, start_date, end_date, status, is_dose_dispensing, latest_effectuation_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  for (const med of ordinations.body) {
    stmt.run(
      med.OrdinationId,
      med.DrugMedication,
      med.ActiveSubstance,
      med.Form,
      med.Strength,
      med.Dosage?.replace(/\n/g, ' | '),
      med.Cause,
      isoDate(med.StartDate),
      isoDate(med.EndDate),
      med.Status?.EnumStr,
      med.IsDoseDispensing ? 1 : 0,
      isoDate(med.LatestEffectuationDate)
    );
    count++;
  }
  return count;
}

// ─── Import: Lab results ──────────────────────────────────────────────────────

function importProevesvar() {
  const data = loadJson('proevesvar.json');
  if (!data) return { requisitions: 0, biochemistry: 0, microbiology: 0 };

  const oversigt = data.find(r => r.url.includes('svaroversigt'));
  if (!oversigt?.body?.Svaroversigt) return { requisitions: 0, biochemistry: 0, microbiology: 0 };

  const sv = oversigt.body.Svaroversigt;

  // Build analyse type lookup
  const analyseTypes = {};
  for (const at of (sv.Analysetyper || [])) {
    analyseTypes[at.Id] = htmlToText(at.LangtNavn_html) || at.Titel;
  }

  // Import requisitions
  const rekStmt = db.prepare(`INSERT OR IGNORE INTO lab_requisitions
    (id, patient_name, sample_time, answer_time, requester, requester_org, sender, lab_area)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  let rekCount = 0;
  for (const rek of (sv.Rekvisitioner || [])) {
    rekStmt.run(
      rek.Id,
      rek.PatientNavn,
      rek.Proevetagningstidspunkt,
      rek.Svartidspunkt,
      htmlToText(rek.Rekvirent_html),
      rek.RekvirentsOrganisation,
      htmlToText(rek.Afsender_html),
      rek.Laboratorieomraade
    );
    rekCount++;
  }

  // Import results
  const bioStmt = db.prepare(`INSERT INTO lab_results_biochemistry
    (requisition_id, analyse_type_id, analyse_name, value, value_type, unit, reference_lower, reference_upper, reference_text, assessment, result_date, producer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const microStmt = db.prepare(`INSERT INTO lab_results_microbiology
    (requisition_id, test_name, material, producer, conclusion, finding_name, finding_interpretation, finding_value, clinical_info, comment, result_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let bioCount = 0, microCount = 0;

  for (const result of (sv.Laboratorieresultater || [])) {
    const type = result.__type || '';

    if (type.includes('KliniskBiokemisvar')) {
      const atName = analyseTypes[result.AnalysetypeId] || result.AnalysetypeId;

      // Skip stub entries that are just lab reference codes (e.g. "HVH KMA")
      // These are tests forwarded to microbiology - real results are in Mikrobiologisvar
      const val = result.Vaerdi?.trim();
      if (val && /^[A-Z]{2,5}\s+[A-Z]{2,5}$/.test(val)) continue;

      // Skip entries that duplicate microbiology results (same test exists with richer data there)
      const nameLower = atName.toLowerCase();
      if (nameLower.includes('mycoplasma') && nameLower.includes('makrolid')) continue;

      // Find unit from Analysetyper
      const at = (sv.Analysetyper || []).find(a => a.Id === result.AnalysetypeId);
      const unit = at?.Enhed || null;

      bioStmt.run(
        result.RekvisitionsId,
        result.AnalysetypeId,
        atName,
        result.Vaerdi,
        result.Vaerditype,
        unit,
        result.ReferenceIntervalNedre ?? null,
        result.ReferenceIntervalOevre ?? null,
        result.ReferenceIntervalTekst,
        result.Referencemarkering,
        result.Resultatdato,
        result.Producent
      );
      bioCount++;
    } else if (type.includes('Mikrobiologisvar')) {
      const investigations = result.Undersoegelser || [];
      for (const inv of investigations) {
        // Extract findings
        const findings = [];
        const qf = inv.QuantitativeFindings?.Data || [];
        // Row 0 is headers, rows 1+ are data
        for (let i = 1; i < qf.length; i++) {
          const row = qf[i];
          if (row && row[4]) {
            findings.push({
              name: row[4],
              interpretation: row[8],
              value: row[9]
            });
          }
        }
        // Also check CultureFindings
        const cf = inv.CultureFindings?.Data || [];
        for (let i = 1; i < cf.length; i++) {
          const row = cf[i];
          if (row && row[1]) {
            findings.push({
              name: row[1],
              interpretation: null,
              value: row[2]
            });
          }
        }

        // Extract conclusion
        const concRow = inv.Conclusion?.Data;
        const conclusion = concRow?.[1]?.[1] || null;

        // Extract clinical info
        const clinInfo = inv.ClinicalInformation?.Data;
        let clinText = null;
        if (clinInfo) {
          const parts = [];
          for (let i = 1; i < clinInfo.length; i++) {
            if (clinInfo[i]?.[0] && clinInfo[i]?.[1]) {
              parts.push(`${clinInfo[i][0]}: ${clinInfo[i][1]}`);
            }
          }
          clinText = parts.join(' | ');
        }

        // Extract comment
        const commData = inv.Comment?.Data;
        const comment = commData?.[1]?.[0] || null;

        // Date and requisition ID live on the parent result, not the investigation
        const rekId = result.RekvisitionsId;
        const resultDate = result.Resultatdato;

        // Insert one row per finding, or one row if no findings
        if (findings.length > 0) {
          for (const f of findings) {
            microStmt.run(
              rekId,
              inv.UndersoegelsesNavn,
              inv.Materiale,
              inv.Producent,
              conclusion,
              f.name,
              f.interpretation,
              f.value,
              clinText,
              comment,
              resultDate
            );
            microCount++;
          }
        } else {
          microStmt.run(
            rekId,
            inv.UndersoegelsesNavn,
            inv.Materiale,
            inv.Producent,
            conclusion,
            null, null, null,
            clinText,
            comment,
            resultDate
          );
          microCount++;
        }
      }
    }
  }

  return { requisitions: rekCount, biochemistry: bioCount, microbiology: microCount };
}

// ─── Import: Hospital episodes ────────────────────────────────────────────────

function importJournaler() {
  const data = loadJson('journaler.json');
  if (!data) return 0;

  const forl = data.find(r => r.url.includes('forloebsoversigt'));
  if (!forl?.body?.Forloeb) return 0;

  const stmt = db.prepare(`INSERT INTO hospital_episodes
    (diagnosis_name, diagnosis_code, hospital, department, sector, date_from, date_to, date_updated, num_epicrises, num_notes, num_diagnoses, num_procedures, is_hidden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  for (const ep of forl.body.Forloeb) {
    stmt.run(
      ep.DiagnoseNavn,
      ep.DiagnoseKode,
      ep.SygehusNavn,
      ep.AfdelingNavn,
      ep.Sektor,
      isoDate(ep.DatoFra),
      isoDate(ep.DatoTil),
      isoDate(ep.DatoOpdateret),
      ep.AntalEpikriser,
      ep.AntalNotater,
      ep.AntalDiagnoser,
      ep.AntalProcedurer,
      ep.Skjult ? 1 : 0
    );
    count++;
  }
  return count;
}

// ─── Import: Vaccinations ─────────────────────────────────────────────────────

function importVaccinationer() {
  const data = loadJson('vaccinationer.json');
  if (!data) return 0;

  const vacc = data.find(r => r.url.includes('effectuatedvaccinations') && Array.isArray(r.body));
  if (!vacc?.body) return 0;

  const stmt = db.prepare(`INSERT INTO vaccinations
    (vaccination_id, date, vaccine, effectuated_by, is_active)
    VALUES (?, ?, ?, ?, ?)`);

  let count = 0;
  for (const v of vacc.body) {
    stmt.run(
      String(v.VaccinationIdentifier),
      isoDate(v.EffectuatedDateTime),
      v.Vaccine,
      v.EffectuatedBy,
      v.ActiveStatus ? 1 : 0
    );
    count++;
  }
  return count;
}

// ─── Import: Appointments ─────────────────────────────────────────────────────

function importAftaler() {
  const data = loadJson('aftaler.json');
  if (!data) return 0;

  const aft = data.find(r => r.url.includes('aftaler/cpr'));
  if (!aft?.body?.appointments) return 0;

  const stmt = db.prepare(`INSERT INTO appointments
    (title, start_time, end_time, organisation, unit, address, phone, appointment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  for (const a of aft.body.appointments) {
    const loc = a.location || {};
    const addr = loc.address;
    const addrStr = addr ? `${addr.street || ''}, ${addr.postalCode || ''} ${addr.city || ''}`.trim() : null;
    const phone = loc.phoneNumbers?.[0]?.number || null;

    stmt.run(
      a.title,
      a.startTime,
      a.endTime,
      loc.organisation,
      loc.unit || null,
      addrStr,
      phone,
      a.appointmentType || null
    );
    count++;
  }
  return count;
}

// ─── Import: Referrals ────────────────────────────────────────────────────────

function importHenvisninger() {
  const data = loadJson('henvisninger.json');
  if (!data) return 0;

  const henv = data.find(r => r.url.includes('/henvisning') && r.body?.aktiveHenvisninger !== undefined);
  if (!henv?.body) return 0;

  const stmt = db.prepare(`INSERT INTO referrals
    (referral_date, expiry_date, referring_clinic, receiving_clinic, specialty, clinical_notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  const allRefs = [
    ...(henv.body.aktiveHenvisninger || []).map(r => ({ ...r, active: 1 })),
    ...(henv.body.tidligereHenvisninger || []).map(r => ({ ...r, active: 0 }))
  ];

  for (const ref of allRefs) {
    const details = ref.detaljer || {};
    const clinicalNotes = htmlToText(details.kliniskeOplysninger_html);

    stmt.run(
      isoDate(ref.henvisningsDato),
      isoDate(ref.udloebsDato),
      ref.henvisendeKlinik,
      ref.modtagerKlinik,
      ref.specialeNavn,
      clinicalNotes,
      ref.active
    );
    count++;
  }
  return count;
}

// ─── Import: GP practice ─────────────────────────────────────────────────────

function importEgenLaege() {
  const data = loadJson('egen-laege.json');
  if (!data) return 0;

  const orgResp = data.find(r => r.url.includes('core/organisation') && !r.url.includes('children'));
  if (!orgResp?.body?.Organizations?.[0]) return 0;

  const org = orgResp.body.Organizations[0];

  const practiceStmt = db.prepare(`INSERT INTO gp_practice
    (name, type, clinic_type, address, zipcode, city, phone, website)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const phone = org.PhoneNumbers?.[0]?.Number || null;

  const result = practiceStmt.run(
    org.Name,
    org.OrganizationType === 1 ? 'Praktiserende læge' : String(org.OrganizationType),
    org.ClinicType,
    org.Address,
    org.ZipCode,
    org.City,
    phone,
    org.Homepage
  );

  const practiceId = result.lastInsertRowid;

  // Import doctors
  const doctorStmt = db.prepare(`INSERT INTO gp_doctors
    (practice_id, name, role, specialty, since_year)
    VALUES (?, ?, ?, ?, ?)`);

  let doctorCount = 0;
  for (const person of (org.People || [])) {
    doctorStmt.run(
      practiceId,
      person.Name,
      person.Role,
      person.Specialty,
      person.Year ? String(person.Year) : null
    );
    doctorCount++;
  }

  return { practice: 1, doctors: doctorCount };
}

// ─── Import: X-rays ──────────────────────────────────────────────────────────

function importRoentgen() {
  const data = loadJson('roentgen.json');
  if (!data) return 0;

  const bil = data.find(r => r.url.includes('billedbeskrivelser/henvisninger'));
  if (!bil?.body?.Svar) return 0;

  const stmt = db.prepare(`INSERT INTO xrays (date, name, producer) VALUES (?, ?, ?)`);

  let count = 0;
  for (const s of bil.body.Svar) {
    stmt.run(
      isoDate(s.Dato),
      s.Navn,
      s.Producent?.Navn
    );
    count++;
  }
  return count;
}

// ─── Import: Diagnoses ───────────────────────────────────────────────────────

function importDiagnoser() {
  const data = loadJson('diagnoser.json');
  if (!data) return 0;

  const diag = data.find(r => r.url.includes('v1/diagnoser'));
  if (!diag?.body) return 0;

  const stmt = db.prepare(`INSERT INTO diagnoses
    (organisation, is_live_data, diagnosis_code, diagnosis_name, date)
    VALUES (?, ?, ?, ?, ?)`);

  let count = 0;
  for (const d of (diag.body.diagnoser || [])) {
    stmt.run(
      diag.body.organization,
      diag.body.isLiveData ? 1 : 0,
      d.code,
      d.name,
      isoDate(d.date)
    );
    count++;
  }
  return count;
}

// ─── Run all imports ─────────────────────────────────────────────────────────

console.log('Building health.db from', dataDir);
console.log('');

importPatient();

const results = {
  medications: importMedicin(),
  lab: importProevesvar(),
  hospital_episodes: importJournaler(),
  vaccinations: importVaccinationer(),
  appointments: importAftaler(),
  referrals: importHenvisninger(),
  gp: importEgenLaege(),
  xrays: importRoentgen(),
  diagnoses: importDiagnoser(),
};

console.log('Import complete:');
console.log(`  Medications:      ${results.medications}`);
console.log(`  Lab requisitions: ${results.lab.requisitions}`);
console.log(`  Lab biochemistry: ${results.lab.biochemistry}`);
console.log(`  Lab microbiology: ${results.lab.microbiology}`);
console.log(`  Hospital episodes:${results.hospital_episodes}`);
console.log(`  Vaccinations:     ${results.vaccinations}`);
console.log(`  Appointments:     ${results.appointments}`);
console.log(`  Referrals:        ${results.referrals}`);
console.log(`  GP practice:      ${results.gp.practice}, doctors: ${results.gp.doctors}`);
console.log(`  X-rays:           ${results.xrays}`);
console.log(`  Diagnoses:        ${results.diagnoses}`);
console.log('');
console.log(`Database saved to: ${dbPath}`);

db.close();
