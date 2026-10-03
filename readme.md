# KeyStrokes

**type anything. it becomes a song.**

A software instrument. You type words, the words become notes. Or you play a
whole piano that lives inside your browser tab. Either way, no hardware was
harmed in the making of this.

Made for the [Crescent Instrument card](https://crescent.hackclub.com/guides/instrument) — software only, because I don't own a soldering iron and I'm not about to start now.

---

## just let me play

Open `index.html`. That's it. Double click it, drag it into a browser, whatever.
No install, no build step, no `npm install` that takes 4 minutes and then tells
you it needs Python.

**Type it:** click the parchment, then type literally anything.

```
a b c d e ... z   ->  notes
space             ->  kick drum
enter             ->  snare
1 2 3 4 5 6 7 8   ->  the rest of the drum kit
backspace         ->  takes it back (emotionally and musically)
```

Type your name. Type a meme. Type your crush's name. It all sounds good,
because everything is locked to a pentatonic scale — that's the cheat code
that means you physically cannot play a wrong note. Mash the keyboard. I dare you.

Then hit **LOOP** and your sentence plays back on repeat with drums and a bass
line underneath it. Congratulations, you made a track out of the word "skibidi".

---

## piano mode

Switch to the **Piano** tab. It'll ask you how to play first (there's a `?`
button if you forget, because you will).

```
white keys:  A S D F G H J K L ; '
black keys:  W E T Y U O P
Z / X        shift octave down / up
space        hold to sustain
1 - 8        drum kit, right there under the keys
```

Works with your real keyboard, or just click/tap the keys on screen. Works on
your phone too, which is how I know someone's going to play this in class.

Every keypress does the little 3D push animation, throws a ripple across the
key and floats a music note into the air, because a piano key that doesn't
react to you is just a drawing of a piano key.

---

## the knobs

| knob | what it does |
|------|--------------|
| **TEMPO** | how fast the loop runs, 60–180 BPM |
| **ECHO** | delay amount. push it up. push it way up. |
| **WOBBLE** | vibrato/tremolo. makes everything sound haunted in a nice way |
| **TONE** | piano brightness, dark and moody to bright and stabby |
| **VOLUME** | the obvious one |

**RECORD** grabs what you're playing and downloads it as a `.wav`. Yes a real
one. Put it in your DAW, nobody has to know it came from a website.

---

## how it makes sound

**Every single sound is synthesised live in your browser. No samples. No mp3s.
No audio files at all.** If you deleted the `assets` folder the music would
still work, it just wouldn't look as nice.

- **Type beats notes** — three stacked oscillators (saw + triangle + an octave-up
  sine) through a low-pass filter that snaps shut on every note. That filter
  movement is 90% of why it sounds like a synth and not like a hospital beep.
- **Piano** — additive synthesis. Six sine waves stacked at harmonic intervals
  (1×, 2×, 3×, 4×, 5×, 6× the note), each a little detuned from the others so
  it beats and shimmers instead of sounding like a test tone. Plus a tiny burst
  of noise at the very start of every note — that's the hammer hitting the
  string. Real pianos have it, so this one does too.
- **Drums** — kick is a sine wave that drops from 150Hz to 44Hz in 130ms
  (that pitch drop is the whole trick). Snare and hi-hat are filtered noise.
  Crash is a long filtered noise tail with echo on it.
- **Envelope** — nothing starts or stops instantly. Fast 6ms attack, long
  exponential decay. Instant on/off gives you a click, and a click is not music.
- **Echo** — a delay line with feedback, shared across everything.

Under the hood: plain **Web Audio API**, hand written, zero libraries. No Tone.js,
no framework, no `node_modules` folder the size of a small country.

---

## what's in the box

```
keystrokes/
  index.html      the whole app
  style.css       all the purple and cream
  audio.js        every sound you'll hear
  app.js          typing, piano, knobs, loops, the fun part
  assets/         bg, logo, parchment, fonts, icon
```

Fonts are **National Park** and **Young Serif**, same ones Crescent uses, so
this thing sits next to the site like it grew up there.

---

## known limitations

- Safari's Web Audio is a bit sleepy about starting. Click once and it wakes up.
- If you hold 40 keys at once your computer will think about it. Fair enough.
- The bass line on LOOP follows your melody and assumes you're in a good mood.

---

made by a teen for **hackclub ysws - music** ✦
