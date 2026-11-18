CREATE FUNCTION public.sync_ward109_staff_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND lower(COALESCE(OLD.email, '')) = 'hotline@jra.org.za'
    AND (
      lower(COALESCE(NEW.email, '')) <> 'hotline@jra.org.za'
      OR NEW.email_confirmed_at IS NULL
    )
  THEN
    DELETE FROM public.ward109_staff_roles
    WHERE user_id = OLD.id AND role = 'ward_staff'::public.ward109_staff_role;
  END IF;

  IF lower(COALESCE(NEW.email, '')) = 'hotline@jra.org.za'
    AND NEW.email_confirmed_at IS NOT NULL
  THEN
    INSERT INTO public.ward109_staff_roles (user_id, role)
    VALUES (NEW.id, 'ward_staff'::public.ward109_staff_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_ward109_staff_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ward109_staff_access_on_user_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_ward109_staff_access();
CREATE TRIGGER ward109_staff_access_on_user_change
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_ward109_staff_access();