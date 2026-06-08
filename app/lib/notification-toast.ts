interface ToastableNotification {
  actorName: string;
  courseTitle: string;
}

/**
 * Builds the arrival-toast message for a batch of freshly-seen enrollment
 * notifications. Names the single student when there's exactly one, otherwise
 * summarizes the count. Returns null when there's nothing to announce.
 */
export function buildEnrollmentToastMessage(
  fresh: ToastableNotification[]
): string | null {
  if (fresh.length === 0) return null;
  if (fresh.length === 1) {
    return `${fresh[0].actorName} enrolled in ${fresh[0].courseTitle}`;
  }
  return `${fresh.length} new students enrolled in your courses`;
}
