// @ts-check
// Swarm Studio canvas. Draws engine events: one frame (iframe) per page, one
// slot per layer, one cursor per agent. Nothing here is scripted: every box,
// cursor move, tool and bubble comes from a real model stream.
//
// The canvas is split by area into web/canvas/ (web/canvas/README.md says which file holds what).
// This file only loads them, in the order the inlined page runs them (server/page.mjs).

import './canvas/base.js'
import './canvas/carry.js'
import './canvas/events.js'
import './canvas/deck.js'
import './canvas/panels.js'
import './canvas/loop.js'
import './canvas/talk.js'
import './canvas/player.js'
import './canvas/design.js'
import './canvas/publish.js'
import './canvas/marks.js'
import './canvas/film.js'
import './canvas/settings.js'
import './canvas/replay.js'
import './canvas/rooms.js'
import './canvas/start.js'
import './canvas/auto.js'
import './canvas/dock.js'
import './canvas/hook.js'
import './canvas/hosted.js'
