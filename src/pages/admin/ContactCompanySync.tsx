import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, PlayCircle, Settings as SettingsIcon, Check, X, RotateCw, Ban, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet'
import {
  useDomainMatchSettings,
  useUpdateDomainMatchSettings,
  useSyncContacts,
  useContactSuggestions,
  useRunContactSync,
  useResolveSuggestion,
  type MatchStatus,
  type SyncContactRow,
} from '@/hooks/useContactCompanySync'

const STATUS_BADGE: Record<MatchStatus, string> = {
  matched: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  needs_review: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  unmatched: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  ignored: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

function ChipList({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim().toLowerCase()
    if (!v) return
    if (!values.includes(v)) onChange([...values, v])
    setInput('')
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="outline" className="gap-1.5">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="opacity-70 hover:opacity-100"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  )
}

function SettingsDrawer() {
  const { data: settings } = useDomainMatchSettings()
  const update = useUpdateDomainMatchSettings()
  const [local, setLocal] = useState<{
    auto_apply: boolean
    subdomain_matching: boolean
    ignored_domains: string[]
    extra_freemail_domains: string[]
  } | null>(null)
  const current = local ?? {
    auto_apply: settings?.auto_apply ?? true,
    subdomain_matching: settings?.subdomain_matching ?? false,
    ignored_domains: settings?.ignored_domains ?? [],
    extra_freemail_domains: settings?.extra_freemail_domains ?? [],
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open && settings) {
          setLocal({
            auto_apply: settings.auto_apply,
            subdomain_matching: settings.subdomain_matching,
            ignored_domains: settings.ignored_domains,
            extra_freemail_domains: settings.extra_freemail_domains,
          })
        } else if (!open) {
          setLocal(null)
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SettingsIcon className="h-4 w-4 mr-1.5" /> Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Domain match settings</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-apply matches</Label>
              <p className="text-xs text-muted-foreground">Single confident matches link automatically.</p>
            </div>
            <Switch
              checked={current.auto_apply}
              onCheckedChange={(v) => setLocal({ ...current, auto_apply: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Subdomain matching</Label>
              <p className="text-xs text-muted-foreground">
                Match <code>sales.acme.com</code> against <code>acme.com</code>.
              </p>
            </div>
            <Switch
              checked={current.subdomain_matching}
              onCheckedChange={(v) => setLocal({ ...current, subdomain_matching: v })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Ignored domains</Label>
            <ChipList
              values={current.ignored_domains}
              onChange={(v) => setLocal({ ...current, ignored_domains: v })}
              placeholder="e.g. example.com"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Additional freemail domains</Label>
            <ChipList
              values={current.extra_freemail_domains}
              onChange={(v) => setLocal({ ...current, extra_freemail_domains: v })}
              placeholder="e.g. mycontractor.co"
            />
          </div>
        </div>
        <SheetFooter>
          <Button
            onClick={() => update.mutate(current)}
            disabled={update.isPending}
          >
            {update.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ContactRow({ row }: { row: SyncContactRow }) {
  const [open, setOpen] = useState(false)
  const { data: suggestions } = useContactSuggestions(open ? row.id : null)
  const resolve = useResolveSuggestion()
  const resync = useRunContactSync()

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/contacts/${row.id}`} className="text-sm font-medium hover:underline truncate">
              {row.full_name || row.email || 'Unnamed'}
            </Link>
            <Badge variant="outline" className={STATUS_BADGE[row.match_status]}>
              {row.match_status.replace('_', ' ')}
            </Badge>
            {row.match_confidence != null && row.match_status !== 'unmatched' && row.match_status !== 'ignored' && (
              <span className="text-[11px] text-muted-foreground">
                {(row.match_confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {row.email || '—'}
            {row.email_domain_normalized && (
              <>
                {' '}· domain <code className="text-foreground/80">{row.email_domain_normalized}</code>
              </>
            )}
            {row.crm_company && (
              <>
                {' '}· linked to <span className="text-foreground/80">{row.crm_company.name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Details'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Re-sync this contact"
            onClick={() => resync.mutate({ mode: 'resync_contact', contact_id: row.id })}
            disabled={resync.isPending}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          {(suggestions || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No suggestions on file.</p>
          ) : (
            (suggestions || []).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 justify-between bg-muted/40 rounded-md px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {s.proposed_company?.name || 'Unknown company'}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {s.normalized_company_domain} ← {s.normalized_contact_domain} · {s.reason}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.proposed_company_id && (
                    <Link
                      to={`/crm/companies/${s.proposed_company_id}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      resolve.mutate({
                        contactId: row.id,
                        companyId: s.proposed_company_id,
                        decision: row.crm_company_id ? 'reassign' : 'confirm',
                      })
                    }
                    disabled={resolve.isPending || !s.proposed_company_id}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      resolve.mutate({
                        contactId: row.id,
                        companyId: s.proposed_company_id,
                        decision: 'reject',
                      })
                    }
                    disabled={resolve.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                resolve.mutate({ contactId: row.id, companyId: null, decision: 'ignore' })
              }
              disabled={resolve.isPending}
            >
              <Ban className="h-3.5 w-3.5 mr-1" /> Mark ignored
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function ContactCompanySync() {
  const [tab, setTab] = useState<MatchStatus | 'all'>('needs_review')
  const [search, setSearch] = useState('')
  const { data, isLoading, isFetching } = useSyncContacts(tab, search)
  const runSync = useRunContactSync()

  const counts = useMemo(() => {
    const c = { all: 0, matched: 0, needs_review: 0, unmatched: 0, ignored: 0 }
    for (const r of data || []) {
      c.all++
      c[r.match_status]++
    }
    return c
  }, [data])

  return (
    <div className="container mx-auto px-4 py-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contact ↔ Company sync</h1>
          <p className="text-sm text-muted-foreground">
            Match contacts to companies by email domain. Freemail and ignored domains are excluded automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SettingsDrawer />
          <Button
            onClick={() => runSync.mutate({ mode: 'bulk_org', only_unmatched: true, limit: 2000 })}
            disabled={runSync.isPending}
          >
            {runSync.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-1.5" />
            )}
            Run sync
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as MatchStatus | 'all')}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="matched">Matched</TabsTrigger>
            <TabsTrigger value="needs_review">Needs review</TabsTrigger>
            <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
            <TabsTrigger value="ignored">Ignored</TabsTrigger>
          </TabsList>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name, or domain"
            className="max-w-sm h-9"
          />
        </div>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (data || []).length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No contacts in this view.
            </Card>
          ) : (
            <div className="space-y-2">
              {(data || []).map((row) => (
                <ContactRow key={row.id} row={row} />
              ))}
              <p className="text-xs text-muted-foreground text-center pt-2">
                Showing {counts.all} of up to 200 records {isFetching ? '· refreshing…' : ''}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}