-- Candidate-only authorization alignment.
-- Keep the caller bound to the uploader member row and preserve the completed-meeting requirement.
-- This makes the RPC use the same role normalization as the meeting_documents RLS policies.
CREATE OR REPLACE FUNCTION public.replace_meeting_document(
  p_group_id uuid,
  p_meeting_id uuid,
  p_file_path text,
  p_file_name text,
  p_file_type text,
  p_file_size bigint,
  p_uploaded_by uuid
)
RETURNS public.meeting_documents
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.meeting_documents;
  v_version integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.id = p_meeting_id
      AND m.group_id = p_group_id
      AND lower(coalesce(m.status, '')) = 'completed'
  ) THEN
    RAISE EXCEPTION 'COMPLETED_MEETING_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = p_uploaded_by
      AND m.group_id = p_group_id
      AND m.status = 'active'
      AND m.onboarding_status = 'active'
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.role, '')) IN ('admin', 'chairperson', 'secretary', 'treasurer')
  ) THEN
    RAISE EXCEPTION 'MEETING_DOCUMENT_UPLOAD_NOT_AUTHORIZED';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin', 'chairperson', 'secretary', 'treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'MEETING_DOCUMENT_UPLOAD_NOT_AUTHORIZED';
  END IF;

  SELECT coalesce(max(d.version), 0) + 1
    INTO v_version
  FROM public.meeting_documents d
  WHERE d.meeting_id = p_meeting_id;

  UPDATE public.meeting_documents
     SET replaced_at = now()
   WHERE meeting_id = p_meeting_id
     AND replaced_at IS NULL;

  INSERT INTO public.meeting_documents (
    group_id, meeting_id, file_path, file_name, file_type,
    file_size, uploaded_by, version
  )
  VALUES (
    p_group_id, p_meeting_id, p_file_path, p_file_name, lower(p_file_type),
    p_file_size, p_uploaded_by, v_version
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
