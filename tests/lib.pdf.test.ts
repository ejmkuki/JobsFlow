// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractPdfText } from '../src/lib/pdf'

// Hand-builds a minimal PDF containing one content-stream object with real
// text-showing operators. No xref/trailer/page-tree needed — the extractor
// deliberately doesn't parse those; it scans for `N G obj ... stream ...
// endstream` blocks directly, so this loose (not fully spec-valid) file is
// enough to exercise it faithfully.
function buildPdfBytes(contentStream: string, options: { compress?: boolean } = {}): Promise<Uint8Array> {
  const header = '%PDF-1.4\n'
  const objHeader = options.compress ? '1 0 obj\n<< /Length 1 /Filter /FlateDecode >>\nstream\n' : '1 0 obj\n<< /Length 1 >>\nstream\n'
  const footer = '\nendstream\nendobj\n'

  if (!options.compress) {
    const bytes = new TextEncoder().encode(header + objHeader + contentStream + footer)
    return Promise.resolve(bytes)
  }

  return (async () => {
    const compressedStream = new Blob([new TextEncoder().encode(contentStream)])
      .stream()
      .pipeThrough(new CompressionStream('deflate'))
    const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer())
    const prefix = new TextEncoder().encode(header + objHeader)
    const suffix = new TextEncoder().encode(footer)
    const out = new Uint8Array(prefix.length + compressed.length + suffix.length)
    out.set(prefix, 0)
    out.set(compressed, prefix.length)
    out.set(suffix, prefix.length + compressed.length)
    return out
  })()
}

function toFile(bytes: Uint8Array, name = 'resume.pdf'): File {
  return new File([bytes], name, { type: 'application/pdf' })
}

const sampleContent =
  'BT /F1 12 Tf 72 720 Td (Senior Database Engineer) Tj 0 -14 Td (8 years Oracle and MongoDB) Tj ET'

describe('extractPdfText', () => {
  it('extracts text-showing operator content from an uncompressed content stream', async () => {
    const bytes = await buildPdfBytes(sampleContent)
    const text = await extractPdfText(toFile(bytes))
    expect(text).toBe('Senior Database Engineer\n8 years Oracle and MongoDB')
  })

  it('extracts text from a FlateDecode-compressed content stream', async () => {
    const bytes = await buildPdfBytes(sampleContent, { compress: true })
    const text = await extractPdfText(toFile(bytes))
    expect(text).toBe('Senior Database Engineer\n8 years Oracle and MongoDB')
  })

  it('handles escaped parens and hex strings', async () => {
    const content = 'BT (He said \\(hello\\)) Tj 0 -14 Td <48656c6c6f> Tj ET'
    const bytes = await buildPdfBytes(content)
    const text = await extractPdfText(toFile(bytes))
    expect(text).toBe('He said (hello)\nHello')
  })

  it('returns null for a file that is not a PDF', async () => {
    const text = await extractPdfText(toFile(new TextEncoder().encode('not a pdf at all')))
    expect(text).toBeNull()
  })

  it('returns null rather than garbled text when extraction looks unreadable', async () => {
    // Simulates a CID/Identity-H-encoded content stream: text-showing
    // operators are present, but the "characters" are mostly non-printable
    // byte values, not real WinAnsi/Latin text.
    const garbage = Array.from({ length: 40 }, (_, i) => String.fromCharCode(0x80 + (i % 100))).join('')
    const content = `BT (${garbage}) Tj ET`
    const bytes = await buildPdfBytes(content)
    const text = await extractPdfText(toFile(bytes))
    expect(text).toBeNull()
  })
})
