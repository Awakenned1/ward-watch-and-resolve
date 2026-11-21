-- Ward 109 Resolved: foundation (reference data, profiles, roles, settings, audit).
-- Multi-ward ready: staff roles and reference data are scoped by ward_id.

-- Types -----------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('resident', 'ward_admin', 'councillor', 'municipal_liaison', 'super_admin');
CREATE TYPE public.suburb_coverage AS ENUM ('full', 'partial');
CREATE TYPE public.contact_method AS ENUM ('email', 'sms', 'whatsapp');
CREATE TYPE public.entity_contact_type AS ENUM ('url', 'email', 'phone', 'app');
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified');

-- Helper: keep updated_at current.
CREATE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Wards, suburbs, boundaries ----------------------------------------------------
CREATE TABLE public.wards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_number integer NOT NULL UNIQUE CHECK (ward_number > 0),
  name text NOT NULL,
  municipality text NOT NULL DEFAULT 'City of Johannesburg',
  tracking_prefix text NOT NULL UNIQUE CHECK (tracking_prefix ~ '^[A-Z0-9]{2,8}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.suburbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  coverage public.suburb_coverage NOT NULL DEFAULT 'full',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (ward_id, name)
);

-- Official boundary as GeoJSON (Polygon or MultiPolygon, [lng, lat] order). One active per ward.
CREATE TABLE public.ward_boundaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  geojson jsonb NOT NULL CHECK (geojson->>'type' IN ('Polygon', 'MultiPolygon')),
  source text NOT NULL CHECK (char_length(btrim(source)) BETWEEN 3 AND 300),
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ward_boundaries_one_active ON public.ward_boundaries (ward_id) WHERE is_active;

-- Municipal directory -----------------------------------------------------------
CREATE TABLE public.municipal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  short_name text,
  services text,
  contact_type public.entity_contact_type NOT NULL,
  contact_value text NOT NULL CHECK (char_length(btrim(contact_value)) BETWEEN 3 AND 300),
  secondary_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(secondary_links) = 'array'),
  verification_status public.verification_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_reporting_channel boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER municipal_entities_touch BEFORE UPDATE ON public.municipal_entities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text,
  municipal_entity_id uuid REFERENCES public.municipal_entities(id) ON DELETE SET NULL,
  map_color text NOT NULL DEFAULT '#64748B' CHECK (map_color ~ '^#[0-9A-Fa-f]{6}$'),
  emergency_warning boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.issue_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  suggests_urgent boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (category_id, name)
);
CREATE INDEX issue_types_category_idx ON public.issue_types (category_id);

-- Profiles -----------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text CHECK (first_name IS NULL OR char_length(btrim(first_name)) BETWEEN 1 AND 60),
  last_name text CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 60),
  full_name text CHECK (full_name IS NULL OR char_length(btrim(full_name)) BETWEEN 1 AND 121),
  street_address text CHECK (street_address IS NULL OR char_length(btrim(street_address)) BETWEEN 3 AND 200),
  lives_in_ward boolean,
  mobile text CHECK (mobile IS NULL OR mobile ~ '^\+?[0-9 ()-]{7,20}$'),
  email text,
  preferred_contact public.contact_method NOT NULL DEFAULT 'email',
  default_suburb_id uuid REFERENCES public.suburbs(id) ON DELETE SET NULL,
  privacy_consent_at timestamptz,
  privacy_consent_version text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Copies the registration details (first name, surname, suburb, street address) from sign-up
-- metadata into the profile. Metadata is user-supplied: values are trimmed and length-checked,
-- the suburb must be an active Ward 109 suburb, and nothing here affects roles or access.
CREATE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  first text := nullif(left(btrim(meta->>'first_name'), 60), '');
  last text := nullif(left(btrim(meta->>'last_name'), 60), '');
  street text := nullif(left(btrim(meta->>'street_address'), 200), '');
  suburb uuid;
