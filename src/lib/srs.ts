// SuperMemo-2 (SM-2) Algorithm Helper for Spaced Repetition System (SRS)

export interface SRSState {
  interval: number;      // Days until next review
  easeFactor: number;    // Difficulty multiplier (defaults to 2.5)
  repetitions: number;   // Number of consecutive correct answers
}

export interface SRSResult extends SRSState {
  nextReview: Date;      // Timestamp of the scheduled next review
  status: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';
}

/**
 * Calculates the next review parameters based on user response quality.
 * @param quality User rating from 1 to 5:
 *                1 - Blackout, total failure
 *                2 - Incorrect, but character looked familiar
 *                3 - Correct with serious difficulty
 *                4 - Correct with hesitation / moderate ease
 *                5 - Perfect response, no hesitation
 * @param currentState Existing SRS state of the vocabulary card
 */
export function calculateSRS(quality: number, currentState: SRSState): SRSResult {
  let { interval, easeFactor, repetitions } = currentState;

  // Bound quality between 1 and 5
  quality = Math.max(1, Math.min(5, quality));

  // Determine repetitions and interval based on response quality
  if (quality < 3) {
    // Incorrect answer: restart the learning cycle
    repetitions = 0;
    interval = 1; // Show again tomorrow
  } else {
    // Correct answer: increment repetitions and scale interval
    if (repetitions === 0) {
      interval = 1; // 1 day
    } else if (repetitions === 1) {
      interval = 4; // 4 days (slightly accelerated for tutoring context)
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Adjust Ease Factor (EF)
  // Standard formula: EF' = EF + (0.1 - (5 - Q) * (0.08 + (5 - Q) * 0.02))
  const qDiff = 5 - quality;
  easeFactor = easeFactor + (0.1 - qDiff * (0.08 + qDiff * 0.02));
  
  // Ease Factor must not fall below 1.3
  easeFactor = Math.max(1.3, parseFloat(easeFactor.toFixed(2)));

  // Determine user-facing mastery status
  let status: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED' = 'LEARNING';
  if (repetitions === 0) {
    status = 'NEW';
  } else if (interval >= 21) {
    status = 'MASTERED';
  } else if (interval >= 7) {
    status = 'REVIEW';
  }

  // Calculate next review timestamp
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  
  // Standardize to the beginning of that day for clean daily sessions
  nextReview.setHours(0, 0, 0, 0);

  return {
    interval,
    easeFactor,
    repetitions,
    nextReview,
    status
  };
}
