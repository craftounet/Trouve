drop policy groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated using(owner_id=(select auth.uid()) or private.is_member(id));
-- Schedule edits invalidate votes attached to the old occurrence.
create function private.invalidate_schedule_reports() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'Non autorisé'; end if;
 if (new.day_of_week,new.start_time,new.end_time,new.recurrence_start,new.recurrence_end,new.teacher) is distinct from (old.day_of_week,old.start_time,old.end_time,old.recurrence_start,old.recurrence_end,old.teacher) then delete from public.cancellations where event_id=new.id; end if; return new; end $$;
create trigger schedule_reports after update on public.events for each row execute function private.invalidate_schedule_reports();
-- A removed member no longer contributes confirmations; remove obsolete reports.
create function private.remove_member_votes() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Connexion requise'; end if;
 delete from public.cancellations c using public.events e where c.event_id=e.id and c.group_id=old.group_id and e.user_id=old.user_id;
 delete from public.cancellation_confirmations v using public.cancellations c where v.cancellation_id=c.id and c.group_id=old.group_id and v.user_id=old.user_id;
 update public.cancellations c set status=case
 when (select count(*) from public.cancellation_confirmations v where v.cancellation_id=c.id and v.confirmation)>=2 and (select count(*) filter(where confirmation)>count(*) filter(where not confirmation) from public.cancellation_confirmations v where v.cancellation_id=c.id) then 'confirmed'
 when (select count(*) from public.cancellation_confirmations v where v.cancellation_id=c.id and not v.confirmation)>=2 and (select count(*) filter(where not confirmation)>=count(*) filter(where confirmation) from public.cancellation_confirmations v where v.cancellation_id=c.id) then 'rejected' else 'pending' end where c.group_id=old.group_id;
 return old; end $$;
create trigger member_votes after delete on public.group_members for each row execute function private.remove_member_votes();
revoke execute on function private.invalidate_schedule_reports(),private.remove_member_votes() from public,anon,authenticated;
