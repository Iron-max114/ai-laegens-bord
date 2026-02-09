#!/usr/bin/env node
// Parser for sundhed.dk Aftaler (appointments) JSON
// Usage: node parse-aftaler.js < aftaler.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseAftaler(responses) {
  const lines = [];
  lines.push('# Aftaler (Kommende Aftaler)');
  lines.push('');

  const aftaler = responses.find(r => r.url.includes('/aftaler/cpr'));
  if (!aftaler?.body?.appointments || aftaler.body.appointments.length === 0) {
    lines.push('Ingen kommende aftaler.');
    return lines.join('\n');
  }

  lines.push(`Antal aftaler: ${aftaler.body.appointments.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  aftaler.body.appointments.forEach((a, i) => {
    lines.push(`## ${i + 1}. ${a.title}`);
    lines.push(`- Dato: ${a.startTimeDetailed?.dateFormatted || 'ukendt'}`);
    lines.push(`- Tid: ${a.startTimeDetailed?.timeFormatted || 'ukendt'}${a.endTimeDetailed?.timeFormatted ? ' - ' + a.endTimeDetailed.timeFormatted : ''}`);
    lines.push(`- Uge: ${a.startTimeDetailed?.weekNo || 'ukendt'}`);

    if (a.location) {
      lines.push(`- Organisation: ${a.location.organisation || 'ukendt'}`);
      if (a.location.unitType && a.location.unitType !== a.location.organisation) {
        lines.push(`- Enhed: ${a.location.unitType}`);
      }
      lines.push(`- Adresse: ${a.location.address?.formatted || 'ukendt'}`);
      if (a.location.phone) lines.push(`- Telefon: ${a.location.phone}`);
    }

    if (a.appointmentType) lines.push(`- Type: ${a.appointmentType}`);
    if (a.endTimeNotDefined) lines.push(`- OBS: Sluttidspunkt ikke angivet`);
    lines.push('');
  });

  return lines.join('\n');
}

console.log(parseAftaler(input));
