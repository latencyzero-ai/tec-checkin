-- ============================================================
-- TEC Attendance — Atomic Check-in / Check-out Function
-- Run this ONCE in Supabase SQL Editor.
-- ============================================================
--
-- WHY THIS EXISTS:
-- All check-in logic lives here, inside one atomic transaction.
-- The web app calls only this function — it cannot read or
-- write anything else. This eliminates race conditions when
-- many leaders tap at the same moment, and means a compromised
-- app cannot touch the rest of your database.
--
-- BEHAVIOUR (one function, decides automatically):
--   - No active session for the given code  -> returns error
--   - telegram_id not a registered leader    -> returns error
--   - Leader has an OPEN block in this session-> CHECK OUT (close it)
--   - Leader has no open block                -> CHECK IN (new block)
--   - Re-join handled via incrementing block_number
--
-- RETURNS json: { action, leader_name, block_number, message }
-- ============================================================

create or replace function public.toggle_attendance(
    p_session_code text,
    p_telegram_id  bigint
)
returns json
language plpgsql
security definer            -- runs with owner privileges; callable by anon
set search_path = public
as $$
declare
    v_session    record;
    v_leader     record;
    v_open_block record;
    v_next_block int;
    v_now        timestamptz := now();
    v_duration   int;
begin
    -- 1. Session must exist AND be active --------------------------------
    select * into v_session
    from sessions
    where session_code = p_session_code
      and is_active = true
    limit 1;

    if v_session.id is null then
        return json_build_object(
            'action',  'error',
            'message', 'No active meeting found for this link. The meeting may not have started yet, or has already ended.'
        );
    end if;

    -- 2. Telegram user must be a registered, active leader ---------------
    select * into v_leader
    from leaders
    where telegram_id = p_telegram_id
      and is_active = true
    limit 1;

    if v_leader.id is null then
        return json_build_object(
            'action',  'error',
            'message', 'You are not registered yet. Please send /register to the bot first, then come back.'
        );
    end if;

    -- 3. Is there an OPEN block for this leader in this session? ----------
    select * into v_open_block
    from attendance_log
    where session_id = v_session.id
      and leader_id  = v_leader.id
      and is_active_block = true
    order by block_number desc
    limit 1
    for update;   -- row lock: makes concurrent double-taps safe

    if v_open_block.id is not null then
        -- ---- CHECK OUT: close the open block ----
        v_duration := greatest(
            0,
            round(extract(epoch from (v_now - v_open_block.checkin_time)) / 60.0)::int
        );

        update attendance_log
        set checkout_time   = v_now,
            duration_mins   = v_duration,
            is_active_block = false
        where id = v_open_block.id;

        return json_build_object(
            'action',       'checkout',
            'leader_name',  v_leader.full_name,
            'block_number', v_open_block.block_number,
            'duration_mins', v_duration,
            'message',      format('Checked out. You were present for %s minute(s) this block.', v_duration)
        );
    else
        -- ---- CHECK IN: open a new block ----
        select coalesce(max(block_number), 0) + 1 into v_next_block
        from attendance_log
        where session_id = v_session.id
          and leader_id  = v_leader.id;

        insert into attendance_log
            (session_id, leader_id, checkin_time, is_active_block, block_number)
        values
            (v_session.id, v_leader.id, v_now, true, v_next_block);

        return json_build_object(
            'action',       'checkin',
            'leader_name',  v_leader.full_name,
            'block_number', v_next_block,
            'message',      case
                              when v_next_block = 1
                                then format('Welcome %s! You are checked in.', v_leader.full_name)
                              else format('Welcome back %s! Re-joined (block %s).', v_leader.full_name, v_next_block)
                            end
        );
    end if;
end;
$$;

-- ============================================================
-- Permissions: allow the anon role to call ONLY this function.
-- The app uses the anon key + this grant. Nothing else is exposed.
-- ============================================================
grant execute on function public.toggle_attendance(text, bigint) to anon;

-- Optional but recommended: a read-only helper so the page can show
-- the meeting name + the leader's current status before they tap.
create or replace function public.get_checkin_context(
    p_session_code text,
    p_telegram_id  bigint
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_session record;
    v_leader  record;
    v_open    record;
begin
    select * into v_session from sessions
    where session_code = p_session_code and is_active = true limit 1;

    if v_session.id is null then
        return json_build_object('session_active', false);
    end if;

    select * into v_leader from leaders
    where telegram_id = p_telegram_id and is_active = true limit 1;

    select * into v_open from attendance_log
    where session_id = v_session.id and leader_id = v_leader.id
      and is_active_block = true limit 1;

    return json_build_object(
        'session_active', true,
        'session_code',   v_session.session_code,
        'platform',       v_session.platform,
        'registered',     (v_leader.id is not null),
        'leader_name',    v_leader.full_name,
        'currently_in',   (v_open.id is not null)
    );
end;
$$;

grant execute on function public.get_checkin_context(text, bigint) to anon;
