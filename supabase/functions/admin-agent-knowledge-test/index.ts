// Deal Admin Agent — Knowledge Base test.
//
// One-shot self-test that (1) auto-generates ~10 questions from the docs
// already ingested into the agent's knowledge base, (2) asks each question
// through the SAME RAG retrieval path production uses (match_admin_agent_knowledge
// RPC + "ADMIN AGENT KNOWLEDGE BASE" prompt injection), and (3) grades whether
// the answer is factually consistent with the source passage AND whether the
// expected doc was retrieved in the top-3 chunks. Persists the run.
//
// Auth: requires the caller's JWT. The docs list is loaded through the user
// client so RLS scopes to the caller's companies; the run is inserted with
// created_by = auth.uid() to satisfy RLS on admin_agent_knowledge_test_runs.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1';
const EMBED_MODEL = 'openai/text-embedding-3-small';
const CHAT_MODEL = 'google/gemini-3.5-flash';

const MAX_DOCS_FOR_GENERATION = 40;
const TARGET_QUESTIONS = 10;
const PER_DOC_DIGEST_CHARS = 900;
const RETRIEVE_TOP_K = 5;
const HIT_TOP_K = 3; // "retrieval_hit" = expected doc is in the top 3

type KnowledgeDoc = {
  id: string;
  title: string;
  tags: string[] | null;
  extracted_text: string | null;
};

type GeneratedQuestion = {
  question: string;
  expected_doc_id: string;
  expected_doc_title: string;
  expected_snippet: string;
  rubric: string;
};

type RetrievedChunk = {
  chunk_id: string;
  doc_id: string;
  title: string;
  tags: string[] | null;
  content: string;
  similarity: number;
};

type GradeResult = {
  pass: boolean;
  retrieval_hit: boolean;
  answer_hit: boolean;
  reason: string;
};

