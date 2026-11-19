import { receiveEnglishReading } from './admit-english-reading.mjs';

/**
 * Invoke the real English algebra's tagText signature through a caller-supplied,
 * resolved import. English is the owner of grammar: this adapter does not tag,
 * parse, attach arcs, or guess semantic roles. A consumer must independently
 * verify its resolved package, source commit and current runtime identity.
 */
export function consumeEnglishAlgebra({ sourceText, sourceRevision = null, englishBundle, tagText }) {
  if (typeof tagText !== 'function') {
    throw new TypeError('English algebra tagText must be a verified caller-supplied function');
  }
  const reading = tagText(sourceText);
  if (reading && typeof reading.then === 'function') {
    throw new TypeError('English algebra tagText must return a synchronous reading, not a Promise');
  }
  return receiveEnglishReading({ sourceText, sourceRevision, englishBundle, reading });
}
