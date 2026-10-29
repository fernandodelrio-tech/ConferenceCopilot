# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Single self-contained HTML file (`copilot/index.html`), no install and no build step. Hosted on GitHub Pages; opened in Safari or Chrome on Mac, iPad and iPhone.

## Users

One conference attendee taking notes during live sessions. Primary device is a Mac laptop open on their lap during talks, typing a lot; iPad and iPhone are secondary (quick photos of slides, recording the speaker, rereading briefs between sessions).

## Product Purpose

Conference Copilot turns the attendee's agenda into one notebook per session. During a talk they capture typed notes, photos of slides, short videos and a recording of the speaker with a live transcript. When the session ends, Copilot makes sense of everything and writes a brief with key takeaways and learnings, then marks the session attended. Success: the attendee leaves each session with a brief they will actually reread, without fiddling with the tool during the talk.

## Operating Context

- Used live, in a dim conference room, while listening. Attention belongs to the speaker; the tool must be operable at a glance.
- State must carry across Mac, iPad and iPhone through the user's own Google Drive (drive.file scope, a "Conference Copilot" folder).
- Agenda arrives as pasted text, a calendar (.ics) export, or a photo/PDF of the printed program.

## Capabilities and Constraints

- Agenda import: paste text (heuristic or Claude), .ics, photo/PDF (Claude), single session form, sample agenda.
- Adding a typed note: Return (Shift-Return for a new line, the Mac default), ⌘-Return, a key combination the user records, or the send button only (the iPhone default); chosen in Settings → Notes or from the hint under the note field, saved per device.
- Notes: typed (with key-point star), photos, video (frame extracted for AI), audio recording with live browser speech recognition.
- Record and type at once: notes typed (and photos taken) while a session is recording are stamped with their time in the recording; tapping the stamp plays the talk from there, and briefs read the notes woven into the transcript where they were written. Live transcription survives silences and offers Resume when the browser stops it.
- Transcript clean-up (Wispr Flow style): Claude removes fillers, false starts and repetitions, keeps self-corrections' final form, adds punctuation and paragraphs, and fixes misheard names using the session, the agenda's speakers and companies, and the user's vocabulary. Never summarises; the raw transcript is kept and can be shown or restored. Per recording after a confirmation, or automatically when the user turns it on in Settings.
- Fix Photo (crop button on each photo): Straighten, on the device, finds the slide or screen by growing the room inward from the photo's edges (dark title bars and text stay part of the slide), puts draggable corners on it with a magnifier, estimates the true shape from the perspective (snapping to 16:9 or 4:3), and warps it square, with Rotate, Whole Photo and an optional Enhance. Recreate with Claude, after confirming, sends the (straightened) photo and gets back a faithful SVG redrawing (same text, layout, tables and simple charts; pictures become labelled boxes), which is sanitised (only drawing elements, no scripts, links or external resources), rendered to PNG and saved as a new photo next to the original or in its place; its text goes into briefs instead of a second image. A fixed photo shows Original and Undo; the original is always kept.
- Files can be dragged onto a session (photos, videos, documents) or pasted into the note field; a drop target shows which session they go to.
- Brief: Claude API called from the browser with the user's own key (stored only on the device); on-device extractive fallback without a key. 
- Sessions are marked attended when a brief is created; can be toggled manually.
- Quick notes for informal moments (booth visits, hallway conversations, meetups): stamped with the date and time, titled on the device from what was written (Suggest Title asks Claude for a better one), tagged by kind.
- Catch Up: sessions the user can't attend are flagged (Catch Up Later on a session that has started or passed, or from the session menu ahead of time) with how they'll catch up (the recording, the post-session summary, or whichever comes first), an optional link and a note. Flagged sessions leave To Attend and Now & Next and gather in a Catch Up list (to catch up, then caught up). On the session: open the link, transcribe a downloaded recording file with Deepgram (files over 100 MB stay on the device; the transcript syncs), paste the summary as a document, take notes while watching, and mark it caught up. Its brief and the wrap-ups say it was caught up afterwards rather than attended live, and creating the brief marks it caught up.
- End-of-day wrap-up per day and conference takeaways; before creating or refreshing one, the user ticks which sessions and quick notes go in (and, for the takeaways, which day wrap-ups), with All and None per day. Choices are remembered per wrap-up, synced (newest choice wins per item), and new sessions start included; the briefing says how many were left out. Exported on the device as PDF (print), Word (.docx) or PowerPoint (.pptx), or saved to Google Docs.
- Versions for different readers: each day wrap-up and the takeaways can have a version For me (detailed, each point cited to its session), For my team (context for colleagues who weren't there, what it means for us, ideas to try), For executives (bottom line first: implications, recommendations, decisions needed) and an Email or Slack update (subject and ready-to-send prose, with Open in Mail). Each has its own length (short, standard, detailed), source citations on or off, and an optional note to tailor it; the last choices per reader are remembered on the device. Every version can be edited by hand (headline, summary, sections) or changed by asking Claude (typed, or one-tap suggestions that confirm first), with Undo/Redo; editing takeaways flags the slide deck as older and offers to update it. Versions sync independently and a deleted one stays deleted.
- Layout: the sidebar and the sessions column collapse independently; Focus mode gives the selected session the whole window (full screen on Mac).
- Now & Next: in a session happening today, an Up next card says when it ends, what starts next (with overlapping choices), in how many minutes, the room, whether it's in a different building, and a map button; the same at a glance at the top of Today and All Sessions, and as a full view (now, up next, later today, or the next day) in the sidebar.
- Flights: the user adds flights (number and date, or from a pasted confirmation or photo read by Claude after confirming); tapping Update fetches status, scheduled/expected/actual times, terminal, gate and baggage belt from AeroDataBox (RapidAPI key stored on the device). Nothing is checked in the background; stale data is marked. A Leave by time = latest departure − time to be there early − trip to the airport. Flights on travel days appear in Now & Next.
- Venue maps: the user adds the venue's floor plans (PDF or image; one plan per page). After one confirmation Claude reads every room on every page, matches them to the agenda and the app draws a simple layout of each level; a PDF's own text centres rooms exactly, and without a key the PDF text alone places the agenda's rooms. Each session's location opens its level with the room highlighted; rooms can be searched, fixed by hand, and they sync through Drive.
- Briefs can be shared, copied or saved as a Google Doc.
- All Briefings lists every session brief, day wrap-up and the conference takeaways, flags ones with newer notes, and deletes any or all of them across devices (notes are never deleted with them).
- Briefs, wrap-ups and takeaways show each section as a titled card (icon, title, number of points), two columns where there is room, with an outline of the section titles that stays at the top while reading, jumps to a section and shows which one is being read. Tapping ✦ on a section starts a request to Claude about just that section. The requests made so far stay with each brief or version as a conversation, kept through Undo. On Mac and iPad the wrap-up opens almost full screen with Ask Claude and the actions beside the text; on iPhone the request box stays pinned under the text, with suggestions in a row above it.
- Nothing is sent to Claude without the user asking and confirming: briefs, wrap-ups, takeaways, one-tap brief changes and title suggestions each show what will be sent first.
- No server. Local storage is IndexedDB; sync is Google Drive.
- Transcription: with the user's Deepgram key (stored only on the device), the microphone is streamed to Deepgram (nova-3) for a live transcript with speaker labels and key terms from the vocabulary and agenda; any saved recording can be transcribed again from its audio. Without a key, the browser's Web Speech API is used, which is made for close dictation and misses most of a talk on iPhone. Claude cannot take audio. With Deepgram, iPhone's voice processing is off (it erases distant speakers, and its automatic gain goes with it), so the app boosts quiet speech itself before sending it: a rumble filter, a compressor and an automatic gain that rises only while there is speech above the room's noise (Settings: Normal, High, Maximum). The saved recording is not altered. Accents and rooms: the speakers' language includes English (India) and English + Hindi (mixed), Deepgram's code-switching model; an Echoey hall room setting cuts the low-mid boom where reverberation builds up, lifts the consonants, and eases compression and boost (to ×8) so the echo isn't amplified with the voice. Both are set in Settings and can be overridden per session (⋯ → Speakers & Room), apply to Transcribe Again, and are passed to transcript clean-up so it expects accent-related mishearings and keeps Indian English phrasing. iPhone stops a web page's microphone when the screen locks or another app takes over: the recording bar says so (Save & Continue), a paused audio engine offers Tap to Resume, each recording keeps a log of what happened, and Settings has a Microphone Check that tests every step from the microphone to words on screen: it shows the sample rate and processing used and how many times Deepgram replied, and Stop and Listen plays the raw microphone next to the last 12 seconds exactly as sent to Deepgram, with what to do for each outcome. Before audio is reduced to Deepgram's 16 kHz, an 8th-order low-pass at 7 kHz removes what 16 kHz can't hold, so hiss and sibilance don't fold back into the speech band; a Quiet speech boost of Off sends the microphone at its own level.

## Brand Commitments

- Apple design language (macOS / iOS Human Interface Guidelines feel): the user explicitly asked for it. System font (SF Pro via the platform stack) is part of that commitment.
- Colours and type modelled on apple.com: white and #F5F5F7 surfaces, near-black #1D1D1F ink, Apple blue #0071E3 accent (requested Oct 2026, replacing the earlier soft warm tones). SF Pro on Apple devices, Inter as the close match elsewhere.
- Light, Dark and Auto (follow device) themes with an explicit switch.

## Product Principles

1. The talk comes first: capturing a note is one keystroke or one tap, never a dialog.
2. One obvious next step on every screen.
3. Feels like an app that shipped with the Mac, not a website.
4. The user's data stays theirs: on their devices and in their own Drive.
