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
