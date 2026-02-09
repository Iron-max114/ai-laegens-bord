#!/usr/bin/env node
// Parser for sundhed.dk Medicin (medication) JSON
// Usage: node parse-medicin.js < medicin.json
// Or:    cat medicin.json | node parse-medicin.js

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseMedicin(responses) {
  const lines = [];
  lines.push('# Medicin (Aktive Ordinationer)');
  lines.push('');

  // Find identity
  const identity = responses.find(r => r.url.includes('/identity/selectedname'));
  if (identity?.body) {
    lines.push(`Patient: ${identity.body.Full}`);
    lines.push('');
  }

  // Find overview
  const overview = responses.find(r => r.url.includes('/ordinations/overview'));
  if (overview?.body) {
    const o = overview.body;
    lines.push(`Oversigt: ${o.NumberOfActive} aktive, ${o.NumberOfStopped} stoppede, ${o.NumberOfTemporarilyStopped} midlertidigt stoppede`);
    lines.push('');
  }

  // Find prescriptions overview
  const prescriptions = responses.find(r => r.url.includes('/prescriptions/overview'));
  if (prescriptions?.body) {
    const p = prescriptions.body;
    lines.push(`Recepter: ${p.NumOpen} åbne af ${p.NumTotal} totalt, ${p.NumDispensings} udleveringer`);
    lines.push('');
  }

  // Find active ordinations
  const ordinations = responses.find(r => r.url.includes('/ordinations/') && !r.url.includes('overview'));
  if (ordinations?.body && Array.isArray(ordinations.body)) {
    lines.push('---');
    lines.push('');
    ordinations.body.forEach((med, i) => {
      lines.push(`## ${i + 1}. ${med.DrugMedication}`);
      lines.push(`- Aktivt stof: ${med.ActiveSubstance}`);
      lines.push(`- Form: ${med.Form}`);
      lines.push(`- Styrke: ${med.Strength}`);
      lines.push(`- Dosering: ${med.Dosage.replace(/\n/g, ' | ')}`);
      lines.push(`- Indikation: ${med.Cause}`);
      lines.push(`- Start: ${med.StartDate ? med.StartDate.split('T')[0] : 'ukendt'}`);
      if (med.EndDate) lines.push(`- Slut: ${med.EndDate.split('T')[0]}`);
      lines.push(`- Status: ${med.Status.EnumStr}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

console.log(parseMedicin(input));
