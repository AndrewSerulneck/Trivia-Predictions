-- Phase 3 LOCAL ONLY. Install with generation paused; secret is deliberately unset.
-- No question is retired, promoted, or edited by this migration.
alter table public.trivia_questions add column if not exists image_context jsonb;
alter table public.trivia_questions add column if not exists speed_revision bigint not null default 0;
alter table public.trivia_questions add column if not exists speed_generation_metadata jsonb;

create table public.speed_trivia_control (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 0,
  policy text not null default 'speed-facts-v2',
  admission_secret text check(admission_secret is null or length(admission_secret)>=32)
);
create table public.speed_trivia_permits (
  transaction_id bigint primary key, row_id uuid not null, write_hash text not null, reserve_previous_fact boolean not null default false
);
create table public.speed_trivia_memory (
  id text primary key, row_data jsonb not null, revision bigint not null
);
create table public.speed_trivia_changes (
  revision bigint primary key, row_id uuid not null, removed boolean not null
);
create table public.speed_trivia_admissions (
  row_id uuid primary key, content_hash text not null, revision bigint not null,
  policy text not null, evidence jsonb not null, checked_at timestamptz not null default now()
);
create table public.speed_trivia_cleanup_log (
  manifest_hash text not null, row_id uuid not null, before_state jsonb not null,
  after_state jsonb not null, manifest_entry jsonb not null, applied_revision bigint not null, undone boolean not null default false,
  primary key(manifest_hash,row_id)
);
-- grants-contract: no-api-access speed_trivia_control — private signing secret; RPCs only.
-- grants-contract: no-api-access speed_trivia_permits — transaction permits; RPCs only.
-- grants-contract: no-api-access speed_trivia_memory — permanent fact memory; RPCs only.
-- grants-contract: no-api-access speed_trivia_changes — bounded revision deltas; RPCs only.
-- grants-contract: no-api-access speed_trivia_admissions — signed evidence; RPCs only.
-- grants-contract: no-api-access speed_trivia_cleanup_log — immutable before/after log; RPCs only.
revoke all on public.speed_trivia_control,public.speed_trivia_permits,public.speed_trivia_memory,
  public.speed_trivia_changes,public.speed_trivia_admissions,public.speed_trivia_cleanup_log from public,anon,authenticated,service_role;
alter table public.speed_trivia_control enable row level security;
alter table public.speed_trivia_control force row level security;
alter table public.speed_trivia_permits enable row level security;
alter table public.speed_trivia_permits force row level security;
alter table public.speed_trivia_memory enable row level security;
alter table public.speed_trivia_memory force row level security;
alter table public.speed_trivia_changes enable row level security;
alter table public.speed_trivia_changes force row level security;
alter table public.speed_trivia_admissions enable row level security;
alter table public.speed_trivia_admissions force row level security;
alter table public.speed_trivia_cleanup_log enable row level security;
alter table public.speed_trivia_cleanup_log force row level security;
insert into public.speed_trivia_control(singleton) values(true);

-- JSON.stringify-compatible compact, recursively sorted JSON. Tested against Node.
create function public.speed_canonical(p jsonb) returns text
language sql immutable strict set search_path=pg_catalog,public as $$
 select case jsonb_typeof(p)
 when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||public.speed_canonical(value),',' order by key collate "C") from jsonb_each(p)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(public.speed_canonical(value),',' order by ord) from jsonb_array_elements(p) with ordinality a(value,ord)),'')||']'
 else p::text end
