/** The drafting room's worker (see drafts.ts). */
import { handleDrafts } from './drafts';
import { serve } from './offthread';

serve(handleDrafts);
