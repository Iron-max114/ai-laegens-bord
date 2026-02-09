#!/usr/bin/env node
// Parser for sundhed.dk Diagnoser JSON
// Usage: node parse-diagnoser.js < diagnoser.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseDiagnoser(responses) {
  const lines = [];
  lines.push('# Diagnoser');
  lines.push('');

  const data = responses.find(r => r.url.includes('/diagnoser'));
  if (!data?.body) {
    lines.push('Ingen diagnoser fundet.');
    return lines.join('\n');
  }

  const body = data.body;
  if (body.organization) lines.push(`Lægepraksis: ${body.organization}`);
  lines.push(`Live data: ${body.isLiveData ? 'Ja' : 'Nej'}`);
  lines.push('');

  if (!body.diagnoser || body.diagnoser.length === 0) {
    lines.push('Ingen diagnoser registreret hos egen læge.');
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');
  body.diagnoser.forEach((d, i) => {
    lines.push(`${i + 1}. ${d.diagnoseTekst || d.diagnoseKode || 'Ukendt diagnose'}`);
    if (d.diagnoseKode) lines.push(`   Kode: ${d.diagnoseKode}`);
    if (d.dato) lines.push(`   Dato: ${d.dato}`);
  });

  return lines.join('\n');
}

console.log(parseDiagnoser(input));
