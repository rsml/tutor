---
marp: true
theme: sylvan-dark
paginate: false
html: true
---

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- IMAGE: Replace — hero image evoking learning, books, or craft -->
![bg](https://picsum.photos/seed/design-loop/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Design the Loop</h1>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Hero — learning, books, or craft</p>

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

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

![bg contain](https://picsum.photos/seed/library/1920/1080)

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 8px;">SCREENSHOT: Library — books with AI covers and progress bars</p>

<!--
Fallback. "Here's the library. Each book was generated for this reader,
with an AI cover and a progress bar."
-->

---

<!-- FALLBACK: Reader + Inline Chat -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

![bg contain](https://picsum.photos/seed/reader/1920/1080)

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 8px;">SCREENSHOT: Reader with inline chat panel slid out</p>

<!--
Fallback. "Click any sentence and a chat panel explains it.
Dismiss it and you're right back where you were."
-->

---

<!-- FALLBACK: Quiz + Feedback -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

![bg contain](https://picsum.photos/seed/quiz/1920/1080)

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 8px;">SCREENSHOT: Quiz panel and feedback form</p>

<!--
Fallback. "After each chapter: a quiz. Then a feedback form.
These aren't afterthoughts — they're the most important features in the product."
-->

---

<!-- BRIDGE -->

<div style="text-align: center; margin-top: 80px;">

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 60px;">That app works because of</p>

<p style="font-size: 96pt; font-weight: 700; color: #eb9b41;">12 decisions</p>

<p style="font-size: 44pt; color: #a0a0a0; margin-top: 60px;">that apply to any AI product</p>

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

<!-- IMAGE: Replace — bedrock, blueprint, or architectural foundation -->
![bg](https://picsum.photos/seed/bedrock/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Foundations</h1>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Bedrock, blueprint, or foundation</p>

<!--
"Three decisions you make before anyone touches a keyboard."
-->

---

<!-- PRINCIPLE 1 -->

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">Foundations</p>

## Product first, AI second

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">Remove the AI. Does your product still make sense?</p>

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

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- IMAGE: Replace — ancient books, library, something timeless -->
![bg](https://picsum.photos/seed/ancient-books/1920/1080)

<div style="width: 100%; padding: 60px 80px;">
<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">Foundations</p>

<h2 style="text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Steal from something ancient</h2>

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">Meet your users where they already are</p>
</div>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Ancient books, library, something timeless</p>

<!--
"Books. Chapters. Quizzes. Table of contents.
Humans have used this format for centuries.
Nobody needs a tutorial to use Tutor.

The technology is radical. The interaction model is ancient.
That's why it works — zero learning curve.

When you pick your product's metaphor, look for ones people already carry around.
The best AI products feel familiar on the outside and magical on the inside."
-->

---

<!-- PRINCIPLE 3 -->

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">Foundations</p>

## Your format is your best prompt

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">Product design beats prompt engineering</p>

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

<!-- IMAGE: Replace — doorway, threshold, first light -->
![bg](https://picsum.photos/seed/threshold/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">The First Experience</h1>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Doorway, threshold, or first light</p>

<!--
"What happens when someone opens your product for the first time."
-->

---

<!-- PRINCIPLE 4 -->

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">The First Experience</p>

## Steer before it's expensive

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">Let users course-correct before you spend the compute</p>

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

<!-- TOC screenshot -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

![bg contain](https://picsum.photos/seed/toc/1920/1080)

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 8px;">SCREENSHOT: TOC approval — editable, reorderable chapter list</p>

<!--
Show the TOC screen. "30 seconds here saves hours of wasted generation."
-->

---

<!-- PRINCIPLE 5 -->

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">The First Experience</p>

## Generate late, not early

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">The later you generate, the more you know about your user</p>

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

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- IMAGE: Replace — something tangible, a physical object, a book on a shelf -->
![bg](https://picsum.photos/seed/artifact/1920/1080)

<div style="width: 100%; padding: 60px 80px;">
<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">The First Experience</p>

<h2 style="text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Make things, not responses</h2>

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">Give users something they'd call "mine"</p>
</div>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Something tangible — book on a shelf, physical object</p>

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

<!-- IMAGE: Replace — cycles, spiral, feedback loop, gears -->
![bg](https://picsum.photos/seed/spiral/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">The Loop</h1>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Cycles, spiral, or feedback loop</p>

<!--
"This is the core of the talk. The thing that makes everything else matter."
-->

---

<!-- PRINCIPLE 7 -->

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">The Loop</p>

## Make them work for it

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">Wrong answers are your most valuable signal</p>

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

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">The Loop</p>

## Watch hands, not mouths

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">What users do tells you more than what they say</p>

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

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">The Loop</p>

## Close the loop

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">Feed every interaction back into the next one</p>

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

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

![bg contain](https://picsum.photos/seed/loop-diagram/1920/1080)

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 8px;">DIAGRAM: Circular loop — Read &rarr; Quiz &rarr; Feedback &rarr; Generate &rarr; Read</p>

<!--
Let the visual do the work. Pause.
"Read. Quiz. Feedback. Generate. Each cycle, the book gets smarter about you."
-->

---

<!-- ═══════════════════════════════════════════════════════════════════════
     ACT 4: THE LONG GAME
     ═══════════════════════════════════════════════════════════════════════ -->

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- IMAGE: Replace — time, growth, compounding — tree rings, roots, horizon -->
![bg](https://picsum.photos/seed/horizon/1920/1080)

<h1 style="width: 100%; text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">The Long Game</h1>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Time, growth — tree rings, roots, or horizon</p>

<!--
"What happens over weeks and months. What compounds and becomes yours."
-->

---

<!-- PRINCIPLE 10 -->

<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px;">The Long Game</p>

## Adapt, don't just personalize

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px;">Settings pages are static. Feedback loops are alive.</p>

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

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- IMAGE: Replace — someone pointing at something specific, magnifying glass, close-up -->
![bg](https://picsum.photos/seed/focus/1920/1080)

<div style="width: 100%; padding: 60px 80px;">
<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">The Long Game</p>

<h2 style="text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Help where the confusion is</h2>

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">Don't send users to a chatbot. Go to them.</p>
</div>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Focus, pointing, magnifying glass</p>

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

<!-- _style: "section { padding: 0; justify-content: flex-start; }" -->

<!-- IMAGE: Replace — open door, keys, unlocked gate -->
![bg](https://picsum.photos/seed/open-door/1920/1080)

<div style="width: 100%; padding: 60px 80px;">
<p style="font-size: 38pt; color: #a0a0a0; margin-bottom: 20px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">The Long Game</p>

<h2 style="text-shadow: 0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);">Give control to earn trust</h2>

<p style="font-size: 48pt; color: #a0a0a0; margin-top: 80px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">Let users leave and they'll stay</p>
</div>

<p style="position: absolute; bottom: 40px; right: 60px; font-size: 24pt; color: rgba(255,200,100,0.7); text-shadow: 0 2px 8px rgba(0,0,0,0.8);">IMAGE: Open door, keys, or unlocked gate</p>

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

<p style="font-size: 44pt; color: #a0a0a0; margin-bottom: 60px;">The one thing</p>

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
