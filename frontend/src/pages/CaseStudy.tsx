import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Network, Radar, Target } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { Panel, PanelHeader } from '../components/ui'

const stages = [
  { title: 'Find the conversation', icon: Radar, question: 'What is receiving attention?',
    input: 'A research area, such as AI in healthcare.',
    work: 'Search recent news, retain source links, extract topics and entities, and merge aliases. Count each article once per topic and count distinct source domains.',
    output: 'Canonical topics with articles, source breadth and recency. The attention score is a proxy; this search sample cannot establish market growth.', link: '/signals', label: 'Inspect external evidence' },
  { title: 'Check our research', icon: BookOpen, question: 'Can our library answer this topic?',
    input: 'Each canonical topic and its description.',
    work: 'Retrieve passages, collapse them to unique research documents, and assess direct versus partial coverage. Weight relevance by freshness. Archive clippings do not count as internal research.',
    output: 'A coverage estimate, document IDs and relevance reasons. If the model judge is unavailable, clearly labelled similarity proxies receive conservative weight.', link: '/library', label: 'Explore the simulated library' },
  { title: 'Explain the relationships', icon: Network, question: 'Which entities and documents connect?',
    input: 'Extracted entities, topics and matched internal documents.',
    work: 'Build topic–entity and topic–document relationships, with semantic adjacency between topics. The graph helps an analyst explore related research.',
    output: 'An explorable evidence map. This prototype uses vector retrieval for QA; it does not claim graph-based answer retrieval.', link: '/graph', label: 'Explore the knowledge graph' },
  { title: 'Prioritise the next action', icon: Target, question: 'Where should an analyst investigate next?',
    input: 'News attention and usable internal coverage on a 0–1 scale.',
    work: 'Calculate gap = attention × (1 − coverage). Apply explicit decision rules for commissioning, refresh, maintenance, monitoring or portfolio review.',
    output: 'A ranked shortlist with evidence. The model writes a summary; deterministic rules set the action. An analyst makes the commissioning decision.', link: '/demand', label: 'Review ranked opportunities' },
]

