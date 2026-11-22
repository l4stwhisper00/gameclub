# Supabase: online rooms

## What this branch adds

- Shared rooms and membership in the `club_rooms` and `club_room_members` tables.
- Room messages in `club_room_messages`.
- Public player cards in `club_public_profiles` (username, avatar and status only).
- RLS policies and authenticated RPCs for creating/joining/leaving/managing rooms.
- Supabase Realtime subscriptions for room, membership and chat changes.
- The room list, room details, room actions and room chat now use the Supabase adapter in `js/online-rooms.js`.

## Apply the updated SQL

The original room migration was applied earlier. This branch now also creates `club_public_profiles`, which is required to show player names and avatars across accounts.

1. Open the Supabase project → **SQL Editor** → **New query**.
2. Open the latest `supabase/online-rooms.sql` from this branch.
3. Paste the entire file and click **Run**. The script is designed to be re-runnable; it uses `create table if not exists` and replaces its policies/functions.
4. If an error appears, stop and send the complete error text.

Do not add a secret/service-role key to the website. The browser uses only the publishable key.

## Important limitations

- This makes room creation, joining, membership and text chat shared between signed-in accounts.
- The participant strip currently represents room members; it is not a precise online-presence indicator.
- Actual game state and hidden information (especially Mafia roles) are not migrated. Do not treat Mafia or other hidden-role games as securely playable online until server-authorized game-state operations are implemented.
- Browser verification with two separate accounts is still required before merging this PR into `main`.


## Interactive chess

- `supabase/chess-game-state.sql` creates the member-readable `club_room_game_states` table and enables its Realtime feed. This migration has already been applied to the connected project.
- `supabase/functions/chess-game/index.ts` is the authenticated server endpoint. It validates legal moves with chess.js, checks player turns and revision numbers, and calculates the solo bot's reply.
- The `chess-game` Edge Function is deployed with JWT verification enabled. Do not place the service-role key in browser code; the function reads its server-side environment variable.
- Chess rooms can be configured for human-vs-human or solo-vs-bot. The bot offers easy, medium and hard levels.
- The existing solo chess room can be recovered from its game panel: the host can initialize a new chess position as a bot game.
- The first browser smoke test should confirm: host starts a bot game, selects a piece, sees legal destinations, completes a move, receives a bot reply, reloads the room and sees the same position.
- Human-vs-human verification should use two separate signed-in accounts and confirm that only the player whose turn it is can move.
