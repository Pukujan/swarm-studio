# 7. The Auto show: visuals, swarm chatter, launch kit

Auto already moves through the studio by itself: canvas → video → app. This spec makes the whole run look and sound alive from start to finish, and adds a launch step at the end that posts **only with the person's click**.

## Where things stand

| Step | View | What shows today | Gap |
|---|---|---|---|
| Design | Canvas | Cursors fly to sections, sections stream in, images paint, wires link pages | — |
| Review | Canvas | The reviewer goes page by page; fixes land | No cursor marks the page being reviewed |
| Video | Video tab | A live preview of the clip, with cursors on scenes and the bar | — |
| App, games, shop, data | App tab | The code wall (3 typing tiles, a cursor on each caret, and the asset pane: the build's pictures turning on a card) and the steps | — |
| Deploy | App tab | Only the Auto panel's text and clock | **Nothing to watch** |
| Between steps | — | The view switches instantly | **Feels like a jump cut** |

## A. Visuals

### A1. Step transitions
- When Auto moves to a new view, a full-width card slides in for 1.2 s, then the new view fades in:
  - in mono: "STEP 4 / 8";
  - in display type: "Building the *app*", with the accent word in the serif;
  - the step's icon, and the agents assigned to it, shown as cursor pills.
- Under `prefers-reduced-motion` it's a plain fade.
- During a step, the active view tab pulses lime (live), and the Auto panel's step row has a progress shimmer.

### A2. Review cursors
- A reviewer cursor in its own colour, labelled "Reviewer", hovers over the page being checked and draws a dashed lime box around each section it flags.
- When a fix lands, the box flashes green and disappears.

### A3. Deploy shot
- **While Vercel builds:**
  - a "terminal" tile streams the build log lines Vercel returns (already sent by `publishVercel` while it polls), in mono with a lime caret;
  - next to it, a globe or edge-network graphic pulses at each step: upload, build, ready.
- **When the deploy is ready:**
  - the live site opens in a big device frame (laptop, plus a phone beside it);
  - the swarm's cursors "click around" it: they scroll the hero, open /play and press Play;
  - the address bar shows the real URL, with a copy button.

### A4. Final screen
After the last step there's a summary card:
- the total time and the time per step, as a timeline bar;
- the counts: agents, sections, images, files and lines written;
- the live link, a QR code, "Play the game", "Open the launch kit" and "Share to Arcade" (once spec 5 exists).

## B. Swarm chatter (sound)

### What it is
- Each agent "talks" in short, cute gibberish syllables (`ba`, `mi`, `po`, `ta`, `loo`, `pi`, `do`).
- They're synthesised live with Web Audio: an oscillator and a formant filter, with a pitch envelope per syllable. There are no recordings, so nothing to license.
- **Original only:** no film characters' voices, words or catchphrases.

### Voices
- Each agent's voice is seeded from its name: base pitch (180–520 Hz), speed, vibrato, and a timbre preset (squeaky, round, raspy, breathy). The same agent always sounds the same.

### Event sounds

| Event | Sound |
|---|---|
| An agent starts a section or file | a quick 2-syllable "bip-ba!" |
| Section or file done | a rising 3 syllables, "woo-pa-ti!" |
| Failed, then retried | a falling "awww", then a determined "hup!" on the retry |
| The reviewer flags something | a short gasp |
| Break room speech bubble | 2–4 syllables timed to the bubble, so two agents trade lines like gossip |
| Step transition | a little fanfare chord |
| Deploy ready | a crowd cheer: all the agents' voices plus a clap texture |

### Occasional real words
- About 3 times per run, one agent says one real short line ("ship it!", "looks good!", "boss fight!").
- The line comes from TTS on the Pro (the on-demand TTS job), pitched up 4–6 semitones and sped up 1.2×, then cached by text in the data dir.
- With no TTS, the agent babbles instead.

### Rules
- **Quiet by default:** volume 35%, with a 🔊 toggle and a slider in the dock. The setting is remembered.
- **At most 2 voices at once**, the same agent never twice in a row, and no more than 1 sound per 400 ms overall.
- **Auto-mute** when the tab is hidden, when a mic or screen recording is active (if the browser can tell), and in video export. The demo-video recording mode can turn it back on on purpose.
- **Code:** one module, `web/chatter.js`, which listens to the same events the canvas uses (`agent:assign`, `layer:done`, `layer:failed`, `review`, `auto`, `break-room`). It doesn't touch the build logic.

## C. Launch kit (post with permission)

### What it makes
A last, optional Auto step, `launch`. It writes:
- **X:** a thread of 3–5 posts (hook, what it is, a gameplay or feature line, the link).
- **LinkedIn:** one post in a professional tone.
- **Threads and Bluesky:** short versions.
- **Instagram and TikTok:** a caption plus hashtags.
- **Discord and Slack:** an announcement.
- Media attached to each: the promo clip, 3 hero images, the game GIF or clip, and the live link.

### How it posts (nothing goes out by itself)
- Each post is a card with **Post** / **Edit** / **Skip**. Editing is inline.
- **X, LinkedIn, Threads, Bluesky:**
  - **Post** opens the network's own share page in the person's browser, where they're already logged in, prefilled with the text and link (for example `x.com/intent/post?text=…&url=…`).
  - The person presses Post on the network's own page, so the network asks for its own confirmation. We hold no account access and no passwords.
  - Media can't be prefilled this way: the card has "Download media" to attach by hand.
- **Discord, Slack, Telegram:**
  - Only if Hermes's messaging gateway is connected for that platform.
  - **Post** shows a confirm box with the exact text, channel and attachments, and sends only after **Send**.
  - Each send is one action; there's no bulk "post everywhere".
- **Instagram and TikTok:** these have no posting API without an approved developer app, so the card offers "Download video + copy caption".
- **Record:** the launch kit is saved in the run (`runs/<id>/launch.json`), with which posts were opened or sent and when.

### Safety
- The person reads and confirms every post; Auto never posts by itself.
- Nothing is posted from text or links found in pages, files or other untrusted content.
- No tokens for social accounts are stored. Gateway sends use Hermes's existing connections.

## Done when

- [x] Step transitions play between every Auto view change, and fade only under reduced motion.
- [x] Review shows the reviewer cursor and flag boxes. Deploy shows the build log tile and then the live site in a device frame with the cursors clicking around it.
- [x] The final summary card shows the real numbers and the live link with a QR code.
- [ ] Chatter: every agent has its own recognisable voice, the event sounds play, the dock toggle and volume work, and it mutes when the tab is hidden. With no TTS, nothing breaks. *(Built and wired, default off; the voices were not listened to yet: needs an ear test.)*
- [ ] The launch kit writes posts for every network. Post opens the prefilled share page (tested for X and LinkedIn), a Discord send needs the confirm, and nothing is ever sent without a click. *(Built; the share URLs are built from the run, but opening them on x.com and LinkedIn while signed in is still to test. No gateway is connected here, so a Discord send was only checked up to the confirm box and the server's 409.)*
- [x] `scripts/check.sh` passes, and builds are unchanged with chatter and the launch step off.

## Size

About 1½ days: visuals ½ day, chatter ½ day, launch kit ½ day.