$$;
create function public.speed_hash(p text) returns text language sql immutable strict
set search_path=pg_catalog,public as $$ select encode(sha256(convert_to(p,'UTF8')),'hex') $$;
-- Standard HMAC-SHA256 built from PostgreSQL's SHA-256 primitive; no extension dependency.
create function public.speed_sign(p_secret text,p_message text) returns text
language plpgsql immutable strict set search_path=pg_catalog,public as $$
declare k bytea:=convert_to(p_secret,'UTF8'); ipad bytea; opad bytea; i int;
begin
 if length(k)>64 then k:=sha256(k); end if;
 k:=k||decode(repeat('00',64-length(k)),'hex');ipad:=k;opad:=k;
 for i in 0..63 loop ipad:=set_byte(ipad,i,get_byte(k,i)#54);opad:=set_byte(opad,i,get_byte(k,i)#92);end loop;
 return encode(sha256(opad||sha256(ipad||convert_to(p_message,'UTF8'))),'hex');
end $$;
create function public.speed_content_hash(p jsonb) returns text language sql immutable strict
set search_path=pg_catalog,public as $$
 select public.speed_hash(public.speed_canonical(jsonb_build_object(
 'question',p->'question','answer',p->'options'->((p->>'correct_answer')::int),'options',p->'options',
 'correctAnswer',p->'correct_answer','category',p->'category','imageUrl',coalesce(nullif(p->'image_url','""'::jsonb),'null'::jsonb),
 'imageContext',coalesce(p->'image_context','null'::jsonb),'pool',p->'question_pool','format',p->'answer_format')))
$$;
create function public.speed_write_hash(p jsonb) returns text language sql immutable strict
set search_path=pg_catalog,public as $$
 select public.speed_hash(public.speed_canonical(jsonb_build_object('id',p->'id','slug',p->'slug','status',p->'status',
 'question',p->'question','options',p->'options','correct_answer',p->'correct_answer','category',p->'category',
 'difficulty',p->'difficulty','question_pool',p->'question_pool','answer_format',p->'answer_format',
 'image_url',coalesce(p->'image_url','null'::jsonb),'image_context',coalesce(p->'image_context','null'::jsonb))))
$$;

create function public.guard_speed_trivia_write() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare involved boolean; guarded boolean; permitted boolean; reserve_old boolean:=false; rev bigint;
begin
 if TG_OP='DELETE' and old.speed_revision>0 then raise exception 'speed-physical-delete-forbidden'; end if;
 if TG_OP='UPDATE' and old.speed_revision>0 then
  if new.id<>old.id or new.slug is distinct from old.slug then raise exception 'speed-identity-change-forbidden'; end if;
  -- Former-Speed rows cannot erase their provenance to escape history protection.
  new.speed_revision:=old.speed_revision;
 end if;
 involved := (TG_OP<>'INSERT' and old.question_pool='anytime_blitz') or (TG_OP<>'DELETE' and new.question_pool='anytime_blitz');
 if not involved then
  if TG_OP='INSERT' then new.speed_revision:=0; end if;
  return coalesce(new,old);
 end if;
 -- This row lock also serializes direct status-only retirement and pool departures.
 perform 1 from public.speed_trivia_control where singleton for update;
 if TG_OP='DELETE' then raise exception 'speed-physical-delete-forbidden'; end if;
 if TG_OP='UPDATE' and (new.id<>old.id or new.slug is distinct from old.slug) then raise exception 'speed-identity-change-forbidden'; end if;
 if new.question_pool='anytime_blitz' and new.answer_format<>'multiple_choice' then raise exception 'speed-invalid-format'; end if;
 new.normalized_question_key := public.normalize_trivia_question_key(new.question);
 guarded := TG_OP='INSERT' or old.question_pool<>'anytime_blitz' or
    (new.question_pool='anytime_blitz' and (public.speed_write_hash(to_jsonb(new))<>public.speed_write_hash(to_jsonb(old))) and
      not (new.status='deleted' and old.status<>'deleted' and public.speed_content_hash(to_jsonb(new))=public.speed_content_hash(to_jsonb(old)) and new.difficulty is not distinct from old.difficulty));
 -- Pool departure also needs a signed permit. A Live slug upsert must not
 -- accidentally overwrite a Speed question. Authorized departures retain memory.
 if old.question_pool='anytime_blitz' and new.question_pool<>'anytime_blitz' then guarded:=true; end if;
 if guarded then
   delete from public.speed_trivia_permits where transaction_id=txid_current() and row_id=new.id
      and write_hash=public.speed_write_hash(to_jsonb(new)) returning true,reserve_previous_fact into permitted,reserve_old;
   if not coalesce(permitted,false) then raise exception 'speed-admission-required'; end if;
 end if;
 update public.speed_trivia_control set revision=revision+1 where singleton returning revision into rev;
 if TG_OP='UPDATE' and old.question_pool='anytime_blitz' and
    (new.question_pool<>'anytime_blitz' or (reserve_old and public.speed_content_hash(to_jsonb(new))<>public.speed_content_hash(to_jsonb(old)))) then
   insert into public.speed_trivia_memory(id,row_data,revision) values('history:'||old.id||':'||rev,
     to_jsonb(old)||jsonb_build_object('id','history:'||old.id||':'||rev,'status','deleted'),rev);
 end if;
 new.speed_revision:=rev;
 insert into public.speed_trivia_changes values(rev,new.id,new.question_pool<>'anytime_blitz');
 return new;
end $$;
create trigger z_speed_trivia_admission before insert or update or delete on public.trivia_questions
for each row execute function public.guard_speed_trivia_write();

create function public.speed_trivia_inventory() returns jsonb language sql security definer
set search_path=pg_catalog,public as $$
 select jsonb_build_object('revision',c.revision::text,'count',
   (select count(*) from public.trivia_questions where question_pool='anytime_blitz')+(select count(*) from public.speed_trivia_memory))
 from public.speed_trivia_control c where singleton
$$;
create function public.speed_trivia_corpus_page(p_revision text,p_offset int,p_limit int) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare rev bigint; result jsonb;
begin
 select revision into rev from public.speed_trivia_control where singleton for share;
 if rev::text<>p_revision or p_limit<1 or p_limit>1000 or p_offset<0 then raise exception 'stale-speed-revision'; end if;
 select coalesce(jsonb_agg(row_data order by id collate "C"),'[]') into result from (
  select id,row_data from (
   select id::text,to_jsonb(q) row_data from public.trivia_questions q where question_pool='anytime_blitz'
   union all select id,row_data from public.speed_trivia_memory
  ) all_rows order by id collate "C" limit p_limit offset p_offset
 ) page;
 return jsonb_build_object('rows',result,'revision',rev::text);
end $$;
create function public.speed_trivia_corpus_delta(p_revision text,p_limit int) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare rev bigint; changes int;
begin
 select revision into rev from public.speed_trivia_control where singleton for share;
 if p_limit<1 or p_limit>500 or p_revision::bigint>rev then raise exception 'invalid-speed-delta'; end if;
 select count(*) into changes from (select revision from public.speed_trivia_changes where revision>p_revision::bigint limit p_limit+1) c;
 return jsonb_build_object('revision',rev::text,'complete',changes<=p_limit,
 'rows',case when changes>p_limit then '[]'::jsonb else coalesce((select jsonb_agg(row_data) from (
  select to_jsonb(q) row_data from public.trivia_questions q where question_pool='anytime_blitz' and speed_revision>p_revision::bigint
  union all select row_data from public.speed_trivia_memory where revision>p_revision::bigint
 ) r),'[]') end,
 'removedIds',case when changes>p_limit then '[]'::jsonb else coalesce((select jsonb_agg(row_id::text) from public.speed_trivia_changes where revision>p_revision::bigint and removed),'[]') end);
end $$;
create index speed_trivia_revision_idx on public.trivia_questions(speed_revision) where question_pool='anytime_blitz';
create index speed_trivia_memory_revision_idx on public.speed_trivia_memory(revision);
create function public.speed_trivia_find(p_identifier text) returns jsonb language sql security definer
set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.trivia_questions q where id::text=p_identifier or slug=p_identifier
$$;

create function public.admit_speed_trivia(p_payload text,p_check jsonb,p_signature text,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg public.speed_trivia_control; prior public.trivia_questions; candidate public.trivia_questions;
 payload jsonb; found_prior boolean; expected_signature text;
begin
 select * into cfg from public.speed_trivia_control where singleton for update;
 if cfg.admission_secret is null then raise exception 'speed-admission-not-configured'; end if;
 expected_signature:=public.speed_sign(cfg.admission_secret,public.speed_canonical(p_check));
 if p_signature is distinct from expected_signature or p_check->>'policyVersion' is distinct from cfg.policy or
    p_check->>'payloadHash' is distinct from public.speed_hash(p_payload) or
    coalesce((p_check->>'expiresAt')::bigint,0)<extract(epoch from clock_timestamp())*1000 or
    (p_check->>'expiresAt')::bigint>extract(epoch from clock_timestamp())*1000+310000 then raise exception 'invalid-speed-check'; end if;
 if p_check->>'corpusRevision' is distinct from cfg.revision::text then raise exception 'stale-speed-revision'; end if;
 payload:=p_payload::jsonb;
 select * into prior from public.trivia_questions where id=(payload->>'id')::uuid for update;
 found_prior:=found;
 if found_prior and p_check->>'oldHash' is distinct from public.speed_hash(public.speed_canonical(to_jsonb(prior))) then raise exception 'speed-old-state-drift'; end if;
 if not found_prior and p_check->>'oldHash' is not null then raise exception 'speed-old-state-drift'; end if;
 if found_prior and prior.status='deleted' and not coalesce((p_check->>'restore')::boolean,false) then raise exception 'speed-retired'; end if;
 if (not found_prior or prior.question_pool<>'anytime_blitz') and payload->>'status'<>'pending_review' then raise exception 'speed-new-row-must-be-pending'; end if;
 if found_prior then candidate:=jsonb_populate_record(prior,payload); else
   candidate:=jsonb_populate_record(null::public.trivia_questions,payload); candidate.created_at:=now(); candidate.speed_revision:=0;
 end if;
 if candidate.question_pool<>'anytime_blitz' or candidate.answer_format<>'multiple_choice' or
    nullif(trim(candidate.question),'') is null or nullif(trim(candidate.category),'') is null or
    jsonb_typeof(candidate.options)<>'array' or jsonb_array_length(candidate.options)<2 or
    candidate.correct_answer<0 or candidate.correct_answer>=jsonb_array_length(candidate.options) or
    exists(select 1 from jsonb_array_elements(candidate.options) v where jsonb_typeof(v)<>'string' or nullif(trim(v#>>'{}'),'') is null) or
    (candidate.image_url is not null and candidate.image_url<>'' and candidate.image_context is null) then raise exception 'speed-malformed-content'; end if;
 if p_evidence->>'decision' is distinct from 'unique' or p_evidence->>'policyVersion' is distinct from cfg.policy or
    p_evidence->>'corpusRevision' is distinct from cfg.revision::text or
    p_check->>'contentHash' is distinct from public.speed_content_hash(to_jsonb(candidate)) or
    p_evidence->>'contentHash' is distinct from p_check->>'contentHash' then raise exception 'invalid-speed-evidence'; end if;
 if jsonb_typeof(p_check->'generation')='object' then
  if p_check->'generation'->>'version' is distinct from 'speed-subject-plan-v1' or nullif(p_check->'generation'->>'subtopic','') is null or length(p_check->'generation'->>'subtopic')>160 or
     nullif(p_check->'generation'->>'primarySubject','') is null or length(p_check->'generation'->>'primarySubject')>160 then raise exception 'invalid-speed-generation-metadata'; end if;
  candidate.speed_generation_metadata:=p_check->'generation';
 elsif found_prior and prior.question_pool='anytime_blitz' and not coalesce((p_check->>'reservePreviousFact')::boolean,false) then
  candidate.speed_generation_metadata:=prior.speed_generation_metadata;
 else candidate.speed_generation_metadata:=null;
 end if;
 insert into public.speed_trivia_permits values(txid_current(),candidate.id,public.speed_write_hash(to_jsonb(candidate)),coalesce((p_check->>'reservePreviousFact')::boolean,false));
 if found_prior then
   update public.trivia_questions set question=candidate.question,options=candidate.options,correct_answer=candidate.correct_answer,
     category=candidate.category,difficulty=candidate.difficulty,question_pool=candidate.question_pool,answer_format=candidate.answer_format,
     image_url=candidate.image_url,image_context=candidate.image_context,status=candidate.status,speed_generation_metadata=candidate.speed_generation_metadata where id=candidate.id returning * into candidate;
 else
   insert into public.trivia_questions(id,slug,question,options,correct_answer,category,difficulty,question_pool,answer_format,image_url,image_context,status,speed_generation_metadata)
    values(candidate.id,candidate.slug,candidate.question,candidate.options,candidate.correct_answer,candidate.category,candidate.difficulty,
     candidate.question_pool,candidate.answer_format,candidate.image_url,candidate.image_context,candidate.status,candidate.speed_generation_metadata) returning * into candidate;
 end if;
 delete from public.speed_trivia_permits where transaction_id=txid_current();
 insert into public.speed_trivia_admissions(row_id,content_hash,revision,policy,evidence) values(candidate.id,p_check->>'contentHash',candidate.speed_revision,cfg.policy,p_evidence)
 on conflict(row_id) do update set content_hash=excluded.content_hash,revision=excluded.revision,policy=excluded.policy,evidence=excluded.evidence,checked_at=now();
 if p_evidence->'derivedFact'->>'contentHash'=p_check->>'contentHash' and p_evidence->'derivedFact'->>'extractorVersion'='answer-concepts-v2' then
  insert into public.speed_trivia_features(id,content_hash,extractor_version,derived) values(candidate.id::text,p_check->>'contentHash','answer-concepts-v2',p_evidence->'derivedFact')
   on conflict(id) do update set content_hash=excluded.content_hash,extractor_version=excluded.extractor_version,derived=excluded.derived;
 end if;
 return to_jsonb(candidate);
end $$;
-- Utility/trigger functions are never client RPC entry points.
revoke all on function public.speed_canonical(jsonb),public.speed_hash(text),public.speed_sign(text,text),public.speed_content_hash(jsonb),public.speed_write_hash(jsonb),public.guard_speed_trivia_write() from public,anon,authenticated,service_role;
revoke all on function public.speed_trivia_inventory(),public.speed_trivia_corpus_page(text,int,int),public.speed_trivia_corpus_delta(text,int),public.speed_trivia_find(text),public.admit_speed_trivia(text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.speed_trivia_inventory(),public.speed_trivia_corpus_page(text,int,int),public.speed_trivia_corpus_delta(text,int),public.speed_trivia_find(text),public.admit_speed_trivia(text,jsonb,text,jsonb) to service_role;

-- Immutable signed manifest, at most 50 retirements/transaction. No content edits.
create function public.speed_trivia_retire_batch(p_manifest text,p_signature text,p_start int,p_limit int) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg public.speed_trivia_control; manifest jsonb; mh text; entry jsonb; q public.trivia_questions;
 keeper public.trivia_questions; prior_log public.speed_trivia_cleanup_log; done int; expected bigint; result jsonb:='[]';
begin
 select * into cfg from public.speed_trivia_control where singleton for update;
 manifest:=p_manifest::jsonb; mh:=public.speed_hash(p_manifest);
 if cfg.admission_secret is null or p_signature is distinct from public.speed_sign(cfg.admission_secret,p_manifest) or
 manifest->>'version' is distinct from 'speed-retirement-apply-v1' or manifest->>'policyVersion' is distinct from cfg.policy or
 manifest->>'applyReady' is distinct from 'true' or p_limit<1 or p_limit>50 or p_start<0 or jsonb_typeof(manifest->'retirements')<>'array' then raise exception 'invalid-speed-manifest'; end if;
 select count(*) into done from public.speed_trivia_cleanup_log where manifest_hash=mh;
 if exists(select 1 from public.speed_trivia_cleanup_log where manifest_hash=mh and undone) then raise exception 'speed-manifest-already-undone'; end if;
 expected:=(manifest->>'corpusRevision')::bigint+done;
 if expected<>cfg.revision then raise exception 'speed-cleanup-revision-drift'; end if;
 for entry in select value from jsonb_array_elements(manifest->'retirements') with ordinality e(value,ord) where ord>p_start and ord<=p_start+p_limit loop
  select * into prior_log from public.speed_trivia_cleanup_log where manifest_hash=mh and row_id=(entry->>'id')::uuid;
  if found then
   select * into q from public.trivia_questions where id=prior_log.row_id;
   if to_jsonb(q) is distinct from prior_log.after_state then raise exception 'speed-cleanup-after-state-drift'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'idempotent',true));continue;
  end if;
  select * into q from public.trivia_questions where id=(entry->>'id')::uuid for update;
  if not found or q.question_pool<>'anytime_blitz' or q.slug is distinct from entry->>'slug' or
    q.status is distinct from entry->>'oldStatus' or q.status='deleted' or
    public.speed_content_hash(to_jsonb(q)) is distinct from entry->>'oldContentHash' then raise exception 'speed-cleanup-old-state-drift'; end if;
  select * into keeper from public.trivia_questions where id=(entry->>'keeperId')::uuid for update;
  if not found or keeper.question_pool<>'anytime_blitz' or keeper.status<>'active' or keeper.id=q.id or
    public.speed_content_hash(to_jsonb(keeper)) is distinct from entry->>'keeperContentHash' or
    exists(select 1 from jsonb_array_elements(manifest->'retirements') v where v->>'id'=keeper.id::text) then raise exception 'speed-cleanup-invalid-keeper'; end if;
  if entry->>'confidence' is distinct from 'high' or entry->'evidence'->'result'->>'decision' is distinct from 'duplicate' or
    entry->'evidence'->'result'->>'qualityA' is distinct from 'sound' or entry->'evidence'->'result'->>'qualityB' is distinct from 'sound' or
    not coalesce(((entry->'evidence'->>'aId'=q.id::text and entry->'evidence'->>'bId'=keeper.id::text and entry->'evidence'->>'aHash'=entry->>'oldContentHash' and entry->'evidence'->>'bHash'=entry->>'keeperContentHash') or
      (entry->'evidence'->>'bId'=q.id::text and entry->'evidence'->>'aId'=keeper.id::text and entry->'evidence'->>'bHash'=entry->>'oldContentHash' and entry->'evidence'->>'aHash'=entry->>'keeperContentHash')),false) then raise exception 'speed-cleanup-unproven-keeper'; end if;
  insert into public.speed_trivia_cleanup_log(manifest_hash,row_id,before_state,after_state,manifest_entry,applied_revision)
    values(mh,q.id,to_jsonb(q),'{}',entry,0);
  update public.trivia_questions set status='deleted' where id=q.id returning * into q;
  update public.speed_trivia_cleanup_log set after_state=to_jsonb(q),applied_revision=q.speed_revision where manifest_hash=mh and row_id=q.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'idempotent',false));
 end loop;
 return jsonb_build_object('manifestHash',mh,'rows',result,'revision',(select revision::text from public.speed_trivia_control where singleton));
end $$;
create function public.speed_trivia_cleanup_state(p_manifest_hash text) returns jsonb language sql security definer
set search_path=pg_catalog,public as $$
 select jsonb_build_object('revision',(select revision::text from public.speed_trivia_control where singleton),
 'rows',coalesce((select jsonb_agg(to_jsonb(l) order by row_id) from public.speed_trivia_cleanup_log l where manifest_hash=p_manifest_hash),'[]'))
$$;
create function public.speed_trivia_undo_retirement(p_manifest_hash text,p_row_id uuid,p_payload text,p_check jsonb,p_signature text,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare log public.speed_trivia_cleanup_log; q public.trivia_questions; restored jsonb;
begin
 perform 1 from public.speed_trivia_control where singleton for update;
 select * into log from public.speed_trivia_cleanup_log where manifest_hash=p_manifest_hash and row_id=p_row_id for update;
 if not found then raise exception 'speed-undo-no-log'; end if;
 select * into q from public.trivia_questions where id=p_row_id for update;
 if log.undone then
  if public.speed_content_hash(to_jsonb(q)) is distinct from public.speed_content_hash(log.before_state) or q.status is distinct from log.before_state->>'status' then raise exception 'speed-undo-after-state-drift'; end if;
  return to_jsonb(q);
 end if;
 if to_jsonb(q) is distinct from log.after_state then raise exception 'speed-undo-old-state-drift'; end if;
 if p_check->>'restore' is distinct from 'true' or (p_payload::jsonb)->>'id' is distinct from p_row_id::text or
    (p_payload::jsonb)->>'status' is distinct from log.before_state->>'status' or
    public.speed_write_hash(p_payload::jsonb) is distinct from public.speed_write_hash(log.before_state) then raise exception 'speed-undo-content-mismatch'; end if;
 restored:=public.admit_speed_trivia(p_payload,p_check,p_signature,p_evidence);
 update public.speed_trivia_cleanup_log set undone=true where manifest_hash=p_manifest_hash and row_id=p_row_id;
 return restored;
end $$;
revoke all on function public.speed_trivia_retire_batch(text,text,int,int),public.speed_trivia_cleanup_state(text),public.speed_trivia_undo_retirement(text,uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.speed_trivia_retire_batch(text,text,int,int),public.speed_trivia_cleanup_state(text),public.speed_trivia_undo_retirement(text,uuid,text,jsonb,text,jsonb) to service_role;

-- Content/provider/policy keyed decisions. Entries are reusable, never approvals.
create table public.speed_trivia_pair_cache(key text primary key,value jsonb not null,created_at timestamptz not null default now());
-- grants-contract: no-api-access speed_trivia_pair_cache — signed cache writes and bounded RPC reads only.
revoke all on public.speed_trivia_pair_cache from public,anon,authenticated,service_role;
alter table public.speed_trivia_pair_cache enable row level security;
alter table public.speed_trivia_pair_cache force row level security;
create function public.speed_trivia_cached_pairs(p_keys text[]) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
 if cardinality(p_keys)>128 then raise exception 'speed-cache-key-budget'; end if;
 return coalesce((select jsonb_object_agg(key,value) from public.speed_trivia_pair_cache where key=any(p_keys)),'{}');
end $$;
create function public.speed_trivia_cache_pairs(p_entries text,p_signature text) returns boolean language plpgsql security definer
set search_path=pg_catalog,public as $$
declare secret text; entry record;
begin
 select admission_secret into secret from public.speed_trivia_control where singleton;
 if secret is null or p_signature is distinct from public.speed_sign(secret,p_entries) or jsonb_typeof(p_entries::jsonb)<>'object' or
   (select count(*) from jsonb_each(p_entries::jsonb))>128 then raise exception 'invalid-speed-cache-signature'; end if;
 for entry in select * from jsonb_each(p_entries::jsonb) loop
  if entry.key!~'^[a-f0-9]{64}$' or entry.value->>'modelVersion' is null or entry.value->>'firstHash' is null or
    entry.value->'result'->>'decision' not in ('unique','duplicate','uncertain') then raise exception 'invalid-speed-cache-entry'; end if;
  insert into public.speed_trivia_pair_cache(key,value) values(entry.key,entry.value) on conflict(key) do nothing;
 end loop;
 return true;
end $$;
revoke all on function public.speed_trivia_cached_pairs(text[]),public.speed_trivia_cache_pairs(text,text) from public,anon,authenticated;
grant execute on function public.speed_trivia_cached_pairs(text[]),public.speed_trivia_cache_pairs(text,text) to service_role;

create table public.speed_trivia_features(id text primary key,content_hash text not null,extractor_version text not null,derived jsonb not null);
-- grants-contract: no-api-access speed_trivia_features — derived metadata only via checked bounded backfill RPC.
revoke all on public.speed_trivia_features from public,anon,authenticated,service_role;
alter table public.speed_trivia_features enable row level security;
alter table public.speed_trivia_features force row level security;
create function public.speed_trivia_backfill_features(p_rows jsonb,p_revision text) returns int language plpgsql security definer
set search_path=pg_catalog,public as $$
declare rev bigint; entry jsonb; actual jsonb; changed int:=0;
begin
 select revision into rev from public.speed_trivia_control where singleton for share;
 if p_revision is distinct from rev::text or jsonb_array_length(p_rows)>500 then raise exception 'stale-speed-feature-backfill'; end if;
 for entry in select value from jsonb_array_elements(p_rows) loop
  select to_jsonb(q) into actual from public.trivia_questions q where id::text=entry->>'id' and question_pool='anytime_blitz';
  if not found then select row_data into actual from public.speed_trivia_memory where id=entry->>'id'; end if;
  if actual is null or public.speed_content_hash(actual) is distinct from entry->>'contentHash' or entry->>'extractorVersion' is distinct from 'answer-concepts-v2' then raise exception 'invalid-speed-derived-content'; end if;
  insert into public.speed_trivia_features(id,content_hash,extractor_version,derived) values(entry->>'id',entry->>'contentHash',entry->>'extractorVersion',entry->'derived')
   on conflict(id) do update set content_hash=excluded.content_hash,extractor_version=excluded.extractor_version,derived=excluded.derived;
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function public.speed_trivia_backfill_features(jsonb,text) from public,anon,authenticated;
grant execute on function public.speed_trivia_backfill_features(jsonb,text) to service_role;

-- Acquire the shared lock BEFORE question row locks, including multi-row direct
-- writes. This avoids row/control lock inversion with signed admission RPCs.
-- Live imports are still unrestricted; their short DML transaction is serialized.
create function public.lock_trivia_admission_statement() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
 if TG_OP='TRUNCATE' then raise exception 'speed-physical-delete-forbidden'; end if;
 perform 1 from public.speed_trivia_control where singleton for update;
 return null;
end $$;
create trigger a_trivia_admission_statement before insert or update or delete or truncate on public.trivia_questions
for each statement execute function public.lock_trivia_admission_statement();
revoke all on function public.lock_trivia_admission_statement() from public,anon,authenticated,service_role;
revoke truncate on public.trivia_questions from anon,authenticated,service_role;

-- Explicit admin conversion only; Live imports never get a pool-departure permit.
create function public.leave_speed_trivia(p_payload text,p_check jsonb,p_signature text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg public.speed_trivia_control; prior public.trivia_questions; candidate public.trivia_questions;
begin
 select * into cfg from public.speed_trivia_control where singleton for update;
 if cfg.admission_secret is null or p_signature is distinct from public.speed_sign(cfg.admission_secret,public.speed_canonical(p_check)) or
   p_check->>'operation' is distinct from 'leave_speed' or p_check->>'policyVersion' is distinct from cfg.policy or
   p_check->>'payloadHash' is distinct from public.speed_hash(p_payload) or
   coalesce((p_check->>'expiresAt')::bigint,0)<extract(epoch from clock_timestamp())*1000 or
   (p_check->>'expiresAt')::bigint>extract(epoch from clock_timestamp())*1000+310000 then raise exception 'invalid-speed-check'; end if;
 if p_check->>'corpusRevision' is distinct from cfg.revision::text then raise exception 'stale-speed-revision'; end if;
 select * into prior from public.trivia_questions where id=(p_payload::jsonb->>'id')::uuid for update;
 if not found or prior.question_pool<>'anytime_blitz' or prior.status='deleted' or
   p_check->>'oldHash' is distinct from public.speed_hash(public.speed_canonical(to_jsonb(prior))) then raise exception 'speed-old-state-drift'; end if;
 candidate:=jsonb_populate_record(prior,p_payload::jsonb);
 if candidate.id<>prior.id or candidate.slug is distinct from prior.slug or candidate.question_pool<>'live_showdown' or
   candidate.answer_format not in ('write_in','numeric','true_false') or nullif(trim(candidate.question),'') is null or
   jsonb_typeof(candidate.options)<>'array' or jsonb_array_length(candidate.options)<1 or candidate.correct_answer<0 or
   candidate.correct_answer>=jsonb_array_length(candidate.options) then raise exception 'invalid-live-conversion'; end if;
 insert into public.speed_trivia_permits values(txid_current(),candidate.id,public.speed_write_hash(to_jsonb(candidate)),true);
 update public.trivia_questions set question=candidate.question,options=candidate.options,correct_answer=candidate.correct_answer,
  category=candidate.category,difficulty=candidate.difficulty,question_pool=candidate.question_pool,answer_format=candidate.answer_format,
  image_url=candidate.image_url,image_context=candidate.image_context,status=candidate.status where id=candidate.id returning * into candidate;
 delete from public.speed_trivia_permits where transaction_id=txid_current();
 return to_jsonb(candidate);
end $$;
revoke all on function public.leave_speed_trivia(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.leave_speed_trivia(text,jsonb,text) to service_role;
