// Unit tests for the SM-2 spaced repetition algorithm in src/lib/srs.ts

import { describe, it, expect } from 'vitest';
import { calculateSRS, SRSState } from '@/lib/srs';

// Default starting state — a brand-new card that has never been reviewed.
const NEW_CARD: SRSState = {
  interval: 0,
  easeFactor: 2.5,
  repetitions: 0,
};

describe('calculateSRS — incorrect answers (quality < 3)', () => {
  it('quality=1 resets repetitions to 0 and sets interval to 1', () => {
    const result = calculateSRS(1, { interval: 10, easeFactor: 2.5, repetitions: 5 });
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.status).toBe('NEW');
  });

  it('quality=2 resets repetitions to 0 and sets interval to 1', () => {
    const result = calculateSRS(2, { interval: 10, easeFactor: 2.5, repetitions: 3 });
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.status).toBe('NEW');
  });

  it('quality out of range (0) is clamped to 1', () => {
    const result = calculateSRS(0, NEW_CARD);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });
});

describe('calculateSRS — correct answers (quality >= 3)', () => {
  it('first correct answer (repetitions=0) sets interval to 1', () => {
    const result = calculateSRS(4, NEW_CARD);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.status).toBe('LEARNING');
  });

  it('second correct answer (repetitions=1) sets interval to 4', () => {
    const result = calculateSRS(4, { ...NEW_CARD, repetitions: 1, interval: 1 });
    expect(result.interval).toBe(4);
    expect(result.repetitions).toBe(2);
    expect(result.status).toBe('LEARNING');
  });

  it('third correct answer (repetitions=2) scales interval by easeFactor', () => {
    const state: SRSState = { interval: 4, easeFactor: 2.5, repetitions: 2 };
    const result = calculateSRS(4, state);
    // interval = round(4 * 2.5) = 10
    expect(result.interval).toBe(10);
    expect(result.repetitions).toBe(3);
  });

  it('quality=5 (perfect) scales interval and improves easeFactor', () => {
    const state: SRSState = { interval: 4, easeFactor: 2.5, repetitions: 2 };
    const result = calculateSRS(5, state);
    // EF = 2.5 + (0.1 - 0 * (0.08 + 0 * 0.02)) = 2.5 + 0.1 = 2.6
    expect(result.easeFactor).toBe(2.6);
  });

  it('quality=6 (above range) is clamped to 5', () => {
    const state: SRSState = { interval: 4, easeFactor: 2.5, repetitions: 2 };
    const clamped = calculateSRS(6, state);
    const explicit5 = calculateSRS(5, state);
    expect(clamped.easeFactor).toBe(explicit5.easeFactor);
    expect(clamped.interval).toBe(explicit5.interval);
  });
});

describe('calculateSRS — ease factor (EF) formula', () => {
  it('quality=3 reduces easeFactor slightly', () => {
    const state: SRSState = { interval: 4, easeFactor: 2.5, repetitions: 2 };
    const result = calculateSRS(3, state);
    // EF = 2.5 + (0.1 - 2*(0.08 + 2*0.02)) = 2.5 + (0.1 - 0.24) = 2.5 - 0.14 = 2.36
    expect(result.easeFactor).toBe(2.36);
  });

  it('EF is floored at 1.3 and never goes below it', () => {
    // Start with EF already near the floor; quality=1 would push it below 1.3
    const state: SRSState = { interval: 4, easeFactor: 1.3, repetitions: 2 };
    const result = calculateSRS(1, state);
    expect(result.easeFactor).toBe(1.3);
  });

  it('EF floor applies even after multiple poor responses', () => {
    let state: SRSState = { interval: 10, easeFactor: 1.5, repetitions: 3 };
    // Drive EF down with repeated quality=1 answers
    for (let i = 0; i < 10; i++) {
      state = calculateSRS(1, state);
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});

describe('calculateSRS — status transitions', () => {
  it('returns NEW when repetitions resets to 0 after an incorrect answer', () => {
    const result = calculateSRS(1, { interval: 10, easeFactor: 2.5, repetitions: 5 });
    expect(result.status).toBe('NEW');
  });

  it('returns LEARNING when interval < 7', () => {
    const result = calculateSRS(4, NEW_CARD); // interval=1, repetitions=1
    expect(result.status).toBe('LEARNING');
  });

  it('returns REVIEW when interval >= 7 and < 21', () => {
    // interval=4, EF=2.5 → next interval = round(4 * 2.5) = 10
    const state: SRSState = { interval: 4, easeFactor: 2.5, repetitions: 2 };
    const result = calculateSRS(4, state);
    expect(result.interval).toBe(10);
    expect(result.status).toBe('REVIEW');
  });

  it('returns MASTERED when interval >= 21', () => {
    // interval=10, EF=2.5 → next interval = round(10 * 2.5) = 25
    const state: SRSState = { interval: 10, easeFactor: 2.5, repetitions: 5 };
    const result = calculateSRS(5, state);
    expect(result.interval).toBe(25);
    expect(result.status).toBe('MASTERED');
  });
});

describe('calculateSRS — nextReview date', () => {
  it('nextReview is set to midnight (start of day) on the correct future date', () => {
    const result = calculateSRS(4, NEW_CARD); // interval=1
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expected.setHours(0, 0, 0, 0);
    // Compare date only (not exact milliseconds, since test execution takes time)
    expect(result.nextReview.toDateString()).toBe(expected.toDateString());
    expect(result.nextReview.getHours()).toBe(0);
    expect(result.nextReview.getMinutes()).toBe(0);
    expect(result.nextReview.getSeconds()).toBe(0);
  });
});
