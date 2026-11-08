
CREATE OR REPLACE FUNCTION public.auto_qualificar_protocolado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Se o usuário está marcando como desqualificado, respeita.
  IF NEW.status_qualificacao = 'desqualificado' THEN
    RETURN NEW;
  END IF;

  IF NEW.protocolado = true AND NEW.data_protocolo IS NOT NULL THEN
    NEW.status_qualificacao := 'qualificado';
    IF NEW.qualificado_em IS NULL THEN
      NEW.qualificado_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
