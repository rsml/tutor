# Demo Day Rehearsal Script

**Event:** Nashville Product Meetup — 9th Semi-Annual Community Demo Day
**Date:** May 20, 2026
**Slot:** ~10 minutes + Q&A
**Format:** Pure demo. One slide at the end (Thanks/QR). App already open on screen.
**Structure:** The Layered Reveal — each layer forces the audience to revise what they think they're looking at.

---

## Before You Start

- Tutor open to a pre-existing book with 5+ chapters completed (e.g. "Cognitive Architecture")
- Have the chapter reader open on a chapter mid-way through the book (chapter 3 or 4)
- The chapter should be scrolled to the top, ready to read
- Thanks/QR slide queued in a separate window (Cmd-Tab to it at the end)
- Wifi confirmed working, API key set

---

## Layer 1: "It looks like a normal e-book" (0:00 – 1:30)

**What you show:** The chapter reader. Scroll through it slowly.

**What you say:**

> "I built an AI learning app called Tutor. This is a chapter from a book on cognitive architecture."

Scroll. Let them see the formatting — bold terms, key insights, headers, maybe a diagram.

> "Looks like a normal e-book, right?"

Pause. Let them nod.

**Why this works:** You're setting the floor low. They think they know what this is. Everything after this is a surprise.

---

## Layer 2: "It tests you" (1:30 – 3:00)

**What you show:** Navigate to the quiz at the end of the chapter. Three multiple-choice questions.

**What you say:**

> "After every chapter, there's a quiz. Three questions on what you just read."

Answer two correctly. Get one wrong — genuinely wrong if possible, or pick one you know is wrong.

> "I got that one wrong."

Pause. Don't explain yet. Just let it sit.

**Why this works:** A quiz is mildly interesting. But they're about to find out why the wrong answer matters.

---

## Layer 3: "It listens" (3:00 – 4:30)

**What you show:** The feedback form that appears after the quiz.

**What you say:**

> "Now it asks me: what worked? What didn't?"

Type something real into the feedback form. Something like: "Too much theory. I wanted a concrete example of how this applies to a real code review."

> "This isn't a survey. This is a prompt. What I type here shapes the next chapter."

Submit the feedback.

**Why this works:** The audience is starting to revise. This isn't a static e-book. It's listening.

---

## Layer 4: "It rewrites itself" (4:30 – 6:30)

**What you show:** Open the next chapter. Read the opening paragraph aloud.

**What you say:**

Before opening:

> "Watch the opening of the next chapter."

Open it. Read the first few sentences aloud. The chapter should open with a brief recap of the concept you got wrong, and the content should be more concrete / example-driven based on the feedback.

> "It opened with a recap of what I got wrong. And the whole chapter shifted — more examples, less theory. Because I asked."

Pause.

> "Every chapter is shaped by the one before it. The quiz results, the feedback, your learning profile. Nobody else will ever see this chapter. It was written for me."

**Why this works:** This is the big reveal. The thing they thought was a static e-book is actually adaptive. This is where the "wait, really?" lands.

---

## Layer 5: "It goes to you" (6:30 – 7:30)

**What you show:** Select a sentence in the chapter. The action menu appears (Explain, Discuss, Go deeper). Click one. The inline chat panel slides out with the sentence already loaded. Ask a question. Get an answer. Dismiss.

**What you say:**

Select a sentence.

> "I don't understand this sentence. So I click it."

Click Explain. Chat slides out.

> "The AI already has the sentence loaded. It knows what chapter I'm in, what book I'm reading, what I've struggled with."

The response appears.

> "Dismiss. I'm right back where I was. That took five seconds."

Dismiss the panel.

> "Most AI products make you leave to get help. Copy, paste, re-explain the context. This one goes to you."

**Why this works:** Another revision. It's not just adaptive across chapters — it's adaptive within a sentence. The audience keeps revising upward.

---

## Layer 6: "It's been keeping score" (7:30 – 9:00)

**What you show:** Navigate to the learning profile (or the book-complete screen if available, then the profile update).

**What you say:**

> "One more thing."

Open the learning profile. Scroll slowly through the accumulated skills — behavioral economics, cognitive bias mitigation, decision-making frameworks — each with a proficiency score.

> "I never filled this out. The app built this from five books of quizzes, feedback, and reading behavior. Book one didn't know any of this. Book five knows all of it."

Pause. Let them read it.

> "That's the difference between an AI product and an AI demo. Demos are stateless. This remembers."

**Why this works:** The final revision. Everything they saw — the quiz, the feedback, the adaptive chapter — was quietly feeding this profile the whole time. The punchline is that the product has been learning them while they were learning from it.

---

## Close (9:00 – 9:45)

Navigate back to the library. Let them see the covers, the progress bars, the collection of books.

> "This is Tutor. AI-generated books that rewrite themselves based on how you're learning. It's free and open source."

Cmd-Tab to the Thanks/QR slide.

> "rossmiller.dev/tutor. Try it tonight — pick something you've been meaning to learn."

Leave the QR up for Q&A.

---

## Timing Checkpoints

| Time | Layer | You should be... |
|------|-------|-----------------|
| 0:00 | 1 | Scrolling through the chapter |
| 1:30 | 2 | Starting the quiz |
| 3:00 | 3 | On the feedback form |
| 4:30 | 4 | Opening the next chapter |
| 6:30 | 5 | Clicking a sentence for inline chat |
| 7:30 | 6 | Opening the learning profile |
| 9:00 | Close | Back on the library, then QR slide |

If you're at layer 4 and it's already 7:00, skip the inline chat (layer 5) and go straight to the profile (layer 6). Layers 4 and 6 are the ones that can't be cut.

---

## What Can Go Wrong

| Risk | Mitigation |
|------|-----------|
| AI generation is slow | Use a pre-existing book with chapters already generated. Only the feedback → next chapter transition needs to feel live. If needed, say "this generates in about 30 seconds — let me show you one that's already ready" and open a pre-loaded chapter. |
| Wifi dies | Everything is local — filesystem storage, Electron app. Only AI generation needs network. If it fails, show pre-generated content and say "it generates in the background." |
| Quiz doesn't have a good wrong answer | Pre-read the quiz. Know which one to get wrong. Pick one where the recap will be visible in the next chapter. |
| You run long | Cut layer 5 (inline chat). It's impressive but not essential. Layers 4 and 6 carry the narrative. |
| You run short | Spend more time on layer 4 — read more of the adaptive chapter aloud. Or show the library and covers before closing. |

---

## The One Idea

If the audience remembers one thing: **this thing learns you while you learn from it.**

Everything in the demo serves that. If a moment doesn't serve it, skip it.
