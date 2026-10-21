import type { EmailOtpType } from '@supabase/supabase-js';

/** The one-time link kinds Supabase can send that /auth/confirm accepts. */
export const OTP_TYPES: EmailOtpType[] = ['recovery', 'email', 'signup', 'invite', 'magiclink', 'email_change'];
