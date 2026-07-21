export const sanitizeFeedback = (s: string) => s.replace(/<\/?[^>]+>/g, '')
