/** Collapse whitespace and cap a text so health details and findings stay one line. */
export function oneLine(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/** Cap a multi-line text, keeping its first `maxLines` lines. */
export function clipLines(text: string, maxLines = 20, maxChars = 4000): string {
  const lines = text.split(/\r?\n/)
  const kept = lines.slice(0, maxLines).join('\n')
  return kept.length <= maxChars ? kept : `${kept.slice(0, maxChars)}…`
}
