import { createHash } from 'node:crypto';

const PACKAGE = '@lenticule-science/english-language-algebra';
const REFUSAL = (code, message) => Object.freeze({ code, message });
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
const hashSource = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const intactOffset = (source, offset) => offset === 0 || offset === source.length
  || !(source.charCodeAt(offset - 1) >= 0xD800 && source.charCodeAt(offset - 1) <= 0xDBFF
    && source.charCodeAt(offset) >= 0xDC00 && source.charCodeAt(offset) <= 0xDFFF);
const exactSpan = (source, span, text, from, to) => Array.isArray(span) && span.length === 2
  && span.every(Number.isSafeInteger) && span[0] >= from && span[1] <= to && span[0] < span[1]
  && intactOffset(source, span[0]) && intactOffset(source, span[1])
  && source.slice(span[0], span[1]) === text;
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
  const uncoveredSpans = [];
  let searchAfter = 0;
  const recordUncovered = (from, to) => {
    if (from >= to || !/\S/u.test(sourceText.slice(from, to))) return;
    uncoveredSpans.push([from, to]);
    diagnostics.push(REFUSAL('UNPARSED_SOURCE_CONTENT',
      'Non-whitespace source content at UTF-16 [' + from + ',' + to + ') is absent from upstream sentence spans'));
  };
  for (let i = 0; i < reading.sentences.length; i++) {
    const sentence = reading.sentences[i];
    if (!nonempty(sentence?.text) || !Array.isArray(sentence.words) || !Array.isArray(sentence.arcs)
      || !Array.isArray(sentence.roles)) {
      throw new TypeError(`sentence ${i} is not a supported tagText() sentence`);
    }
    const native = ['sourceBinding','sourceSpan','wordSourceSpans'].some(key => Object.hasOwn(sentence, key));
    if (native && (sentence.sourceBinding !== 'native-exact'
      || !exactSpan(sourceText, sentence.sourceSpan, sentence.text, searchAfter, sourceText.length)
      || !Array.isArray(sentence.wordSourceSpans) || sentence.wordSourceSpans.length !== sentence.words.length)) {
      diagnostics.push(REFUSAL('NATIVE_SOURCE_BINDING_INVALID', 'sentence ' + i + ' lacks a valid native source binding'));
      sentences.push({ sourceSpan: null, sourceBinding: 'withheld', words: [], grammarRelations: [], roleCandidates: [], roleBindings: [], cohomology: sentence.cohomology ?? null });
      continue;
    }
    const start = native ? sentence.sourceSpan[0] : sourceText.indexOf(sentence.text, searchAfter);
    if (start < 0) {
      diagnostics.push(REFUSAL('SOURCE_SPAN_NOT_FOUND', `sentence ${i} is not an exact later source substring`));
      sentences.push({ sourceSpan: null, words: [], grammarRelations: [], roleCandidates: [], roleBindings: [], cohomology: sentence.cohomology ?? null });
      continue;
    }
    recordUncovered(searchAfter, start);
    searchAfter = start + sentence.text.length;
    const words = [];
    let localCursor = 0;
    for (let j = 0; j < sentence.words.length; j++) {
      const word = sentence.words[j];
      if (!nonempty(word?.text)) throw new TypeError(`word ${i}:${j} is not an English word result`);
      const nativeSpan = native ? sentence.wordSourceSpans[j] : null;
      const localAt = native
        ? (exactSpan(sourceText, nativeSpan, word.text, start + localCursor, start + sentence.text.length) ? nativeSpan[0] - start : -1)
        : findWord(sentence.text, word.text, localCursor);
      if (localAt < 0) {
        diagnostics.push(REFUSAL(native ? 'NATIVE_WORD_SPAN_INVALID' : 'WORD_SPAN_NOT_FOUND', `word ${i}:${j} lacks an exact source token`));
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
        parserStatus: arc.status ?? null, parserValue: arc.value ?? null, evidenceForWorldClaim: false });
    }
    if (grammarRelations.length === 0) diagnostics.push(REFUSAL('NO_GRAMMATICAL_RELATIONS', `sentence ${i} has no licensed dependency relations`));
    // Preserve upstream role frames, but only separately assert token occurrence
    // bindings when each role string names exactly one source word in this sentence.
    const roleBindings = sentence.roles.map((frame, frameIndex) => {
      const bindings = {};
      let unresolved = false;
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
        diagnostics.push(REFUSAL('MALFORMED_ROLE_FRAME',
          'role frame ' + i + ':' + frameIndex + ' is not an object'));
        return { frameIndex, status: 'unresolved', bindings };
      }
      const supported = ['verb', 'agent', 'patient', 'instrument', 'recipient', 'location'];
      if (!nonempty(frame.verb)) {
        diagnostics.push(REFUSAL('ROLE_PREDICATE_MISSING',
          'role frame ' + i + ':' + frameIndex + ' lacks a source verb'));
        unresolved = true;
      }
      for (const [key, value] of Object.entries(frame)) {
        if (!supported.includes(key) && value !== null) {
          diagnostics.push(REFUSAL('UNSUPPORTED_ROLE_FIELD',
            'role ' + i + ':' + frameIndex + ':' + key + ' is not in the upstream role contract'));
          unresolved = true;
        }
      }
      for (const key of supported) {
        if (!Object.hasOwn(frame, key) || frame[key] === null) continue;
        if (!nonempty(frame[key])) {
          diagnostics.push(REFUSAL('UNSUPPORTED_ROLE_VALUE',
            'role ' + i + ':' + frameIndex + ':' + key + ' is not a nonempty token name'));
          bindings[key] = null;
          unresolved = true;
          continue;
        }
        const matches = byText.get(frame[key]) ?? [];
        const unique = matches.length === 1 && matches[0].sourceSpan !== null;
        if (!unique) {
          diagnostics.push(REFUSAL('UNRESOLVED_ROLE_REFERENT',
            'role ' + i + ':' + frameIndex + ':' + key + ' cannot identify one token occurrence'));
        }
        bindings[key] = unique
          ? { tokenId: matches[0].tokenId, sourceSpan: [...matches[0].sourceSpan] }
          : null;
        if (!unique) unresolved = true;
      }
      return { frameIndex, status: unresolved ? 'unresolved' : 'source-bound', bindings };
    });
    sentences.push({ sourceSpan: [start, start + sentence.text.length], sourceBinding: native ? 'native-exact' : 'legacy-source-match', words, grammarRelations,
      roleCandidates: structuredClone(sentence.roles), roleBindings,
      cohomology: structuredClone(sentence.cohomology ?? null) });
  }
  recordUncovered(searchAfter, sourceText.length);
  if (sentences.length === 0) diagnostics.push(REFUSAL('NO_SENTENCES', 'English parser supplied no sentence readings'));
  return {
    kind: 'ptgae.english-reading-gate.v0',
    status: diagnostics.length ? 'abstained' : 'candidate',
    source: { sha256: hashSource(sourceText), utf16Length: sourceText.length, sourceRevision, coordinates: 'utf16-half-open',
      coverage: { complete: uncoveredSpans.length === 0 && sentences.every(sentence => sentence.sourceSpan !== null), uncoveredSpans } },
    upstream: structuredClone(englishBundle),
    sentences, diagnostics,
    interpretationAuthority: 'candidate-only',
    signCellsAdmitted: [],
    executableEffects: [],
  };
}