BEGIN
  SELECT s.id INTO suburb
  FROM public.suburbs s JOIN public.wards w ON w.id = s.ward_id
  WHERE w.ward_number = 109 AND s.is_active AND s.name = btrim(meta->>'suburb');

  INSERT INTO public.profiles (id, email, first_name, last_name, full_name, street_address,
                               default_suburb_id, lives_in_ward)
  VALUES (
    NEW.id, NEW.email, first, last,
    nullif(btrim(concat_ws(' ', first, last)), ''),
    CASE WHEN char_length(street) >= 3 THEN street END,
    suburb,
    CASE WHEN suburb IS NOT NULL THEN true
         WHEN meta->>'lives_in_ward' IN ('true', 'false') THEN (meta->>'lives_in_ward')::boolean END
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.sync_profile_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Roles ----------------------------------------------------------------------------
CREATE TABLE public.roles (
  role public.app_role PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL
);

-- Every signed-in user is implicitly a resident; rows here grant elevated roles.
-- ward_id NULL = all wards (super admin). municipal_entity_id is required for liaisons.
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL REFERENCES public.roles(role),
  ward_id uuid REFERENCES public.wards(id) ON DELETE CASCADE,
  municipal_entity_id uuid REFERENCES public.municipal_entities(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'resident'),
  CHECK ((role = 'municipal_liaison') = (municipal_entity_id IS NOT NULL)),
  CHECK (role = 'super_admin' OR ward_id IS NOT NULL)
);
CREATE UNIQUE INDEX user_roles_unique ON public.user_roles
  (user_id, role, coalesce(ward_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(municipal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX user_roles_user_idx ON public.user_roles (user_id);

-- Role checks. SECURITY DEFINER so RLS policies can call them without recursion.
CREATE FUNCTION public.has_role(_role public.app_role, _ward uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role = _role
      AND (_ward IS NULL OR r.ward_id IS NULL OR r.ward_id = _ward)
  );
$$;

CREATE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_role('super_admin');
$$;

-- Ward staff = ward administrators, councillor, super admin.
CREATE FUNCTION public.is_ward_staff(_ward uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid())
      AND (
        r.role = 'super_admin'
        OR (r.role IN ('ward_admin', 'councillor')
            AND (_ward IS NULL OR r.ward_id = _ward))
      )
  );
$$;

CREATE FUNCTION public.liaison_entity_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.municipal_entity_id FROM public.user_roles r
  WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'municipal_liaison';
$$;

-- Roles for the current user, for the UI (the database still enforces every action).
CREATE FUNCTION public.my_roles()
RETURNS TABLE (role public.app_role, ward_id uuid, municipal_entity_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.role, r.ward_id, r.municipal_entity_id FROM public.user_roles r
  WHERE r.user_id = (SELECT auth.uid());
$$;

-- Settings ---------------------------------------------------------------------------
CREATE TABLE public.system_settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.]+$'),
  value jsonb NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER system_settings_touch BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE FUNCTION public.setting_int(_key text, _default integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = _key), _default);
$$;

-- Audit log ----------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_record_idx ON public.audit_logs (table_name, record_id);

CREATE FUNCTION public.write_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rec jsonb := to_jsonb(coalesce(NEW, OLD));
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    (SELECT auth.uid()),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(rec->>'id', rec->>'key', rec->>'user_id'),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_municipal_entities AFTER INSERT OR UPDATE OR DELETE ON public.municipal_entities
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_service_categories AFTER INSERT OR UPDATE OR DELETE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_ward_boundaries AFTER INSERT OR UPDATE OR DELETE ON public.ward_boundaries
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_system_settings AFTER INSERT OR UPDATE OR DELETE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Notification preferences (created here so the new-user trigger can fill it) -----------
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true,
  sms boolean NOT NULL DEFAULT false,
  whatsapp boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notification_preferences_touch BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- Row-level security ----------------------------------------------------------------------
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suburbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Start from nothing; grant only what the app uses.
REVOKE ALL ON public.wards, public.suburbs, public.ward_boundaries, public.municipal_entities,
  public.service_categories, public.issue_types, public.profiles, public.roles, public.user_roles,
  public.system_settings, public.audit_logs, public.notification_preferences FROM anon, authenticated;

-- Public reference data (directory, suburbs, categories) is readable by everyone.
GRANT SELECT ON public.wards, public.suburbs, public.municipal_entities, public.service_categories,
  public.issue_types, public.roles TO anon, authenticated;
CREATE POLICY "Active wards are public" ON public.wards FOR SELECT USING (is_active OR public.is_super_admin());
CREATE POLICY "Suburbs are public" ON public.suburbs FOR SELECT USING (is_active OR public.is_ward_staff(ward_id));
CREATE POLICY "Directory is public" ON public.municipal_entities FOR SELECT USING (is_active OR public.is_ward_staff());
CREATE POLICY "Categories are public" ON public.service_categories FOR SELECT USING (is_active OR public.is_ward_staff());
CREATE POLICY "Issue types are public" ON public.issue_types FOR SELECT USING (is_active OR public.is_ward_staff());
CREATE POLICY "Role list is public" ON public.roles FOR SELECT USING (true);

-- Reference data is configured by ward staff (directory/categories) and super admins (wards).
GRANT INSERT, UPDATE, DELETE ON public.suburbs, public.municipal_entities, public.service_categories,
  public.issue_types, public.wards TO authenticated;
CREATE POLICY "Super admins manage wards" ON public.wards FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins manage suburbs" ON public.suburbs FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Staff manage directory" ON public.municipal_entities FOR ALL TO authenticated
  USING (public.is_ward_staff()) WITH CHECK (public.is_ward_staff());
CREATE POLICY "Staff manage categories" ON public.service_categories FOR ALL TO authenticated
  USING (public.is_ward_staff()) WITH CHECK (public.is_ward_staff());
CREATE POLICY "Staff manage issue types" ON public.issue_types FOR ALL TO authenticated
  USING (public.is_ward_staff()) WITH CHECK (public.is_ward_staff());

-- Boundaries hold no personal data but are only needed by staff and the verification function.
GRANT SELECT, INSERT, UPDATE ON public.ward_boundaries TO authenticated;
CREATE POLICY "Staff read boundaries" ON public.ward_boundaries FOR SELECT TO authenticated
  USING (public.is_ward_staff(ward_id));
CREATE POLICY "Super admins manage boundaries" ON public.ward_boundaries FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Profiles: own profile, or ward staff (to contact residents).
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
CREATE POLICY "Read own profile or as staff" ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_ward_staff());
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

