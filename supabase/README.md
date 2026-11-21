# Supabase: online rooms

## Current state

- `online-rooms.sql` creates a separate, hardened set of `club_*` tables and RPCs for shared rooms, membership, and room chat.
- The current browser UI still reads/writes the prototype `localStorage` room/chat store. Applying the SQL alone does **not** switch the UI to online rooms.
- The next code step is to replace those local operations with calls to the `club_*` RPCs/tables and Supabase Realtime, then test with two separate accounts.

## Apply the migration

1. Open the Supabase project.
2. Go to **SQL Editor** → **New query**.
3. Open `online-rooms.sql` in this repository, copy its full contents into the editor.
4. Click **Run**.
5. If Supabase reports an error, stop and send the complete error text. Do not rerun a partially applied script until the error is reviewed.

The migration is additive and uses `club_*` names to avoid changing the earlier prototype tables.

## Security notes

- Room creation and membership changes happen through authenticated RPCs.
- RLS limits private room visibility and chat access to members.
- The host is automatically inserted as a room member.
- Do not put Supabase secret/service-role keys in browser code.
- Do not store Mafia roles or other secret game state in a client-readable shared JSON column. Hidden game state needs server-side authorization before those games are made truly online.
