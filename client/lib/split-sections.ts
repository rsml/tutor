export interface Section {
  index: number
  title: string | null
  markdown: string
  wordCount: number
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

interface Segment {
  title: string | null
  markdown: string
  wordCount: number
}

/** Check if a line opens or closes a fenced code block (``` or ~~~). */
function isFenceLine(line: string): boolean {
  return /^(`{3,}|~{3,})/.test(line.trim())
}

function splitAtHeadings(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let currentLines: string[] = []
  let currentTitle: string | null = null
  let inFence = false

  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence
    }

    if (!inFence && /^## /.test(line)) {
      // Flush previous segment
      if (currentLines.length > 0) {
        const md = currentLines.join('\n').trim()
        if (md) {
          segments.push({ title: currentTitle, markdown: md, wordCount: countWords(md) })
        }
      }
      currentTitle = line.replace(/^## /, '').trim()
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }

  // Flush last segment
  if (currentLines.length > 0) {
    const md = currentLines.join('\n').trim()
    if (md) {
      segments.push({ title: currentTitle, markdown: md, wordCount: countWords(md) })
    }
  }

  return segments
}

/**
 * Split markdown on blank lines, but treat fenced code blocks as atomic —
 * blank lines inside fences do not cause a split.
 */
function splitParagraphsPreservingFences(markdown: string): string[] {
  const lines = markdown.split('\n')
  const paragraphs: string[] = []
  let current: string[] = []
  let inFence = false

  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence
      current.push(line)
      continue
    }

    if (!inFence && line.trim() === '') {
      if (current.some(l => l.trim() !== '')) {
        paragraphs.push(current.join('\n').trim())
        current = []
      }
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    const trimmed = current.join('\n').trim()
    if (trimmed) paragraphs.push(trimmed)
  }

  return paragraphs
}

function splitByParagraphs(markdown: string, targetWords: number): Section[] {
  const paragraphs = splitParagraphsPreservingFences(markdown)
  const sections: Section[] = []
  let currentParagraphs: string[] = []
  let currentWordCount = 0

  for (const para of paragraphs) {
    const wc = countWords(para)
    if (currentWordCount >= targetWords && currentParagraphs.length > 0) {
      const md = currentParagraphs.join('\n\n').trim()
      sections.push({ index: sections.length, title: null, markdown: md, wordCount: countWords(md) })
      currentParagraphs = []
      currentWordCount = 0
    }
    currentParagraphs.push(para)
    currentWordCount += wc
  }

  // Flush remaining
  if (currentParagraphs.length > 0) {
    const md = currentParagraphs.join('\n\n').trim()
    sections.push({ index: sections.length, title: null, markdown: md, wordCount: countWords(md) })
  }

  // Ensure minimum 2 sections
  if (sections.length < 2 && sections.length === 1) {
    const allParas = splitParagraphsPreservingFences(markdown)
    if (allParas.length >= 2) {
      const mid = Math.ceil(allParas.length / 2)
      const first = allParas.slice(0, mid).join('\n\n').trim()
      const second = allParas.slice(mid).join('\n\n').trim()
      return [
        { index: 0, title: null, markdown: first, wordCount: countWords(first) },
        { index: 1, title: null, markdown: second, wordCount: countWords(second) },
      ]
    }
  }

  return sections
}

const MIN_WORDS = 300
const MAX_WORDS = 700

export function splitChapterIntoSections(markdown: string): Section[] {
  const segments = splitAtHeadings(markdown)

  // Fallback: no ## headings found (only 1 segment)
  if (segments.length <= 1) {
    return splitByParagraphs(markdown, 350)
  }

  // Merge small adjacent segments greedily
  const merged: Segment[] = []
  let accumTitle: string | null = null
  let accumLines: string[] = []
  let accumWords = 0

  for (const seg of segments) {
    if (accumWords >= MIN_WORDS && accumLines.length > 0) {
      // Close current accumulation
      merged.push({
        title: accumTitle,
        markdown: accumLines.join('\n\n'),
        wordCount: accumWords,
      })
      accumTitle = seg.title
      accumLines = [seg.markdown]
      accumWords = seg.wordCount
    } else if (accumWords + seg.wordCount > MAX_WORDS && accumLines.length > 0 && accumWords > 0) {
      // Would exceed max — close current, start new
      merged.push({
        title: accumTitle,
        markdown: accumLines.join('\n\n'),
        wordCount: accumWords,
      })
      accumTitle = seg.title
      accumLines = [seg.markdown]
      accumWords = seg.wordCount
    } else {
      // Accumulate
      if (accumLines.length === 0) {
        accumTitle = seg.title
      }
      accumLines.push(seg.markdown)
      accumWords += seg.wordCount
    }
  }

  // Flush remaining
  if (accumLines.length > 0) {
    merged.push({
      title: accumTitle,
      markdown: accumLines.join('\n\n'),
      wordCount: accumWords,
    })
  }

  // Ensure minimum 2 sections
  if (merged.length === 1 && segments.length >= 2) {
    const mid = Math.ceil(segments.length / 2)
    const first = segments.slice(0, mid)
    const second = segments.slice(mid)
    return [
      {
        index: 0,
        title: first[0].title,
        markdown: first.map(s => s.markdown).join('\n\n'),
        wordCount: first.reduce((sum, s) => sum + s.wordCount, 0),
      },
      {
        index: 1,
        title: second[0].title,
        markdown: second.map(s => s.markdown).join('\n\n'),
        wordCount: second.reduce((sum, s) => sum + s.wordCount, 0),
      },
    ]
  }

  return merged.map((seg, i) => ({
    index: i,
    title: seg.title,
    markdown: seg.markdown,
    wordCount: seg.wordCount,
  }))
}
