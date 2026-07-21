/**
 * Renders a SkillProgress rollup into the plain-text block
 * suggest-next-book.ts embeds as its skill-mastery evidence layer in the
 * book-suggestion prompt. Returns the empty string when there are no
 * skills yet, so a caller can fall back to its own "no data" placeholder
 * instead of showing an empty section.
 */
export function formatSkillProgress(result: import('@shared/responses.js').SkillProgress): string {
  if (result.skills.length === 0) return ''

  const { stats, skills } = result
  const lines: string[] = []

  lines.push(`Overall: ${stats.completedBooks}/${stats.totalBooks} books completed, ${stats.completedChapters}/${stats.totalChapters} chapters completed`)
  lines.push('')

  for (const skill of skills) {
    const pct = skill.totalWeight > 0 ? Math.round((skill.completedWeight / skill.totalWeight) * 100) : 0
    const bookList = skill.books.map(b => `${b.title} (${b.completed ? 'completed' : 'in progress'}${b.lastActivityAt ? `, last: ${b.lastActivityAt.split('T')[0]}` : ''})`).join(', ')
    lines.push(`${skill.name}: ${pct}% mastery${skill.lastActivityAt ? ` (last activity: ${skill.lastActivityAt.split('T')[0]})` : ''} — taught by: ${bookList}`)

    const weak = skill.subskills.filter(s => s.totalWeight > 0 && (s.completedWeight / s.totalWeight) < 0.5)
    const strong = skill.subskills.filter(s => s.totalWeight > 0 && (s.completedWeight / s.totalWeight) >= 0.5)

    if (weak.length > 0) {
      lines.push(`  Weak subskills (< 50%): ${weak.map(s => {
        const p = Math.round((s.completedWeight / s.totalWeight) * 100)
        return `${s.name} (${p}%)`
      }).join(', ')}`)
    }
    if (strong.length > 0) {
      lines.push(`  Strong subskills (>= 50%): ${strong.map(s => {
        const p = Math.round((s.completedWeight / s.totalWeight) * 100)
        return `${s.name} (${p}%)`
      }).join(', ')}`)
    }
  }

  return lines.join('\n')
}
