#!/usr/bin/env node
// Parser for sundhed.dk Hjemmemålinger (home measurements) JSON
// Usage: node parse-hjemmemaalinger.js < hjemmemaalinger.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseHjemmemaalinger(responses) {
  const lines = [];
  lines.push('# Hjemmemålinger');
  lines.push('');

  const data = responses.find(r => r.url.includes('/maalinger'));
  if (!data?.body) {
    lines.push('Ingen hjemmemålinger fundet.');
    return lines.join('\n');
  }

  const body = data.body;

  if (!body.documents || body.documents.length === 0) {
    lines.push('Ingen hjemmemålinger registreret.');
    return lines.join('\n');
  }

  // Group by groupings if available
  if (body.groupings?.length > 0) {
    body.groupings.forEach(g => {
      lines.push(`## ${g.name || 'Gruppe'}`);
      lines.push('');
    });
  }

  body.documents.forEach((doc, i) => {
    lines.push(`## ${i + 1}. ${doc.type || doc.name || 'Måling'}`);
    if (doc.date) lines.push(`- Dato: ${doc.date}`);
    if (doc.value) lines.push(`- Værdi: ${doc.value} ${doc.unit || ''}`);
    if (doc.source) lines.push(`- Kilde: ${doc.source}`);
    lines.push('');
  });

  return lines.join('\n');
}

console.log(parseHjemmemaalinger(input));
