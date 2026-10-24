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
- Notes: typed (with key-point star), photos, video (frame extracted for AI), audio recording with live browser speech recognition.
- Record and type at once: notes typed (and photos taken) while a session is recording are stamped with their time in the recording; tapping the stamp plays the talk from there, and briefs read the notes woven into the transcript where they were written. Live transcription survives silences and offers Resume when the browser stops it.
- Transcript clean-up (Wispr Flow style): Claude removes fillers, false starts and repetitions, keeps self-corrections' final form, adds punctuation and paragraphs, and fixes misheard names using the session, the agenda's speakers and companies, and the user's vocabulary. Never summarises; the raw transcript is kept and can be shown or restored. Per recording after a confirmation, or automatically when the user turns it on in Settings.
- Files can be dragged onto a session (photos, videos, documents) or pasted into the note field; a drop target shows which session they go to.
- Brief: Claude API called from the browser with the user's own key (stored only on the device); on-device extractive fallback without a key. 
- Sessions are marked attended when a brief is created; can be toggled manually.
- Quick notes for informal moments (booth visits, hallway conversations, meetups): stamped with the date and time, titled on the device from what was written (Suggest Title asks Claude for a better one), tagged by kind.
- End-of-day wrap-up per day and conference takeaways across everything; exported on the device as PDF (print), Word (.docx) or PowerPoint (.pptx), or saved to Google Docs.
- Layout: the sidebar and the sessions column collapse independently; Focus mode gives the selected session the whole window (full screen on Mac).
- Venue maps: the user adds the venue's floor plans (PDF or image; one plan per page). After one confirmation Claude reads every room on every page, matches them to the agenda and the app draws a simple layout of each level; a PDF's own text centres rooms exactly, and without a key the PDF text alone places the agenda's rooms. Each session's location opens its level with the room highlighted; rooms can be searched, fixed by hand, and they sync through Drive.
- Briefs can be shared, copied or saved as a Google Doc.
- All Briefings lists every session brief, day wrap-up and the conference takeaways, flags ones with newer notes, and deletes any or all of them across devices (notes are never deleted with them).
- Nothing is sent to Claude without the user asking and confirming: briefs, wrap-ups, takeaways, one-tap brief changes and title suggestions each show what will be sent first.
- No server. Local storage is IndexedDB; sync is Google Drive.
- Transcription: with the user's Deepgram key (stored only on the device), the microphone is streamed to Deepgram (nova-3) for a live transcript with speaker labels and key terms from the vocabulary and agenda; any saved recording can be transcribed again from its audio. Without a key, the browser's Web Speech API is used, which is made for close dictation and misses most of a talk on iPhone. Claude cannot take audio. iPhone stops a web page's microphone when the screen locks or another app takes over: the recording bar says so (Save & Continue), a paused audio engine offers Tap to Resume, each recording keeps a log of what happened, and Settings has a Microphone Check that tests every step from the microphone to words on screen.

## Brand Commitments

- Apple design language (macOS / iOS Human Interface Guidelines feel): the user explicitly asked for it. System font (SF Pro via the platform stack) is part of that commitment.
- Colours and type modelled on apple.com: white and #F5F5F7 surfaces, near-black #1D1D1F ink, Apple blue #0071E3 accent (requested Oct 2026, replacing the earlier soft warm tones). SF Pro on Apple devices, Inter as the close match elsewhere.
- Light, Dark and Auto (follow device) themes with an explicit switch.

## Product Principles

1. The talk comes first: capturing a note is one keystroke or one tap, never a dialog.
2. One obvious next step on every screen.
3. Feels like an app that shipped with the Mac, not a website.
4. The user's data stays theirs: on their devices and in their own Drive.
