-- Ward 109 Resolved: the Ward Councillor manages their own ward administrators.
-- Access still flows only through verified-email provisioning (role_email_grants): the role is
-- granted when an account with that email exists and its email address is confirmed.

CREATE POLICY "Councillors manage ward administrator grants" ON public.role_email_grants
  FOR ALL TO authenticated
  USING (role = 'ward_admin' AND ward_id IS NOT NULL AND public.has_role('councillor', ward_id))
  WITH CHECK (
    role = 'ward_admin' AND ward_id IS NOT NULL AND public.has_role('councillor', ward_id)
    AND created_by = (SELECT auth.uid())
  );

-- Accounts created before this database was installed (the sign-up trigger did not exist yet)
-- get their profile and notification preferences now, using the same rules as handle_new_user.
-- Email-provisioned roles were already applied when the grants were inserted.
INSERT INTO public.profiles (id, email, first_name, last_name, full_name, street_address,
                             default_suburb_id, lives_in_ward)
SELECT u.id, u.email, m.first, m.last,
       nullif(btrim(concat_ws(' ', m.first, m.last)), ''),
       CASE WHEN char_length(m.street) >= 3 THEN m.street END,
       s.id,
       CASE WHEN s.id IS NOT NULL THEN true
            WHEN m.in_ward IN ('true', 'false') THEN m.in_ward::boolean END
FROM auth.users u
CROSS JOIN LATERAL (
  SELECT nullif(left(btrim(u.raw_user_meta_data->>'first_name'), 60), '') AS first,
         nullif(left(btrim(u.raw_user_meta_data->>'last_name'), 60), '') AS last,
         nullif(left(btrim(u.raw_user_meta_data->>'street_address'), 200), '') AS street,
         u.raw_user_meta_data->>'lives_in_ward' AS in_ward
) m
LEFT JOIN public.suburbs s
  ON s.is_active AND s.name = btrim(u.raw_user_meta_data->>'suburb')
  AND s.ward_id = (SELECT w.id FROM public.wards w WHERE w.ward_number = 109)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.notification_preferences (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;