-- App users may not flip demo flags or edit their account email through the profile.
-- (Direct API requests run as anon/authenticated; triggers and the SQL editor do not.)
CREATE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'is_demo can only be changed by a super administrator';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Change your email through account settings';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- Roles are granted only by super admins.
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
CREATE POLICY "Read own roles or as super admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_super_admin() OR public.is_ward_staff(ward_id));
CREATE POLICY "Super admins grant roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND granted_by = (SELECT auth.uid()));
CREATE POLICY "Super admins revoke roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Settings: public keys readable by all; staff read everything; super admins change.
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.system_settings TO authenticated;
CREATE POLICY "Public settings" ON public.system_settings FOR SELECT
  USING (is_public OR public.is_ward_staff());
CREATE POLICY "Super admins change settings" ON public.system_settings FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Audit log: written only by triggers; readable by super admins.
GRANT SELECT ON public.audit_logs TO authenticated;
CREATE POLICY "Super admins read audit log" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());

GRANT SELECT, UPDATE ON public.notification_preferences TO authenticated;
CREATE POLICY "Own notification preferences" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION public.handle_new_user(), public.sync_profile_email(), public.write_audit_log()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(public.app_role, uuid), public.is_super_admin(),
  public.is_ward_staff(uuid), public.liaison_entity_ids(), public.my_roles(),
  public.setting_int(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role, uuid), public.is_super_admin(),
  public.is_ward_staff(uuid), public.liaison_entity_ids(), public.my_roles(),
  public.setting_int(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.is_ward_staff(uuid) TO anon;
