// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractDocxText } from '../src/lib/docx'

// Hand-builds a minimal single-entry ZIP (the .docx container) so the test
// has no dependency on a real Word file or a zip library.
async function buildDocxZip(xml: string, method: 'stored' | 'deflate'): Promise<File> {
  const content = new TextEncoder().encode(xml)
  const filename = new TextEncoder().encode('word/document.xml')

  let compressed: Uint8Array
  if (method === 'stored') {
    compressed = content
  } else {
    const stream = new Blob([content]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    compressed = new Uint8Array(await new Response(stream).arrayBuffer())
  }

  const methodCode = method === 'stored' ? 0 : 8
  const localHeaderOffset = 0

  const local = new DataView(new ArrayBuffer(30))
  local.setUint32(0, 0x04034b50, true)
  local.setUint16(4, 20, true)
  local.setUint16(6, 0, true)
  local.setUint16(8, methodCode, true)
  local.setUint16(10, 0, true)
  local.setUint16(12, 0, true)
  local.setUint32(14, 0, true)
  local.setUint32(18, compressed.length, true)
  local.setUint32(22, content.length, true)
  local.setUint16(26, filename.length, true)
  local.setUint16(28, 0, true)

  const central = new DataView(new ArrayBuffer(46))
  central.setUint32(0, 0x02014b50, true)
  central.setUint16(4, 20, true)
  central.setUint16(6, 20, true)
  central.setUint16(8, 0, true)
  central.setUint16(10, methodCode, true)
  central.setUint16(12, 0, true)
  central.setUint16(14, 0, true)
  central.setUint32(16, 0, true)
  central.setUint32(20, compressed.length, true)
  central.setUint32(24, content.length, true)
  central.setUint16(28, filename.length, true)
  central.setUint16(30, 0, true)
  central.setUint16(32, 0, true)
  central.setUint16(34, 0, true)
  central.setUint16(36, 0, true)
  central.setUint32(38, 0, true)
  central.setUint32(42, localHeaderOffset, true)

  const centralDirOffset = 30 + filename.length + compressed.length
  const centralDirSize = 46 + filename.length

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, 1, true)
  eocd.setUint16(10, 1, true)
  eocd.setUint32(12, centralDirSize, true)
  eocd.setUint32(16, centralDirOffset, true)
  eocd.setUint16(20, 0, true)

  const blob = new Blob([
    new Uint8Array(local.buffer),
    filename,
    compressed,
    new Uint8Array(central.buffer),
    filename,
    new Uint8Array(eocd.buffer),
  ])
  return new File([blob], 'resume.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

const sampleXml =
  '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:body>' +
  '<w:p><w:r><w:t>Senior Database Engineer</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>8 years Oracle</w:t></w:r><w:r><w:t xml:space="preserve"> &amp; MongoDB</w:t></w:r></w:p>' +
  '</w:body></w:document>'

describe('extractDocxText', () => {
  it('extracts paragraph text from a stored (uncompressed) docx', async () => {
    const file = await buildDocxZip(sampleXml, 'stored')
    const text = await extractDocxText(file)
    expect(text).toBe('Senior Database Engineer\n8 years Oracle & MongoDB')
  })

  it('extracts paragraph text from a deflate-compressed docx', async () => {
    const file = await buildDocxZip(sampleXml, 'deflate')
    const text = await extractDocxText(file)
    expect(text).toBe('Senior Database Engineer\n8 years Oracle & MongoDB')
  })

  it('returns null for a non-zip file', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'not-a-docx.docx')
    const text = await extractDocxText(file)
    expect(text).toBeNull()
  })
})
