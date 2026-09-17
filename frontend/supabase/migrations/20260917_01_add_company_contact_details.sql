begin;

alter table public.companies
  add column if not exists email text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text
    default 'France';

comment on column public.companies.email
is 'Adresse e-mail professionnelle affichée sur les documents CarnetPass.';

comment on column public.companies.address_line1
is 'Première ligne de l’adresse professionnelle.';

comment on column public.companies.address_line2
is 'Complément facultatif de l’adresse professionnelle.';

comment on column public.companies.postal_code
is 'Code postal de l’entreprise.';

comment on column public.companies.city
is 'Ville de l’entreprise.';

comment on column public.companies.country
is 'Pays de l’entreprise, France par défaut.';

commit;