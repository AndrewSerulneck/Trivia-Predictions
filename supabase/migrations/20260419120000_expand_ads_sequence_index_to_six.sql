alter table advertisements
drop constraint if exists ads_sequence_index_valid;

alter table advertisements
add constraint ads_sequence_index_valid
check (sequence_index is null or sequence_index between 1 and 6);
