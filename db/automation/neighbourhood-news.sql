-- Provisioned by db/setup-news-automation.mjs; no credentials in cron commands.
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE OR REPLACE FUNCTION app_private.sync_neighbourhood_news()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f record; response record; n integer := 0;
BEGIN
  -- Prevent overlapping manual and scheduled syncs.
  IF NOT pg_try_advisory_xact_lock(109,7007) THEN RETURN 0; END IF;
  PERFORM set_config('http.curlopt_timeout_msec','12000',true);
  PERFORM set_config('http.curlopt_connecttimeout_msec','5000',true);
  PERFORM set_config('http.curlopt_followlocation','0',true);
  FOR f IN SELECT id,feed_url FROM public.news_feeds WHERE enabled LOOP
    BEGIN
      -- Allowlisted publisher only. Staff can pause a source, never point the worker at another host.
      IF f.feed_url <> 'https://www.citizen.co.za/sandton-chronicle/feed/' THEN
        RAISE EXCEPTION 'Feed URL is not approved';
      END IF;
      SELECT * INTO response FROM extensions.http_get(f.feed_url);
      IF response.status <> 200 THEN RAISE EXCEPTION 'Publisher returned HTTP %',response.status; END IF;
      n := n + app_private.ingest_neighbourhood_rss(f.id,response.content);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.news_feeds SET last_checked_at=now(),last_error='Feed temporarily unavailable; retrying next hour.' WHERE id=f.id;
      RAISE LOG 'Neighbourhood news source % failed: %', f.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION app_private.sync_neighbourhood_news() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('ward109-neighbourhood-news','17 * * * *','SELECT app_private.sync_neighbourhood_news()');
