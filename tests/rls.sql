-- Run through Supabase execute_sql or psql as postgres; all fixtures roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','trouve-rls-a@example.invalid','{"username":"Test A"}'),
 ('10000000-0000-4000-8000-000000000002','trouve-rls-b@example.invalid','{"username":"Test B"}'),
 ('10000000-0000-4000-8000-000000000003','trouve-rls-c@example.invalid','{"username":"Test C"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare g uuid; t uuid; e uuid; c uuid; begin
 insert into public.groups(name,owner_id) values('RLS group',auth.uid()) returning id into g;
 perform set_config('test.group',g::text,true);
 if (select count(*) from public.group_members where group_id=g)<>1 then raise exception 'Owner membership missing'; end if;
 insert into public.invitations(group_id) values(g) returning token into t;
 perform set_config('test.token',t::text,true);
 insert into public.events(user_id,title,day_of_week,start_time,end_time,recurrence_start) values(auth.uid(),'Cours',0,'08:00','10:00','2026-09-01') returning id into e;
 perform set_config('test.event',e::text,true);
 begin update public.events set user_id='10000000-0000-4000-8000-000000000002' where id=e;raise exception 'FAIL: reassignment allowed'; exception when insufficient_privilege then null; end;
 c:=public.report_absence(g,e,'2099-09-28'); -- Monday
 perform set_config('test.cancellation',c::text,true);
 if (select status from public.cancellations where id=c)<>'pending' then raise exception 'One vote must stay pending';end if;
 begin update public.cancellations set status='confirmed' where id=c;raise exception 'FAIL: forged status';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.events) or exists(select 1 from public.groups) or exists(select 1 from public.invitations) then raise exception 'Stranger can read private data';end if;
 begin perform public.vote_absence(current_setting('test.cancellation')::uuid,true);raise exception 'FAIL: stranger voted';exception when raise_exception then if sqlerrm='FAIL: stranger voted' then raise;end if;end;
 begin perform public.report_absence(current_setting('test.group')::uuid,current_setting('test.event')::uuid,'2099-09-28');raise exception 'FAIL: stranger reported';exception when raise_exception then if sqlerrm='FAIL: stranger reported' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.accept_invitation(current_setting('test.token')::uuid);
do $$ declare c uuid:=current_setting('test.cancellation')::uuid; begin
 if not exists(select 1 from public.events where id=current_setting('test.event')::uuid) then raise exception 'Peer cannot read agenda';end if;
 update public.events set title='Hacked' where id=current_setting('test.event')::uuid;
 if found then raise exception 'Peer can edit agenda';end if;
 begin perform public.accept_invitation(current_setting('test.token')::uuid);raise exception 'FAIL: invitation reused';exception when raise_exception then if sqlerrm='FAIL: invitation reused' then raise;end if;end;
 perform public.vote_absence(c,true);
 perform public.vote_absence(c,true);
 if (select count(*) from public.cancellation_confirmations where cancellation_id=c)<>2 then raise exception 'Duplicate vote';end if;
 if (select status from public.cancellations where id=c)<>'confirmed' then raise exception 'Two votes must confirm';end if;
 perform public.vote_absence(c,false);
 if (select status from public.cancellations where id=c)<>'pending' then raise exception 'Tie must return pending';end if;
end $$;
-- Leaving revokes visibility and removes the member's vote.
delete from public.group_members where group_id=current_setting('test.group')::uuid and user_id=auth.uid();
do $$ begin if exists(select 1 from public.events) then raise exception 'Former member still sees agenda';end if;end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.cancellation_confirmations where cancellation_id=current_setting('test.cancellation')::uuid)<>1 then raise exception 'Former member vote not removed';end if;
 update public.events set start_time='08:30' where id=current_setting('test.event')::uuid;
 if exists(select 1 from public.cancellations where id=current_setting('test.cancellation')::uuid) then raise exception 'Schedule edit retained stale confirmation';end if;
 begin perform public.report_absence(current_setting('test.group')::uuid,current_setting('test.event')::uuid,'2099-09-29');raise exception 'FAIL: wrong weekday accepted';exception when raise_exception then if sqlerrm='FAIL: wrong weekday accepted' then raise;end if;end;
 update public.invitations set revoked=true where token=current_setting('test.token')::uuid;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.events;raise exception 'FAIL: anonymous read';exception when insufficient_privilege then null;end;
 begin perform public.accept_invitation(current_setting('test.token')::uuid);raise exception 'FAIL: anonymous RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
