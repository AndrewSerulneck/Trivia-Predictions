-- LOCAL Phase 2 artifact. Requires separate production confirmation in Phase 4.
-- The applied 20261013120000 migration is immutable. No content/data backfill here.
alter table public.trivia_questions add column speed_subject_evidence jsonb;
alter table public.trivia_questions add column speed_review_state jsonb;

create table public.speed_trivia_variety_permits (
 transaction_id bigint not null, row_id uuid not null, metadata_hash text not null,
 primary key(transaction_id,row_id)
);
-- grants-contract: no-api-access speed_trivia_variety_permits — internal transaction permits only.
revoke all on public.speed_trivia_variety_permits from public,anon,authenticated,service_role;
alter table public.speed_trivia_variety_permits enable row level security;
alter table public.speed_trivia_variety_permits force row level security;

create table public.speed_trivia_review_log (
 operation_id text primary key, authority_hash text not null, authority jsonb not null,
 before_states jsonb not null, after_states jsonb not null, undone boolean not null default false,
 undo_states jsonb, created_at timestamptz not null default now()
);
-- grants-contract: no-api-access speed_trivia_review_log — signed RPCs and readback only.
revoke all on public.speed_trivia_review_log from public,anon,authenticated,service_role;
alter table public.speed_trivia_review_log enable row level security;
alter table public.speed_trivia_review_log force row level security;

create function public.guard_speed_variety_metadata() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare permitted boolean;
begin
 if new.question_pool<>'anytime_blitz' then return new; end if;
 if TG_OP='INSERT' then
  if new.speed_subject_evidence is null and new.speed_review_state is null then return new; end if;
 elsif new.speed_subject_evidence is not distinct from old.speed_subject_evidence and new.speed_review_state is not distinct from old.speed_review_state then
  return new;
 end if;
 delete from public.speed_trivia_variety_permits where transaction_id=txid_current() and row_id=new.id and
 metadata_hash=public.speed_hash(public.speed_canonical(jsonb_build_array(new.speed_subject_evidence,new.speed_review_state))) returning true into permitted;
 if not coalesce(permitted,false) then raise exception 'speed-variety-permit-required'; end if;
 return new;
end $$;
create trigger y_speed_variety_metadata before insert or update on public.trivia_questions
for each row execute function public.guard_speed_variety_metadata();
revoke all on function public.guard_speed_variety_metadata() from public,anon,authenticated,service_role;

