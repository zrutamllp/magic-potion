import { Fragment, type ReactNode } from 'react';
import type { GameSettings } from '@magic-potion/shared';
import { useGame } from '../GameContext';
import { rulesSections } from '../rules';
import { Card, PageTitle } from '../ui/basics';

// "**word**" in the rules text is shown in bold.
function withBold(text: string): ReactNode {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
}

export function RulesContent({ settings }: { settings: GameSettings }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {rulesSections(settings).map((section) => (
        <Card key={section.title}>
          <h2 className="mb-3 text-2xl font-bold text-brand-soft">{section.title}</h2>
          {section.paragraphs?.map((p) => (
            <p key={p} className="text-lg leading-relaxed">
              {withBold(p)}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-2 pl-6 text-lg leading-relaxed marker:text-brand-soft">
              {section.bullets.map((b) => (
                <li key={b}>{withBold(b)}</li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

export function Rules() {
  const { state } = useGame();
  return (
    <>
      <PageTitle title="Rules" />
      <RulesContent settings={state.settings} />
    </>
  );
}