type QuestionResult = GeneratedQuestion & {
  answer: string;
  retrieved: Array<Pick<RetrievedChunk, 'chunk_id' | 'doc_id' | 'title' | 'similarity'>>;
  grade: GradeResult;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callGateway(path: string, body: unknown): Promise<any> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY not configured');
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 400)}`);
  }
  return await res.json();
}

async function embedQuery(text: string): Promise<number[]> {
  const out = await callGateway('/embeddings', { model: EMBED_MODEL, input: [text] });
  const vec = out?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error('Embedding response missing vector');
  return vec;
}

function tryParseJson(text: string): any {
  if (!text) return null;
  // Strip common code fences.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to locate a JSON array or object substring.
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch { /* fall through */ }
    }
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try { return JSON.parse(cleaned.slice(objStart, objEnd + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

async function chatJson(system: string, user: string): Promise<any> {
  const out = await callGateway('/chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const text = out?.choices?.[0]?.message?.content ?? '';
  const parsed = tryParseJson(text);
  if (parsed == null) throw new Error(`Model returned non-JSON: ${String(text).slice(0, 200)}`);
  return parsed;
}

async function chatText(system: string, user: string): Promise<string> {
  const out = await callGateway('/chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.1,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return String(out?.choices?.[0]?.message?.content ?? '').trim();
}

function buildDigest(docs: KnowledgeDoc[]): string {
  const parts: string[] = [];
  for (const d of docs) {
    const tags = Array.isArray(d.tags) && d.tags.length ? ` [${d.tags.join(', ')}]` : '';
    const body = String(d.extracted_text || '').replace(/\s+/g, ' ').trim().slice(0, PER_DOC_DIGEST_CHARS);
    parts.push(`DOC_ID: ${d.id}\nTITLE: ${d.title}${tags}\nCONTENT_PREVIEW: ${body}`);
  }
  return parts.join('\n\n---\n\n');
}

function normalizeQuestion(q: any, docs: KnowledgeDoc[]): GeneratedQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const docId = typeof q.expected_doc_id === 'string' ? q.expected_doc_id : null;
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return null;
  const question = typeof q.question === 'string' ? q.question.trim() : '';
  const snippet = typeof q.expected_snippet === 'string' ? q.expected_snippet.trim() : '';
  if (!question || !snippet) return null;
  return {
    question,
    expected_doc_id: doc.id,
    expected_doc_title: doc.title,
    expected_snippet: snippet.slice(0, 500),
    rubric: typeof q.rubric === 'string' ? q.rubric.trim().slice(0, 400) : 'Answer must match the expected snippet.',
  };
}

function retrievedChunkOf(row: any): RetrievedChunk {
  return {
    chunk_id: String(row?.chunk_id ?? ''),
    doc_id: String(row?.doc_id ?? ''),
    title: String(row?.title ?? 'Untitled'),
    tags: Array.isArray(row?.tags) ? (row.tags as string[]) : null,
    content: String(row?.content ?? ''),
    similarity: typeof row?.similarity === 'number' ? row.similarity : 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Missing bearer token' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: 'Unauthorized' });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const companyId: string | undefined = body?.company_id;
    const agentKey: string = typeof body?.agent_key === 'string' ? body.agent_key : 'admin_agent';
    if (!companyId) return json(400, { error: 'company_id required' });

    // Membership check — RLS on admin_agent_knowledge_docs enforces this too,
    // but we surface a clean 403 instead of an empty docs list.
    const { data: membership } = await userClient
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) return json(403, { error: 'Not a member of this company' });

    // Load the same tag filter production uses.
    const { data: settings } = await userClient
      .from('admin_agent_settings')
      .select('knowledge_tag_filter')
      .eq('company_id', companyId)
      .maybeSingle();
    const tagFilter: string[] = Array.isArray(settings?.knowledge_tag_filter)
      ? (settings!.knowledge_tag_filter as string[])
      : [];

    // Load ready docs the agent would actually see (same tag filter semantics).
    let docsQuery = userClient
      .from('admin_agent_knowledge_docs')
      .select('id, title, tags, extracted_text')
      .eq('company_id', companyId)
      .eq('agent_key', agentKey)
      .eq('status', 'ready');
    if (tagFilter.length > 0) docsQuery = docsQuery.overlaps('tags', tagFilter);
    const { data: docsRaw, error: docsErr } = await docsQuery;
    if (docsErr) throw docsErr;
    const docs: KnowledgeDoc[] = ((docsRaw ?? []) as any[])
      .filter((d) => typeof d?.extracted_text === 'string' && d.extracted_text.trim().length > 50)
      .slice(0, MAX_DOCS_FOR_GENERATION)
      .map((d) => ({
        id: d.id,
        title: d.title || 'Untitled',
        tags: Array.isArray(d.tags) ? d.tags : [],
        extracted_text: d.extracted_text,
      }));

    if (docs.length === 0) {
      return json(400, {
        error: 'No ready knowledge documents to test against.',
      });
    }

    // ── 1. Generate questions ──────────────────────────────────────
    const digest = buildDigest(docs);
    const perDocTarget = docs.length <= TARGET_QUESTIONS ? 1 : 0; // ensures coverage when small
    const genSystem = [
      'You design a factual knowledge test for a business AI agent using its OWN uploaded reference documents.',
      'For each question, choose ONE source document and cite a short verbatim snippet from that document that contains the answer.',
      'Questions must be SPECIFIC enough that the correct answer would clearly come from that one document (not generic knowledge).',
      'Prefer definitions, rules, thresholds, workflow steps, and concrete requirements.',
      'Return STRICT JSON: {"questions":[{"question":"...","expected_doc_id":"<uuid from the input>","expected_snippet":"<verbatim ~1-3 sentence quote from that doc>","rubric":"what a correct answer must contain"}]}',
      'expected_doc_id MUST be one of the DOC_IDs in the input. Do not invent ids.',
      `Generate ${TARGET_QUESTIONS} questions total${perDocTarget > 0 ? `, with at least 1 question per document when possible` : ''}. Do not repeat questions.`,
    ].join('\n');

    const genUser = `KNOWLEDGE BASE DIGEST (${docs.length} documents):\n\n${digest}`;
    const genOut = await chatJson(genSystem, genUser);
    const rawQs: any[] = Array.isArray(genOut?.questions) ? genOut.questions : [];
    const questions: GeneratedQuestion[] = rawQs
      .map((q) => normalizeQuestion(q, docs))
      .filter((q): q is GeneratedQuestion => q !== null)
      .slice(0, TARGET_QUESTIONS);

    if (questions.length === 0) {
      return json(500, { error: 'Question generation produced no usable items.' });
    }

    // ── 2. Answer each question via the production RAG path ───────
    const results: QuestionResult[] = [];
    for (const q of questions) {
      // Retrieval — same RPC + same tag filter production uses.
      let retrieved: RetrievedChunk[] = [];
      let answer = '';
      let grade: GradeResult = {
        pass: false,
        retrieval_hit: false,
        answer_hit: false,
        reason: 'Not evaluated',
      };
      try {
        const qVec = await embedQuery(q.question);
        const { data: matched, error: matchErr } = await userClient.rpc('match_admin_agent_knowledge', {
          p_company_id: companyId,
          p_agent_key: agentKey,
          p_query: qVec as unknown as string,
          p_match_count: RETRIEVE_TOP_K,
          p_tag_filter: tagFilter.length > 0 ? tagFilter : null,
        });
        if (matchErr) throw matchErr;
        retrieved = ((matched ?? []) as any[]).map(retrievedChunkOf);

        // Build the same "ADMIN AGENT KNOWLEDGE BASE" injection block prod uses.
        const kbBlocks = retrieved.map((r, i) => {
          const tagStr = r.tags && r.tags.length ? ` [${r.tags.join(', ')}]` : '';
          return `### ${i + 1}. ${r.title}${tagStr} (sim=${r.similarity.toFixed(2)})\n${r.content}`;
        });
        const kbBlock = kbBlocks.length
          ? `ADMIN AGENT KNOWLEDGE BASE (top ${kbBlocks.length} passages retrieved for this question — treat as authoritative reference):\n\n${kbBlocks.join('\n\n---\n\n')}`
          : 'ADMIN AGENT KNOWLEDGE BASE: (no passages retrieved)';

        const answerSystem = [
          'You are the Deal Admin Agent answering a knowledge-base question.',
          'Answer ONLY from the passages provided in the ADMIN AGENT KNOWLEDGE BASE below.',
          'If the passages do not contain the answer, say "Not in the knowledge base." Do not guess.',
          'Be specific and quote/paraphrase the relevant passage.',
        ].join('\n');
        answer = await chatText(answerSystem, `${kbBlock}\n\nQUESTION: ${q.question}`);

        // ── 3. Grade this question. ────────────────────────────────
        const topDocIds = retrieved.slice(0, HIT_TOP_K).map((r) => r.doc_id);
        const retrievalHit = topDocIds.includes(q.expected_doc_id);

        const gradeSystem = [
          'You grade whether an AI agent\'s answer to a knowledge-base question is factually consistent with the expected source snippet.',
          'Return STRICT JSON: {"answer_correct": true|false, "reason": "one short sentence"}.',
          'answer_correct=true only when the answer conveys the same facts/rule as the expected snippet (paraphrase is fine). Otherwise false.',
          'If the answer says the information is not in the knowledge base, answer_correct=false.',
        ].join('\n');
        const gradeUser = [
          `QUESTION: ${q.question}`,
          `EXPECTED SNIPPET (from doc "${q.expected_doc_title}"): ${q.expected_snippet}`,
          `RUBRIC: ${q.rubric}`,
          `AGENT ANSWER: ${answer}`,
        ].join('\n\n');
        let answerCorrect = false;
        let gradeReason = '';
        try {
          const graded = await chatJson(gradeSystem, gradeUser);
          answerCorrect = graded?.answer_correct === true;
          gradeReason = typeof graded?.reason === 'string' ? graded.reason.slice(0, 300) : '';
        } catch (gerr) {
          gradeReason = `Grader error: ${(gerr as Error).message.slice(0, 200)}`;
        }

        grade = {
          pass: retrievalHit && answerCorrect,
          retrieval_hit: retrievalHit,
          answer_hit: answerCorrect,
          reason:
            gradeReason ||
            (retrievalHit
              ? answerCorrect
                ? 'Retrieval hit and answer matches the source.'
                : 'Retrieval hit but answer diverges from the source.'
              : `Expected doc "${q.expected_doc_title}" not in top ${HIT_TOP_K} retrieved chunks.`),
        };
      } catch (perQErr) {
        grade = {
          pass: false,
          retrieval_hit: false,
          answer_hit: false,
          reason: `Error: ${(perQErr as Error).message.slice(0, 200)}`,
        };
      }

      results.push({
        ...q,
        answer,
        retrieved: retrieved.map((r) => ({
          chunk_id: r.chunk_id,
          doc_id: r.doc_id,
          title: r.title,
          similarity: r.similarity,
        })),
        grade,
      });
    }

    const score = results.filter((r) => r.grade.pass).length;
    const total = results.length;

    // Persist the run (RLS: created_by must equal auth.uid()).
    const { data: inserted, error: insErr } = await userClient
      .from('admin_agent_knowledge_test_runs')
      .insert({
        company_id: companyId,
        agent_key: agentKey,
        score,
        total,
        tag_filter: tagFilter,
        questions: questions as any,
        results: results as any,
        created_by: userId,
      })
      .select('id, created_at')
      .single();
    if (insErr) throw insErr;

    return json(200, {
      ok: true,
      run: {
        id: inserted.id,
        created_at: inserted.created_at,
        company_id: companyId,
        agent_key: agentKey,
        score,
        total,
        tag_filter: tagFilter,
        results,
      },
    });
  } catch (e) {
    console.error('[admin-agent-knowledge-test]', e);
    return json(500, { error: (e as Error).message ?? 'Unknown error' });
  }
});