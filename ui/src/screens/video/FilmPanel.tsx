// The film panel over the Design deck (docs/ux/OBJECTS.md: **Film studio**; the classic one is web/canvas/film.js's
// .video-pop): the open build's film while it is being made or is ready, floating over the deck's bottom right corner.
// It is the Film studio's own view (FilmStudioView with `panel`) of the same film (useFilm.ts): one model, one source,
// no second copy. Minimized it is the title and the progress; its head opens the Film studio. A film that was already
// there when the deck opened starts minimized (classic showed a saved film quietly); one asked for here, or heard
// starting, opens. `/video` in the deck's chat makes the film through `useFilmPanel().make`.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNav } from '../../nav/NavProvider'
import { useSheets } from '../setup/Sheets'
import { FilmStudioView } from './FilmStudioView'
import { panelShows, type FilmAsk } from './model'
import { useFilm } from './useFilm'

// `run`: the open build (none: no panel, and `make` does nothing)
export function useFilmPanel(run: string | null): { panel: ReactNode, make: (ask?: FilmAsk) => void } {
  const { go } = useNav()
  const sheets = useSheets()
  const { film, opts, onOpts, media, mediaError, mine, fresh, live, make, pick, addRef, reveal, mediaKey, mediaAgain } = useFilm(run, { saved: 'film' })
  // the person's own Minimize or Expand, for this build; until they press it, a saved film is minimized
  const [min, setMin] = useState<boolean | null>(null)
  useEffect(() => { setMin(null) }, [run])
  const small = min ?? !fresh
  const onSetup = useCallback(() => sheets.open('setup'), [sheets])

  const panel = run && panelShows(film, fresh)
    ? <FilmStudioView film={film} opts={opts} onOpts={onOpts} media={media} mediaError={mediaError} mine={mine} live={live}
        onMake={() => { void make() }} onPick={pick} onAddRef={addRef} onReveal={reveal} onMediaKey={mediaKey} onMediaAgain={mediaAgain} onSetup={onSetup}
        panel={{ min: small, onMin: () => setMin(!small), onOpen: () => go({ type: 'room', room: 'video' }) }} />
    : null
  return { panel, make: useCallback((ask?: FilmAsk) => { setMin(false); void make(ask) }, [make]) }
}
