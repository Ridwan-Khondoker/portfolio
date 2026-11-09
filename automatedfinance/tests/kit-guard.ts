import { describe } from 'vitest';
import { kitAvailable } from '@/lib/seed/kit';

/** Acceptance tests need the confidential kit on local disk; elsewhere (e.g. a public CI) they are skipped with a note. */
export const describeWithKit = kitAvailable() ? describe : describe.skip;
if (!kitAvailable()) console.warn('[tests] data/ or source-workbooks/ not found: acceptance tests that need the company data are skipped.');
