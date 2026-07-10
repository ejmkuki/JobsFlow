// Server-side PDF text extraction (Cloudflare Workers runtime). No
// dependency — same philosophy as lib/docx.ts. PDFs are a much messier
// format than a zip: this is a best-effort content-stream scanner, not a
// full parser. It works well for the common case (Word/Docs/Chrome "export
// to PDF" with standard single-byte text encoding) and honestly returns
// null — never garbled mojibake — when it can't confidently read a file
// (encrypted PDFs, or ones using embedded CID/Identity-H fonts that need a
// ToUnicode CMap we don't parse).

// Finds `N G obj ... stream\n...\nendstream` blocks anywhere in the file.
// We deliberately skip full object-graph / xref / page-tree parsing — every
// FlateDecode (or raw) stream in the file is a candidate, and non-text
// streams (fonts, images) simply won't yield Tj/TJ matches.
const OBJECT_STREAM_PATTERN = /(\d+)\s+\d+\s+obj([\s\S]*?)stream\r?\n([\s\S]*?)endstream/g

function latin1Decode(bytes: Uint8Array): string {
  let out = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return out
}

function latin1Encode(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 0xff
  }
  return bytes
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const stream = new Blob([ab]).stream().pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

// Walks a PDF literal string starting just after '(', respecting escaped
// and balanced-nested parens per the PDF spec, and returns the raw
// (still-escaped) content plus the index right after the closing ')'.
function readParenString(text: string, start: number): { content: string; end: number } | null {
  let depth = 1
  let i = start
  let content = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      content += ch + (text[i + 1] ?? '')
      i += 2
      continue
    }
    if (ch === '(') depth += 1
    if (ch === ')') {
      depth -= 1
      if (depth === 0) return { content, end: i + 1 }
    }
    content += ch
    i += 1
  }
  return null
}

function unescapePdfString(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\\') {
      out += raw[i]
      continue
    }
    const next = raw[i + 1]
    if (next === 'n') { out += '\n'; i += 1 }
    else if (next === 'r') { out += '\n'; i += 1 }
    else if (next === 't') { out += '\t'; i += 1 }
    else if (next === '(' || next === ')' || next === '\\') { out += next; i += 1 }
    else if (next >= '0' && next <= '7') {
      const octal = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? ''
      out += String.fromCharCode(Number.parseInt(octal, 8) & 0xff)
      i += octal.length
    } else if (next === '\n' || next === undefined) {
      i += 1 // line-continuation escape, or trailing backslash — drop it
    } else {
      out += next
      i += 1
    }
  }
  return out
}

function hexToString(hex: string): string {
  const clean = hex.replace(/\s/g, '')
  let out = ''
  for (let i = 0; i < clean.length - 1; i += 2) {
    out += String.fromCharCode(Number.parseInt(clean.slice(i, i + 2), 16))
  }
  return out
}

// Pulls Tj / TJ / ' / " text-showing operator content out of one decoded
// content stream, inserting a line break at each text-positioning operator
// (Td/TD/T*) so output reads as roughly one line per moved text run.
function extractRunsFromContentStream(text: string): string {
  const lines: string[] = []
  let current = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '(') {
      const result = readParenString(text, i + 1)
      if (!result) break
      current += unescapePdfString(result.content)
      i = result.end
      continue
    }
    if (ch === '<' && text[i + 1] !== '<') {
      const end = text.indexOf('>', i + 1)
      if (end === -1) break
      current += hexToString(text.slice(i + 1, end))
      i = end + 1
      continue
    }
    // Text-positioning operators start a new line in the output.
    if (text.startsWith('Td', i) || text.startsWith('TD', i) || text.startsWith('T*', i)) {
      if (current.trim()) lines.push(current.trim())
      current = ''
      i += 2
      continue
    }
    i += 1
  }
  if (current.trim()) lines.push(current.trim())
  return lines.join('\n')
}

// Returns extracted plain text, or null if this doesn't look like a
// readable PDF, or if extraction produced text that's mostly non-printable
// (a strong signal of an embedded CID/Identity-H font we can't decode
// correctly) — we'd rather say "couldn't read this" than feed garbage into
// the match engine.
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const raw = latin1Decode(bytes)
    if (!raw.startsWith('%PDF-')) return null

    const parts: string[] = []
    for (const match of raw.matchAll(OBJECT_STREAM_PATTERN)) {
      const dict = match[2]
      // The PDF spec allows (and many writers emit) an EOL right before the
      // `endstream` keyword that is not part of the stream data itself —
      // strip it, or it corrupts FlateDecode inflation.
      const streamRaw = match[3].replace(/\r\n$|[\r\n]$/, '')
      const streamBytes = latin1Encode(streamRaw)

      let contentBytes: Uint8Array | null = streamBytes
      if (dict.includes('/FlateDecode')) {
        contentBytes = await inflateZlib(streamBytes)
      } else if (/\/Filter\s*\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)/.test(dict)) {
        continue // image data, not text
      }
      if (!contentBytes) continue

      const contentText = latin1Decode(contentBytes)
      const runs = extractRunsFromContentStream(contentText)
      if (runs) parts.push(runs)
    }

    const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    if (!text) return null

    const printable = text.match(/[\x20-\x7E\n]/g)?.length ?? 0
    if (printable / text.length < 0.85) return null

    return text
  } catch {
    return null
  }
}
