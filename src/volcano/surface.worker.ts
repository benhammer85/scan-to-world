/** The surface's worker (see surface.ts). */
import { handleSurface } from './surface';
import { serve } from './offthread';

serve(handleSurface);
