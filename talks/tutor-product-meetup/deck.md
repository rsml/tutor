---
marp: true
theme: sylvan-dark
paginate: false
html: true
---

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- PLACEHOLDER: Replace with a striking hero image — something about learning, books, or craft -->
![bg](https://picsum.photos/seed/design-loop/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Design the Loop</h1>

<!--
Let it breathe. Then:

"I built an AI product. Not a chatbot. Not a wrapper around an API.
A learning app that generates books tailored to how you learn.
I want to show it to you — then I want to talk about the product decisions
that made it actually work."
-->

---

<div style="text-align: center; margin-top: 160px;">

<p style="font-size: 96pt; font-weight: 700; color: #eb9b41;">Let me show you</p>

</div>

<!--
Switch to the app for a live demo. 3-4 minutes.

DEMO SCRIPT:
1. Show the library — books with AI covers, progress bars (20s)
2. Create a new book — enter a topic and prompt (30s)
3. AI generates a table of contents — reorder a chapter, approve (30s)
4. Open a chapter — scroll, show formatting and diagrams (30s)
5. Click a sentence — inline chat slides out, ask a question, dismiss (30s)
6. Finish chapter — quiz appears, answer one wrong on purpose (20s)
7. Give feedback — "too abstract, more examples" (20s)
8. Show next chapter — opens with a recap of what you got wrong (20s)
9. Flash the EPUB export and AI cover generation (20s)

If demo breaks, advance through the next three fallback slides.
-->

---

<!-- FALLBACK: Library -->
<!-- SCREENSHOT: Tutor library page — 4-5 books with AI-generated covers, progress bars -->

![bg contain](https://picsum.photos/seed/library/1920/1080)

<!--
Fallback. "Here's the library. Each book was generated for this reader,
with an AI cover and a progress bar."
-->

---

<!-- FALLBACK: Reader + Inline Chat -->
<!-- SCREENSHOT: Chapter open with inline chat panel slid out on a selected sentence -->

![bg contain](https://picsum.photos/seed/reader/1920/1080)

<!--
Fallback. "Click any sentence and a chat panel explains it.
Dismiss it and you're right back where you were."
-->

---

<!-- FALLBACK: Quiz + Feedback -->
<!-- SCREENSHOT: Quiz panel with a question + feedback form below -->

![bg contain](https://picsum.photos/seed/quiz/1920/1080)

<!--
Fallback. "After each chapter: a quiz. Then a feedback form.
These aren't afterthoughts — they're the most important features in the product."
-->

---

<!-- BRIDGE -->

<div style="text-align: center; margin-top: 80px;">

<p style="font-size: 52pt; color: #a0a0a0; margin-bottom: 60px;">That app works because of</p>

<p style="font-size: 96pt; font-weight: 700; color: #eb9b41;">12 decisions</p>

<p style="font-size: 52pt; color: #a0a0a0; margin-top: 60px;">that apply to any AI product</p>

</div>

<!--
"Everything you just saw works because of specific product decisions.
Not engineering decisions. Product decisions.
And every one of them applies to whatever you're building."
-->

---

<!-- ═══════════════════════════════════════════════════════════════════════
     ACT 1: FOUNDATIONS
     ═══════════════════════════════════════════════════════════════════════ -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- PLACEHOLDER: Replace with an image evoking bedrock, blueprint, or foundation -->
![bg](https://picsum.photos/seed/bedrock/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Foundations</h1>

<!--
"Three decisions you make before anyone touches a keyboard."
-->

---

<!-- PRINCIPLE 1 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">Foundations</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Product first, AI second</p>

<p style="font-size: 42pt; color: #a0a0a0;">Remove the AI. Does your product still make sense?</p>

<!--
"Tutor is a learning app. Books, chapters, quizzes, progress tracking.
Remove the AI and hand-write the chapters — the product still works.

That's the test. If your product is just a pretty skin over an API call,
you don't have a product. You have a demo.

The book metaphor, the chapter structure, the quiz loop —
all of that has value on its own. AI makes it magical. The product makes it useful."
-->

---

<!-- PRINCIPLE 2 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">Foundations</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Steal from something ancient</p>

<p style="font-size: 42pt; color: #a0a0a0;">Books. Chapters. Quizzes. Table of contents.</p>

<!--
"Humans have used this format for centuries.
Nobody needs a tutorial to use Tutor.
You know what a chapter is. You know what a quiz is.

The technology is radical. The interaction model is ancient.
That's why it works — zero learning curve.

When you pick your product's metaphor, look for ones people already carry around.
The best AI products feel familiar on the outside and magical on the inside."
-->

---

<!-- PRINCIPLE 3 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">Foundations</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Your format is your best prompt</p>

<p style="font-size: 42pt; color: #a0a0a0;">Structure does more than instructions</p>

<!--
"'Write me a book about economics' — you get generic filler.

'Write a 1,500-word chapter on supply and demand
from an approved outline, for a reader who said the last chapter
was too abstract and got two questions wrong about pricing' —
you get something genuinely good.

The difference isn't smarter instructions. It's a smarter product structure.
The chapter length, the quiz results, the feedback form —
those constrain the AI into a shape where it actually performs.

You don't need better prompts. You need better product design."
-->

---

<!-- ═══════════════════════════════════════════════════════════════════════
     ACT 2: THE FIRST EXPERIENCE
     ═══════════════════════════════════════════════════════════════════════ -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- PLACEHOLDER: Replace with a first-light / dawn / threshold image -->
![bg](https://picsum.photos/seed/threshold/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">The First Experience</h1>

<!--
"What happens when someone opens your product for the first time."
-->

---

<!-- PRINCIPLE 4 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The First Experience</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Steer before it's expensive</p>

<p style="font-size: 42pt; color: #a0a0a0;">Put the gate where a small correction prevents a large waste</p>

<!--
"You create a book. The AI generates a table of contents.
12 proposed chapters. You can reorder, remove, add. Then approve.

Editing a 12-line outline: 30 seconds.
Editing 12 wrong chapters: hours.

AI proposes. You approve. Then the expensive work begins.
The gate goes where steering is cheapest.

Where's the highest-leverage moment in your product for the user to say
'yes, go' or 'no, change course'? Put the gate there."
-->

---

<!-- SCREENSHOT: TOC approval step in the wizard — showing editable, reorderable chapter list -->

![bg contain](https://picsum.photos/seed/toc/1920/1080)

<!--
Show the TOC screen. "30 seconds here saves hours of wasted generation."
-->

---

<!-- PRINCIPLE 5 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The First Experience</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Generate late, not early</p>

<p style="font-size: 42pt; color: #a0a0a0;">Early generation locks in ignorance</p>

<!--
"Chapter 8 doesn't exist until you finish chapter 7.

That means chapter 8 has your quiz results, your feedback,
the questions you asked — signal that didn't exist when the book started.

Generate everything up front and chapter 8 is generic.
Generate it after seven chapters of learning about you — it's personal.

The temptation is to generate everything at once. Feels faster.
But early generation locks in ignorance. Late generation captures learning."
-->

---

<!-- PRINCIPLE 6 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The First Experience</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Make things, not responses</p>

<p style="font-size: 42pt; color: #a0a0a0;">Artifacts create ownership</p>

<!--
"A chat response is ephemeral. Close the tab, it's gone.

A Tutor book has a title, a cover, chapters, a progress bar.
People say 'my book on economics.'
Nobody says 'my ChatGPT response on economics.'

Export it as an EPUB. Read it on a Kindle. Give it to a friend.
The AI output became a thing you own, not a moment you had.

If users would describe your output as 'mine' — you've crossed
a line that most AI products never reach."
-->

---

<!-- ═══════════════════════════════════════════════════════════════════════
     ACT 3: THE LOOP
     ═══════════════════════════════════════════════════════════════════════ -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- PLACEHOLDER: Replace with an image evoking cycles, feedback, or spirals -->
![bg](https://picsum.photos/seed/spiral/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">The Loop</h1>

<!--
"This is the core of the talk. The thing that makes everything else matter."
-->

---

<!-- PRINCIPLE 7 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The Loop</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Make them work for it</p>

<p style="font-size: 42pt; color: #a0a0a0;">Friction is the feature</p>

<!--
"After every chapter: a quiz. Three questions.

Sounds like bad UX. You just read something — now you're taking a test?
But it works. Cognitive scientists call it 'desirable difficulty.'
The struggle to recall what you just read is what makes it stick.
Easy content is forgettable. Challenge creates retention.

And the product insight: every wrong answer is the most valuable
signal the AI can get. It now knows exactly what you didn't understand.

Most products treat failure as a dead end.
This one treats it as a gift. The friction is the feature."
-->

---

<!-- PRINCIPLE 8 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The Loop</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Watch hands, not mouths</p>

<p style="font-size: 42pt; color: #a0a0a0;">Behavior tells you what feedback forms can't</p>

<!--
"Which sentences did they click for help?
How far did they scroll? Which questions did they get wrong?
How long did they spend?

These signals are more honest than any survey.
People say 'the chapter was great.' Their behavior says
they stopped reading at paragraph three and asked the AI
to explain the same thing twice.

The product captures this as a side effect of normal use.
No interruptions. No pop-up surveys. Just paying attention.

What behaviors in your product reveal what your users would never say?"
-->

---

<!-- PRINCIPLE 9 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The Loop</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Close the loop</p>

<p style="font-size: 42pt; color: #a0a0a0;">Every output feeds the next input</p>

<!--
"This is the payoff. This is why the quiz exists.
This is why the feedback form exists.

Got a question wrong? The next chapter opens with a recap.
Said 'too abstract'? More examples next time.
The learning profile updates across books.

Every interaction makes the next one better.

Most AI products are one-shot. Generate. Deliver. Done.
The product that closes the loop compounds in a way
a single-turn product never can.

This is the moat. Anyone can call the same API.
Nobody can replicate the accumulated understanding of your user."
-->

---

<!-- LOOP DIAGRAM -->
<!-- PLACEHOLDER: Create a clean circular diagram —
     Read → Quiz → Feedback → Generate → Read
     Each arrow labeled with the signal it carries.
     White on dark. Minimal. Iconic. -->

![bg contain](images/placeholder-loop-diagram.svg)

<!--
Let the visual do the work. Pause.
"Read. Quiz. Feedback. Generate. Each cycle, the book gets smarter about you."
-->

---

<!-- ═══════════════════════════════════════════════════════════════════════
     ACT 4: THE LONG GAME
     ═══════════════════════════════════════════════════════════════════════ -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- PLACEHOLDER: Replace with an image evoking time, growth, compounding — roots, rings, horizon -->
![bg](https://picsum.photos/seed/horizon/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">The Long Game</h1>

<!--
"What happens over weeks and months. What compounds and becomes yours."
-->

---

<!-- PRINCIPLE 10 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The Long Game</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Adapt, don't just personalize</p>

<p style="font-size: 42pt; color: #a0a0a0;">Personalization is a settings page. Adaptation is a feedback loop.</p>

<!--
"Personalized: 'you said you like visual examples.' That's a settings page.

Adaptive: 'you got three questions wrong about market sizing,
so this chapter opens with a walkthrough using diagrams.'
That's a feedback loop.

Personalization is static. Set once, applies forever.
Adaptation is dynamic. Learns from every interaction. Changes in real time.

The first adaptation is the moment users get hooked.
It's the aha — 'this thing is actually paying attention to me.'

Book five knows you better than book one.
That's not personalization. That's a relationship."
-->

---

<!-- PRINCIPLE 11 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The Long Game</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Help where the confusion is</p>

<p style="font-size: 42pt; color: #a0a0a0;">Not in a chatbot. At the point of need.</p>

<!--
"You're reading. A sentence doesn't click.
You tap it. A panel slides out with that sentence already loaded.
You ask 'what does this mean?' The AI explains — in context.
Dismiss the panel. Right back where you were.

Compare that to a chatbot. Copy the text. Switch windows.
Paste it. Explain what you're reading. Ask your question. Get an answer.
Find your place again.

Context-specific help at the point of confusion
versus general help in a separate room. It's not close.

Where in your product do users get stuck?
Can you put help right there — pre-loaded with what they need?"
-->

---

<!-- PRINCIPLE 12 -->

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 40px;">The Long Game</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; margin-bottom: 0.3em;">Give control to earn trust</p>

<p style="font-size: 42pt; color: #a0a0a0;">The product that lets you leave is the one you stay with</p>

<!--
"Bring your own API key. Choose your model. Your books live on your machine.
Export to EPUB — take everything and leave whenever you want.
The code is open source. Every prompt, every data flow, inspectable.

These aren't features. They're trust signals.

In a world where every AI product wants your data and wants you locked in,
the product that hands you the keys earns the long-term relationship.

The paradox: the freedom to leave is what makes people stay.

What control could you give your users that would make them trust you more?"
-->

---

<!-- ═══════════════════════════════════════════════════════════════════════
     CLOSING
     ═══════════════════════════════════════════════════════════════════════ -->

<div style="text-align: center; margin-top: 60px;">

<p style="font-size: 52pt; color: #a0a0a0; margin-bottom: 60px;">The one thing</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; line-height: 1.3; margin-bottom: 40px;">Anyone can call the API</p>

<p style="font-size: 80pt; font-weight: 700; color: #eb9b41; line-height: 1.3;">Design the loop</p>

</div>

<!--
"Every one of you can call the same AI I do.
The API is not the product. The loop is the product.

What structure do you wrap around the AI?
What signals do you capture from normal usage?
How do you feed those signals back into the next generation?

Answer those three questions and you have an AI product.
Skip them and you have a demo."
-->

---

<div style="text-align: center; margin-top: 160px;">

<p style="font-size: 96pt; font-weight: 700; color: #eb9b41;">Thanks</p>

<p style="font-size: 42pt; color: #a0a0a0; margin-top: 60px;">rossmiller.dev/tutor</p>

</div>

<!--
Leave up during Q&A.
-->
