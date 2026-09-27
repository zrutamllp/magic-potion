import { z } from 'zod';
import { vaultFragmentDigits } from '../assignment';
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
  publicView: (ctx, progress) => ({ content: asJson(ctx.publicData), hint: progress.hint }),
});

// Find the Code: decode a message. Half the key is on screen, the other half is a fragment.
export type FindCodeProgress = { hint: { symbol: string; letter: string } | null };

const answerSubmission = z.object({ answer: z.string().max(200) });

export const findCodeChecker = defineChecker<'find_code', FindCodeProgress>({
  submission: answerSubmission,
  init: () => ({ hint: null }),
  submit(ctx, progress, raw) {
    const parsed = answerSubmission.safeParse(raw);
    if (!parsed.success || parsed.data.answer.trim() === '') return { status: 'invalid' };
    return matchesAny(parsed.data.answer, ctx.secretData.answer)
      ? { status: 'solved', progress }
      : { status: 'wrong', progress };
  },
  hint(ctx) {
    const key = ctx.secretData.hiddenKey;
    const pair = key[randInt(ctx.rng, key.length)] as { symbol: string; letter: string };
    return { hint: { symbol: pair.symbol, letter: pair.letter } };
  },
  publicView: (ctx, progress) => ({ content: asJson(ctx.publicData), hint: progress.hint }),
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