export default function CaseStudy() {
  const [selected, setSelected] = useState(0)
  const [documents, setDocuments] = useState(1)
  const [age, setAge] = useState(30)
  const stage = stages[selected]
  const freshness = age <= 120 ? 1 : age >= 450 ? 0 : 1 - (age - 120) / 330
  const usable = 0.25 + 0.75 * freshness
  const coverage = documents ? 0.6 * Math.min(1, documents * usable / 5) + 0.4 * usable : 0
  const attention = 0.8
  const gap = attention * (1 - coverage)
  const action = documents > 0 && age > 300 && coverage < 0.7 ? 'Refresh' : coverage < 0.35 ? 'Commission' : coverage >= 0.6 ? 'Maintain' : 'Monitor'
  return <div className="pb-14">
    <PageHeader eyebrow="Gartner case study · Presentation guide" title="What should we research next?"
      lede="Connect the market conversation to the research we already have, then give an analyst an evidence-backed next step." />
    <div className="space-y-6 px-7 pt-6">
      <Panel raised className="p-6">
        <p className="label-caps text-momentum">The business decision</p>
        <h2 className="mt-2 max-w-3xl text-2xl font-semibold">High attention + weak usable coverage = a research opportunity.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">A research director needs to decide what to commission, what to update, and what existing research can already answer. This prototype joins public news with a simulated internal library to support that decision.</p>
        <Link to="/" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-momentum">Start a market scan <ArrowRight className="size-4" /></Link>
      </Panel>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Follow one question through four decisions</h2>
        <div className="grid gap-2 md:grid-cols-4" role="tablist" aria-label="Analysis stages">
          {stages.map((item, i) => <button key={item.title} role="tab" aria-selected={selected === i} aria-controls="stage-detail" id={`stage-${i}`} onClick={() => setSelected(i)}
            className={`rounded-xl border p-4 text-left transition ${selected === i ? 'border-momentum bg-momentum/10' : 'border-edge bg-surface hover:bg-surface-2'}`}>
            <item.icon className="mb-3 size-5 text-momentum" /><span className="text-xs text-ink-3">0{i + 1}</span><p className="mt-1 text-sm font-medium">{item.title}</p>
          </button>)}
        </div>
        <Panel className="mt-3 p-6">
          <div role="tabpanel" id="stage-detail" aria-labelledby={`stage-${selected}`}>
            <h3 className="text-lg font-semibold">{stage.question}</h3>
            <dl className="mt-4 grid gap-5 lg:grid-cols-3">{[['Input', stage.input], ['What happens', stage.work], ['Output and limit', stage.output]].map(([title, body]) =>
              <div key={title}><dt className="label-caps">{title}</dt><dd className="mt-2 text-sm leading-relaxed text-ink-2">{body}</dd></div>)}</dl>
            <Link to={stage.link} className="mt-5 inline-flex items-center gap-2 text-sm text-momentum">{stage.label}<ArrowRight className="size-4" /></Link>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Make the scoring tangible" subtitle="Illustrative example, not a live finding. Assume attention = 0.80 and every document directly covers the topic." />
        <div className="grid gap-7 p-6 md:grid-cols-2">
          <div className="space-y-5">
            <label className="block text-sm">Relevant documents <strong className="float-right num">{documents}</strong><input className="mt-3 w-full accent-[var(--color-momentum)]" type="range" min="0" max="5" value={documents} onChange={e => setDocuments(Number(e.target.value))} /></label>
            <label className="block text-sm">Age of each document <strong className="float-right num">{age} days</strong><input className="mt-3 w-full accent-[var(--color-momentum)]" type="range" min="0" max="600" step="30" value={age} onChange={e => setAge(Number(e.target.value))} /></label>
            <p className="text-xs leading-relaxed text-ink-3">Relevance weights: direct = 1, partial = 0.5, tangential = 0. Freshness is full through 120 days and declines to zero at 450 days. Old notes retain 25% background value. Thresholds are prototype assumptions to validate with analysts.</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-2 p-5">
            <div className="grid grid-cols-3 gap-3">{[['Attention', attention], ['Coverage', coverage], ['Gap', gap]].map(([label, value]) => <div key={String(label)}><p className="label-caps">{label}</p><p className="num mt-2 text-2xl">{Number(value).toFixed(2)}</p></div>)}</div>
            <p className="mt-5 text-sm text-ink-2">0.80 × (1 − {coverage.toFixed(2)}) = {gap.toFixed(2)}</p>
            <p className="mt-3 font-semibold text-momentum">Suggested action: {action}</p>
            <p className="mt-2 text-xs text-ink-3">Coverage = 60% effective document depth + 40% strongest usable document. Actions are advisory.</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-6"><h2 className="text-lg font-semibold">A second path answers client questions</h2><p className="mt-3 text-sm leading-relaxed text-ink-2">“What are the governance risks of AI in healthcare?” goes to internal retrieval, cited answer generation and a support check. It does not need a market scan. The planner selects this path in automatic mode; explicit modes let the user choose.</p><p className="mt-3 text-xs leading-relaxed text-ink-3">Orchestration is a bounded LangGraph workflow: model-assisted routing and language tasks, deterministic scoring and persistence. It is not a team of autonomous agents dynamically inventing tools.</p><Link to="/library" className="mt-4 inline-block text-sm text-momentum">Ask the library →</Link></Panel>
        <Panel className="p-6"><h2 className="text-lg font-semibold">Present in this order</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-2"><li>State the research allocation decision and show this flow.</li><li>Scan “AI in healthcare” and inspect the activity trace.</li><li>Open one opportunity and trace it to news and internal documents.</li><li>Explore its graph relationships.</li><li>Ask a library question and inspect citations.</li><li>Close with limitations, evaluation and next improvements.</li></ol></Panel>
      </div>
      <Panel className="border-gap/30 p-5"><h2 className="text-sm font-semibold text-gap">What the demo establishes</h2><p className="mt-2 text-sm leading-relaxed text-ink-2">The components work together to support a research decision. The library is simulated. News search is a small, query-dependent sample, not measured client demand or a reliable time series. Similarity and model judgements need analyst evaluation. A low score does not justify retiring research. Historical growth detection, client-demand validation and production controls remain future work.</p></Panel>
    </div>
  </div>
}
