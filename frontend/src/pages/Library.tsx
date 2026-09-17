import clsx from 'clsx'
import { BadgeCheck, BookOpen, FileText, Loader2, Quote, Search, ShieldQuestion, X } from 'lucide-react'
import { useState } from 'react'

import PageHeader from '../components/PageHeader'
import { Badge, Button, EmptyState, ErrorBlock, LoadingBlock, Panel, PanelHeader, Stat, Tabs } from '../components/ui'
import { api } from '../lib/api'
import { compact, pct, score, shortDate } from '../lib/format'
import { useAsync, useDebounced } from '../lib/hooks'
import type { LibraryDocument, RagAnswer } from '../lib/types'

type Mode = 'ask' | 'browse'

export default function LibraryPage() {
  const [mode, setMode] = useState<Mode>('ask')
  const { data: stats } = useAsync(() => api.libraryStats(), [])

  return (
    <div className="pb-14">
      <PageHeader
        eyebrow="Research library"
        title="Your research library."
        lede="This is the internal shelf the market is measured against. Ask it a question and the answer is assembled only from retrieved passages, with document citations enforced and an independent groundedness score shown rather than hidden."
        actions={
          <Tabs<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ask', label: 'Ask' },
              { value: 'browse', label: 'Browse' },
            ]}
          />
        }
      />

      <div className="space-y-5 px-7 pt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Documents" value={compact(stats?.documents)} icon={<BookOpen className="size-3.5" />} />
          <Stat label="Indexed passages" value={compact(stats?.chunks)} hint={`${compact(stats?.indexed_vectors)} vectors`} />
          <Stat label="Total words" value={compact(stats?.words)} />
          <Stat label="Practice areas" value={stats?.by_practice_area?.length ?? 0} />
        </div>

        {mode === 'ask' ? <AskPanel /> : <BrowsePanel />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
function AskPanel() {
  const [draft, setDraft] = useState('')
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const question = draft.trim()
    if (question.length < 3) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      setAnswer(await api.libraryAsk(question))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const examples = [
    'What are the major risks of AI adoption in healthcare?',
    'How should a board oversee cyber incident disclosure?',
    'What drives cloud cost overruns in large enterprises?',
    'How do manufacturers reduce single-source supplier risk?',
  ]

  return (
    <div className="space-y-5">
      <Panel raised>
        <div className="flex items-center gap-3 px-4 py-3">
          <ShieldQuestion className="size-4 shrink-0 text-coverage" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder="Ask a question that existing research should answer…"
            className="flex-1 bg-transparent py-1.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <Button variant="primary" onClick={submit} disabled={loading || draft.trim().length < 3}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Answer
          </Button>
        </div>
        {!answer && !loading ? (
          <div className="flex flex-wrap gap-1.5 border-t border-edge-soft px-4 py-3">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setDraft(example)
                  setTimeout(submit, 0)
                }}
                className="rounded-full border border-edge bg-surface-2 px-3 py-1.5 text-[11.5px] text-ink-2 transition hover:border-coverage/40 hover:text-ink"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}
      </Panel>

      {loading ? (
        <Panel>
          <LoadingBlock label="Retrieving passages and composing a cited answer" rows={4} />
        </Panel>
      ) : null}
      {error ? <ErrorBlock message={error} onRetry={submit} /> : null}

      {answer ? (
        <>
          <Panel>
            <PanelHeader
              title="Answer"
              subtitle={`Grounded in ${answer.retrieved} retrieved passage(s)`}
              icon={<FileText className="size-4" />}
              actions={
                <div className="flex items-center gap-1.5">
                  {answer.verdict ? (
                    <Badge tone={answer.verdict === 'grounded' ? 'coverage' : answer.verdict === 'no_coverage' ? 'gap' : 'neutral'}>
                      {answer.verdict.replace('_', ' ')}
                    </Badge>
                  ) : null}
                  {answer.groundedness !== null && answer.groundedness !== undefined ? (
                    <Badge tone={answer.groundedness >= 0.8 ? 'coverage' : answer.groundedness >= 0.5 ? 'gap' : 'critical'}>
                      <BadgeCheck className="size-3" />
                      {pct(answer.groundedness)} supported
                    </Badge>
                  ) : null}
                </div>
              }
            />
            <div className="px-5 py-4">
              <CitedText text={answer.answer} />

              {answer.unsupported?.length ? (
                <div className="mt-4 rounded-xl border border-gap/25 bg-gap/6 px-3.5 py-3">
                  <p className="text-[11.5px] font-medium text-gap">
                    The verifier could not fully support {answer.unsupported.length} claim(s)
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {answer.unsupported.map((claim) => (
                      <li key={claim} className="text-[11.5px] leading-relaxed text-ink-2">
                        &middot; {claim}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {answer.citations.length ? (
              <div className="border-t border-edge-soft px-5 py-4">
                <p className="label-caps mb-2.5 flex items-center gap-1.5">
                  <Quote className="size-3" />
                  Citations
                </p>
                <ul className="grid gap-2 md:grid-cols-2">
                  {answer.citations.map((citation) => (
                    <li key={citation.doc_id} className="flex items-start gap-2.5">
                      <span className="num mt-0.5 shrink-0 rounded-md border border-coverage/30 bg-coverage/10 px-1.5 py-0.5 text-[10.5px] text-coverage">
                        {citation.doc_id}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] leading-snug text-ink-2">{citation.title}</p>
                        <p className="num mt-0.5 text-[10.5px] text-ink-3">
                          {citation.practice_area} &middot; {shortDate(citation.published_date)} &middot;{' '}
                          {score(citation.score)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {answer.hits?.length ? (
            <Panel>
              <PanelHeader
                title="Retrieved passages"
                subtitle="Exactly what the model was allowed to read - no more"
              />
              <ul className="divide-y divide-edge-soft">
                {answer.hits.map((hit, index) => (
                  <li key={`${hit.doc_id}-${index}`} className="px-5 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[12.5px] font-medium text-ink-2">
                        <span className="num mr-2 text-momentum">{hit.doc_id}</span>
                        {hit.title}
                      </p>
                      <span className="num shrink-0 text-[11px] text-ink-3">{score(hit.score)}</span>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">{hit.text}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/** Renders [RN-1042] markers as visible citation chips. */
function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Z]{2}-\d+\])/g)
  return (
    <p className="text-[13.5px] leading-[1.8] text-ink">
      {parts.map((part, index) =>
        /^\[[A-Z]{2}-\d+\]$/.test(part) ? (
          <span
            key={index}
            className="num mx-0.5 rounded border border-momentum/30 bg-momentum/10 px-1 py-[1px] align-baseline text-[10.5px] text-momentum"
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  )
}

/* ------------------------------------------------------------------------- */
function BrowsePanel() {
  const [query, setQuery] = useState('')
  const [semantic, setSemantic] = useState(false)
  const [area, setArea] = useState<string>('')
  const [selected, setSelected] = useState<string | null>(null)
  const debounced = useDebounced(query, 350)

  const { data, error, loading, reload } = useAsync(
    () =>
      semantic && debounced.length > 2
        ? api.librarySearch(debounced, 15).then((result) => ({
            documents: result.results as unknown as LibraryDocument[],
            total: result.results.length,
            facets: [],
            doc_types: [],
          }))
        : api.documents({ q: debounced || undefined, practice_area: area || undefined, limit: 60 }),
    [debounced, area, semantic],
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Panel>
        <PanelHeader
          title="Documents"
          subtitle={data ? `${data.total} match${data.total === 1 ? '' : 'es'}` : 'Loading'}
          actions={
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-3 select-none">
              <input
                type="checkbox"
                checked={semantic}
                onChange={(event) => setSemantic(event.target.checked)}
                className="size-3 accent-[var(--color-coverage)]"
              />
              semantic search
            </label>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-edge-soft px-4 py-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-edge bg-surface-2 px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-ink-3" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={semantic ? 'Describe what you need…' : 'Filter by title or abstract…'}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="text-ink-3 hover:text-ink">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={semantic}
            className="rounded-lg border border-edge bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2 focus:outline-none disabled:opacity-50"
          >
            <option value="">All practice areas</option>
            {data?.facets?.map((facet) => (
              <option key={facet.practice_area} value={facet.practice_area}>
                {facet.practice_area} ({facet.n})
              </option>
            ))}
          </select>
        </div>

        {loading ? <LoadingBlock label="Loading documents" rows={5} /> : null}
        {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

        {data?.documents?.length ? (
          <ul className="max-h-[640px] divide-y divide-edge-soft overflow-y-auto">
            {data.documents.map((doc) => (
              <li key={doc.doc_id}>
                <button
                  type="button"
                  onClick={() => setSelected(doc.doc_id)}
                  className={clsx(
                    'w-full px-5 py-3.5 text-left transition',
                    selected === doc.doc_id ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[12.5px] leading-snug font-medium text-ink">{doc.title}</p>
                    {'score' in doc ? (
                      <span className="num shrink-0 text-[11px] text-coverage">
                        {score((doc as unknown as { score: number }).score)}
                      </span>
                    ) : null}
                  </div>
                  <p className="num mt-1 text-[10.5px] text-ink-3">
                    {doc.doc_id} &middot; {doc.practice_area} &middot; {doc.doc_type} &middot;{' '}
                    {shortDate(doc.published_date)}
                    {doc.analyst ? ` · ${doc.analyst}` : ''}
                  </p>
                  {doc.abstract ? (
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-3">{doc.abstract}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : !loading && !error ? (
          <EmptyState title="No documents match" body="Clear the filter or try semantic search." />
        ) : null}
      </Panel>

      <div className="lg:sticky lg:top-5 lg:h-fit">
        {selected ? <DocumentView docId={selected} onClose={() => setSelected(null)} /> : (
          <Panel>
            <EmptyState
              icon={<BookOpen className="size-6" />}
              title="Select a document"
              body="The full text is shown here, along with the passages that were indexed for retrieval."
            />
          </Panel>
        )}
      </div>
    </div>
  )
}

function DocumentView({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { data, error, loading } = useAsync(() => api.document(docId), [docId])

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={data?.document.title ?? docId}
        subtitle={
          data
            ? `${data.document.doc_id} · ${data.document.practice_area} · ${data.document.doc_type} · ${shortDate(
                data.document.published_date,
              )}`
            : undefined
        }
        actions={
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink">
            <X className="size-4" />
          </button>
        }
      />
      {loading ? <LoadingBlock label="Loading document" rows={4} /> : null}
      {error ? <ErrorBlock message={error} /> : null}
      {data ? (
        <div className="max-h-[calc(100vh-160px)] overflow-y-auto px-5 py-4">
          <p className="text-[12.5px] leading-relaxed text-ink-2 italic">{data.document.abstract}</p>
          <div className="num mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-3">
            <span>{data.document.word_count} words</span>
            <span>{data.chunks.length} indexed passages</span>
            {data.document.analyst ? <span>{data.document.analyst}</span> : null}
          </div>
          <div className="mt-4 space-y-3 border-t border-edge-soft pt-4">
            {data.document.body?.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index} className="text-[12.5px] leading-relaxed text-ink-2">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
