import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileSliders, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

type DeckSlide = { number: number; title: string; section: string; notes: string; image: string }
type Deck = { title: string; author: string; mainSlides: number; revision?: string; executiveSlides?: number[]; slides: DeckSlide[] }
const BASE = '/presentation/'

export default function PresentationView() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [route, setRoute] = useState<'full' | 'executive'>('full')
  const [present, setPresent] = useState(false)
  const [outline, setOutline] = useState(true)
  const [imageError, setImageError] = useState<number | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const presentRef = useRef(false)
  const slides = useMemo(() => {
    if (!deck) return []
    const selected = deck.executiveSlides
    return route === 'executive' && selected?.length ? deck.slides.filter(s => selected.includes(s.number)) : deck.slides
  }, [deck, route])
  useEffect(() => { presentRef.current = present }, [present])

  useEffect(() => {
    const controller = new AbortController()
    fetch(BASE + 'manifest.json', { signal: controller.signal, cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('The presentation files could not be loaded.'); return r.json() })
      .then((data: Deck) => { if (!data.slides?.length) throw new Error('The presentation is empty.'); setDeck(data) })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [])

  async function exitPresent() {
    setPresent(false)
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  }
  async function enterPresent() {
    setPresent(true)
    await stageRef.current?.requestFullscreen().catch(() => undefined)
  }
  useEffect(() => {
    function changed() { if (!document.fullscreenElement) setPresent(false) }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
      if (e.key === 'Escape' && presentRef.current) {
        e.preventDefault(); e.stopImmediatePropagation(); void exitPresent(); return
      }
      if (!deck) return
      if (e.key === 'ArrowRight' || (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON')) {
        e.preventDefault(); setIndex(i => Math.min(slides.length - 1, i + 1))
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)) }
      if (e.key === 'Home') { e.preventDefault(); setIndex(0) }
      if (e.key === 'End') { e.preventDefault(); setIndex(slides.length - 1) }
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [deck, slides])

  if (error) return <div className="p-12" role="alert"><p>{error}</p><a className="mt-4 inline-block text-momentum" href={BASE + 'Demand-Sensing-Executive.pdf'} download>Download the PDF directly</a></div>
  if (!deck) return <p role="status" className="p-12 text-ink-3">Loading presentation…</p>
  const slide = slides[index]
  const asset = (name: string) => BASE + name + (deck.revision ? '?v=' + encodeURIComponent(deck.revision) : '')
  return <div ref={stageRef} data-deck-present={present || undefined} className={'executive-deck' + (present ? ' ed-present' : '')}>
    <header className="ed-toolbar">
      <button type="button" className="ed-icon" aria-label={outline ? 'Hide slide outline' : 'Show slide outline'} onClick={() => setOutline(v => !v)}>{outline ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
      <div className="ed-heading"><strong>{deck.title}</strong><span>{route === 'executive' ? `${slides.length} slides · executive overview` : `${deck.mainSlides} presentation + ${deck.slides.length - deck.mainSlides} reference slides`}</span></div>
      <div className="ed-actions">
        {deck.executiveSlides?.length ? <select className="ed-route" aria-label="Presentation depth" value={route} onChange={e => { setRoute(e.target.value as 'full' | 'executive'); setIndex(0); setImageError(null) }}><option value="full">Complete walkthrough</option><option value="executive">Executive overview</option></select> : null}
        <a href={asset('Demand-Sensing-Executive.pptx')} download title="Download the complete editable deck"><FileSliders size={16} /><span>PowerPoint</span></a>
        <a href={asset('Demand-Sensing-Executive.pdf')} download className="ed-primary" title="Download the complete deck"><Download size={16} /><span>Download PDF</span></a>
        <button type="button" aria-label={present ? 'Exit presentation full screen' : 'Presentation full screen'} onClick={() => void (present ? exitPresent() : enterPresent())}>{present ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      </div>
    </header>
    <div className="ed-body">
      {outline && !present && <nav className="ed-outline" aria-label="Slide outline">{slides.map((s, i) => <button key={s.number} type="button" onClick={() => setIndex(i)} aria-label={'Go to slide ' + s.number + ': ' + s.title} aria-current={i === index ? 'page' : undefined} className={i === index ? 'ed-selected' : ''}>
        {s.number === deck.mainSlides + 1 && <span className="ed-divider">Technical reference</span>}
        <img src={asset(s.image)} alt="" loading="lazy" width="1600" height="900" />
        <span><b>{String(s.number).padStart(2, '0')}</b>{s.title}</span>
      </button>)}</nav>}
      <main className="ed-main">
        <div className="ed-canvas" aria-label={'Slide ' + slide.number + ': ' + slide.title}>
          {imageError === index ? <p role="alert">This slide could not load. Use the PDF or PowerPoint download above.</p> : <img key={slide.number} src={asset(slide.image)} alt={'Slide ' + slide.number + ': ' + slide.title} width="1600" height="900" onError={() => setImageError(index)} />}
        </div>
        <footer className="ed-navigation">
          <button type="button" aria-label="Previous slide" disabled={!index} onClick={() => setIndex(i => i - 1)}><ChevronLeft size={18} /><span>Previous</span></button>
          <label><span className="sr-only">Choose presentation slide</span><select aria-label="Choose presentation slide" value={index} onChange={e => setIndex(Number(e.target.value))}>{slides.map((s, i) => <option key={s.number} value={i}>{String(s.number).padStart(2, '0')} · {s.title}</option>)}</select></label>
          <span className="ed-counter" aria-live="polite">{index + 1} / {slides.length}</span>
          <button type="button" aria-label="Next slide" disabled={index === slides.length - 1} onClick={() => setIndex(i => i + 1)}><span>Next</span><ChevronRight size={18} /></button>
        </footer>
        {!present && <details className="ed-notes"><summary>Speaker notes and sources</summary><p>{slide.notes}</p></details>}
      </main>
    </div>
  </div>
}
