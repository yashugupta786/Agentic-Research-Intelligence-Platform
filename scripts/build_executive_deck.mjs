// Editable slides, with one source for the PowerPoint, PDF and app viewer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile} from 'file:///C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT=path.resolve(import.meta.dirname,'..');
const BUILD=path.join(ROOT,'tmp','executive-deck');
const OUT=path.join(ROOT,'presentation');
const SKILL='C:/Users/yashu/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const PY='C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
process.env.RUNTIME_NODE_MODULES='C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
await fs.mkdir(BUILD,{recursive:true}); await fs.mkdir(path.join(OUT,'slides'),{recursive:true});
const p=Presentation.create({slideSize:{width:1600,height:900}});
const C={navy:'#0B2238',ink:'#102C43',blue:'#1767B2',teal:'#007D82',mint:'#71D5C0',muted:'#536C80',line:'#CCD9E2',paper:'#F5F8FB',white:'#FFFFFF',gold:'#A96113'};
const FONT='Segoe UI', manifest=[], nativeTables=[];
function text(s,v,x,y,w,h,size=28,color=C.ink,bold=false){const q=s.shapes.add({geometry:'textbox',name:v.slice(0,55),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});q.text=v;q.text.style={typeface:FONT,fontSize:size,color,bold,autoFit:'none',insets:{left:0,right:0,top:0,bottom:0}};return q;}
function box(s,x,y,w,h,fill,stroke='none'){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1.5}});}
function rule(s,y=824,x=80,w=1440,color=C.line){box(s,x,y,w,2,color);}
function slide(title,section,notes,dark=false){const s=p.slides.add();s.background.fill=dark?C.navy:C.white;const n=manifest.length+1;manifest.push({number:n,title,section,notes,image:`slides/slide-${String(n).padStart(2,'0')}.png`});text(s,section.toUpperCase(),80,44,1400,28,17,dark?C.mint:C.teal,true);text(s,title,80,102,1440,n===1?230:125,n===1?78:49,dark?C.white:C.ink,true);rule(s,824,80,1440,dark?'#365066':C.line);text(s,'Demand Sensing Intelligence',80,845,1200,24,16,dark?'#BDD0DE':C.muted);text(s,String(n).padStart(2,'0'),1460,840,60,32,22,dark?C.mint:C.teal,true);s.speakerNotes.textFrame.setText(notes);return s;}
function note(s,v){text(s,v,80,770,1440,43,20,C.muted);}
function label(s,v,x,y,w=650){text(s,v,x,y,w,40,23,C.teal,true);}
function block(s,title,body,x,y,w=650){text(s,title,x,y,w,48,32,C.ink,true);text(s,body,x,y+61,w,130,28,C.muted);}
function table(s,head,rows,{y=280,height=390,widths,font=26}={}){const vals=[head,...rows];const t=s.tables.add({rows:vals.length,columns:head.length,left:80,top:y,width:1440,height,values:vals,columnWidths:widths});t.borders.assign({fill:C.line,width:1});for(let r=0;r<vals.length;r++)for(let c=0;c<head.length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.navy:r%2?C.paper:C.white;cell.text.style={typeface:FONT,fontSize:r===0?24:font,color:r===0?C.white:C.ink,bold:r===0||c===0,autoFit:'none',insets:{left:18,right:18,top:13,bottom:12}};}nativeTables.push(manifest.length);return t;}
function flow(s,steps,y=285,h=200){let prev;const gap=40,w=(1440-gap*(steps.length-1))/steps.length;return steps.map((v,i)=>{const x=80+i*(w+gap),q=box(s,x,y,w,h,C.paper,C.line);text(s,v[0],x+20,y+23,w-40,63,30,C.ink,true);text(s,v[1],x+20,y+99,w-40,h-112,25,C.muted);if(prev)s.shapes.connect(prev,q,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.teal,width:2.5},tail:{type:'triangle'}});prev=q;return q;});}
const src=(files)=>`Sources: ${files}. All worked calculations and synthetic article/document IDs are illustrative, unless explicitly described as a recorded run. Prototype weights and thresholds are design choices, not calibrated probabilities.`;

