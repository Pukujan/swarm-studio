// Honesty in the crew's talk (owner, 2026-11-13). The crew members who answer in the chat (Talk during
// a build, the planner in Ask and Fix) can read and look; none of them can install a package, restart
// the Studio or change this computer. One night a sprite cut-out failed with "No module named 'PIL'"
// and the chat first said it would install Pillow, then that it had not. So the rule is in every
// answering prompt (HONEST_RULE), and it is also checked on the answer itself: a reply that claims to
// install, restart or update something is asked again once, and if the model still claims it, the
// plain truth is said instead (CANNOT). A prompt line alone is a hope; this is the check.

export const HONEST_RULE = 'You cannot install, restart, update or change anything in Swarm Studio or on this computer: you only read and look, and the builder only writes the app (it adds packages inside the app, nowhere else). Never say you did, will or can. When a missing program or package is what failed, say that it is the Studio\'s own tooling and not the project, and that the person runs the fix themselves: Fix mode in this chat names the exact command.'

export const CANNOT = 'I cannot install, restart or change anything in the Studio from this chat: I can only read what the build did. Switch the chat to Fix and it names the exact command for you to run.'

// what none of them can do. "Update" counts only with what it would update: the builder updates files all day.
const DO = '(?:re-?install\\w*|install\\w*|restart\\w*|reboot\\w*|pip\\b|brew\\b|(?:updat|upgrad)\\w+ (?:the |your |my )?(?:studio|swarm|hermes|python|pillow|plugin|package\\w*|engine))'
// "I'll install", "we can restart", "let me install", "I am going to install", "I've installed"; and a
// sentence that opens with it: "Installing Pillow now." (never "the builder is installing…", which is true)
const WILL = new RegExp(`\\b(?:i|we)(?:['’]ll| will| can| could| shall| am going to|['’]m going to| am|['’]m| have| just|['’]ve| already)?(?: now| just| quickly| already| go ahead and| also)* ${DO}|\\blet me (?:just |quickly |go ahead and )?${DO}|^(?:(?:ok(?:ay)?|sure|yes|right)[,.!]? )?(?:installing|reinstalling|restarting|rebooting)\\b`, 'i')
// "Pillow is installed now", "it is now installed", "done: installed"
const DID = /\b(?:is|are|it['’]s|that['’]s) (?:now |all )?(?:installed|restarted|updated|upgraded)(?: now)?\b(?! (?:on|in|by|with|when|if|before))|\b(?:done|fixed|sorted)\b[^.!?\n]{0,30}\b(?:installed|restarted|updated)\b/i
// a yes with nothing after it that hands the job back to the person
const YES = /^\s*(?:yes|yep|yeah|sure|ok(?:ay)?|on it|will do|absolutely|of course|certainly|right away|no problem)\b/i
const NOT = /\b(?:can(?:no|['’])t|cannot|can not|could ?n['’]t|won['’]t|will not|not able|unable|am not|['’]m not|have not|haven['’]t|did not|didn['’]t|do not|don['’]t|never|no way|nothing)\b/i
// the person is told to do it: "you can install it with…", "run pip install pillow"
const YOU = /\b(?:you|your|yourself)\b|\brun\b|\bpress\b|\btype\b|\bopen\b/i

// the person asked the crew to do what it cannot: "can u install pillow then?"
export const asksStudio = text => new RegExp(`\\b${DO}`, 'i').test(String(text || ''))

// Does this answer claim the speaker installed, restarted or updated something, or is about to?
// Read sentence by sentence: "I cannot install anything" and "you can install it with pip" are not claims.
// asked: the person asked for exactly that (asksStudio), so a bare "Yes." is a claim too.
export function claimsDoing(answer, asked = false) {
  const sentences = String(answer || '').split(/(?<=[.!?:;])\s+|\n+/).map(s => s.trim()).filter(Boolean)
  if (asked && sentences.length && YES.test(sentences[0]) && !NOT.test(sentences[0]) && !sentences.some(s => YOU.test(s) || NOT.test(s))) return true
  return sentences.some(s => !NOT.test(s) && (WILL.test(s) || (DID.test(s) && !YOU.test(s))))
}

// The check around one answer. again(note) asks the model once more with the note added and resolves
// with its new answer (or null); -> the answer to show.
export async function honestly({ answer, text = '', again = null }) {
  const asked = asksStudio(text)
  if (!claimsDoing(answer, asked)) return answer
  const second = again ? String((await again('That answer says you will or did install, restart or change something. You cannot, and you did not. Answer again in plain words: say that you cannot, what actually failed if you know, and what the person can run or press themselves.').catch(() => '')) || '').trim() : ''
  return second && !claimsDoing(second, asked) ? second : CANNOT
}
