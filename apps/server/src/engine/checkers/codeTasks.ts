import { z } from 'zod';
import { vaultFragmentDigits, vaultMarker } from '../assignment';
import { matchesAny } from '../normalize';
import { randInt } from '../rng';
import { asJson, defineChecker } from './types';

// The Vault: 3 digits from on-screen clues, then the 3-digit fragment held by another team.
export type VaultProgress = { hint: { position: number; digit: string } | null };

const codeSubmission = z.object({ code: z.string().max(50) });

export const vaultChecker = defineChecker<'vault', VaultProgress>({
  submission: codeSubmission,
  init: () => ({ hint: null }),
  submit(ctx, progress, raw) {
    const parsed = codeSubmission.safeParse(raw);
    if (!parsed.success) return { status: 'invalid' };
    const code = parsed.data.code.replace(/\D/g, '');
    if (code.length !== 6) return { status: 'invalid' };
    const expected = ctx.secretData.clueDigits.join('') + vaultFragmentDigits(ctx.fragment ?? '');
    return code === expected ? { status: 'solved', progress } : { status: 'wrong', progress };
  },
  hint(ctx) {
    const position = randInt(ctx.rng, ctx.secretData.clueDigits.length);
    return { hint: { position, digit: ctx.secretData.clueDigits[position] as string } };
  },
  // The marker only: the fragment's digits are another team's secret.
  publicView: (ctx, progress) => ({
    content: asJson(ctx.publicData),
    marker: vaultMarker(ctx.fragment),
    hint: progress.hint,
  }),
});

// Find the Code: decode a message. Each team has its own word and cipher (made at game start).
// Half the key is on screen; the other half is the fragment held by another team.
export type FindCodeProgress = { hint: { symbol: string; letter: string } | null };

const answerSubmission = z.object({ answer: z.string().max(200) });

export const findCodeChecker = defineChecker<'find_code', FindCodeProgress>({
  submission: answerSubmission,
  init: () => ({ hint: null }),
  submit(ctx, progress, raw) {
    const parsed = answerSubmission.safeParse(raw);
    if (!parsed.success || parsed.data.answer.trim() === '' || !ctx.cipher) {
      return { status: 'invalid' };
    }
    return matchesAny(parsed.data.answer, [ctx.cipher.word])
      ? { status: 'solved', progress }
      : { status: 'wrong', progress };
  },
  // Reveals one more letter of the hidden half of the key.
  hint(ctx, progress) {
    const key = ctx.cipher?.hiddenKey ?? [];
    const pair = key[randInt(ctx.rng, key.length)];
    return pair ? { hint: { symbol: pair.symbol, letter: pair.letter } } : progress;
  },
  publicView: (ctx, progress) => ({
    content: asJson(ctx.publicData),
    encodedMessage: ctx.cipher?.encodedMessage ?? [],
    visibleKey: asJson(ctx.cipher?.visibleKey ?? []),
    hint: progress.hint,
  }),
});

// Alien Translator: translate symbols with a partial legend. The hint decodes 3 more symbols.
export type AlienProgress = { hintLegend: { symbol: string; letter: string }[] };

export const alienTranslatorChecker = defineChecker<'alien_translator', AlienProgress>({
  submission: answerSubmission,
  init: () => ({ hintLegend: [] }),
  submit(ctx, progress, raw) {
    const parsed = answerSubmission.safeParse(raw);
    if (!parsed.success || parsed.data.answer.trim() === '') return { status: 'invalid' };
    return matchesAny(parsed.data.answer, ctx.secretData.answer)
      ? { status: 'solved', progress }
      : { status: 'wrong', progress };
  },
  hint: (ctx) => ({
    hintLegend: ctx.secretData.hiddenLegend.slice(0, 3).map(({ symbol, letter }) => ({
      symbol,
      letter,
    })),
  }),
  publicView: (ctx, progress) => ({
    content: asJson(ctx.publicData),
    hintLegend: progress.hintLegend,
  }),
});
