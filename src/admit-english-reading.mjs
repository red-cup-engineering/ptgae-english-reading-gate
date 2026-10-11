import { createHash } from 'node:crypto';

const PACKAGE = '@lenticule-science/english-language-algebra';
const REFUSAL = (code, message) => Object.freeze({ code, message });
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
const hashSource = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const letterOrNumber = (char) => char !== undefined && /[\p{L}\p{M}\p{N}]/u.test(char);

/** Find an intact source token, rather than treating a substring of another word as a token. */
function findWord(source, word, start) {
  let pos = source.indexOf(word, start);
  while (pos >= 0) {
    const prev = pos === 0 ? undefined : Array.from(source.slice(0, pos)).at(-1);
    const after = Array.from(source.slice(pos + word.length))[0];
    if (!letterOrNumber(prev) && !letterOrNumber(after)) return pos;
    pos = source.indexOf(word, pos + 1);
  }
  return -1;
}

/**
 * Receive one real *candidate* English reading from the upstream language-algebra's
 * tagText() output. Do not create true/false evidence, SignCells or an action request.
 * The upstream English identity must be independently pinned by the calling office;
 * this module only verifies the supplied identity's shape, not its authenticity.
 */
export function receiveEnglishReading({ sourceText, sourceRevision = null, englishBundle, reading }) {
  if (!nonempty(sourceText)) throw new TypeError('sourceText must be nonempty');
  if (!englishBundle || englishBundle.package !== PACKAGE || !nonempty(englishBundle.version)
    || !/^[0-9a-f]{40}$/u.test(englishBundle.sourceCommit ?? '')) {
    throw new TypeError('a pinned English-algebra package/version/sourceCommit is required');
  }
  if (!reading || reading.meta?.code !== 'en' || !Array.isArray(reading.sentences)) {
    throw new TypeError('reading must have the English algebra tagText() shape');
  }
  if (sourceRevision !== null && !nonempty(sourceRevision)) throw new TypeError('sourceRevision must be nonempty or null');

  const diagnostics = [];
  const sentences = [];
  let searchAfter = 0;
  for (let i = 0; i < reading.sentences.length; i++) {
    const sentence = reading.sentences[i];
    if (!nonempty(sentence?.text) || !Array.isArray(sentence.words) || !Array.isArray(sentence.arcs)
      || !Array.isArray(sentence.roles)) {
      throw new TypeError(`sentence ${i} is not a supported tagText() sentence`);
    }
    const start = sourceText.indexOf(sentence.text, searchAfter);
    if (start < 0) {
      diagnostics.push(REFUSAL('SOURCE_SPAN_NOT_FOUND', `sentence ${i} is not an exact later source substring`));
      sentences.push({ sourceSpan: null, words: [], grammarRelations: [], roleCandidates: [], cohomology: sentence.cohomology ?? null });
      continue;
    }
    searchAfter = start + sentence.text.length;
    const words = [];
    let localCursor = 0;
    for (let j = 0; j < sentence.words.length; j++) {
      const word = sentence.words[j];
      if (!nonempty(word?.text)) throw new TypeError(`word ${i}:${j} is not an English word result`);
      const localAt = findWord(sentence.text, word.text, localCursor);
      if (localAt < 0) {
        diagnostics.push(REFUSAL('WORD_SPAN_NOT_FOUND', `word ${i}:${j} lacks an exact source token`));
        words.push({ tokenId: `${i}:${j}`, text: word.text, sourceSpan: null, tags: word.tags ?? [] });
      } else {
        localCursor = localAt + word.text.length;
        words.push({ tokenId: `${i}:${j}`, text: word.text, sourceSpan: [start + localAt, start + localCursor], tags: word.tags ?? [] });
      }
    }
    const byText = new Map();
    for (const w of words) byText.set(w.text, [...(byText.get(w.text) ?? []), w]);
    const grammarRelations = [];
    for (let j = 0; j < sentence.arcs.length; j++) {
      const arc = sentence.arcs[j];
      if (!nonempty(arc?.rel) || !nonempty(arc?.head) || !nonempty(arc?.dependent)) {
        diagnostics.push(REFUSAL('MALFORMED_RELATION', `arc ${i}:${j} lacks relation/head/dependent`));
        continue;
      }
      const heads = byText.get(arc.head) ?? [];
      const dependents = byText.get(arc.dependent) ?? [];
      const unique = heads.length === 1 && dependents.length === 1
        && heads[0].sourceSpan !== null && dependents[0].sourceSpan !== null;
      if (!unique) {
        diagnostics.push(REFUSAL('AMBIGUOUS_RELATION_REFERENT', `arc ${i}:${j} cannot uniquely identify source token instances`));
      }
      grammarRelations.push({ kind: 'english.grammatical-candidate', rel: arc.rel,
        head: unique ? heads[0].tokenId : null,
        dependent: unique ? dependents[0].tokenId : null,
        parserStatus: arc.status ?? null, evidenceForWorldClaim: false });
    }
    if (grammarRelations.length === 0) diagnostics.push(REFUSAL('NO_GRAMMATICAL_RELATIONS', `sentence ${i} has no licensed dependency relations`));
    // Preserve source grammar's role candidates; never convert them into truth witnesses.
    sentences.push({ sourceSpan: [start, start + sentence.text.length], words, grammarRelations,
      roleCandidates: structuredClone(sentence.roles), cohomology: structuredClone(sentence.cohomology ?? null) });
  }
  if (sentences.length === 0) diagnostics.push(REFUSAL('NO_SENTENCES', 'English parser supplied no sentence readings'));
  return {
    kind: 'ptgae.english-reading-gate.v0',
    status: diagnostics.length ? 'abstained' : 'candidate',
    source: { sha256: hashSource(sourceText), utf16Length: sourceText.length, sourceRevision, coordinates: 'utf16-half-open' },
    upstream: structuredClone(englishBundle),
    sentences, diagnostics,
    interpretationAuthority: 'candidate-only',
    signCellsAdmitted: [],
    executableEffects: [],
  };
}
