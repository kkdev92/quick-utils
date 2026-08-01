/**
 * Message protocol between the extension host and the regex worker.
 *
 * Kept in its own module so both sides import the same declarations and
 * neither can drift; it deliberately depends on nothing but the pure matching
 * types.
 */

import type { RegexMatch } from '../lib/regex';

/** Host → worker. */
export interface RegexRequest {
  /** Correlates the reply, and lets a reply that arrives after a timeout be discarded. */
  id: number;
  pattern: string;
  flags: string;
  input: string;
  /** Maximum matches to collect before reporting `truncated`. */
  limit: number;
}

/** Worker → host. */
export type RegexResponse =
  | { id: number; ok: true; matches: RegexMatch[]; truncated: boolean }
  | { id: number; ok: false; error: string };
