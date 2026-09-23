/**
 * Voice transcripts and typed questions: telling a question from noise.
 *
 * Why. ElevenLabs Scribe writes non-speech sound as a tag, in the spoken
 * language and in brackets. On 2026-09-03 someone pressed the mic in a noisy
 * room, the transcript came back as "[קולות של פעולות]", the ask box submitted
 * it, and LeaderFeed answered it with eight sources — an answer to a question
 * nobody asked, paid for, and cached.
 */

/** Sound tags Scribe inserts: "[קולות של פעולות]", "[צחוק]", "(laughter)". */
const SQUARE_TAG = /\[[^\]]*\]/g;
const ROUND_TAG = /\([^()]*\)/g;

/**
 * For a TRANSCRIPT: drop every sound tag, in square or round brackets. Speech
 * has no brackets of its own, so anything bracketed was inserted by the
 * transcriber, never said.
 */
export function cleanTranscript(text: string): string {
  return (text || "").replace(SQUARE_TAG, " ").replace(ROUND_TAG, " ").replace(/\s+/g, " ").trim();
}

/**
 * For a TYPED or pasted question: drop square-bracket tags only. Round brackets
 * are ordinary punctuation in a typed question — "מה קורה עם תמ"א 38 (חיזוק)?"
 * — and must survive.
 */
export function stripSoundTags(text: string): string {
  return (text || "").replace(SQUARE_TAG, " ").replace(/\s+/g, " ").trim();
}

/** At least one real word (two letters, Hebrew or Latin). Digits alone are not a question. */
export function hasWords(text: string): boolean {
  return /[א-תA-Za-z]{2,}/.test(text || "");
}
