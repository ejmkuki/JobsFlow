// Client-side PDF text extraction (browser). No dependency — same
// philosophy as lib/docx.ts. Kept as a separate copy from
// functions/lib/pdf.ts because functions/ and src/ are different
// TypeScript project roots; the extraction logic is identical, only the
// entry point differs (File here vs raw bytes on the server). PDFs are a
// much messier format than a zip: this is a best-effort content-stream
// scanner, not a full parser. It works well for the common case
// (Word/Docs/Chrome "export to PDF", including embedded CID/Identity-H
// subset fonts via their /ToUnicode CMap) and honestly returns null — never
// garbled mojibake — when it can't confidently read a file (encrypted
// PDFs, or CID fonts with no embedded ToUnicode map to decode against).

// Finds `N G obj ... endobj` blocks anywhere in the file — dict-only objects
// (Font, Resources) as well as ones with an embedded stream. We deliberately
// skip full xref / page-tree parsing; every stream is a candidate, and
// non-text streams (images, font programs) simply won't yield Tj/TJ matches.
const OBJECT_PATTERN = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g

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

// Decodes a hex string as 2-byte CID codes (Identity-H encoding) through a
// font's parsed /ToUnicode map. Unmapped CIDs are dropped rather than
// guessed at.
function decodeCidHex(hex: string, cmap: Map<number, string>): string {
  const clean = hex.replace(/\s/g, '')
  let out = ''
  for (let i = 0; i + 4 <= clean.length; i += 4) {
    const cid = Number.parseInt(clean.slice(i, i + 4), 16)
    out += cmap.get(cid) ?? ''
  }
  return out
}

function decodeUtf16BEHex(hex: string): string {
  const clean = hex.replace(/\s/g, '')
  let out = ''
  for (let i = 0; i + 4 <= clean.length; i += 4) {
    out += String.fromCharCode(Number.parseInt(clean.slice(i, i + 4), 16))
  }
  return out
}

// Parses a /ToUnicode CMap stream's bfchar/bfrange blocks into a CID ->
// Unicode-string map, per the PDF spec's CMap text format.
function parseToUnicodeCMap(cmapText: string): Map<number, string> {
  const map = new Map<number, string>()
  const hexToken = /<([0-9A-Fa-f]+)>/g

  for (const block of cmapText.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const tokens = [...block[1].matchAll(hexToken)].map((m) => m[1])
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      map.set(Number.parseInt(tokens[i], 16), decodeUtf16BEHex(tokens[i + 1]))
    }
  }

  const entryPattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[\s\S]*?\]|<[0-9A-Fa-f]+>)/g
  for (const block of cmapText.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(entryPattern)) {
      const lo = Number.parseInt(entry[1], 16)
      const hi = Number.parseInt(entry[2], 16)
      const dst = entry[3]
      if (dst.startsWith('[')) {
        const items = [...dst.matchAll(hexToken)].map((m) => m[1])
        for (let cid = lo, idx = 0; cid <= hi && idx < items.length; cid += 1, idx += 1) {
          map.set(cid, decodeUtf16BEHex(items[idx]))
        }
      } else {
        const baseHex = dst.slice(1, -1)
        const baseUnits: number[] = []
        for (let i = 0; i + 4 <= baseHex.length; i += 4) baseUnits.push(Number.parseInt(baseHex.slice(i, i + 4), 16))
        for (let cid = lo, offset = 0; cid <= hi; cid += 1, offset += 1) {
          const units = baseUnits.slice()
          units[units.length - 1] += offset
          map.set(cid, units.map((u) => String.fromCharCode(u)).join(''))
        }
      }
    }
  }
  return map
}

