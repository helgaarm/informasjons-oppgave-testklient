export function submissionMessage(response) {
  if (response.ok) return 'Oppgaven er mottatt av Helsenorge test02.';
  if (response.deliveryUnknown) return 'Leveringsstatus er ukjent. Kontroller test02 før du prøver igjen.';
  if (response.status === 401 && response.body?.error === 'invalid_client') {
    const description = typeof response.body.error_description === 'string' ? response.body.error_description : '';
    // Match known diagnostics, but never copy arbitrary upstream text into the banner.
    if (/\bclient tenancy is unknown\b/i.test(description)) {
      return 'Helsenorge kjenner ikke klienttypen i tokenet (HTTP 401). Hent et nytt testtoken under Tilkobling. Appen må sende med riktig client tenancy.';
    }
    if (/\bclientid is not valid\b/i.test(description)) {
      return 'Helsenorge avviste klient-ID-en i tokenet (HTTP 401). Kontroller klientoppsettet under Tilkobling. Hvis feilen fortsetter, må testklientens tilgang avklares med NHN.';
    }
    return 'Helsenorge avviste klientopplysningene i tokenet (HTTP 401). Se feildetaljene i Respons, og kontroller testoppsettet under Tilkobling.';
  }
  return `Helsenorge avviste forespørselen (HTTP ${response.status}). Se responsen.`;
}