// 01
{
const s=slide('Demand Sensing\nIntelligence','Research planning case study',`Prepared by Yashu Gupta. The business decision is which research to commission, refresh or maintain. The case study permits a simulated internal library. This presentation follows the data through the application, then explains what the scores mean. ${src('Case_Study_Lead DS.docx; backend/app/agents/graph.py')}`,true);
text(s,'A defensible research priority,\nwith evidence behind every score',80,388,1330,145,43,'#BDD0DE');
text(s,'Yashu Gupta',80,667,1100,55,33,C.white,true);
text(s,'Agentic workflow / Internal retrieval / Research decisions',80,738,1440,42,26,C.mint);
}
// 02
{
const s=slide('The research decision and the case-study brief','Business purpose',`The five requested capabilities are emerging topics, cited RAG answers, gap analysis, a knowledge graph and agentic orchestration. Market scan proposes research work, while Library QA answers a client question. The system supports an analyst's judgment. It does not measure client demand or publish research automatically. ${src('Case_Study_Lead DS.docx; backend/app/agents/graph.py')}`);
text(s,'Where should we commission, refresh or maintain research?',80,246,1440,95,40,C.teal,true);
table(s,['Research planning','Client question answering'],[
['Public signals reveal emerging themes','Internal retrieval finds relevant passages'],
['Coverage and gaps rank possible work','Citations connect claims to research notes'],
['A knowledge graph exposes relationships','Support review flags unsupported claims'],
],{y:373,height:303,widths:[720,720],font:28});
note(s,'LangGraph coordinates both routes. The simulated library defines the boundary of what the assistant knows.');
}
// 03
{
const s=slide('Architecture: setup and a live request','System design',`Setup chunks internal documents into approximately 130 words with 25-word overlap, embeds them and stores normalized vectors with a chunk/document ID map. SQLite retains documents. At inference the UI sends question, forced_intent and force_refresh. FastAPI validates the request, LangGraph executes the selected path, and SSE carries progress to the browser. POST /api/ask supports blocking clients. The live UI uses GET /api/ask/stream. NetworkX constructs the graph and SQLite saves completed results. This is a local prototype. ${src('backend/app/data/library_builder.py; backend/app/services/vectorstore.py; backend/app/api/agent.py; backend/app/agents/graph.py')}`);
label(s,'SETUP: PREPARE THE INTERNAL LIBRARY',80,241,1400);
flow(s,[['Research documents','Text, dates and stable IDs'],['Chunk + embed','~130 words, 25-word overlap'],['FAISS + SQLite','Vectors, passages and ID map']],298,171);
label(s,'INFERENCE: ONE QUESTION FROM THE UI',80,519,1400);
flow(s,[['React UI','Question and selected mode'],['FastAPI','Validate HTTP request'],['LangGraph','Agents read shared state'],['UI + saved run','SSE events and DB snapshot']],572,177);
note(s,'Inference reuses the index. Tavily supplies public signals, Gemini supplies model calls, NetworkX builds relationships.');
}
// 04
{
const s=slide('The market-scan workflow','Nine agents, one shared state',`Each node returns a partial state update. Earlier fields remain available, so creating topics does not remove articles. Planner uses code for a forced UI mode and a model in Auto. Scout uses search. Topic Analyst uses extraction, embeddings and canonicalization. Attention and Gap use arithmetic. Librarian uses retrieval and a relevance judge. Graph uses NetworkX and embeddings. Synthesis and Critic use separate model calls. ${src('backend/app/agents/graph.py; backend/app/agents/nodes.py')}`);
const names=[['01 Planner','Intent + search queries'],['02 Scout','Unique article records'],['03 Topic Analyst','Topics + evidence mapping'],['04 Attention','Breadth + recency score'],['05 Coverage','Matches + coverage score'],['06 Graph Curator','Nodes + typed links'],['07 Gap Analyst','Gap + priority + action'],['08 Synthesizer','Executive recommendation'],['09 Critic','Consistency + issues']];let prev;
names.forEach((v,i)=>{const row=Math.floor(i/3),col=row%2?2-i%3:i%3,x=80+500*col,y=245+166*row,q=box(s,x,y,440,124,C.paper,C.line);text(s,v[0],x+20,y+20,400,44,31,C.ink,true);text(s,v[1],x+20,y+72,400,40,25,C.muted);if(prev)s.shapes.connect(prev,q,{kind:'straight',fromSide:i%3===0?'bottom':row%2?'left':'right',toSide:i%3===0?'top':row%2?'right':'left',line:{fill:C.teal,width:2.5},tail:{type:'triangle'}});prev=q;});
note(s,'Shared state carries the original question, articles, topics, coverage, graph, scores and final narrative.');
}
// 05
{
const s=slide('Planner and Scout: a question becomes evidence','Agents 01–02',`Input example: question='AI in healthcare', forced_intent='market_scan', force_refresh=false. The UI-selected route uses deterministic planning: research_area='AI in healthcare', intent='market_scan' and the three search queries shown. The original question stays unchanged. In Auto mode a model classifies intent and can supply up to four queries. Scout calls Tavily search_news(query,max_results=8,days=45,force=force_refresh) for each query. It may reuse cache. Pooling uses URL keys, so repeated results contribute one article. Output is articles[], signal_source and scout_stats. Each article includes title, url, domain, snippet, published_date and source. Eight is a requested maximum, not a guaranteed return count. ${src('backend/app/agents/nodes.py: planner_node, scout_node; backend/app/services/external_signals.py')}`);
text(s,'UI input: “AI in healthcare” + Market scan',80,241,1440,65,37,C.ink,true);
table(s,['Planner output: queries[]','Scout action'],[
['AI in healthcare','Tavily: request up to 8 results'],
['AI in healthcare emerging trends','Tavily: request up to 8 results'],
['AI in healthcare regulation governance','Tavily: request up to 8 results'],
],{y:337,height:278,widths:[920,520],font:27});
text(s,'Pool results, deduplicate URLs, retain article metadata',80,655,1440,56,34,C.teal,true);
note(s,'Output: articles[] + signal_source + scout_stats. Three queries can return fewer than 24 unique articles.');
}
// 06
{
const s=slide('Topic extraction: what the first model call reads','Agent 03 / Extract',`Twelve illustrative articles require two extraction calls, six articles per call. Input includes index, title, date, source domain and at most 520 characters of snippet. It does not fetch and read full article HTML. The model returns one ArticleExtraction per valid index: topics (requested 1–3), entities (schema description up to5) and driver. Batch-local indices become global by adding the batch start. The driver is a why-now clause, not an extracted entity relation. Code then lexical_normalise() lowercases, collapses whitespace, removes quote characters, stop prefixes and selected filler words, and caps a phrase at80 characters. Keys shorter than4 are skipped. The three maps are updated during this cleanup. ${src('backend/app/services/topics.py: extract_signals, lexical_normalise, normalise_topics')}`);
label(s,'INPUT: SIX ARTICLES PER CALL',80,245);
text(s,'[0] Hospital A establishes an AI oversight committee\nDate: 2026-09-13\nSource: hospital.example\nExcerpt: committee reviews models before deployment…',80,306,685,196,28,C.muted);
label(s,'OUTPUT FOR ARTICLE INDEX 0',865,245);
text(s,'topics: [“Clinical AI Governance”]\nentities: [{name: “Hospital A”, type: “ORGANISATION”}]\ndriver: “New committee reviews clinical models”',865,306,655,201,28,C.ink);
rule(s,554);text(s,'12 articles × 2 themes = 24 extracted mentions',80,597,1440,65,38,C.teal,true);
text(s,'Clean phrase keys and retain their article indexes.\nExample: “The AI governance trends” becomes “ai governance”.',80,680,1440,77,29);
note(s,'Illustrative extraction. The model returns themes, entities and a driver. Code creates graph relationships later.');
}
// 07
{
const s=slide('Topic consolidation: group, name, map back','Agent 03 / Consolidate',`Continue the illustrative12-article example.24 extracted mentions may yield16 cleaned unique phrases. The actual number is data-dependent. Embed the cleaned phrases in frequency order and L2-normalize each vector. Compare each vector with current cluster centroids using a dot product, equal to cosine for unit vectors. Join the best centroid at score>=0.93. Otherwise create a group. Recompute joined centroids as normalize(mean(member vectors)). Canonicalization receives area_hint and numbered lists of phrases (up to8 unique sorted phrases per group), not raw articles, vectors or frequency counts. It returns label/category/description/member_groups. It may merge true synonyms and must preserve distinct subtopics. The prompt aims for5–10 topics, while the node caps the final result at14. Three topics here are an illustration. Code maps member_groups through phrase indexes and surface_articles to unique URLs, dates, entities and drivers. Unknown group IDs are ignored, repeated claims across topics are ignored and omitted groups survive separately. ${src('backend/app/services/topics.py; backend/app/agents/nodes.py: topic_analyst_node')}`);
flow(s,[['24 mentions','16 cleaned phrases'],['Embed + cluster','Compare to centroids'],['Second LLM call','Name groups, merge synonyms'],['3 topic records','Recover article evidence']],248,201);
text(s,'Similarity = dot(unit vector, unit centroid)    Join at ≥ 0.93',80,490,1440,61,34,C.teal,true);
table(s,['Canonical output example','Member groups','Recovered evidence'],[
['Clinical AI Governance','[0, 2]','5 article URLs across 4 domains'],
['Healthcare Agentic AI','[1]','Its own URLs, entities and dates'],
['AI Diagnostic Accuracy','[3]','Its own URLs, entities and dates'],
],{y:550,height:204,widths:[590,270,580],font:24});
note(s,'Illustrative counts. Output is 3 topic records plus the original articles in state. Topic names emerge from this scan.');
}
// 08
{
const s=slide('Attention: breadth and recency, calculated explicitly','Agent 04 / Python calculation',`This is the derived news-sample path actually used by momentum_node, which passes an empty time series. Inputs for one illustrative topic: mention_count5 unique article URLs, source_count4 distinct URL domains, newest article age4days. B=min(1,.7*4/6+.3*min(5,12)/12)=.5916667. R=exp(-4/30)=.8751733. A=.7B+.3R=.6767187, stored as momentum about.6767. The two70/30 blends serve different purposes: within breadth, publishers receive more weight than article volume; final attention blends breadth with recency.6outlets and12articles are prototype scale constants, not inferred from requesting24 search results.30days is a decay time constant. Unknown dates yield R0 and recency_days999. growth_pct is null because no measured baseline exists. ${src('backend/app/services/topics.py: compute_momentum; backend/app/agents/nodes.py: momentum_node')}`);
text(s,'Example input: 5 articles, 4 publishers, newest article 4 days ago',80,243,1440,62,33,C.muted);
label(s,'BREADTH: REWARD DISTINCT PUBLISHERS',80,338,1400);
text(s,'B = min(1, 0.7 × publishers / 6 + 0.3 × min(articles, 12) / 12)',80,391,1440,64,32);
text(s,'B = 0.7 × 4/6 + 0.3 × 5/12 = 0.5917',80,462,1440,58,33,C.teal,true);
label(s,'RECENCY: DISCOUNT OLDER SIGNALS',80,552,1400);
text(s,'R = exp(−days / 30) = exp(−4 / 30) = 0.8752',80,605,1440,60,34);
rule(s,683);text(s,'Attention = 0.7B + 0.3R',80,710,1090,57,37,C.ink,true);text(s,'0.6767',1210,699,310,70,54,C.teal,true);
note(s,'The state field is momentum. This score measures sampled attention. Historical growth is not measured.');
}
// 09
{
const s=slide('Coverage: the retrieval funnel for each topic','Agent 05 / Retrieve',`For each topic, librarian_coverage_node constructs query_text=label+'. '+description and calls assess_coverage(top_k5,judge=True). The index embeds this query and returns up to50 ranked chunk hits. Archive filtering happens after retrieval. Code keeps one best-scoring chunk per document, drops similarity below.62, and keeps at most10 candidate documents. It judges these candidates in one call for this topic, then retains covers/partial, sorts by verdict weight then similarity, and keeps at most5. Repeat separately for each topic. Shortfalls in candidate counts are expected. No additional chunk-summary stage is present. Syndicated Archive represents external syndicated content, excluded so it does not count as original internal coverage. ${src('backend/app/agents/nodes.py: librarian_coverage_node; backend/app/services/coverage.py: assess_coverage; backend/app/services/vectorstore.py')}`);
text(s,'Query = topic label + description',80,238,1440,62,39,C.teal,true);
flow(s,[['Up to 50 chunks','Embed query, search FAISS'],['Up to 10 documents','One best passage per document'],['One judge call','Verdict for each candidate'],['Up to 5 matches','Keep covers or partial']],348,219);
block(s,'Python filters candidates','Exclude Syndicated Archive.\nRequire similarity ≥ 0.62.\nSeveral chunks from one note count as one document.',80,613,680);
block(s,'Loop over the topic list','3 topics mean 3 coverage assessments.\nEach topic receives its own matches, reasons,\ncoverage score and staleness.',870,613,650);
}
// 10
{
const s=slide('The judge reads excerpts and returns reasons','Agent 05 / Judge',`Per-topic input contains TOPIC and WHAT THE TOPIC COVERS, then candidate document ID, title, practice_area, doc_type, similarity and first420 characters of the best hit text. The system prompt says be strict: same healthcare domain is not the same topic. The model returns verdicts[{doc_id,verdict,reason}], one per supplied ID. Covers means squarely addresses topic, partial means adjacent angle/section, tangential means same domain different subject, unrelated means no fit. It sees neither full external articles nor full internal documents, and cannot prove exhaustive coverage. Python validates IDs/verdict labels and handles missing verdicts with a labelled conservative proxy. ${src('backend/app/services/coverage.py: JUDGE_SYSTEM, judge_candidates')}`);
label(s,'INPUT TO THE MODEL',80,241,1400);
text(s,'Clinical AI Governance: oversight and accountability for clinical models.\nFor each candidate: document ID, title, metadata, similarity and a 420-character excerpt.',80,294,1440,107,31);
table(s,['Illustrative candidate excerpt','Model verdict','Reason returned'],[
['RN-9001: approval gates and clinical AI oversight','covers','Directly addresses governance'],
['RN-9002: an audit subsection on clinical models','partial','Covers one part of governance'],
['RN-9003: diagnostic accuracy benchmarks','tangential','Same domain, different subject'],
],{y:441,height:265,widths:[720,260,460],font:25});
note(s,'Output: [{doc_id, verdict, reason}]. Python assigns weights of 1, 0.5, 0, 0 and calculates the scores next.');
}
// 11
{
const s=slide('Coverage combines relevance, age and depth','Agent 05 / Calculate',`Continue the same illustrative judge example. RN-9001 covers and RN-9002 partial are both500days old. RN-9003 tangential contributes0 regardless of its age. Freshness F=1 for age<=120,0 for age>=450, otherwise1-(age-120)/330. For285days F=.5. A document's usable weight is verdict_weight*(.25+.75F). The two500-day accepted notes have weights.25 and.125. Sum=.375,max=.25. Coverage=.6*(.375/5)+.4*.25=.145. Depth uses a fixed divisor5 even when only2 notes match. Staleness is the age of the newest accepted document,500days here, not an average and not a model output. Output includes topic_slug,doc_count2,strong_matches1,newest_doc_date,staleness_days500,coverage_score.145,matched_docs with verdicts/reasons/ages and judged_by. ${src('backend/app/services/coverage.py: _freshness, assess_coverage')}`);
text(s,'Freshness F = 1 through day 120, 0 from day 450',80,240,1440,57,35,C.ink,true);
text(s,'Between them: F = 1 − (age − 120) / 330     At 285 days: F = 0.50',80,305,1440,58,30,C.muted);
text(s,'Usable weight u = relevance × (0.25 + 0.75 × F)',80,392,1440,61,36,C.teal,true);
table(s,['Accepted document','Verdict weight','Age','F','Usable u'],[
['RN-9001: covers','1.0','500 days','0','0.250'],
['RN-9002: partial','0.5','500 days','0','0.125'],
],{y:480,height:186,widths:[590,280,230,120,220],font:25});
text(s,'C = 0.6 × min(1, Σu / 5) + 0.4 × max(u)',80,696,1090,56,33,C.ink,true);text(s,'0.145',1235,682,285,78,56,C.teal,true);
note(s,'C = 0.6 × (0.375 / 5) + 0.4 × 0.25 = 0.145. Staleness: 500 days, the age of the newest accepted note.');
}
// 12
{
const s=slide('The graph connects a topic to its evidence','Agent 06 / Build relationships',`Graph Curator reads topic_objects for full entities and coverage by slug for accepted document matches. It does not extract arbitrary subject-predicate-object relations with an LLM. NetworkX creates topic mentions entity, topic covered_by document (up to4 matches per topic), and document published_in practice area. A batched embedding call for topic label+description supports topic-to-topic adjacent_to links at cosine>=.62. This threshold has a different purpose from .93 phrase deduplication. Entities belong to source articles and are assigned to topics supported by those articles, which can make associations broad. The graph is saved in SQLite. State receives graph counts, central_entities, question and a nodes/links snapshot (up to300nodes). A covered_by link can represent partial or stale evidence, with similarity as edge weight. ${src('backend/app/services/knowledge_graph.py; backend/app/agents/nodes.py: graph_curator_node')}`);
const entity=box(s,80,361,380,150,C.paper,C.line),topic=box(s,590,361,420,150,C.navy),doc=box(s,1140,361,380,150,C.paper,C.line);
text(s,'Hospital A',101,395,340,55,34,C.ink,true);text(s,'Extracted entity',101,459,340,35,26,C.muted);
text(s,'Clinical AI\nGovernance',615,393,370,94,37,C.white,true);
text(s,'RN-9001',1161,395,340,55,34,C.ink,true);text(s,'Accepted internal note',1161,459,340,38,25,C.muted);
s.shapes.connect(topic,entity,{kind:'straight',fromSide:'left',toSide:'right',line:{fill:C.teal,width:3},tail:{type:'triangle'}});s.shapes.connect(topic,doc,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.teal,width:3},tail:{type:'triangle'}});
text(s,'mentions',455,314,150,38,22,C.teal,true);text(s,'covered_by',1009,314,155,38,22,C.teal,true);
block(s,'Input is already in shared state','Topic entities from article extraction.\nAccepted internal documents from Coverage.\nCode assigns the relationship types.',80,588,680);
block(s,'Output belongs to the selected run','Nodes, links, graph statistics and central entities.\nThe UI shows the map for that question.\nSQLite preserves the result for replay.',870,588,650);
note(s,'Illustrative relationship. “Covered by” may mean partial or stale coverage. The graph does not recalculate the gap.');
}
// 13
{
const s=slide('Gap scoring turns the evidence into a priority','Agent 07 / Rank',`Continue the same illustrative topic: exact attention .6767186624, coverage .145, two accepted notes, newest500days old. Gap=A*(1-C)=.5785944564, rounded.5786.1-C=.855 means missing share under this heuristic. Rules run in order: refresh when A>=.50 and newest accepted note>300days and C<.70; publish_now when A>=.55 and C<.35; maintain when A>=.50 and C>=.60; over_invested when A<.45 and C>=.55; otherwise watch. Priority thresholds are.45CRITICAL,.30HIGH,.16MEDIUM,elseLOW, with CRITICAL capped toHIGH for maintain/over_invested/watch. The old accepted notes trigger refresh before publish_now. Output gaps[] joins by topic_slug, includes label,A,C,gap,priority,quadrant,rationale and sorts descending by gap. ${src('backend/app/services/coverage.py: classify, build_gap; backend/app/agents/nodes.py: gap_analyst_node')}`);
text(s,'Gap = attention × (1 − coverage)',80,244,1440,87,54,C.ink,true);
text(s,'0.6767 × (1 − 0.145) = 0.5786',80,360,1440,84,55,C.teal,true);
rule(s,476);block(s,'Priority: CRITICAL','Gap ≥ 0.45\nStrong sampled attention meets weak usable coverage.',80,524,650);
block(s,'Action: REFRESH','Attention ≥ 0.50, coverage < 0.70\nNewest accepted note > 300 days old\nRefresh rule takes precedence over commissioning.',870,524,650);
note(s,'Same worked example. Output: gap_score 0.5786, priority CRITICAL, quadrant refresh and an evidence-based rationale.');
}
// 14
{
const s=slide('Synthesis writes the decision; Critic checks the numbers','Agents 08–09',`Synthesizer receives the original question, research area, article/outlet counts and up to12 gap rows with scores, priority,quadrant,rationale and up to3 document IDs/ages each. It generates ExecutiveOutput. The returned recommendation list is deterministic computed_recommendations from the top5 gap rows, overriding model-proposed actions. The model contributes the narrative and top_opportunities. Critic is a separate model call reading summary and up to12 analytics rows. It returns consistent,issues,confidence. State receives verdict,groundedness and up to3 critique_issues. It flags inconsistencies but does not automatically repair the summary or fact-check original articles. Missing critic output does not prove a pass. ${src('backend/app/agents/nodes.py: computed_recommendations, synthesizer_node, critic_node')}`);
label(s,'SYNTHESIZER INPUT',80,244,1400);
text(s,'Clinical AI Governance: attention 0.6767, coverage 0.145, gap 0.5786.\nCRITICAL / refresh. Newest accepted note: 500 days old.',80,299,1440,104,31);
label(s,'EXECUTIVE OUTPUT',80,437,1400);
text(s,'“Refresh the clinical AI governance research. Current coverage is dated,\nwhile this news sample shows substantial attention to the topic.”',80,492,1440,112,37,C.ink,true);
rule(s,645);text(s,'Critic compares the summary with the supplied analytics.',80,686,1440,54,33,C.teal,true);
note(s,'Illustrative summary. Output adds the narrative, computed actions, consistency verdict and any flagged issues.');
}
// 15
{
const s=slide('Library QA answers a different user need','Separate RAG route',`Input is the client's original question. rag.retrieve uses default top_k6, retrieves up to24 candidates with min_score.42, excludes archive and retains at most2 chunks per document. Answer generation sees question and passages with document IDs. Code strips unknown citation IDs. A separate groundedness call estimates supported/total claims and lists unsupported claims. Empty retrieval produces abstention. The answer has citations and retrieval evidence. Planner routes library_qa directly to Librarian, then Synthesis and Critic skip additional work because support assessment already ran. Coverage's covers/partial judge is a different task from answering a client's question. ${src('backend/app/services/rag.py; backend/app/config.py; backend/app/agents/nodes.py: librarian_rag_node')}`);
text(s,'“What governance practices does our research recommend for clinical AI?”',80,242,1440,118,39,C.ink,true);
flow(s,[['Retrieve','Up to 6 internal passages'],['Generate answer','Use passages and cite note IDs'],['Assess support','Supported and unsupported claims']],412,215);
text(s,'Output: answer + citations + retrieved evidence + support assessment',80,685,1440,74,33,C.teal,true);
note(s,'No relevant evidence: abstain. Library QA does not need a web scan, attention score or gap calculation.');
}
// 16
{
const s=slide('Demonstration evidence and pilot KPIs','What we can substantiate',`Recorded run9,17Sep2026: query AI in healthcare, cached Tavily evidence,23unique articles,20outlets,53raw topic mentions,9canonical topics and63965ms runtime. This is historical operational evidence and does not validate the changed code or general quality. Previous runs replay a full SQLite snapshot with its original question,timestamp,outputs and graph,without new model/search calls. Current telemetry includes latency,calls,tokens. Coverage reasons and model consistency estimates are inspectable but not measured accuracy. An analyst-labelled evaluation set is needed for recall@k,citation precision,verdict agreement,recommendation acceptance and analyst time saved. ${src('recorded run9; backend/app/services/run_history.py; backend/app/core/telemetry.py')}`);
text(s,'Recorded example: 23 articles / 9 topics / ~64 seconds',80,241,1440,78,44,C.teal,true);
table(s,['Already observable','Pilot measurement to add'],[
['Saved question, agent trace and graph snapshot','Replay reliability across representative questions'],
['Latency, calls and token counts','p50/p95 latency and cost per successful run'],
['Retrieved passages and judge reasons','Recall@k, citation precision and analyst agreement'],
['Ranked actions and model consistency check','Recommendation acceptance and analyst time saved'],
],{y:363,height:342,widths:[720,720],font:26});
note(s,'Historical run #9 used cached search results. Operational success does not establish production accuracy or business impact.');
}
// 17
{
const s=slide('The next investment is stronger evidence','Limits and future work',`The current prototype is integrated, but the weights/thresholds need calibration. Excerpts can omit relevant material. Single-best-chunk evidence and filtering after retrieval can miss coverage. Article entities can attach to multiple topics. Static attention cannot prove a surge. The library is simulated. Next steps: analyst-labelled benchmark and threshold tuning; fuller evidence and multi-passage judgment; temporal baselines; hybrid retrieval/reranking; access-aware retrieval and authentication; durable jobs and request-scoped telemetry. No business KPI targets are claimed before a baseline. ${src('backend/app/services/topics.py; backend/app/services/coverage.py; backend/app/services/knowledge_graph.py; backend/app/services/vectorstore.py')}`);
table(s,['Current boundary','Next investment','Success measure'],[
['Heuristic scores and model verdicts','Analyst-labelled cases and calibration','Agreement on useful research actions'],
['Short excerpts, one passage per note','Richer evidence and retrieval evaluation','Fewer missed and false coverage matches'],
['News sample without a time baseline','Comparable historical signal collection','Measured change over time'],
['Local prototype and shared services','Access control, durable jobs, telemetry','Reliable use under concurrent load'],
],{y:266,height:415,widths:[490,490,460],font:26});
note(s,'A controlled analyst pilot should establish quality, usefulness and operating cost before wider deployment.');
}
// 18
{
const s=slide('A research decision with a visible calculation','Closing example',`Close by replaying the single worked example, not by claiming production performance. Clinical AI Governance has5articles across4domains, newest4days ago, producing attention.6767. Two accepted500-day notes produce coverage.145. Gap.5786 crossesCRITICAL and stale evidence triggersrefresh. An analyst can inspect original evidence, the document reasons and the graph, then decide whether the proposed work is useful. Technical detail follows only if needed. ${src('backend/app/services/topics.py; backend/app/services/coverage.py')}`,true);
text(s,'Clinical AI Governance',80,254,1440,78,52,C.white,true);
text(s,'Attention  0.6767\nCoverage  0.145\nGap             0.5786',80,371,710,216,44,'#BDD0DE');
text(s,'REFRESH',930,389,590,85,62,C.mint,true);text(s,'Two accepted notes,\nboth 500 days old',930,500,590,109,34,C.white);
text(s,'The analyst sees the evidence and owns the final decision.',80,702,1440,66,35,C.white,true);
}
// 19
{
const s=slide('The dictionaries preserve provenance during cleanup','Reference / Topic mapping',`surface_counter is collections.Counter[str]. surface_articles is dict[str,list[int]]. surface_original is dict[str,str] using setdefault, preserving the first observed raw spelling. Consider article0 with AI Governance and Agentic AI, article1 with The AI governance trends, article2 with AI Governance and Clinical AI Oversight. The governance key occurs3times. If governance and oversight ultimately merge, concatenate [0,1,2] and[2], then unique URLs prevent article2 from being counted twice. This raw phrase count differs from canonical mention_count, which is the unique URL count after merging. The full original articles remain in state. Entities/drivers are recovered from extractions whose indices belong to the merged topic. ${src('backend/app/services/topics.py: normalise_topics')}`);
table(s,['Cleaned key','surface_counter','surface_articles','surface_original'],[
['ai governance','3','[0, 1, 2]','AI Governance'],
['agentic ai','1','[0]','Agentic AI'],
['clinical ai oversight','1','[2]','Clinical AI Oversight'],
],{y:263,height:300,widths:[360,285,365,430],font:26});
text(s,'Merged topic evidence: [0, 1, 2] + [2] gives 3 unique article URLs',80,610,1440,90,35,C.teal,true);
note(s,'The maps store phrase frequency, provenance and display spelling. Deduplicating a phrase does not discard its source articles.');
}
// 20
{
const s=slide('Centroid comparison and the second model call','Reference / Topic algorithm',`Two-dimensional vectors below are synthetic arithmetic examples, not real model embeddings. v0=(1,0) starts group0. v1=(.96,.28) has norm1 and dot(v1,v0)=.96, so it joins. The new centroid is normalize((.98,.14))≈(.98995,.14142). v2=(0,1) has cosine.14142 against that centroid, below.93, so it starts group1. Each later vector compares with all existing centroids, not all other individual vectors. Canonicalization's real input format is numbered phrase lists plus area hint. Shown example [0]Clinical AI Governance,[1]Healthcare Agentic AI,[2]Clinical AI Oversight can map0and2toone topic if judged synonyms. The prompt requires each group exactly once and merges only synonyms. The model output member_groups is the mapping key. The code preserves omitted groups. ${src('backend/app/services/topics.py: _greedy_cluster, _canonicalise_with_llm')}`);
text(s,'v₀ = (1, 0) starts group 0\nv₁ = (0.96, 0.28): dot(v₁, v₀) = 0.96, so join\nNew centroid = normalize(mean(v₀, v₁)) ≈ (0.98995, 0.14142)',80,247,1440,153,31);
rule(s,441);label(s,'SECOND CALL INPUT: PHRASES + GROUP IDs',80,483,690);label(s,'SECOND CALL OUTPUT: TOPIC + MEMBERS',865,483,655);
text(s,'[0] Clinical AI Governance\n[1] Healthcare Agentic AI\n[2] Clinical AI Oversight',80,547,690,151,29);
text(s,'Clinical AI Governance: member_groups [0, 2]\nHealthcare Agentic AI: member_groups [1]\nEach also returns category and description.',865,547,655,190,29);
note(s,'member_groups recovers phrases, then article indexes, then URLs and entities. The naming call receives no raw vectors.');
}
// 21
{
const s=slide('Agent outputs accumulate in shared state','Reference / Data contracts',`These are business-facing fields, not complete tracing/error schemas. Planner also adds reasoning and plan. Scout includes stats/cache information. Topic JSON includes entities[:12],drivers[:6],article_urls[:8],while internal topic_objects retain the fuller mappings. Topic node max_topics14 and normalisation.merged is sum(max(0,len(aliases)-1)), not raw_mentions minus canonical. Attention replaces topics with enriched topic dictionaries and adds momentum to internal objects. Coverage adds a map keyed by topic_slug and enriches topics. Graph returns graph stats/question/snapshot. Gap adds gaps and a DB-wide portfolio summary, which can include other runs; the gaps list itself belongs to this scan. Synthesizer adds answer/executive_summary/recommendations/top_opportunities. Critic adds verdict/groundedness/critique_issues. ${src('backend/app/agents/nodes.py; backend/app/agents/state.py')}`);
table(s,['Node','Main fields it adds or updates'],[
['Planner / Scout','intent, research_area, queries / articles, signal_source, scout_stats'],
['Topic / Attention','topics, topic_objects, normalisation / momentum, recency_days'],
['Coverage / Graph','coverage[slug], matched_docs / graph.snapshot nodes and links'],
['Gap Analyst','gaps: scores, priority, quadrant, rationale / portfolio summary'],
['Synthesizer / Critic','answer, recommendations / verdict, groundedness, critique_issues'],
],{y:265,height:426,widths:[420,1020],font:25});
note(s,'Each node reads the shared state and returns a partial update. Topic and coverage records join through the topic slug.');
}
// 22
{
const s=slide('Score interpretation and failure boundaries','Reference / Calculation rules',`No accepted docs returns coverage0,doc_count0,staleness999. Missing/invalid date also maps999. This is a sentinel, not observed age. Future dates clamp to0. If the judge is incomplete, judged_by=hybrid. If absent,similarity_proxy. Only similarity>=.74 gets proxy partial(.5),otherwise unrelated. It cannot become covers from similarity alone. LLM rate limiting starts90-second cooldown. A missing index raises: node marks coverage unavailable,sets coverage_scoreNone,and Gap skips that topic. Freshness saturates at120/450. Coverage0.52 for one fresh covers note demonstrates depth5 divisor (.6/5+.4). Five fresh covers yield1. Five fresh partials yield.5. Priority thresholds .45,.30,.16 as described. These are configurable design judgments in code, requiring validation, and scores are not probabilities. ${src('backend/app/services/coverage.py; backend/app/agents/nodes.py')}`);
table(s,['Condition','What it means in this implementation'],[
['1 fresh “covers” document','Coverage = 0.6 × (1/5) + 0.4 × 1 = 0.52'],
['5 fresh “covers” documents','Coverage = 1.00, the depth target is met'],
['Judge unavailable or incomplete','Labelled similarity proxy: partial only at similarity ≥ 0.74'],
['No accepted documents / missing dates','999 is a sentinel. No accepted docs also gives coverage 0.'],
['Index unavailable','Coverage unavailable. Skip gap scoring for that topic.'],
],{y:268,height:423,widths:[550,890],font:25});
note(s,'Staleness is calendar age of the newest accepted note. A model verdict, heuristic score and confidence estimate are different things.');
}

const filename=process.argv[2]||'Demand-Sensing-Executive-v3.pptx';
const candidate=path.join(BUILD,'candidate.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
const data={title:'Demand Sensing Intelligence',author:'Yashu Gupta',mainSlides:18,revision:'2026-09-17-agent-depth',executiveSlides:[1,2,3,4,8,9,11,13,16,17,18],slides:manifest};
await fs.writeFile(path.join(BUILD,'manifest.json'),JSON.stringify(data,null,2));
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
await finalizePresentation({workspaceDir:ROOT,candidatePath:candidate,finalPath:path.join(OUT,filename),pythonExecutable:PY,integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit',...nativeTables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:nativeTables,fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:path.join(BUILD,`${filename}.validation.json`)});
await fs.copyFile(path.join(BUILD,'manifest.json'),path.join(OUT,'manifest.json'));
console.log(`Finalized ${manifest.length} slides: ${filename}`);