// Pulls Tj / TJ / ' / " text-showing operator content out of one decoded
// content stream, inserting a line break at each text-positioning operator
// (Td/TD/T*) so output reads as roughly one line per moved text run. Hex
// strings are decoded as 2-byte CIDs through fontNameToCMap when the
// currently selected font (tracked via `/Name size Tf`) is a CID font with a
// known ToUnicode map; otherwise as plain 1-byte codes.
function extractRunsFromContentStream(text: string, fontNameToCMap: Map<string, Map<number, string>>): string {
  const lines: string[] = []
  let current = ''
  let currentFont = ''
  let inArray = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '[') { inArray = true; i += 1; continue }
    if (ch === ']') { inArray = false; i += 1; continue }
    // Many PDF writers never emit a literal space glyph for CID fonts —
    // word gaps show up instead as an oversized negative kerning offset
    // between glyph runs inside a TJ array. Tiny offsets (sub-few-unit,
    // real letter-spacing) are ignored; anything past this threshold is a
    // word boundary. Empirically these two populations don't overlap.
    if (inArray) {
      const numMatch = /^-?(?:\d+\.?\d*|\.\d+)/.exec(text.slice(i, i + 20))
      if (numMatch) {
        const value = Number.parseFloat(numMatch[0])
        if (Math.abs(value) > 50 && current.length > 0 && !current.endsWith(' ')) current += ' '
        i += numMatch[0].length
        continue
      }
    }
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
      const hex = text.slice(i + 1, end)
      const cmap = fontNameToCMap.get(currentFont)
      current += cmap ? decodeCidHex(hex, cmap) : hexToString(hex)
      i = end + 1
      continue
    }
    if (ch === '/') {
      const tfMatch = /^\/([A-Za-z0-9#+.\-]+)\s+[\d.]+\s+Tf/.exec(text.slice(i, i + 80))
      if (tfMatch) {
        currentFont = tfMatch[1]
        i += tfMatch[0].length
        continue
      }
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
// (a strong signal of a CID font with no usable ToUnicode map) — we'd rather
// say "couldn't read this" than feed garbage into the match engine.
export async function extractPdfText(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    const raw = latin1Decode(bytes)
    if (!raw.startsWith('%PDF-')) return null

    const dictByObj = new Map<number, string>()
    const streamByObj = new Map<number, Uint8Array>()

    for (const match of raw.matchAll(OBJECT_PATTERN)) {
      const objNum = Number(match[1])
      const body = match[2]
      const dictText = body.split(/\bstream\r?\n/)[0]
      dictByObj.set(objNum, dictText)

      const streamMatch = body.match(/stream\r?\n([\s\S]*?)endstream/)
      if (!streamMatch) continue

      // The PDF spec allows (and many writers emit) an EOL right before the
      // `endstream` keyword that is not part of the stream data itself —
      // strip it, or it corrupts FlateDecode inflation.
      const streamRaw = streamMatch[1].replace(/\r\n$|[\r\n]$/, '')
      const streamBytes = latin1Encode(streamRaw)

      let contentBytes: Uint8Array | null = streamBytes
      if (dictText.includes('/FlateDecode')) {
        contentBytes = await inflateZlib(streamBytes)
      } else if (/\/Filter\s*\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)/.test(dictText)) {
        continue // image data, not text
      }
      if (contentBytes) streamByObj.set(objNum, contentBytes)
    }

    // Resolve CID (Type0/Identity-H) fonts' /ToUnicode CMaps, keyed by the
    // font object number, then by the resource name(s) that reference them.
    const fontToUnicode = new Map<number, Map<number, string>>()
    const toUnicodeObjNums = new Set<number>()
    for (const [objNum, dictText] of dictByObj) {
      const toUnicodeMatch = dictText.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)
      if (!toUnicodeMatch) continue
      toUnicodeObjNums.add(Number(toUnicodeMatch[1]))
      if (!/\/Subtype\s*\/Type0/.test(dictText) && !dictText.includes('/Identity-H')) continue
      const cmapBytes = streamByObj.get(Number(toUnicodeMatch[1]))
      if (!cmapBytes) continue
      fontToUnicode.set(objNum, parseToUnicodeCMap(latin1Decode(cmapBytes)))
    }

    // Only the streams a /Type/Page object actually names via /Contents are
    // real content streams — everything else in the file (embedded font
    // programs, CIDToGIDMaps, ToUnicode CMaps) is binary or metadata that
    // happens to also be a FlateDecode stream, and scanning it for Tj/TJ
    // tokens produces noise. Font resource names (e.g. /F1) are only unique
    // within a single page's own /Resources dict — different pages commonly
    // assign the same name to different fonts — so each content stream gets
    // its owning page's own name->CMap map, not a document-wide union.
    // Fall back to scanning every stream (with no CID decoding) only for
    // malformed/unusual files where no /Contents refs were found at all.
    const contentObjNums = new Set<number>()
    const pageFontMapByContentObj = new Map<number, Map<string, Map<number, string>>>()
    for (const dictText of dictByObj.values()) {
      if (!/\/Type\s*\/Page\b/.test(dictText)) continue
      const contentRefs: number[] = []
      const single = dictText.match(/\/Contents\s+(\d+)\s+\d+\s+R/)
      if (single) contentRefs.push(Number(single[1]))
      const arrayMatch = dictText.match(/\/Contents\s*\[([\s\S]*?)\]/)
      if (arrayMatch) {
        for (const ref of arrayMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) contentRefs.push(Number(ref[1]))
      }
      if (contentRefs.length === 0) continue

      const pageFontMap = new Map<string, Map<number, string>>()
      for (const fontDictMatch of dictText.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
        for (const ref of fontDictMatch[1].matchAll(/\/([A-Za-z0-9#+.\-]+)\s+(\d+)\s+\d+\s+R/g)) {
          const cmap = fontToUnicode.get(Number(ref[2]))
          if (cmap) pageFontMap.set(ref[1], cmap)
        }
      }
      for (const objNum of contentRefs) {
        contentObjNums.add(objNum)
        pageFontMapByContentObj.set(objNum, pageFontMap)
      }
    }
    const targetObjNums = contentObjNums.size > 0 ? contentObjNums : new Set(streamByObj.keys())

    const parts: string[] = []
    for (const objNum of targetObjNums) {
      if (toUnicodeObjNums.has(objNum)) continue // the CMap stream itself, not page content
      const contentBytes = streamByObj.get(objNum)
      if (!contentBytes) continue
      const contentText = latin1Decode(contentBytes)
      const fontMap = pageFontMapByContentObj.get(objNum) ?? new Map<string, Map<number, string>>()
      const runs = extractRunsFromContentStream(contentText, fontMap)
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
