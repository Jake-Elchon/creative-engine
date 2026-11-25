create table cimfest.storefront_images (
    storefront_id uuid primary key references cimfest.storefronts (id) on delete cascade,
    version uuid not null,
    content_type text not null check (content_type in ('image/png', 'image/jpeg')),
    file_data bytea not null check (octet_length(file_data) between 1 and 2097152)
);
revoke all on cimfest.storefront_images from public, anon, authenticated, service_role;

alter table cimfest.product_media drop constraint product_media_valid_file;
alter table cimfest.product_media add constraint product_media_valid_file check (
    (kind = 'video' and content_type in ('video/mp4', 'video/webm', 'video/quicktime')
        and octet_length(file_data) between 1 and 33554432)
    or (kind = 'video_preview' and content_type in ('video/mp4', 'video/webm', 'video/quicktime')
        and octet_length(file_data) between 1 and 16777216)
    or (kind = 'audio' and content_type in ('audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp4')
        and octet_length(file_data) between 1 and 8388608)
);
