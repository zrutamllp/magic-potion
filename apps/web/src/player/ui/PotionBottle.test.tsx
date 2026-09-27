import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PotionBottle, PotionMeter, clampPercent, liquidTop, potionLabel } from './PotionBottle';

describe('PotionBottle', () => {
  it('raises the liquid with the fill level', () => {
    expect(liquidTop(0)).toBe(151);
    expect(liquidTop(100)).toBe(44);
    expect(liquidTop(50)).toBeCloseTo(97.5);
    expect(liquidTop(25)).toBeGreaterThan(liquidTop(75));
  });

  it('keeps odd values inside 0 to 100', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it('labels the fill in whole percent and says Full only when it is full', () => {
    expect(potionLabel(0)).toBe('0%');
    expect(potionLabel(100 / 3)).toBe('33%');
    expect(potionLabel(99.6)).toBe('99%');
    expect(potionLabel(100)).toBe('Full');
  });

  it('describes itself for screen readers and moves the liquid', () => {
    render(<PotionBottle percent={25} />);
    expect(screen.getByRole('img', { name: 'Magic Potion 25% full' })).toBeInTheDocument();
    expect(screen.getByTestId('potion-liquid').style.transform).toBe(
      `translateY(${liquidTop(25)}px)`,
    );
  });

  it('shows the % and how many teams are done', () => {
    render(<PotionMeter percent={50} completedTeams={2} totalTeams={4} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 teams done')).toBeInTheDocument();
  });
});
