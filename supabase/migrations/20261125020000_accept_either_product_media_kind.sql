-- A product type can require media without restricting the upload to video or audio.
alter table cimfest.product_types
    add column requires_media boolean not null default false;

update cimfest.product_types
set requires_media = true
where required_media_kind is not null;

alter table cimfest.product_types drop column required_media_kind;
