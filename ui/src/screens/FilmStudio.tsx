// The Film studio (docs/ux/OBJECTS.md; the classic one is web/canvas/film.js in the Video view): a build's film, at
// ?version=<run>&room=video. Where the person is comes from the machine; the film from video/useFilm.ts, which the
// film panel over the Design deck reads too (video/FilmPanel.tsx): its own routes, read once when the room opens and
// kept up to date from the stream's `video:*` events. Make the film posts what was chosen to
// POST /api/runs/<id>/video, as the classic room does; the chat's words are an idea for the next cut. The film is made by the server with HyperFrames
// (docs/engines/video.md): nothing here renders, scores or checks one.
import { useCallback, useMemo } from 'react'
import { Chat } from '../chat'
import { useNav } from '../nav/NavProvider'
import { useTrail } from '../shell/Trail'
import { useSheets } from './setup/Sheets'
import { FilmStudioView } from './video/FilmStudioView'
import { useFilm } from './video/useFilm'

export function FilmStudio() {
  const { view } = useNav()
  const run = view.run || view.version || null
  const sheets = useSheets()
  const { film, title, loading, lines, say, opts, onOpts, media, mediaError, mine, live, make, pick, addRef, reveal, mediaKey, mediaAgain } = useFilm(run)

  // the chat's words are an idea for the film (web/canvas/loop.js: the Video view's box)
  const onChat = useCallback(({ text }: { text: string }) => {
    say('you', `🎬 ${text}`)
    void make({ idea: text })
  }, [say, make])

  useTrail(title || undefined)
  // the film's news is the Log's; what failed, and what the person said, is the chat's too
  const feed = useMemo(() => ({ lines: lines.filter(l => l.who !== 'sys'), log: lines.filter(l => l.who === 'sys' || l.who === 'err') }), [lines])
  const onSetup = useCallback(() => sheets.open('setup'), [sheets])

  return (
    <>
      {/* the chat is down the left in a wide window, along the bottom in a narrower one (decision 0015, chat/Dock.tsx);
          the room takes what is beside or above it */}
      <div className="flex min-w-0 flex-col overflow-hidden" style={{ height: 'calc(100dvh - 3.5rem - var(--chat-h, 0px))', marginLeft: 'var(--chat-w, 0px)' }}>
        <FilmStudioView film={film} loading={loading} opts={opts} onOpts={onOpts} media={media} mediaError={mediaError} mine={mine} live={live}
          onMake={() => { void make() }} onPick={pick} onAddRef={addRef} onReveal={reveal}
          onMediaKey={mediaKey} onMediaAgain={mediaAgain} onSetup={onSetup} />
      </div>
      {run && <Chat from={run} project={view.project} lines={feed.lines} log={feed.log} onSubmit={onChat}
        box={{ placeholder: 'An idea for the video…', empty: 'Say an idea for the video: “faster, end on the crowd”, “for Instagram”. Your words make the next cut.', action: 'Send' }} />}
    </>
  )
}
