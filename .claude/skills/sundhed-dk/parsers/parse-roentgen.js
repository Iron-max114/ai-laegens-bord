#!/usr/bin/env node
// Parser for sundhed.dk Røntgen og scanning JSON
// Usage: node parse-roentgen.js < roentgen.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseRoentgen(responses) {
  const lines = [];
  lines.push('# Røntgen og Scanning (Billedbeskrivelser)');
  lines.push('');

  const data = responses.find(r => r.url.includes('/billedbeskrivelser/henvisninger/'));
  if (!data?.body?.Svar || data.body.Svar.length === 0) {
    lines.push('Ingen røntgen- eller scanningsbeskrivelser fundet.');
    return lines.join('\n');
  }

  lines.push(`Antal undersøgelser: ${data.body.TotalItems}`);
  if (data.body.MinDate) lines.push(`Ældste: ${data.body.MinDate.split('T')[0]}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  data.body.Svar.forEach((s, i) => {
    const dato = s.Dato ? s.Dato.split('T')[0] : 'ukendt';
    lines.push(`## ${i + 1}. ${s.Navn}`);
    lines.push(`- Dato: ${dato}`);
    if (s.Producent?.Navn) lines.push(`- Producent: ${s.Producent.Navn}`);
    if (s.Beskrivelse) lines.push(`- Beskrivelse: ${s.Beskrivelse}`);
    if (s.Laege) lines.push(`- Læge: ${s.Laege}`);

    if (s.Undersoegelser?.length > 0) {
      s.Undersoegelser.forEach(u => {
        if (u.Navn !== s.Navn) lines.push(`- Undersøgelse: ${u.Navn}`);
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

console.log(parseRoentgen(input));
