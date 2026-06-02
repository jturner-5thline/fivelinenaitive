-- Strip the auto-seeded subtitle paragraph from the Looking Forward, New Items,
-- and Prep sections in any insights_agenda row that still matches the previous
-- seed (4 headings, each followed by the subtitle + empty paragraph, in order).
-- Rows where the user has added real content are left untouched.
DO $$
DECLARE
  r RECORD;
  new_content jsonb;
  expected_seed jsonb := jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','Presentation'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','marks',jsonb_build_array(jsonb_build_object('type','textStyle','attrs',jsonb_build_object('color','rgba(200,225,255,0.55)','fontFamily',null,'fontSize','13px')),jsonb_build_object('type','italic')),'text','(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null)),
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','Looking Forward'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','marks',jsonb_build_array(jsonb_build_object('type','textStyle','attrs',jsonb_build_object('color','rgba(200,225,255,0.55)','fontFamily',null,'fontSize','13px')),jsonb_build_object('type','italic')),'text','(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null)),
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','New Items'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','marks',jsonb_build_array(jsonb_build_object('type','textStyle','attrs',jsonb_build_object('color','rgba(200,225,255,0.55)','fontFamily',null,'fontSize','13px')),jsonb_build_object('type','italic')),'text','(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null)),
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','Prep'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','marks',jsonb_build_array(jsonb_build_object('type','textStyle','attrs',jsonb_build_object('color','rgba(200,225,255,0.55)','fontFamily',null,'fontSize','13px')),jsonb_build_object('type','italic')),'text','(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null))
    )
  );
  new_seed jsonb := jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','Presentation'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','marks',jsonb_build_array(jsonb_build_object('type','textStyle','attrs',jsonb_build_object('color','rgba(200,225,255,0.55)','fontFamily',null,'fontSize','13px')),jsonb_build_object('type','italic')),'text','(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null)),
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','Looking Forward'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null)),
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','New Items'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null)),
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2,'textAlign',null),'content',jsonb_build_array(jsonb_build_object('type','text','text','Prep'))),
      jsonb_build_object('type','paragraph','attrs',jsonb_build_object('textAlign',null))
    )
  );
BEGIN
  UPDATE public.insights_agenda
     SET content_json = new_seed,
         updated_at = now()
   WHERE content_json = expected_seed;
END $$;