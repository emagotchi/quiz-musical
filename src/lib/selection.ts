import { cleanSelection, type Selection } from '../data/packs';

const KEY = 'mq-selection';

/** Last songs picked in this browser, so solo and room setup start where you left off. */
export function savedSelection() {
  try {
    return cleanSelection(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return cleanSelection(null);
  }
}

export function rememberSelection(selection: Selection) {
  try {
    localStorage.setItem(KEY, JSON.stringify(selection));
  } catch {
    // just won't be remembered
  }
}
