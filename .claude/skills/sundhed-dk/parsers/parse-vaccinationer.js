#!/usr/bin/env node
// Parser for sundhed.dk Vaccinationer JSON
// Usage: node parse-vaccinationer.js < vaccinationer.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseVaccinationer(responses) {
  const lines = [];
  lines.push('# Vaccinationer');
  lines.push('');

  // Overview
  const overview = responses.find(r => r.url.includes('/vaccination/api/v1/overview'));
  if (overview?.body) {
    const o = overview.body;
    lines.push(`Oversigt: ${o.NumberOfEffectuatedVaccinations} gennemførte, ${o.NumberOfSelfcreatedVaccinations} egenregistrerede, ${o.NumberOfPlannedVaccinations} planlagte`);
    if (o.NumberOfOverdueVaccinations > 0) {
      lines.push(`OBS: ${o.NumberOfOverdueVaccinations} overskredne anbefalede vaccinationer!`);
    }
    lines.push('');
  }

  // Effectuated vaccinations
  const vaccinations = responses.find(r =>
    r.url.includes('/effectuatedvaccinations/') &&
    !r.url.includes('onlyDeletedVaccines=true')
  );

  if (vaccinations?.body && Array.isArray(vaccinations.body)) {
    lines.push('---');
    lines.push('');
    vaccinations.body.forEach((v, i) => {
      const dato = v.EffectuatedDateTime ? v.EffectuatedDateTime.split('T')[0] : 'ukendt';
      lines.push(`## ${i + 1}. ${v.Vaccine}`);
      lines.push(`- Dato: ${dato}`);
      lines.push(`- Givet hos: ${v.EffectuatedBy}`);
      if (v.CoverageDuration) lines.push(`- Varighed: ${v.CoverageDuration}`);
      lines.push(`- Aktiv: ${v.ActiveStatus ? 'Ja' : 'Nej'}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

console.log(parseVaccinationer(input));
