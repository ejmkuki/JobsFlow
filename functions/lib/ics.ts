// Minimal RFC 5545 VEVENT builder — just enough for a single interview
// invite. No recurrence, no attendees block (we email each side their own
// copy rather than relying on calendar client RSVP plumbing).
export type IcsEventInput = {
  uid: string
  start: string
  end: string
  summary: string
  description: string
  location: string
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function toIcsUtcStamp(iso: string) {
  const date = new Date(iso)
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function buildIcsEvent(input: IcsEventInput) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JobsFlow AI//Interview Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${toIcsUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toIcsUtcStamp(input.start)}`,
    `DTEND:${toIcsUtcStamp(input.end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

export function icsToBase64(ics: string) {
  const bytes = new TextEncoder().encode(ics)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
