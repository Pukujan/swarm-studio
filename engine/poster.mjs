// A poster frame for every clip the studio makes: one JPEG beside the clip, <name>.poster.jpg, written when the
// clip is rendered (the film, the play test's film). A board shows it until the video is focused or played, so a
// clip nobody is watching holds a picture, not a player (web/video.js).
//
// ffmpeg is the one the film renderer installs and checks (engine/video.mjs videoTools, pinned), else one on
// the machine (`find`: engine/playtest.mjs findFfmpeg, passed in, since the play test imports this file). With
// none, makePoster answers null and the caller keeps what it has (the play test's title-screen photo).
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from './proc.mjs'

export const posterPath = file => String(file).replace(/\.(mp4|webm|mov)$/i, '.poster.jpg')

export function posterFfmpeg(dataDir, find = () => null) {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const pinned = dataDir ? join(dataDir, 'video-tools', 'bin', exe) : ''
  if (pinned && existsSync(pinned)) return pinned
  return find() || null
}

const grab = (ffmpeg, file, out, at, width, timeout) => new Promise(ok => execFile(ffmpeg,
  ['-y', '-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', '4', out],
  { timeout, windowsHide: true }, err => ok(!err && existsSync(out) && statSync(out).size > 0)))

// → the poster's path, or null. A frame half a second in (past a black first frame), else the first frame
// (a clip shorter than that).
export async function makePoster(file, { ffmpeg, out = posterPath(file), at = 0.5, width = 640, timeout = 20000 } = {}) {
  if (!ffmpeg || !existsSync(file)) return null
  if (await grab(ffmpeg, file, out, at, width, timeout)) return out
  if (at > 0 && await grab(ffmpeg, file, out, 0, width, timeout)) return out
  return null
}
