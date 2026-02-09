#!/usr/bin/env node
// Parser for sundhed.dk Journaler (health records) JSON
// Usage: node parse-journaler.js < journaler.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseJournaler(responses) {
  const lines = [];
  lines.push('# Journaler (Sygehusforløb)');
  lines.push('');

  // Find overview
  const overview = responses.find(r => r.url.includes('/ejournal/forloebsoversigt'));
  if (!overview?.body) {
    lines.push('Ingen journaler fundet.');
    return lines.join('\n');
  }

  const data = overview.body;
  lines.push(`Patient: ${data.Navn}`);
  lines.push(`Antal forløb: ${data.NumberOfForloeb}`);
  lines.push('');

  // Filter options (hospitals/diagnoses the patient has been at)
  const filtervalg = responses.find(r => r.url.includes('/ejournal/filtervalg'));
  if (filtervalg?.body?.Sygehuse) {
    lines.push('## Sygehuse med journaler');
    filtervalg.body.Sygehuse.forEach(s => {
      if (s.Navn && s.Navn !== 'Ej oplyst') {
        const afdelinger = s.Afdelinger.filter(a => a.Navn).map(a => a.Navn).join(', ');
        lines.push(`- ${s.Navn}: ${afdelinger}`);
      }
    });
    lines.push('');
  }

  // Date range
  const datofiltrering = responses.find(r => r.url.includes('/ejournal/datofiltrering'));
  if (datofiltrering?.body) {
    const fra = datofiltrering.body.FraDato?.split('T')[0];
    const til = datofiltrering.body.TilDato?.split('T')[0];
    lines.push(`Datointerval: ${fra} til ${til}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Forløb (episodes)
  (data.Forloeb || []).forEach((f, i) => {
    if (f.Skjult) {
      lines.push(`## ${i + 1}. [SKJULT] ${f.Varsling || 'Privatmarkeret forløb'}`);
      lines.push('');
      return;
    }

    const fra = f.DatoFra ? f.DatoFra.split('T')[0] : 'ukendt';
    const til = f.DatoTil ? f.DatoTil.split('T')[0] : 'pågår';

    lines.push(`## ${i + 1}. ${f.DiagnoseNavn || 'Ingen diagnose'}`);
    lines.push(`- Diagnosekode: ${f.DiagnoseKode || 'ingen'}`);
    lines.push(`- Sygehus: ${f.SygehusNavn || 'ukendt'}`);
    lines.push(`- Afdeling: ${f.AfdelingNavn || 'ukendt'}`);
    lines.push(`- Sektor: ${f.Sektor || 'ukendt'}`);
    lines.push(`- Periode: ${fra} til ${til}`);
    lines.push(`- Senest opdateret: ${f.DatoOpdateret ? f.DatoOpdateret.split('T')[0] : 'ukendt'}`);
    lines.push(`- Indhold: ${f.AntalEpikriser || 0} epikriser, ${f.AntalNotater || 0} notater, ${f.AntalDiagnoser || 0} diagnoser, ${f.AntalProcedurer || 0} procedurer`);
    lines.push('');
  });

  return lines.join('\n');
}

console.log(parseJournaler(input));
