/**
 * Strips anything shaped like an HTML or XML tag from reader-authored
 * freeform text, chapter feedback and TOC revision requests, before it is
 * interpolated into an AI prompt that wraps the text in its own tags, such
 * as generate-next-chapter.ts's <reader_liked> and <reader_disliked>
 * wrappers. Without this, an unsanitized "<" in the reader's own words
 * could close that wrapper early. The match is a blunt regex, not an HTML
 * parser, so a reader's literal angle brackets, describing a <Component>
 * in code, say, are stripped too, not just real markup.
 */
export const sanitizeFeedback = (s: string) => s.replace(/<\/?[^>]+>/g, '')
