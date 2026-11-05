import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

function printable(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    out += (code >= 32 && code <= 126) || ch === '\n' || ch === '\t' ? ch : '?'
  }
  return out
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  for (const raw of text.split('\n')) {
    const line = printable(raw)
    if (!line) {
      lines.push('')
      continue
    }
    let rest = line
    while (rest.length > width) {
      let cut = rest.lastIndexOf(' ', width)
      if (cut < 24) cut = width
      lines.push(rest.slice(0, cut).trimEnd())
      rest = rest.slice(cut).trimStart()
    }
    lines.push(rest)
  }
  return lines
}

/** A text-layer PDF the mailroom can extract. Used when an email has no PDF or image attachment. */
export async function textToPdf(title: string, body: string): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const lines = wrap(`${title}\n\n${body}`.slice(0, 20_000), 92)
  const size = 11
  const leading = 15
  const margin = 54
  let page = doc.addPage([612, 792])
  let y = 792 - margin
  page.drawText(printable(title).slice(0, 90), { x: margin, y, size: 14, font: bold, color: rgb(0.06, 0.1, 0.19) })
  y -= 28
  for (const line of lines.slice(title ? 2 : 0)) {
    if (y < margin) {
      page = doc.addPage([612, 792])
      y = 792 - margin
    }
    page.drawText(line, { x: margin, y, size, font, color: rgb(0.1, 0.14, 0.22) })
    y -= leading
  }
  return Buffer.from(await doc.save())
}