-- Retain the original fact admission as a private implementation. Old deployments
-- cannot bypass the new signed evidence/version boundary.
alter function public.admit_speed_trivia(text,jsonb,text,jsonb) rename to admit_speed_trivia_fact_v2;
revoke all on function public.admit_speed_trivia_fact_v2(text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create function public.admit_speed_trivia(p_payload text,p_check jsonb,p_signature text,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved jsonb; q public.trivia_questions; review jsonb; subject jsonb:=p_check->'subjectEvidence';
begin
 if p_check->>'subjectPolicy' is distinct from 'speed-subject-variety-v1' or
 p_check->>'evidenceHash' is distinct from public.speed_hash(public.speed_canonical(p_evidence)) or
 subject->>'policyVersion' is distinct from 'speed-subject-variety-v1' or
 subject->>'classifierVersion' is distinct from 'speed-subject-roles-v1' or
 subject->>'contentHash' is distinct from p_check->>'contentHash' or
 jsonb_typeof(subject->'subjects') is distinct from 'array' or
 jsonb_typeof(subject->'history') is distinct from 'array' then raise exception 'speed-variety-evidence-required'; end if;
 if coalesce((p_check->>'generated')::boolean,false) and
 (subject->>'coverage' not in ('identified','generic') or jsonb_typeof(p_check->'generation') is distinct from 'object') then raise exception 'speed-subject-identity-unresolved'; end if;
 -- Original RPC validates signature, current revision, old hash and fact proof.
 saved:=public.admit_speed_trivia_fact_v2(p_payload,p_check,p_signature,p_evidence);
 review:=jsonb_build_object('state','ready','contentHash',p_check->>'contentHash','policyVersion','speed-facts-v2');
 insert into public.speed_trivia_variety_permits values(txid_current(),(saved->>'id')::uuid,
 public.speed_hash(public.speed_canonical(jsonb_build_array(subject,review))));
 update public.trivia_questions set speed_subject_evidence=subject,speed_review_state=review
 where id=(saved->>'id')::uuid returning * into q;
 return to_jsonb(q);
end $$;
revoke all on function public.admit_speed_trivia(text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.admit_speed_trivia(text,jsonb,text,jsonb) to service_role;

-- FK inventory is evaluated once for a bounded batch, including slug FKs.
-- Row locks in apply/undo also block new FK references until commit. A schema
-- change (including composite FKs) invalidates old reference proof.
create function public.speed_trivia_review_references(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare fk record; counts jsonb; result jsonb:='{}'; schema_items jsonb:='[]';
begin
 if cardinality(p_ids)<1 or cardinality(p_ids)>200 then raise exception 'speed-review-reference-bound'; end if;
 for fk in select c.conname,n.nspname,t.relname,a.attname,b.attname as target,cardinality(c.conkey) as width,c.conrelid as table_oid,a.attnum as column_number,
 pg_get_constraintdef(c.oid) as definition
 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
 join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
 where c.contype='f' and c.confrelid='public.trivia_questions'::regclass order by c.conname loop
  if fk.width<>1 then raise exception 'speed-review-unsupported-reference'; end if;
  if not exists(select 1 from pg_index i where i.indrelid=fk.table_oid and i.indisvalid and i.indisready and i.indpred is null and i.indkey[0]=fk.column_number) then raise exception 'speed-review-reference-index-required'; end if;
  schema_items:=schema_items||jsonb_build_array(jsonb_build_object('name',fk.conname,'schema',fk.nspname,'table',fk.relname,'column',fk.attname,'target',fk.target,'definition',fk.definition));
  execute format('select coalesce(jsonb_object_agg(id::text,n),''{}''::jsonb) from (select q.id,count(r.%I) as n from public.trivia_questions q left join %I.%I r on r.%I=q.%I where q.id=any($1) group by q.id) counts',fk.attname,fk.nspname,fk.relname,fk.attname,fk.target)
  into counts using p_ids;
  result:=result||jsonb_build_object(fk.conname,counts);
 end loop;
 return jsonb_build_object('schema',schema_items,'counts',result);
end $$;
revoke all on function public.speed_trivia_review_references(uuid[]) from public,anon,authenticated;
grant execute on function public.speed_trivia_review_references(uuid[]) to service_role;

-- Authority binds the entire direct star and independent keeper retrieval proof.
-- A sibling exclusion without its own sound direct link is rejected.
create function public.apply_speed_trivia_review(p_authority text,p_signature text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a jsonb:=p_authority::jsonb; cfg public.speed_trivia_control; entry jsonb; proof jsonb;
 q public.trivia_questions; keeper public.trivia_questions; ids uuid[]; prior public.speed_trivia_review_log;
 before_states jsonb:='[]'; after_states jsonb:='[]'; next_status text; review jsonb; mh text:=public.speed_hash(p_authority);
begin
 select * into cfg from public.speed_trivia_control where singleton for update;
 if cfg.admission_secret is null or p_signature is distinct from public.speed_sign(cfg.admission_secret,p_authority) or
 a->>'version' is distinct from 'speed-pending-review-v1' or a->>'policyVersion' is distinct from cfg.policy or
 nullif(a->>'operationId','') is null then raise exception 'speed-review-invalid-authority'; end if;
 select * into prior from public.speed_trivia_review_log where operation_id=a->>'operationId' for update;
 if found then
  if prior.authority_hash<>mh or prior.undone then raise exception 'speed-review-idempotency-conflict'; end if;
  for entry in select value from jsonb_array_elements(prior.after_states) loop
   select * into q from public.trivia_questions where id=(entry->>'id')::uuid for update;
   if to_jsonb(q) is distinct from entry then raise exception 'speed-review-after-state-drift'; end if;
  end loop;
  return jsonb_build_object('operationId',a->>'operationId','rows',prior.after_states,'idempotent',true);
 end if;
 if a->>'corpusRevision' is distinct from cfg.revision::text or
 coalesce((a->>'expiresAt')::bigint,0)<extract(epoch from clock_timestamp())*1000 or
 (a->>'expiresAt')::bigint>extract(epoch from clock_timestamp())*1000+310000 then raise exception 'stale-speed-review-authority'; end if;
 if jsonb_typeof(a->'members') is distinct from 'array' or jsonb_array_length(a->'members') not between 1 and 50 then raise exception 'speed-review-member-bound'; end if;
 select array_agg((value->>'id')::uuid order by value->>'id') into ids from jsonb_array_elements(a->'members');
 if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'speed-review-duplicate-member'; end if;
 -- Lock all members in deterministic order before checking references/content.
 perform 1 from public.trivia_questions where id=any(ids) order by id for update;
 if public.speed_trivia_review_references(ids) is distinct from a->'references' then raise exception 'speed-review-reference-drift'; end if;
 if a->>'kind' in ('family','retire') then
  select * into keeper from public.trivia_questions where id=(a->>'keeperId')::uuid for update;
  if not found or keeper.question_pool<>'anytime_blitz' or
  (a->>'kind'='family' and (keeper.status<>'pending_review' or not keeper.id=any(ids))) or
  (a->>'kind'='retire' and keeper.status<>'active') or
  public.speed_hash(public.speed_canonical(to_jsonb(keeper))) is distinct from a->>'keeperStateHash' then raise exception 'speed-review-invalid-keeper'; end if;
 end if;
 if a->>'kind' in ('family','activate') then
  proof:=a->'keeperProof';
  if proof->>'decision' is distinct from 'unique' or proof->>'policyVersion' is distinct from cfg.policy or
  proof->>'corpusRevision' is distinct from cfg.revision::text or proof->>'contentHash' is distinct from a->>'keeperContentHash' or
  proof->'retrieval'->>'complete' is distinct from 'true' or coalesce((proof->>'verifiedComparisonCount')::int,0)<1 then raise exception 'speed-review-incomplete-keeper-proof'; end if;
 end if;
 if a->>'kind'='family' and (
  jsonb_typeof(a->'keeperProof'->'excludedSiblings') is distinct from 'array' or
  jsonb_array_length(a->'keeperProof'->'excludedSiblings')<>cardinality(ids)-1 or
  exists(select 1 from jsonb_array_elements(a->'members') m where m->>'id'<>a->>'keeperId' and not exists(
   select 1 from jsonb_array_elements(a->'keeperProof'->'excludedSiblings') e where e->>'id'=m->>'id' and e->>'contentHash'=m->>'contentHash')) or
  a->'keeperProof'->'selfQuality'->>'qualityA' is distinct from 'sound') then raise exception 'speed-review-arbitrary-exclusion'; end if;
 for entry in select value from jsonb_array_elements(a->'members') loop
  select * into q from public.trivia_questions where id=(entry->>'id')::uuid;
  if not found or q.question_pool<>'anytime_blitz' or q.status<>'pending_review' or
  public.speed_hash(public.speed_canonical(to_jsonb(q))) is distinct from entry->>'stateHash' or
  public.speed_content_hash(to_jsonb(q)) is distinct from entry->>'contentHash' then raise exception 'speed-review-old-state-drift'; end if;
  before_states:=before_states||jsonb_build_array(to_jsonb(q));
  if a->>'kind' in ('family','activate') and q.id::text=a->>'keeperId' then
   if entry->>'contentHash' is distinct from a->>'keeperContentHash' then raise exception 'speed-review-keeper-hash'; end if;
   next_status:='active';review:=jsonb_build_object('state','ready','contentHash',entry->>'contentHash','policyVersion',cfg.policy);
  elsif a->>'kind' in ('family','retire') then
   proof:=entry->'directProof';
   if q.id=keeper.id or proof->>'aId' is distinct from q.id::text or proof->>'bId' is distinct from keeper.id::text or
   proof->>'aHash' is distinct from entry->>'contentHash' or proof->>'bHash' is distinct from public.speed_content_hash(to_jsonb(keeper)) or
   proof->'result'->>'decision' is distinct from 'duplicate' or proof->'result'->>'qualityA' is distinct from 'sound' or
   proof->'result'->>'qualityB' is distinct from 'sound' or proof->'result'->>'confidence' is distinct from 'high' then raise exception 'speed-review-unproven-direct-link'; end if;
   next_status:='deleted';review:=jsonb_build_object('state','retired_repeat','keeperId',keeper.id,'contentHash',entry->>'contentHash','operationId',a->>'operationId');
  elsif a->>'kind'='hold' and entry->>'reason' in ('factual_uncertainty','provider_unavailable','evidence_incomplete','reservation_review','subject_identity_unresolved') then
   next_status:='pending_review';review:=jsonb_build_object('state','held','reason',entry->>'reason','contentHash',entry->>'contentHash','operationId',a->>'operationId');
  else raise exception 'speed-review-invalid-disposition'; end if;
  insert into public.speed_trivia_permits values(txid_current(),q.id,
  public.speed_write_hash(to_jsonb(q)||jsonb_build_object('status',next_status)),false);
  insert into public.speed_trivia_variety_permits values(txid_current(),q.id,
  public.speed_hash(public.speed_canonical(jsonb_build_array(q.speed_subject_evidence,review))));
  update public.trivia_questions set status=next_status,speed_review_state=review where id=q.id returning * into q;
  after_states:=after_states||jsonb_build_array(to_jsonb(q));
  delete from public.speed_trivia_permits where transaction_id=txid_current();
 end loop;
 if a->>'kind' in ('family','activate') and not (a->>'keeperId')::uuid=any(ids) then raise exception 'speed-review-missing-keeper'; end if;
 delete from public.speed_trivia_permits where transaction_id=txid_current();
 delete from public.speed_trivia_variety_permits where transaction_id=txid_current();
 insert into public.speed_trivia_review_log(operation_id,authority_hash,authority,before_states,after_states)
 values(a->>'operationId',mh,a,before_states,after_states);
 return jsonb_build_object('operationId',a->>'operationId','rows',after_states,'revision',(select revision::text from public.speed_trivia_control where singleton),'idempotent',false);
end $$;
revoke all on function public.apply_speed_trivia_review(text,text) from public,anon,authenticated;
grant execute on function public.apply_speed_trivia_review(text,text) to service_role;

create function public.speed_trivia_review_state(p_operation_id text) returns jsonb language sql security definer
set search_path=pg_catalog,public as $$ select to_jsonb(l) from public.speed_trivia_review_log l where operation_id=p_operation_id $$;
revoke all on function public.speed_trivia_review_state(text) from public,anon,authenticated;
grant execute on function public.speed_trivia_review_state(text) to service_role;

-- Exact group undo restores statuses/metadata only, with every after-state and
-- reference checked. All family facts remain in the bank as pending reservations.
create function public.undo_speed_trivia_review(p_authority text,p_signature text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a jsonb:=p_authority::jsonb; cfg public.speed_trivia_control; log public.speed_trivia_review_log;
 entry jsonb; before_row jsonb; q public.trivia_questions; restored jsonb:='[]'; ids uuid[]; current_states jsonb;
begin
 select * into cfg from public.speed_trivia_control where singleton for update;
 if cfg.admission_secret is null or p_signature is distinct from public.speed_sign(cfg.admission_secret,p_authority) or
 a->>'version' is distinct from 'speed-pending-review-undo-v1' then raise exception 'speed-review-invalid-undo'; end if;
 select * into log from public.speed_trivia_review_log where operation_id=a->>'operationId' for update;
 if not found or a->>'authorityHash' is distinct from log.authority_hash then raise exception 'speed-review-undo-log-mismatch'; end if;
 current_states:=case when log.undone then log.undo_states else log.after_states end;
 select array_agg((value->>'id')::uuid order by value->>'id') into ids from jsonb_array_elements(current_states);
 perform 1 from public.trivia_questions where id=any(ids) order by id for update;
 for entry in select value from jsonb_array_elements(current_states) loop
  select * into q from public.trivia_questions where id=(entry->>'id')::uuid;
  if to_jsonb(q) is distinct from entry then raise exception 'speed-review-undo-state-drift'; end if;
 end loop;
 if log.undone then return jsonb_build_object('rows',log.undo_states,'idempotent',true); end if;
 if a->>'corpusRevision' is distinct from cfg.revision::text or
 coalesce((a->>'expiresAt')::bigint,0)<extract(epoch from clock_timestamp())*1000 or
 (a->>'expiresAt')::bigint>extract(epoch from clock_timestamp())*1000+310000 or
 public.speed_trivia_review_references(ids) is distinct from a->'references' then raise exception 'speed-review-stale-undo'; end if;
 for before_row in select value from jsonb_array_elements(log.before_states) loop
  select * into q from public.trivia_questions where id=(before_row->>'id')::uuid;
  insert into public.speed_trivia_permits values(txid_current(),q.id,public.speed_write_hash(before_row),false);
  insert into public.speed_trivia_variety_permits values(txid_current(),q.id,public.speed_hash(public.speed_canonical(jsonb_build_array(before_row->'speed_subject_evidence',before_row->'speed_review_state'))));
  update public.trivia_questions set status=before_row->>'status',speed_subject_evidence=nullif(before_row->'speed_subject_evidence','null'::jsonb),speed_review_state=nullif(before_row->'speed_review_state','null'::jsonb)
  where id=q.id returning * into q;
  restored:=restored||jsonb_build_array(to_jsonb(q));
 end loop;
 delete from public.speed_trivia_permits where transaction_id=txid_current();
 delete from public.speed_trivia_variety_permits where transaction_id=txid_current();
 update public.speed_trivia_review_log set undone=true,undo_states=restored where operation_id=a->>'operationId';
 return jsonb_build_object('rows',restored,'idempotent',false);
end $$;
revoke all on function public.undo_speed_trivia_review(text,text) from public,anon,authenticated;
grant execute on function public.undo_speed_trivia_review(text,text) to service_role;

create function public.speed_trivia_variety_prerequisites(p_probe text,p_signature text) returns jsonb language sql security definer
set search_path=pg_catalog,public as $$
 select jsonb_build_object('configured',admission_secret is not null and length(p_probe) between 20 and 200 and p_probe like 'speed-variety-prerequisite:%' and p_signature=public.speed_sign(admission_secret,p_probe),'subjectPolicy','speed-subject-variety-v1','factPolicy',policy,'revision',revision::text)
 from public.speed_trivia_control where singleton
$$;
revoke all on function public.speed_trivia_variety_prerequisites(text,text) from public,anon,authenticated;
grant execute on function public.speed_trivia_variety_prerequisites(text,text) to service_role;
