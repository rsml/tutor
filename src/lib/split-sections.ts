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

function splitAtHeadings(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let currentLines: string[] = []
  let currentTitle: string | null = null

  for (const line of lines) {
    if (/^## /.test(line)) {
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

function splitByParagraphs(markdown: string, targetWords: number): Section[] {
  const paragraphs = markdown.split(/\n{2,}/)
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
    const allParas = markdown.split(/\n{2,}/)
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
