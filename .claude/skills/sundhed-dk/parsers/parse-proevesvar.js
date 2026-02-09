#!/usr/bin/env node
// Parser for sundhed.dk Prøvesvar (lab results) JSON
// Usage: node parse-proevesvar.js < proevesvar.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function htmlToText(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, ' | ').replace(/<[^>]+>/g, '').replace(/&#248;/g, 'ø').replace(/&#230;/g, 'æ').replace(/&#229;/g, 'å').replace(/&#198;/g, 'Æ').replace(/&#216;/g, 'Ø').replace(/&#197;/g, 'Å').trim();
}

function parseProevesvar(responses) {
  const lines = [];
  lines.push('# Prøvesvar (Laboratorieresultater)');
  lines.push('');

  // Find person
  const person = responses.find(r => r.url.includes('/personvaelger/valgtperson'));
  if (person?.body?.ValgtPerson) {
    lines.push(`Patient: ${person.body.ValgtPerson.Navn}`);
    lines.push('');
  }

  // Find the main lab results
  const labResponse = responses.find(r => r.url.includes('/labsvar/svaroversigt'));
  if (!labResponse?.body?.Svaroversigt) {
    lines.push('Ingen prøvesvar fundet.');
    return lines.join('\n');
  }

  const data = labResponse.body.Svaroversigt;

  // Build lookup for analysis types
  const analyseTyper = {};
  (data.Analysetyper || []).forEach(a => {
    analyseTyper[a.Id] = {
      titel: a.Titel,
      enhed: a.Enhed_html || '',
      langtnavn: htmlToText(a.LangtNavn_html),
      patientlink: a.Patienthaandbogslink || null,
      laegelink: a.Laegehaandbogslink || null
    };
  });

  // Build lookup for requisitions
  const rekvisitioner = {};
  (data.Rekvisitioner || []).forEach(r => {
    rekvisitioner[r.Id] = {
      dato: r.Proevetagningstidspunkt ? r.Proevetagningstidspunkt.split('T')[0] : 'ukendt',
      rekvirent: htmlToText(r.Rekvirent_html),
      afsender: htmlToText(r.Afsender_html),
      omraade: r.Laboratorieomraade
    };
  });

  // Group results by date
  const resultsByDate = {};
  (data.Laboratorieresultater || []).forEach(r => {
    const rek = rekvisitioner[r.RekvisitionsId] || {};
    const dato = rek.dato || r.Resultatdato?.split('T')[0] || 'ukendt';

    if (!resultsByDate[dato]) resultsByDate[dato] = [];

    const type = r.__type || '';

    if (type.includes('KliniskBiokemisvar')) {
      const at = analyseTyper[r.AnalysetypeId] || {};
      resultsByDate[dato].push({
        type: 'biokemi',
        navn: at.titel || r.AnalysetypeId,
        vaerdi: r.Vaerdi,
        enhed: at.enhed,
        reference: r.ReferenceIntervalTekst || '',
        markering: r.Referencemarkering || '',
        status: r.ResultatStatus
      });
    } else if (type.includes('Mikrobiologisvar')) {
      const undersøgelser = (r.Undersoegelser || []).map(u => {
        let findings = [];
        if (u.QuantitativeFindings?.Data) {
          u.QuantitativeFindings.Data.slice(1).forEach(row => {
            const name = row[4] || '';
            const interpretation = row[8] || '';
            const value = row[9] || '';
            if (name) findings.push(`${name}: ${interpretation || value}`);
          });
        }
        if (u.CultureFindings) {
          const cf = u.CultureFindings;
          if (cf.Comment_html) findings.push(htmlToText(cf.Comment_html));
          if (cf.ColumnDefinitions) {
            cf.ColumnDefinitions.forEach(cd => {
              findings.push(`${htmlToText(cd.Vaekst_html)} ${htmlToText(cd.Navn_html)}`);
            });
          }
        }
        return {
          navn: u.UndersoegelsesNavn,
          materiale: u.Materiale,
          findings
        };
      });

      resultsByDate[dato].push({
        type: 'mikrobiologi',
        resultat: r.Resultat,
        undersøgelser,
        kliniskInfo: htmlToText(r.KliniskeInformationer_html),
        kommentar: htmlToText(r.LaboratorietsKommentar_html)
      });
    } else if (type.includes('Patologisvar')) {
      resultsByDate[dato].push({
        type: 'patologi',
        resultat: r.Resultat || r.Vaerdi,
        status: r.ResultatStatus
      });
    }
  });

  // Output grouped by date
  const sortedDates = Object.keys(resultsByDate).sort().reverse();

  sortedDates.forEach(dato => {
    lines.push(`## ${dato}`);
    lines.push('');

    const results = resultsByDate[dato];

    // Biokemi results as table
    const biokemi = results.filter(r => r.type === 'biokemi');
    if (biokemi.length > 0) {
      lines.push('### Klinisk biokemi');
      lines.push('| Analyse | Værdi | Enhed | Reference | Vurdering |');
      lines.push('|---------|-------|-------|-----------|-----------|');
      biokemi.forEach(b => {
        const flag = b.markering === 'Forhoejet' ? ' FORHØJET' : b.markering === 'Formindsket' ? ' FOR LAV' : '';
        lines.push(`| ${b.navn} | ${b.vaerdi} | ${b.enhed} | ${b.reference} | ${b.markering}${flag ? '' : ''} |`);
      });
      lines.push('');
    }

    // Mikrobiology results
    const mikro = results.filter(r => r.type === 'mikrobiologi');
    if (mikro.length > 0) {
      lines.push('### Mikrobiologi');
      mikro.forEach(m => {
        m.undersøgelser.forEach(u => {
          lines.push(`- **${u.navn}** (${u.materiale}): ${m.resultat}`);
          u.findings.forEach(f => lines.push(`  - ${f}`));
        });
        if (m.kliniskInfo) lines.push(`  Klinisk info: ${m.kliniskInfo}`);
        if (m.kommentar) lines.push(`  Kommentar: ${m.kommentar}`);
      });
      lines.push('');
    }
  });

  return lines.join('\n');
}

console.log(parseProevesvar(input));
