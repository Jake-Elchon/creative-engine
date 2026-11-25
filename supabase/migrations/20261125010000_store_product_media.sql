-- Keep the old references for existing records. A key is only a pointer, so
-- neither the video nor the audio bytes can be recovered from SQL alone.
alter table cimfest.products
    rename column master_file_key to legacy_master_file_key;
alter table cimfest.products
    rename column preview_file_key to legacy_preview_file_key;
alter table cimfest.catalog_assets rename to legacy_catalog_assets;

-- New writes require the media appropriate for the product type. Historical
-- custom types that required a master continue to require a primary (video) file.
alter table cimfest.product_types
    add column required_media_kind text check (required_media_kind in ('video', 'audio'));

update cimfest.product_types
set required_media_kind = case
    when type = 'release' then 'audio'
    when type = 'ebook' then null
    when requires_master_file then 'video'
end;

alter table cimfest.product_types drop column requires_master_file;

-- Keep binary data off the main products row so catalog and checkout queries
-- can read metadata without fetching or transmitting large values.
create table cimfest.product_media (
    product_id uuid not null references cimfest.products (id) on delete cascade,
    kind text not null,
    content_type text not null,
    file_data bytea not null,
    primary key (product_id, kind),
    constraint product_media_valid_file check (
        (kind = 'video'
            and content_type in ('video/mp4', 'video/webm', 'video/quicktime')
            and octet_length(file_data) between 1 and 33554432)
        or
        (kind = 'audio'
            and content_type in ('audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp4')
            and octet_length(file_data) between 1 and 8388608)
    )
);

-- Only the backend serves bytes, after checking the product and media role.
revoke all on cimfest.product_media from public, anon, authenticated, service_role;
