import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, User, Mail, Phone, Calendar, ExternalLink, MessageSquare, Briefcase, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string;
  dealCompany?: string | null;
  dealCrmCompanyId?: string | null;
  dealContactEmail?: string | null;
}

type ContactRow = any;
type CompanyRow = any;
type ActivityRow = {
  id: string;
  activity_type: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  source: string | null;
  contact_id?: string | null;
  crm_company_id?: string | null;
  deal_id?: string | null;
};

function relTime(d?: string | null) {
  if (!d) return "—";
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return "—"; }
}

function activityIcon(type?: string | null) {
  const t = (type || "").toLowerCase();
  if (t.includes("email")) return <Mail className="h-3.5 w-3.5" />;
  if (t.includes("call")) return <Phone className="h-3.5 w-3.5" />;
  if (t.includes("meeting")) return <Calendar className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

export default function DealCrmSearch({ dealId, dealCompany, dealCrmCompanyId, dealContactEmail }: Props) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"contacts" | "companies">("contacts");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [linkedContactIds, setLinkedContactIds] = useState<Set<string>>(new Set());
  const [activitiesByContact, setActivitiesByContact] = useState<Record<string, ActivityRow[]>>({});
  const [activitiesByCompany, setActivitiesByCompany] = useState<Record<string, ActivityRow[]>>({});
  const [associations, setAssociations] = useState<Record<string, { company_id: string; is_primary: boolean }[]>>({});

  // Default search seed: deal company name / contact email domain
  useEffect(() => {
    if (!query) {
      const seed = dealCompany?.split(" ")[0] || "";
      if (seed && seed.length >= 2) setQuery(seed);
    }
  }, [dealCompany]); // eslint-disable-line

  // Fetch contacts already linked to this deal
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contact_deals")
        .select("contact_id, role")
        .eq("deal_id", dealId);
      setLinkedContactIds(new Set((data || []).map((d: any) => d.contact_id)));
    })();
  }, [dealId]);

  // Run search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setContacts([]); setCompanies([]); return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const like = `%${q}%`;
      const [contactsRes, companiesRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, full_name, first_name, last_name, email, phone_work, phone_mobile, job_title, primary_company_id, lifecycle_stage, status, last_activity_date, owner_user_id")
          .or(`full_name.ilike.${like},email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
          .limit(25),
        supabase
          .from("crm_companies")
          .select("id, name, domain, industry, lifecycle_stage, employee_range, hq_city, hq_state, recent_deal_close_date, owner_user_id")
          .or(`name.ilike.${like},domain.ilike.${like}`)
          .limit(25),
      ]);
      if (cancelled) return;
      const cs = contactsRes.data || [];
      const cos = companiesRes.data || [];
      setContacts(cs);
      setCompanies(cos);

      // Hydrate recent activities + associations
      const contactIds = cs.map((c: any) => c.id);
      const companyIds = cos.map((c: any) => c.id);
      const [actC, actCo, assoc] = await Promise.all([
        contactIds.length
          ? supabase
              .from("contact_activities")
              .select("id, contact_id, activity_type, subject, body, occurred_at, source, deal_id")
              .in("contact_id", contactIds)
              .order("occurred_at", { ascending: false })
              .limit(150)
          : Promise.resolve({ data: [] as ActivityRow[] }),
        companyIds.length
          ? supabase
              .from("crm_company_activities")
              .select("id, crm_company_id, activity_type, subject, body, occurred_at, source, deal_id")
              .in("crm_company_id", companyIds)
              .order("occurred_at", { ascending: false })
              .limit(150)
          : Promise.resolve({ data: [] as ActivityRow[] }),
        contactIds.length
          ? supabase
              .from("contact_company_associations")
              .select("contact_id, company_id, is_primary")
              .in("contact_id", contactIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;
      const byC: Record<string, ActivityRow[]> = {};
      (actC.data || []).forEach((a: any) => {
        if (!a.contact_id) return;
        (byC[a.contact_id] ||= []).push(a);
      });
      const byCo: Record<string, ActivityRow[]> = {};
      (actCo.data || []).forEach((a: any) => {
        if (!a.crm_company_id) return;
        (byCo[a.crm_company_id] ||= []).push(a);
      });
      const assocMap: Record<string, { company_id: string; is_primary: boolean }[]> = {};
      (assoc.data || []).forEach((a: any) => {
        (assocMap[a.contact_id] ||= []).push({ company_id: a.company_id, is_primary: !!a.is_primary });
      });
      setActivitiesByContact(byC);
      setActivitiesByCompany(byCo);
      setAssociations(assocMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [query]);

  const linkContact = async (contactId: string) => {
    await supabase.from("contact_deals").insert({ contact_id: contactId, deal_id: dealId });
    setLinkedContactIds((s) => new Set([...s, contactId]));
  };

  const dealDomain = useMemo(() => {
    const e = dealContactEmail?.split("@")[1]?.toLowerCase() || "";
    return e;
  }, [dealContactEmail]);

  const contactRelationship = (c: any): { label: string; tone: "primary" | "warm" | "neutral" } => {
    if (linkedContactIds.has(c.id)) return { label: "Linked to deal", tone: "primary" };
    const acts = activitiesByContact[c.id] || [];
    if (acts.some((a) => a.deal_id === dealId)) return { label: "Touched this deal", tone: "primary" };
    if (dealCrmCompanyId && (associations[c.id] || []).some((a) => a.company_id === dealCrmCompanyId)) {
      return { label: "At deal company", tone: "warm" };
    }
    if (dealDomain && c.email && String(c.email).toLowerCase().endsWith(`@${dealDomain}`)) {
      return { label: "Same email domain", tone: "warm" };
    }
    if (acts.length > 0) return { label: `${acts.length} recent touch${acts.length === 1 ? "" : "es"}`, tone: "neutral" };
    return { label: "No interactions", tone: "neutral" };
  };

  const companyRelationship = (co: any): { label: string; tone: "primary" | "warm" | "neutral" } => {
    if (dealCrmCompanyId && co.id === dealCrmCompanyId) return { label: "Deal company", tone: "primary" };
    if (dealDomain && co.domain && String(co.domain).toLowerCase() === dealDomain) return { label: "Matches contact domain", tone: "warm" };
    const acts = activitiesByCompany[co.id] || [];
    if (acts.some((a) => a.deal_id === dealId)) return { label: "Touched this deal", tone: "primary" };
    if (acts.length > 0) return { label: `${acts.length} recent touch${acts.length === 1 ? "" : "es"}`, tone: "neutral" };
    return { label: "No interactions", tone: "neutral" };
  };

  const toneClass = (t: "primary" | "warm" | "neutral") =>
    t === "primary" ? "bg-primary/15 text-primary border-primary/30"
    : t === "warm" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-muted/30 text-muted-foreground border-border/40";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                CRM Search
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Find contacts and companies, with recent interactions and how they relate to this deal.
              </p>
            </div>
            <div className="relative w-full max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, company, or domain…"
                className="pl-8 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList>
              <TabsTrigger value="contacts" className="gap-1.5">
                <User className="h-3.5 w-3.5" /> Contacts
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{contacts.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="companies" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Companies
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{companies.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contacts" className="mt-3">
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : contacts.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  {query.trim().length < 2 ? "Type at least 2 characters to search." : "No matching contacts."}
                </div>
              ) : (
                <ScrollArea className="max-h-[600px] pr-2">
                  <div className="space-y-2">
                    {contacts.map((c) => {
                      const rel = contactRelationship(c);
                      const acts = (activitiesByContact[c.id] || []).slice(0, 3);
                      return (
                        <div key={c.id} className="rounded-lg border border-border/50 bg-background/40 p-3 hover:bg-background/70 transition">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link to={`/contacts/${c.id}`} className="font-medium hover:underline truncate">
                                  {c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Unnamed"}
                                </Link>
                                <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", toneClass(rel.tone))}>
                                  {rel.label}
                                </Badge>
                                {c.lifecycle_stage && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{c.lifecycle_stage}</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                                {c.job_title && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{c.job_title}</span>}
                                {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                                {(c.phone_work || c.phone_mobile) && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone_work || c.phone_mobile}</span>}
                                {c.last_activity_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Last activity {relTime(c.last_activity_date)}</span>}
                              </div>
                              {acts.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {acts.map((a) => (
                                    <div key={a.id} className="text-xs flex items-start gap-2 text-muted-foreground">
                                      <span className="mt-0.5 text-foreground/60">{activityIcon(a.activity_type)}</span>
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-foreground/80">{a.subject || a.activity_type || "Activity"}</div>
                                        <div className="text-[10px]">{relTime(a.occurred_at)}{a.source ? ` · ${a.source}` : ""}{a.deal_id === dealId ? " · this deal" : ""}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              {!linkedContactIds.has(c.id) && (
                                <Button size="sm" variant="outline" onClick={() => linkContact(c.id)}>Link to deal</Button>
                              )}
                              <Button size="sm" variant="ghost" asChild>
                                <Link to={`/contacts/${c.id}`}>
                                  Open <ExternalLink className="h-3 w-3 ml-1" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="companies" className="mt-3">
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : companies.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  {query.trim().length < 2 ? "Type at least 2 characters to search." : "No matching companies."}
                </div>
              ) : (
                <ScrollArea className="max-h-[600px] pr-2">
                  <div className="space-y-2">
                    {companies.map((co) => {
                      const rel = companyRelationship(co);
                      const acts = (activitiesByCompany[co.id] || []).slice(0, 3);
                      return (
                        <div key={co.id} className="rounded-lg border border-border/50 bg-background/40 p-3 hover:bg-background/70 transition">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link to={`/crm/companies/${co.id}`} className="font-medium hover:underline truncate">
                                  {co.name}
                                </Link>
                                <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", toneClass(rel.tone))}>
                                  {rel.label}
                                </Badge>
                                {co.lifecycle_stage && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{co.lifecycle_stage}</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                                {co.domain && <span>{co.domain}</span>}
                                {co.industry && <span>{co.industry}</span>}
                                {co.employee_range && <span>{co.employee_range} employees</span>}
                                {(co.hq_city || co.hq_state) && <span>{[co.hq_city, co.hq_state].filter(Boolean).join(", ")}</span>}
                                {co.recent_deal_close_date && <span>Last deal close {relTime(co.recent_deal_close_date)}</span>}
                              </div>
                              {acts.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {acts.map((a) => (
                                    <div key={a.id} className="text-xs flex items-start gap-2 text-muted-foreground">
                                      <span className="mt-0.5 text-foreground/60">{activityIcon(a.activity_type)}</span>
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-foreground/80">{a.subject || a.activity_type || "Activity"}</div>
                                        <div className="text-[10px]">{relTime(a.occurred_at)}{a.source ? ` · ${a.source}` : ""}{a.deal_id === dealId ? " · this deal" : ""}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              <Button size="sm" variant="ghost" asChild>
                                <Link to={`/crm/companies/${co.id}`}>
                                  Open <ExternalLink className="h-3 w-3 ml-1" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}