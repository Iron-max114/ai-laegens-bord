#!/usr/bin/env node
// Parser for sundhed.dk Henvisninger (referrals) JSON
// Usage: node parse-henvisninger.js < henvisninger.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function htmlToText(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, '\n  ').replace(/<[^>]+>/g, '').replace(/&#248;/g, 'ø').replace(/&#230;/g, 'æ').replace(/&#229;/g, 'å').trim();
}

function parseHenvisninger(responses) {
  const lines = [];
  lines.push('# Henvisninger (Referrals)');
  lines.push('');

  const henv = responses.find(r => r.url.includes('/henvisning') && r.body?.aktiveHenvisninger !== undefined);
  if (!henv?.body) {
    lines.push('Ingen henvisninger fundet.');
    return lines.join('\n');
  }

  const aktive = henv.body.aktiveHenvisninger || [];
  const tidligere = henv.body.tidligereHenvisninger || [];

  lines.push(`Aktive henvisninger: ${aktive.length}`);
  lines.push(`Tidligere henvisninger: ${tidligere.length}`);
  lines.push('');

  if (aktive.length > 0) {
    lines.push('## Aktive Henvisninger');
    lines.push('');
    aktive.forEach((h, i) => {
      const dato = h.henvisningsDato ? h.henvisningsDato.split('T')[0] : 'ukendt';
      const udloeb = h.udloebsDato ? h.udloebsDato.split('T')[0] : 'ukendt';

      lines.push(`### ${i + 1}. ${h.detaljer?.henvisningsType || 'Henvisning'} - ${h.specialeNavn || 'ukendt speciale'}`);
      lines.push(`- Dato: ${dato}`);
      lines.push(`- Udløber: ${udloeb}`);
      lines.push(`- Henvisende: ${h.henvisendeKlinik}`);
      if (h.detaljer?.modtager?.name) lines.push(`- Modtager: ${h.detaljer.modtager.name}`);

      // Diagnoser
      if (h.detaljer?.diagnoser?.length > 0) {
        lines.push(`- Diagnoser:`);
        h.detaljer.diagnoser.forEach(d => {
          lines.push(`  - ${d.diagnoseType}: ${d.diagnoseText}`);
        });
      }

      // Kliniske oplysninger
      if (h.detaljer?.kliniskeOplysninger?.tekster?.length > 0) {
        lines.push(`- Kliniske oplysninger:`);
        h.detaljer.kliniskeOplysninger.tekster.forEach(t => {
          lines.push(`  ${t.overskrift}:`);
          lines.push(`  ${htmlToText(t.tekst)}`);
        });
      }

      lines.push('');
    });
  }

  if (tidligere.length > 0) {
    lines.push('## Tidligere Henvisninger');
    lines.push('');
    tidligere.forEach((h, i) => {
      const dato = h.henvisningsDato ? h.henvisningsDato.split('T')[0] : 'ukendt';
      lines.push(`### ${i + 1}. ${h.specialeNavn || 'ukendt'} (${dato})`);
      lines.push(`- Henvisende: ${h.henvisendeKlinik}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

console.log(parseHenvisninger(input));
