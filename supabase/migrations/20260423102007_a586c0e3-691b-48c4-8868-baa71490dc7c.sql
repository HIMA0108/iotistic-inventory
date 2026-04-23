drop policy if exists "public read component images" on storage.objects;

create policy "auth list component images"
on storage.objects for select to authenticated
using (bucket_id = 'component-images');