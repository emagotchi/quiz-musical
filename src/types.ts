export interface Hint {
  label: string;
  value: string;
}

export interface Track {
  /** Unique slug within the pack. */
  id: string;
  /** What the player has to guess: a song title, or an anime name in an openings pack. */
  answer: string;
  /** Alternative spellings accepted as correct. */
  aliases?: string[];
  youtubeId: string;
  /** Second of the video where the clip starts. */
  start: number;
  /** Revealed progressively on the last attempts. */
  hints: Hint[];
  /** Shown after the reveal, e.g. "Ases Falsos — Juventud Americana (2012)". */
  credit?: string;
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  /** Noun for the answer in the UI: "canción", "anime"... */
  answerLabel: string;
  guessPlaceholder: string;
  tracks: Track[];
  /** Hint label whose values split the pack into filterable groups ("Proyecto", "Tipo"). */
  groupBy?: string;
  /** Autocomplete options when they differ from the tracks' answers (a filtered pack still suggests every name). */
  answers?: string[];
}
