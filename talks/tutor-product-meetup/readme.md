# Design the Loop

15-20 minute product meetup talk on building AI products, using Tutor as a case study.

## Thesis

Anyone can call the API. The product decisions that matter are: what structure you wrap around the AI, what signals you capture from normal usage, and how you feed those signals back. Design the loop.

## Structure

| Section | Duration | Content |
|---------|----------|---------|
| Live demo | 3-4 min | Walk through Tutor: create book, read, quiz, feedback, adaptation |
| Foundations | 3 min | Product first; steal ancient metaphors; format is the prompt |
| First Experience | 3 min | Steer before expensive; generate late; make artifacts |
| The Loop | 4 min | Friction as feature; behavioral signals; close the loop |
| The Long Game | 4 min | Adapt not personalize; contextual help; trust through control |
| Close | 1 min | "Anyone can call the API. Design the loop." |

## Commands

- `pnpm dev.talk` — preview with live reload
- `pnpm build.talk` — export to `dist/index.html`

## Files

| File | Purpose |
|------|---------|
| `deck.md` | Marp slide deck |
| `theme.css` | Custom dark Marp theme (shared with ai-harness) |
| `images/` | Screenshots, diagrams, and photos |

## TODO

- [ ] Replace picsum placeholder images with real photos
- [ ] Capture Tutor screenshots for fallback/demo slides
- [ ] Create loop diagram SVG
- [ ] Rehearse demo flow
