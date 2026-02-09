#!/usr/bin/env node
// Parser for sundhed.dk Egen Læge (GP information) JSON
// Usage: node parse-egen-laege.js < egen-laege.json

const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

function parseEgenLaege(responses) {
  const lines = [];
  lines.push('# Egen Læge (Praktiserende Læge)');
  lines.push('');

  const orgData = responses.find(r => r.url.includes('/core/organisation/') && !r.url.includes('/children'));
  if (!orgData?.body?.Organizations?.[0]) {
    lines.push('Ingen lægeoplysninger fundet.');
    return lines.join('\n');
  }

  const org = orgData.body.Organizations[0];

  lines.push(`## ${org.DisplayName}`);
  lines.push(`- Type: ${org.InformationsUnderkategori}`);
  lines.push(`- Kliniktype: ${org.ClinicType}`);
  lines.push(`- Adresse: ${org.Address}`);
  lines.push(`- Postnr/By: ${org.ZipCode} ${org.City}`);

  // Phone
  if (org.PhoneNumbers?.length > 0) {
    org.PhoneNumbers.forEach(p => {
      lines.push(`- ${p.Label}${p.Number}`);
    });
  }

  if (org.Homepage) lines.push(`- Hjemmeside: ${org.Homepage}`);
  lines.push('');

  // Doctors
  if (org.People?.length > 0) {
    lines.push('## Læger');
    org.People.forEach(p => {
      const year = p.SeniorityDate ? p.SeniorityDate.split('-')[0] : '';
      lines.push(`- ${p.Name} (${p.PersonType}${year ? ', siden ' + year : ''}) - ${(p.Education || []).join(', ')}`);
    });
    lines.push('');
  }

  // Opening hours
  if (org.OpeningHoursNg) {
    lines.push('## Åbningstider');
    Object.entries(org.OpeningHoursNg).forEach(([type, hours]) => {
      lines.push(`### ${type}`);
      hours.forEach(h => {
        lines.push(`- ${h.Description}: ${h.Hours}`);
      });
    });
    lines.push('');
  }

  // Facilities
  if (org.Facilities?.length > 0) {
    lines.push('## Faciliteter');
    org.Facilities.forEach(f => {
      lines.push(`- ${f.FacilityName}`);
    });
    lines.push('');
  }

  // Functions
  if (org.Functions) {
    Object.entries(org.Functions).forEach(([category, funcs]) => {
      lines.push(`## ${category}`);
      funcs.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    });
  }

  // E-services
  const eservices = responses.find(r => r.url.includes('/eserviceslink/'));
  if (eservices?.body?.OrganizationLinks) {
    const links = eservices.body.OrganizationLinks;
    lines.push('## E-tjenester');
    if (links.ConsultationUrl) lines.push(`- E-mail konsultation: sundhed.dk${links.ConsultationUrl}`);
    if (links.PrescriptionRenewalUrl) lines.push(`- Receptfornyelse: sundhed.dk${links.PrescriptionRenewalUrl}`);
    lines.push('');
  }

  // Booking
  if (org.EMailAppointmentReservationUrl) {
    lines.push(`Online tidsbestilling: ${org.EMailAppointmentReservationUrl}`);
  }

  return lines.join('\n');
}

console.log(parseEgenLaege(input));
