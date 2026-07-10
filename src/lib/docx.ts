// Client-side .docx text extraction. A .docx file is a ZIP archive; the
// document body lives at word/document.xml as WordprocessingML. We parse
// just enough of the ZIP central directory to locate that one entry,
// inflate it if needed, and pull text out of <w:t> runs. No dependency —
// ZIP parsing + DecompressionStream('deflate-raw') are both native.

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIR_SIGNATURE = 0x02014b50
const TARGET_ENTRY = 'word/document.xml'

function findEndOfCentralDirectory(view: DataView): number {
  const maxCommentLength = 65557
  const start = Math.max(0, view.byteLength - maxCommentLength)
  for (let i = view.byteLength - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      return i
    }
  }
  return -1
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Pull readable text out of WordprocessingML: text runs (<w:t>), tabs, and
// paragraph breaks. Good enough for resume matching, not a full renderer.
function xmlToPlainText(xml: string): string {
  const paragraphs = xml.split(/<\/w:p>/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const withTabs = paragraph.replace(/<w:tab\s*\/>/g, '\t').replace(/<w:br\s*\/>/g, '\n')
    const runs = [...withTabs.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXmlText(m[1]))
    const line = runs.join('').trim()
    if (line) lines.push(line)
  }
  return lines.join('\n')
}

// Returns extracted plain text, or null if the file isn't a readable .docx
// (wrong format, corrupt zip, unsupported compression).
export async function extractDocxText(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)

    const eocdOffset = findEndOfCentralDirectory(view)
    if (eocdOffset === -1) return null

    let centralDirOffset = view.getUint32(eocdOffset + 16, true)
    const totalEntries = view.getUint16(eocdOffset + 10, true)

    let localHeaderOffset = -1
    let compressionMethod = -1
    let compressedSize = 0

    for (let i = 0; i < totalEntries; i += 1) {
      if (view.getUint32(centralDirOffset, true) !== CENTRAL_DIR_SIGNATURE) break
      const method = view.getUint16(centralDirOffset + 10, true)
      const size = view.getUint32(centralDirOffset + 20, true)
      const nameLength = view.getUint16(centralDirOffset + 28, true)
      const extraLength = view.getUint16(centralDirOffset + 30, true)
      const commentLength = view.getUint16(centralDirOffset + 32, true)
      const offset = view.getUint32(centralDirOffset + 42, true)
      const nameBytes = bytes.slice(centralDirOffset + 46, centralDirOffset + 46 + nameLength)
      const name = new TextDecoder('utf-8').decode(nameBytes)

      if (name === TARGET_ENTRY) {
        localHeaderOffset = offset
        compressionMethod = method
        compressedSize = size
        break
      }
      centralDirOffset += 46 + nameLength + extraLength + commentLength
    }

    if (localHeaderOffset === -1) return null

    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize)

    let xmlBytes: Uint8Array
    if (compressionMethod === 0) {
      xmlBytes = compressedData
    } else if (compressionMethod === 8) {
      xmlBytes = await inflate(compressedData)
    } else {
      return null
    }

    const xml = new TextDecoder('utf-8').decode(xmlBytes)
    const text = xmlToPlainText(xml)
    return text.trim() || null
  } catch {
    return null
  }
}
