-- 어휘 개척단(어휘 땅따먹기.html)용 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하면 됩니다. 여러 번 실행해도 안전해요.

create table if not exists public.pioneer_rooms (
  code       text primary key,
  seed       bigint not null,
  missions   jsonb  not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pioneer_players (
  room_code  text not null references public.pioneer_rooms(code) on delete cascade,
  name_key   text not null,
  name       text not null,
  subject    text,
  owned      jsonb not null default '{}'::jsonb,
  progress   jsonb not null default '{}'::jsonb,
  correct    int   not null default 0,
  wrong      int   not null default 0,
  achieved   jsonb not null default '{}'::jsonb,
  given      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_code, name_key)
);

grant select, insert on public.pioneer_rooms to anon;
grant select, insert, update on public.pioneer_players to anon;

alter table public.pioneer_rooms   enable row level security;
alter table public.pioneer_players enable row level security;

-- 로그인 없이 학급 코드만으로 쓰는 교실용 게임이라 anon 에게 읽기/쓰기를 열어둡니다.
-- 삭제 권한은 주지 않습니다.
drop policy if exists "pioneer rooms read"   on public.pioneer_rooms;
drop policy if exists "pioneer rooms insert" on public.pioneer_rooms;
create policy "pioneer rooms read"   on public.pioneer_rooms for select to anon using (true);
create policy "pioneer rooms insert" on public.pioneer_rooms for insert to anon with check (true);

drop policy if exists "pioneer players read"   on public.pioneer_players;
drop policy if exists "pioneer players insert" on public.pioneer_players;
drop policy if exists "pioneer players update" on public.pioneer_players;
create policy "pioneer players read"   on public.pioneer_players for select to anon using (true);
create policy "pioneer players insert" on public.pioneer_players for insert to anon with check (true);
create policy "pioneer players update" on public.pioneer_players for update to anon using (true) with check (true);
