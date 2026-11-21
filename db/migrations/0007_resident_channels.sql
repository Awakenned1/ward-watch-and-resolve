-- Private ticket conversations, public resident blogs and attributed neighbourhood headlines.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role text NOT NULL DEFAULT 'resident' CHECK (author_role IN ('resident', 'staff')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_thread_idx ON public.ticket_messages(complaint_id, created_at);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_messages FROM anon, authenticated;
GRANT SELECT ON public.ticket_messages TO authenticated;
GRANT INSERT (complaint_id, author_id, body) ON public.ticket_messages TO authenticated;
CREATE POLICY "Owner and ward staff read ticket conversation" ON public.ticket_messages
  FOR SELECT TO authenticated USING (
    public.is_complaint_staff(complaint_id) OR EXISTS (
      SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.resident_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Owner and ward staff send ticket messages" ON public.ticket_messages
  FOR INSERT TO authenticated WITH CHECK (author_id = (SELECT auth.uid()) AND (
    public.is_complaint_staff(complaint_id) OR EXISTS (
      SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.resident_id = (SELECT auth.uid())
    )
  ));
CREATE FUNCTION public.prepare_ticket_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.complaints; recipient uuid;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = NEW.complaint_id FOR UPDATE;
  IF c.id IS NULL OR c.status IN ('draft', 'closed') THEN
    RAISE EXCEPTION 'Messages are available on submitted, open tickets';
  END IF;
  IF NEW.author_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = NEW.author_id AND email_confirmed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Sign in with a confirmed email to send a message'; END IF;
  NEW.author_role := CASE WHEN public.is_ward_staff(c.ward_id) THEN 'staff' ELSE 'resident' END;
  IF NEW.author_role = 'resident' AND c.resident_id <> NEW.author_id THEN RAISE EXCEPTION 'Not authorised'; END IF;
  NEW.created_at := now();
  NEW.body := btrim(NEW.body);
  UPDATE public.complaints SET last_updated_at = now() WHERE id = c.id;
  -- Never copy private message text to an inbox. Readers open the protected ticket to see it.
  FOR recipient IN
    SELECT c.resident_id WHERE NEW.author_id <> c.resident_id
    UNION
    SELECT r.user_id FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE NEW.author_role = 'resident' AND r.user_id <> NEW.author_id
      AND u.email_confirmed_at IS NOT NULL
      AND (r.role = 'super_admin' OR (r.ward_id = c.ward_id AND r.role IN ('ward_admin','councillor')))
  LOOP
    INSERT INTO public.notifications(user_id, complaint_id, event, channel, title, body, delivery, sent_at)
    VALUES (recipient, c.id, 'ticket_message', 'in_app', 'New reply on ' || c.tracking_number,
      'Open your ticket to read the message and respond.', 'sent', now());
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_messages_prepare BEFORE INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.prepare_ticket_message();
REVOKE ALL ON FUNCTION public.prepare_ticket_message() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Resident',
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 10000),
  is_hidden boolean NOT NULL DEFAULT false,
  moderation_reason text CHECK (char_length(moderation_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_posts_feed_idx ON public.community_posts(ward_id, created_at DESC);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_posts FROM anon, authenticated;
GRANT SELECT ON public.community_posts TO anon, authenticated;
GRANT INSERT (ward_id,author_id,title,body), UPDATE (title,body), DELETE ON public.community_posts TO authenticated;
CREATE POLICY "Read public posts or own moderated posts" ON public.community_posts FOR SELECT
  USING (NOT is_hidden OR author_id = (SELECT auth.uid()) OR public.is_ward_staff(ward_id));
CREATE POLICY "Residents publish their own posts" ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND NOT is_hidden AND EXISTS (
    SELECT 1 FROM public.wards w WHERE w.id = ward_id AND w.is_active
  ));
CREATE POLICY "Authors edit their posts" ON public.community_posts FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid())) WITH CHECK (author_id = (SELECT auth.uid()));
CREATE POLICY "Authors remove their posts" ON public.community_posts FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()));
CREATE FUNCTION public.prepare_community_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.author_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT EXISTS (
      SELECT 1 FROM auth.users WHERE id = NEW.author_id AND email_confirmed_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'Confirm your email before posting'; END IF;
    SELECT coalesce(nullif(btrim(first_name),''),'Resident') INTO NEW.author_name
      FROM public.profiles WHERE id = NEW.author_id;
    NEW.author_name := coalesce(NEW.author_name,'Resident');
    NEW.created_at := now();
  END IF;
  NEW.updated_at := now();
  NEW.title := btrim(NEW.title); NEW.body := btrim(NEW.body);
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_posts_prepare BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.prepare_community_post();
REVOKE ALL ON FUNCTION public.prepare_community_post() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.moderate_community_post(_id uuid, _hidden boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w uuid;
BEGIN
  SELECT ward_id INTO w FROM public.community_posts WHERE id = _id FOR UPDATE;
  IF w IS NULL OR NOT public.is_ward_staff(w) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _hidden AND coalesce(char_length(btrim(_reason)),0) < 3 THEN RAISE EXCEPTION 'Add a moderation reason'; END IF;
  UPDATE public.community_posts SET is_hidden = _hidden,
    moderation_reason = CASE WHEN _hidden THEN btrim(_reason) ELSE NULL END WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_community_post(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_community_post(uuid,boolean,text) TO authenticated;
CREATE TRIGGER audit_community_posts AFTER INSERT OR UPDATE OR DELETE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TABLE public.news_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  name text NOT NULL,
  feed_url text NOT NULL UNIQUE,
  article_prefix text NOT NULL,
  keywords text[] NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text
);
CREATE TABLE public.neighbourhood_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.news_feeds(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 300),
  article_url text NOT NULL UNIQUE CHECK (article_url LIKE 'https://%'),
  published_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  is_hidden boolean NOT NULL DEFAULT false
);
CREATE INDEX neighbourhood_news_feed_idx ON public.neighbourhood_news(ward_id,published_at DESC);
ALTER TABLE public.news_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbourhood_news ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_feeds,public.neighbourhood_news FROM anon,authenticated;
GRANT SELECT ON public.news_feeds,public.neighbourhood_news TO anon,authenticated;
GRANT UPDATE(enabled) ON public.news_feeds TO authenticated;
GRANT UPDATE(is_hidden) ON public.neighbourhood_news TO authenticated;
CREATE POLICY "Public news feed information" ON public.news_feeds FOR SELECT USING (true);
CREATE POLICY "Staff switch feeds" ON public.news_feeds FOR UPDATE TO authenticated
  USING (public.is_ward_staff(ward_id)) WITH CHECK (public.is_ward_staff(ward_id));
CREATE POLICY "Published imported headlines" ON public.neighbourhood_news FOR SELECT
  USING (NOT is_hidden OR public.is_ward_staff(ward_id));
CREATE POLICY "Staff moderate imported headlines" ON public.neighbourhood_news FOR UPDATE TO authenticated
  USING (public.is_ward_staff(ward_id)) WITH CHECK (public.is_ward_staff(ward_id));
INSERT INTO public.news_feeds(ward_id,name,feed_url,article_prefix,keywords)
SELECT id,'Sandton Chronicle','https://www.citizen.co.za/sandton-chronicle/feed/',
  'https://www.citizen.co.za/sandton-chronicle/',
  ARRAY['ward 109','woodmead','wendywood','gallo manor','gallo manors','khyber','edenburg','rivonia','sunninghill','buccleuch','morningside','sandton']
FROM public.wards WHERE ward_number = 109;

-- The private ingest function has no HTTP capability; only the trusted scheduler calls it.
CREATE FUNCTION app_private.ingest_neighbourhood_rss(_feed uuid, _rss text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.news_feeds; doc xml; item xml; headline text; link text; published timestamptz;
  searchable text; inserted integer := 0; n integer;
BEGIN
  SELECT * INTO f FROM public.news_feeds WHERE id = _feed AND enabled FOR UPDATE;
  IF f.id IS NULL THEN RETURN 0; END IF;
  IF octet_length(_rss) > 1048576 THEN RAISE EXCEPTION 'Feed exceeds size limit'; END IF;
  doc := xmlparse(document _rss);
  IF cardinality(xpath('/rss/channel',doc)) = 0 THEN RAISE EXCEPTION 'Expected an RSS feed'; END IF;
  FOREACH item IN ARRAY xpath('/rss/channel/item',doc) LOOP
    headline := left((xpath('string(/item/title)',item))[1]::text,300);
    link := (xpath('string(/item/link)',item))[1]::text;
    searchable := lower(headline || ' ' || (xpath('string(/item/description)',item))[1]::text);
    IF char_length(headline) < 3 OR left(link,char_length(f.article_prefix)) <> f.article_prefix
      OR link ~ '[<>\s]' OR char_length(link) > 2000 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM unnest(f.keywords) k WHERE strpos(searchable,lower(k)) > 0) THEN CONTINUE; END IF;
    BEGIN published := (xpath('string(/item/pubDate)',item))[1]::text::timestamptz;
    EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    IF published IS NULL OR published < now()-interval '30 days' OR published > now()+interval '1 day' THEN CONTINUE; END IF;
    INSERT INTO public.neighbourhood_news(feed_id,ward_id,title,article_url,published_at)
      VALUES(f.id,f.ward_id,headline,link,published) ON CONFLICT(article_url) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END LOOP;
  UPDATE public.news_feeds SET last_checked_at=now(),last_success_at=now(),last_error=NULL WHERE id=f.id;
  RETURN inserted;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ingest_neighbourhood_rss(uuid,text) FROM PUBLIC,anon,authenticated;
