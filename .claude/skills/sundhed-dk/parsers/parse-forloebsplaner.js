#!/usr/bin/env node
// Parser for sundhed.dk Forløbsplaner (care plans) JSON
// Usage: node parse-forloebsplaner.js < forloebsplaner.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseForloebsplaner(responses) {
  const lines = [];
  lines.push('# Forløbsplaner');
  lines.push('');

  const data = responses.find(r => r.url.includes('/plans'));
  if (!data?.body) {
    lines.push('Ingen forløbsplaner fundet.');
    return lines.join('\n');
  }

  const body = data.body;

  if (!body.plans || body.plans.length === 0) {
    lines.push('Ingen aktive forløbsplaner.');
    return lines.join('\n');
  }

  body.plans.forEach((p, i) => {
    lines.push(`## ${i + 1}. ${p.title || p.name || 'Forløbsplan'}`);
    if (p.status) lines.push(`- Status: ${p.status}`);
    if (p.startDate) lines.push(`- Start: ${p.startDate}`);
    if (p.endDate) lines.push(`- Slut: ${p.endDate}`);
    if (p.organization) lines.push(`- Organisation: ${p.organization}`);
    if (p.description) lines.push(`- Beskrivelse: ${p.description}`);
    lines.push('');
  });

  return lines.join('\n');
}

console.log(parseForloebsplaner(input));
