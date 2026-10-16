# The weekly loop

The point of this tool is that posting five times a week stops depending on you having a free evening. Here is the shape of a week.

## Sunday, about 30 minutes — review

1. `npm run dev`, open the calendar. Anything Claude drafted is in **Needs your review**.
2. Open a post. The left side is the real slide, not a mock-up. Swipe through the filmstrip the way someone on Instagram would.
3. Check the **Review** tab: blockers in red, judgement calls in amber, and every factual claim with its source. Mark a fact verified once you have seen the source yourself.
4. Fix small things in place — a word in a headline, a hashtag, the date — and **Save changes**.
5. **Approve** what is ready. **Request changes** on what is not; your note goes into the post's history, which is where Claude picks it up.
6. Download the pack for each approved post. Schedule them in Instagram at 7:30 PM IST, or post at the time.

## During the week — Claude drafts

Ask for a week at a time:

> Draft the Oct 27 packing carousel and the Oct 26 budget reel. Check every price against an operator's own page before you write the slides.

Claude writes the JSON, renders the slides, checks the facts it can, and leaves them in review. Anything it cannot confirm stays flagged, so it reaches you as a question rather than a claim.

Ask for changes in plain language — "slide 4 is doing too much, split it", "make the cover hook shorter", "swap the compare slide for bullets". It edits the file; you refresh.

## Sunday, 15 minutes — what worked

Instagram Insights, five numbers per post: saves, shares, reach from non-followers, profile visits and follows, link taps. Then:

- Which two posts got the most saves and shares? Ask for one more like each next week.
- Which reel lost people in the first three seconds? That hook gets rewritten.
- Did 7:30 PM work? Test one earlier and one later slot.
- Which Story polls got answers? Those are next week's topics.

Put the numbers in the post's `notes` as you go. After three weeks they are the only real evidence of what this audience wants.

## If you edit a file outside the app

Fine — it is just JSON, and git tracks it. Two things to know:

- The editor holds an etag. If the file changed underneath you, saving stops and offers you both versions rather than overwriting one.
- Editing an approved post un-approves it. That is deliberate: an approval is a signature over exactly the words you read.

## Things worth keeping consistent

- **One voice.** Short sentences, no hype, no emoji storms. If a line would make you wince reading it aloud, cut it.
- **Useful before clever.** Every post should leave someone able to do something: book better, pack better, pick a spot.
- **Never name an operator as a recommendation** unless you have used them. Describing a place is not the same as vouching for a business.
- **No marketplace talk.** Not yet. The content is the proof; the platform comes when there is something to show.
