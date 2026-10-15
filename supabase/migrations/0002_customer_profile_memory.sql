-- Adds structured preference/project memory to the existing conversation memory table.
-- This table is only accessed by the server using the Supabase service role.
ALTER TABLE public.rgb_conversation_memory
  ADD COLUMN IF NOT EXISTS customer_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
