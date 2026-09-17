// Editable PowerPoint source. The app and PDF use renders of this same deck.
import fs from 'node:fs/promises';
import path from 'node:path';
import nodeProcess from 'node:process';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile} from 'file:///C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const BUILD=path.join(ROOT,'tmp','executive-deck');
const OUT=path.join(ROOT,'presentation');
const SKILL='C:/Users/yashu/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const PY='C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
nodeProcess.env.RUNTIME_NODE_MODULES='C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
await fs.mkdir(BUILD,{recursive:true});await fs.mkdir(path.join(OUT,'slides'),{recursive:true});
const p=Presentation.create({slideSize:{width:1600,height:900}});
const C={navy:'#0B2238',ink:'#102C43',blue:'#1767B2',teal:'#007D82',mint:'#71D5C0',muted:'#536C80',line:'#CCD9E2',paper:'#F5F8FB',white:'#FFFFFF',gold:'#B26A14'};
const manifest=[];const nativeTables=[];
const FONT='Segoe UI';
function text(s,value,x,y,w,h,size=27,color=C.ink,bold=false){const sh=s.shapes.add({geometry:'textbox',name:value.slice(0,55),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});sh.text=value;sh.text.style={typeface:FONT,fontSize:size,color,bold,autoFit:'none',insets:{left:0,right:0,top:0,bottom:0}};return sh;}
function box(s,x,y,w,h,fill,stroke='none'){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1.5}});}
function rule(s,x,y,w,color=C.line){box(s,x,y,w,2,color);}
function slide(title,section='The solution',note='',dark=false){const s=p.slides.add();s.background.fill=dark?C.navy:C.white;const i=manifest.length+1;manifest.push({number:i,title,section,notes:note,image:`slides/slide-${String(i).padStart(2,'0')}.png`});text(s,section.toUpperCase(),80,44,1350,25,16,dark?C.mint:C.teal,true);text(s,title,80,94,1440,i===1?220:122,i===1?76:48,dark?C.white:C.ink,true);rule(s,80,824,1440,dark?'#365066':C.line);text(s,'Demand Sensing Intelligence',80,845,900,22,15,dark?'#AFC1D0':C.muted);text(s,String(i).padStart(2,'0'),1460,840,60,30,20,dark?C.mint:C.teal,true);s.speakerNotes.textFrame.setText(note);return s;}
function sub(s,v,y=208,dark=false){text(s,v,80,y,1400,70,27,dark?'#BDD0DE':C.muted);}
function note(s,v,dark=false){text(s,v,80,765,1400,45,19,dark?'#BDD0DE':C.muted);}
function para(s,title,body,x,y,w=660){text(s,title,x,y,w,55,31,C.ink,true);text(s,body,x,y+64,w,140,26,C.muted);}
function process(s,steps,y=310,{x=80,w=1440,h=200,connect=true}={}){const gap=40,bw=(w-gap*(steps.length-1))/steps.length;let prev;return steps.map((v,i)=>{const xx=x+i*(bw+gap);const sh=box(s,xx,y,bw,h,C.paper,C.line);text(s,String(i+1).padStart(2,'0'),xx+20,y+20,bw-40,30,20,C.teal,true);text(s,v[0],xx+20,y+60,bw-40,63,29,C.ink,true);text(s,v[1],xx+20,y+124,bw-40,h-130,23,C.muted);if(prev&&connect)s.shapes.connect(prev,sh,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.teal,width:2.5},tail:{type:'triangle'}});prev=sh;return sh;});}
function table(s,headers,rows,{y=270,height=450,widths}={}){const values=[headers,...rows];const t=s.tables.add({rows:values.length,columns:headers.length,left:80,top:y,width:1440,height,values,columnWidths:widths});t.borders.assign({fill:C.white,width:1});for(let r=0;r<values.length;r++){for(let c=0;c<headers.length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.navy:(r%2?C.paper:C.white);cell.text.style={typeface:FONT,fontSize:r===0?23:24,color:r===0?C.white:C.ink,bold:r===0||c===0,autoFit:'none',insets:{left:16,right:16,top:12,bottom:10}};}}nativeTables.push(manifest.length);return t;}
function big(s,value,label,x,y,w=310){text(s,value,x,y,w,110,85,C.teal,true);text(s,label,x,y+115,w,80,25,C.muted);}
async function image(s,file,x,y,w,h){s.images.add({blob:new Uint8Array(await fs.readFile(path.join(ROOT,file))),contentType:'image/png',alt:file,fit:'contain',position:{left:x,top:y,width:w,height:h}});}
const source=(files)=>`Implementation sources: ${files}. Case-study source: Case_Study_Lead DS.docx. Values described as illustrative are teaching assumptions, not recorded outcomes.`;

// 01: A quiet cover with an editable title and clear business purpose.
{
const s=slide('Demand Sensing\nIntelligence','Research planning case study',`Prepared by Yashu Gupta. Introduce the business question: which research should a team commission, refresh or maintain? The prototype integrates public signals with a simulated internal library. The case-study brief explicitly permits a simulated library and flexible technology choices. ${source('backend/app/agents/graph.py')}`,true);
text(s,'Research priorities supported by market signals\nand internal evidence',80,370,1270,120,40,'#BDD0DE');
text(s,'Yashu Gupta',80,637,950,55,31,C.white,true);text(s,'Agentic AI   /   RAG   /   Knowledge graph',80,706,1350,40,24,C.mint);
}
// 02
{
const s=slide('The decision: where should research invest next?','Business value',`Research leaders face two distinct jobs. Market scan compares external attention with internal coverage. Library QA answers a specific question using internal passages and citations. The output supports an analyst's decision. Business impact and time saved have not yet been measured. ${source('backend/app/agents/nodes.py, backend/app/services/rag.py')}`);
sub(s,'A research team needs to distinguish a new opportunity from an existing answer.');
para(s,'Research planning','Market question\nExternal signals and internal coverage\nRanked research actions',80,330,650);
para(s,'Client question answering','Client question\nRelevant internal passages\nCited answer and support assessment',850,330,650);
rule(s,80,612,1440);text(s,'Human decision',80,651,320,45,31,C.teal,true);text(s,'Commission research, refresh an existing note, maintain coverage, or monitor.',445,646,1050,86,31);
}
// 03
{
const s=slide('Five requirements, with visible evidence','Case-study scope',source('Case_Study_Lead DS.docx, frontend/src/pages/Console.tsx, frontend/src/pages/GraphExplorer.tsx'));
table(s,['Requirement','Implementation','Evidence in the product'],[
['A. Emerging topics','News search and topic consolidation','Canonical themes with article provenance'],
['B. Cited RAG answers','Internal retrieval and support review','Answer, document IDs and retained passages'],
['C. Coverage gaps','Attention compared with usable coverage','Ranked gaps and proposed actions'],
['D. Knowledge graph','Topics, entities and accepted documents','Map scoped to the selected scan'],
['E. Agentic orchestration','Conditional LangGraph workflow','Agent trace and recorded outputs'],
],{y:245,height:480,widths:[310,515,615]});
note(s,'MVP scope: sampled news attention and a simulated internal library. Historical surge detection remains future work.');
}
// 04: Explicitly requested native editable architecture diagram.
{
const s=slide('Application architecture','System design',`The browser sends question, selected intent and refresh flag to FastAPI. The live UI uses GET /api/ask/stream and server-sent events. POST /api/ask serves blocking clients. HTTP validation checks question length. A worker executes LangGraph. Shared state carries inputs and node updates. Tools perform search, model calls, vector retrieval and graph construction. SQLite retains source data, scores and complete run snapshots. These are local services, not a production distributed architecture. ${source('backend/app/api/agent.py, backend/app/api/schemas.py, backend/app/agents/graph.py, backend/app/services/run_history.py')}`);
process(s,[['React + Vite','Question, mode and refresh'],['FastAPI','Validate HTTP request'],['LangGraph','Route and execute agents'],['Research result','Scores, evidence and actions']],250,{h:200});
text(s,'SSE streams actual agent events back to the browser',405,480,1060,40,25,C.teal,true);
process(s,[['External search','Tavily and cached results'],['Model services','Gemini extraction and review'],['Internal retrieval','FAISS vectors and ID map'],['Persistence','SQLite and NetworkX']],560,{h:180,connect:false});
note(s,'Shared state preserves the original question, articles, topics, coverage and trace across the workflow.');
}
// 05
{
const s=slide('Nine specialists share one research state','Market scan',`This is an ordered LangGraph workflow. The nodes have distinct responsibilities, but they are not nine independent autonomous models. The Planner uses code when the UI forces Market scan and an LLM in Auto mode. Scout calls search without an LLM. Topic Analyst and Librarian use models. Attention and gap scoring use Python. Graph construction uses NetworkX and embedding-based adjacency. Synthesis and critic use separate model calls. ${source('backend/app/agents/graph.py, backend/app/agents/nodes.py')}`);
const names=[['01 Planner','Intent and search queries'],['02 Signal Scout','Unique articles'],['03 Topic Analyst','Canonical topics'],['04 Attention Analyst','News attention score'],['05 Librarian','Coverage and matches'],['06 Graph Curator','Evidence relationships'],['07 Gap Analyst','Gap and priority'],['08 Synthesizer','Brief and actions'],['09 Critic','Consistency review']];
const nodes=[];names.forEach((n,i)=>{const row=Math.floor(i/3),col=row%2?2-i%3:i%3,x=80+col*500,y=240+row*162;const sh=box(s,x,y,440,125,C.paper,C.line);text(s,n[0],x+20,y+22,400,40,29,C.ink,true);text(s,n[1],x+20,y+70,400,42,24,C.muted);nodes.push(sh);if(i){const prevRow=Math.floor((i-1)/3);s.shapes.connect(nodes[i-1],sh,{kind:'straight',fromSide:prevRow===row?(row%2?'left':'right'):'bottom',toSide:prevRow===row?(row%2?'right':'left'):'top',line:{fill:C.teal,width:2.5},tail:{type:'triangle'}});}});
note(s,'Later nodes can read earlier fields. Articles remain in state after the system creates topic records.');
}
// 06
{
const s=slide('Setup prepares the library before inference','Internal research',`Ingestion stores documents and chunks in SQLite. Chunking uses about 130 words with 25-word overlap and includes the title. Embeddings use the configured model, with 768 dimensions by default. FAISS stores normalized vectors and maps positions to document and chunk IDs. Setup does not run the nine market-scan agents and does not train Gemini. Inference embeds the question or topic and reuses the index. Archive content can be stored but is excluded from coverage and library QA. ${source('backend/app/services/ingestion.py, backend/app/services/vectorstore.py, backend/app/config.py')}`);
text(s,'SETUP',80,250,650,45,23,C.teal,true);text(s,'EACH QUESTION',850,250,650,45,23,C.teal,true);
para(s,'Documents become searchable','Simulated notes retain stable IDs, dates and text.\nOverlapping passages become normalized embeddings.\nFAISS keeps vectors and a document/chunk map.',80,321,650);
para(s,'Queries reuse the index','Embed the question or topic.\nRetrieve candidate passages.\nAssess relevance or write a cited answer.',850,321,650);
rule(s,80,645,1440);text(s,'~130 words / chunk',80,686,460,50,31,C.blue,true);text(s,'25-word overlap',590,686,420,50,31,C.blue,true);text(s,'768 dimensions by default',1050,686,470,60,31,C.blue,true);
note(s,'Index preparation is separate from the market-scan workflow. Embedding represents content for retrieval.');
}
// 07
{
const s=slide('Planner and Scout preserve intent and evidence','Agents 01–02',`Forced Market scan normalizes a recognizable market subject without changing state.question. It creates the subject, emerging trends, and regulation governance queries. Auto mode uses the planning model instead. Scout requests eight results per query by default, with a 45-day search parameter in the scan path, then deduplicates URLs. Search-provider dates can be incomplete or outside the requested window. Run 9 used cached Tavily results: 8+8+8 raw hits, 23 unique URLs and 20 outlets. Topic extraction uses titles, snippets and metadata, not full fetched article HTML. ${source('backend/app/agents/nodes.py, backend/app/services/external_signals.py, SQLite run 9')}`);
text(s,'Query: “AI in healthcare”',80,235,1400,65,37,C.ink,true);
table(s,['Planner search queries','Scout request','Recorded run #9'],[
['AI in healthcare','Up to 8 results','8 returned'],
['AI in healthcare emerging trends','Up to 8 results','8 returned'],
['AI in healthcare regulation governance','Up to 8 results','8 returned'],
],{y:330,height:270,widths:[810,330,300]});
text(s,'24 raw hits',80,641,430,70,43,C.blue,true);text(s,'23 unique articles',575,641,470,70,43,C.teal,true);text(s,'20 outlets',1150,641,360,70,43,C.teal,true);
note(s,'Recorded example: cached Tavily results. Output retains title, URL, domain, snippet, date and source.');
}
// 08
{
const s=slide('Topic consolidation preserves article provenance','Agent 03',`Illustrative input: 12 articles each produce 2 topic phrases, yielding 24 mentions. Extraction runs in batches of 6, producing 1–3 themes plus entities and a driver per article. Lexical normalization can reduce 24 mentions to 16 distinct strings. These counts are illustrative, not promises. The code maintains surface_counter, surface_articles and surface_original. Normalized embeddings join greedy centroid clusters at threshold 0.93. A second LLM returns canonical labels, descriptions, categories and member_groups. It can merge input groups. Mapping member groups back to phrases then article indexes yields topic evidence, entities, drivers and distinct URL counts. Articles still remain in shared state. ${source('backend/app/services/topics.py')}`);
process(s,[['12 articles','Batch extraction'],['24 mentions','Clean and deduplicate'],['16 phrases','Embed and group'],['3 topics','Name and map back']],280,{h:210});
para(s,'What the model does','Extracts themes, then names and optionally merges groups. The second call returns member group IDs.',80,548,650);
para(s,'What code preserves','Article URLs, distinct sources, dates, aliases, entities and drivers map back to each canonical topic.',850,548,650);
note(s,'Illustrative counts. One article may support multiple topics. Twelve articles do not become three articles.');
}
// 09
{
const s=slide('Attention quantifies the observed news sample','Agent 04',`Illustrative example used throughout scoring: 5 distinct articles, 4 distinct domains, newest article age 4 days. Breadth=min(1,0.7*4/6+0.3*5/12)=0.591667. Recency=exp(-4/30)=0.875173. Attention=0.7*breadth+0.3*recency=0.676719, about 0.68. The 30 days is the exponential decay time constant, not the half-life. Half-life is approximately 20.8 days. Unknown dates get no recency credit. Source count is distinct domains and mention count is distinct article URLs per canonical topic. ${source('backend/app/services/topics.py: score_momentum')}`);
big(s,'4','Distinct outlets',80,265);big(s,'5','Distinct articles',600,265);big(s,'4 days','Age of newest article',1110,265,420);
rule(s,80,487,1440);text(s,'Breadth 0.592',80,539,650,55,35,C.ink,true);text(s,'Recency 0.875',850,539,650,55,35,C.ink,true);
text(s,'Attention = 70% × breadth + 30% × recency',80,633,1180,70,37,C.ink,true);text(s,'0.68',1310,622,210,100,64,C.teal,true);
note(s,'Illustrative result. This measures attention in a news sample. A growth claim requires a comparable historical series.');
}
// 10
{
const s=slide('Coverage retrieval separates similarity from relevance','Agent 05',`For every canonical topic the query is topic label plus description. FAISS returns up to 50 passage candidates with default top_k=5. The code excludes Syndicated Archive, keeps the best passage per document, filters similarity at 0.62 and retains at most 10 documents for judgment. The judge receives topic label and description plus document ID, title, practice area, type, similarity and the first 420 characters of that best passage. It returns covers, partial, tangential or unrelated and a reason per document. The code accepts covers/partial, sorts by verdict weight then similarity, and keeps at most five. It does not pass all 50 chunks to the judge. ${source('backend/app/services/coverage.py')}`);
process(s,[['Up to 50','Retrieved passages'],['Up to 10','Unique candidate documents'],['LLM judge','Verdict and reason per document'],['Up to 5','Accepted coverage matches']],275,{h:220});
para(s,'Candidate selection','Exclude syndicated archive. Keep one best passage per document. Require similarity ≥ 0.62.',80,550,650);
para(s,'Judgment context','Topic + description, document metadata and a 420-character excerpt. Full news articles are not supplied.',850,550,650);
note(s,'Similarity selects candidates. Relevance judgment determines whether a document actually addresses the topic.');
}
// 11
{
const s=slide('An old direct match can still reveal a refresh need','Coverage example',`Illustrative topic: Clinical AI Governance. RN-9001 is a teaching document with direct coverage but age 500 days. RN-9002 is about diagnostic accuracy and RN-9003 about ambient documentation. Treat those two as tangential to this particular governance question. They contribute zero despite plausible vector similarity. Verdict weights: covers=1, partial=0.5, tangential/unrelated=0. Freshness is 1 until day120, linearly decreases to0 at day450. Usable weight=w*(0.25+0.75*f). RN-9001 usable weight=0.25. Coverage=.6*(.25/5)+.4*.25=.13. staleness_days is the age of the newest accepted document, here500. ${source('backend/app/services/coverage.py')}`);
table(s,['Teaching document','Age','Judge verdict','Usable weight'],[
['Clinical AI Governance Playbook','500 days','Covers','0.25'],
['Diagnostic accuracy research','30 days','Tangential','0.00'],
['Ambient documentation research','20 days','Tangential','0.00'],
],{y:248,height:315,widths:[650,220,300,270]});
text(s,'Coverage  0.13',80,621,660,90,58,C.teal,true);text(s,'Staleness  500 days',850,621,670,90,58,C.gold,true);
note(s,'Illustrative data. Old research retains background value. Fresh but tangential documents add no coverage.');
}
// 12
{
const s=slide('The gap score supports a specific research action','Agent 07',`Using the same teaching values: attention .676719 and coverage .13. Gap=.676719*(1-.13)=.588746, shown .59. Priority is critical above .45. Refresh classification takes precedence when attention>=.50, accepted document count>0, newest accepted document age>300 and coverage<.70. The example meets all four, so refresh existing research rather than commissioning a duplicate. These are prototype rules requiring calibration. Graph Curator runs before Gap Analyst but graph node counts are not inputs to the score. ${source('backend/app/services/coverage.py: classify and score_gap, backend/app/agents/nodes.py')}`);
text(s,'0.68 × (1 − 0.13)',80,264,1450,120,82,C.ink,true);text(s,'Gap ≈ 0.59',80,404,900,100,66,C.teal,true);
rule(s,80,535,1440);para(s,'Recommended action: refresh','The topic has meaningful attention. Existing coverage is relevant but 500 days old.',80,581,760);
text(s,'CRITICAL PRIORITY',1050,592,465,55,27,C.gold,true);text(s,'Update the governance\nplaybook for analyst review.',1050,653,465,85,29);
note(s,'Illustrative calculation uses unrounded inputs. Gap = attention × (1 − coverage).');
}
// 13
{
const s=slide('The knowledge graph makes evidence inspectable','Agent 06',`The graph adds entity mentions from TopicCandidate objects and accepted internal research from coverage. Relationships include topic mentions entity, topic covered_by document, document published_in_area practice area, and topic adjacent_to topic using cosine threshold0.62. The main map omits practice-area nodes for clarity, starts with one topic and limits entities. A covered_by link can be partial or stale and its displayed edge weight is similarity, not coverage probability. It is not a GraphRAG retrieval path in this MVP. The snapshot belongs to the saved run. ${source('backend/app/services/knowledge_graph.py, frontend/src/pages/GraphExplorer.tsx')}`);
text(s,'MARKET ENTITIES',80,250,380,40,22,C.teal,true);text(s,'CANONICAL TOPIC',590,250,400,40,22,C.teal,true);text(s,'INTERNAL RESEARCH',1120,250,400,40,22,C.teal,true);
const center=box(s,580,417,440,180,C.navy);text(s,'Medical AI Governance\nand Regulation',602,440,396,95,33,C.white,true);text(s,'Attention 0.84    Coverage 0.88',602,551,396,40,24,C.mint);
const left=[['UVA Health','Organisation'],['HHS','Organisation']].map((v,i)=>{const y=340+i*285,sh=box(s,80,y,360,100,C.paper,C.line);text(s,v[0],100,y+16,320,37,30,C.ink,true);text(s,v[1],100,y+58,320,30,23,C.muted);return sh;});
const right=[['RN-1011','FDA clearance pathways'],['RN-1003','Software as a medical device']].map((v,i)=>{const y=340+i*285,sh=box(s,1120,y,400,100,C.paper,C.line);text(s,v[0],1140,y+16,360,37,30,C.ink,true);text(s,v[1],1140,y+58,360,32,22,C.muted);return sh;});
left.forEach(sh=>s.shapes.connect(center,sh,{kind:'elbow',fromSide:'left',toSide:'right',line:{fill:C.teal,width:2},tail:{type:'triangle'}}));right.forEach(sh=>s.shapes.connect(center,sh,{kind:'elbow',fromSide:'right',toSide:'left',line:{fill:C.teal,width:2},tail:{type:'triangle'}}));
box(s,447,471,123,29,C.white);box(s,1023,470,94,30,C.white);text(s,'mentions',450,473,120,30,20,C.muted);text(s,'covered by',1025,475,91,30,17,C.muted);
note(s,'Selected relationships from saved run #9. An accepted coverage link may represent partial or dated research.');
}
// 14
{
const s=slide('Synthesis explains the scores and Critic checks them','Agents 08–09',`Synthesizer receives computed gaps and topic analytics. Code determines recommendations and the model writes a summary. A fallback computed narrative is available if the model is unavailable. Critic compares the narrative with supplied analytics and returns a consistency verdict, confidence and issues. This is not a fact check of source articles or an independently calibrated confidence probability. Library QA skips additional synthesis/critic model calls because Librarian already produced the answer and groundedness review. ${source('backend/app/agents/nodes.py: synthesizer_node and critic_node')}`);
process(s,[['Computed analytics','Scores, matches and priority'],['Synthesizer','Executive summary and actions'],['Critic','Check narrative against data']],285,{h:225});
para(s,'Example check','The brief says coverage is 0.13. Critic compares that statement with the supplied gap table.',80,567,650);
para(s,'Decision boundary','The analyst reviews the recommendation. The model does not publish research or allocate a budget.',850,567,650);
note(s,'A consistency estimate evaluates the generated brief against supplied analytics. It is not external truth validation.');
}
// 15
{
const s=slide('Library QA uses a separate retrieval path','Cited answers',`The original client question is the retrieval query. Default k=6, initial candidate search k*4 with min_score .42. Archive is excluded and at most two chunks per document survive. Model writes from passages with [RN-####] citations. Invalid citation IDs are removed. Independent groundedness assessment estimates supported/total claims and lists unsupported claims. Empty retrieval triggers abstention. Retrieval without supporting content should be stated as insufficient. No Tavily search or attention/gap scoring is necessary. ${source('backend/app/services/rag.py, backend/app/agents/nodes.py, backend/app/config.py')}`);
text(s,'“What governance practices does our research recommend for clinical AI?”',80,241,1440,110,37,C.ink,true);
process(s,[['Retrieve','Up to 6 internal passages'],['Answer','Claims with document IDs'],['Assess support','Supported and unsupported claims']],399,{h:210});
text(s,'Coverage asks whether research addresses a topic. Library QA answers the client’s question.',80,659,1440,80,32,C.teal,true);
note(s,'No relevant passages: abstain. Returned citations must refer to documents supplied to the answer model.');
}
// 16
{
const s=slide('Recorded runs preserve the complete demonstration','Operational evidence',`Verified SQLite run9: question AI in healthcare, saved2026-09-17, latency63965ms, cached Tavily evidence,23articles20outlets,53raw topic mentions,9canonical topics,55graphnodes160edges. Nine agents completed and critique_issues/errors are empty. This is one observed run and not a latency benchmark or quality evaluation. Replay loads result_json fromSQLite and performs no search/model calls. Legacy history can contain only summary/trace and cannot reproduce data never stored. ${source('SQLite runs.id=9, backend/app/services/run_history.py')}`);
big(s,'23','Unique articles',80,256,310);big(s,'9','Canonical topics',570,256,340);big(s,'64 s','Observed runtime',1100,256,400);
para(s,'Live demonstration','Show the submitted question, agent outputs, coverage rationale and query-scoped graph.',80,548,650);
para(s,'Recorded demonstration','Open the same run from Previous runs. Its question, timestamp, evidence and graph remain together.',850,548,650);
note(s,'Observed run #9, 17 Sep 2026. Cached search results. Nine agents completed with no recorded review issues.');
}
// 17
{
const s=slide('Quality measurement needs an analyst-labelled test set','KPIs and evaluation',`Separate operational metrics already captured from validation not yet completed. Latency/calls/tokens are observable per run, though process-wide telemetry slicing is not safe under concurrent requests. Model groundedness and consistency scores are estimates, not validated accuracy. Proposed evaluation: analyst-labelled questions, recall@k and citation precision, relevance verdict agreement, gap recommendation usefulness, analyst time saved, p50/p95 latency and cost under repeated runs. Set acceptance targets after a baseline. No invented KPI values. ${source('backend/app/core/telemetry.py, backend/app/services/rag.py, backend/app/services/coverage.py')}`);
table(s,['Measure','Available today','Evaluation for a pilot'],[
['Speed and cost','Latency, provider calls and tokens','p50/p95 latency and cost per successful run'],
['Retrieval quality','Passages and document IDs','Recall@k and citation precision'],
['Coverage quality','Verdicts, reasons and scores','Agreement with analyst labels'],
['Answer quality','Model support/consistency estimates','Human review of claims and omissions'],
['Business usefulness','Proposed research actions','Accepted recommendations and analyst time saved'],
],{y:246,height:481,widths:[335,520,585]});
note(s,'The recorded demo is operational evidence. It does not establish production accuracy or business impact.');
}
// 18
{
const s=slide('Technology choices fit the prototype’s scope','Design decisions',source('backend/app/agents/graph.py, backend/app/services/vectorstore.py, backend/app/services/knowledge_graph.py, backend/app/data/db.py'));
table(s,['Choice','Why it fits','Trade-off'],[
['LangGraph','Explicit state and conditional routes','Sequential scans accumulate model latency'],
['FAISS exact search','Simple local retrieval with a document ID map','Post-filtering can miss useful candidates'],
['LLM relevance judge','Distinguishes same-domain text from coverage','Short excerpts and model variability limit judgment'],
['NetworkX + SQLite','Inspectable relationships and simple persistence','Shared, multi-user scale needs further engineering'],
['Complete run snapshots','Repeatable historical demonstrations','Evidence and traces increase storage volume'],
],{y:246,height:483,widths:[300,560,580]});
note(s,'The case-study brief permits alternative technology choices. These choices support an integrated local MVP.');
}
// 19
{
const s=slide('A staged path to a dependable research service','Future work',`Recommended order: validate usefulness before adding architectural complexity. First create labelled evaluation sets and calibrate thresholds. Then strengthen evidence with real temporal baselines, richer article text, hybrid retrieval and reranking. Before broader use add auth, access-aware retrieval, request-scoped telemetry, durable queues, cancellation/resume and monitored provider budgets. Move to shared vector/graph services only when measured scale warrants it. These are future work, not deployed capabilities. ${source('README.md, backend/app/agents/graph.py, backend/app/services/coverage.py')}`);
process(s,[['Evaluate','Analyst labels and calibrated rules'],['Improve evidence','History, richer text and retrieval'],['Harden operations','Access control and durable jobs'],['Scale selectively','Shared services when needed']],295,{h:240});
text(s,'Pilot exit criteria',80,598,1420,55,33,C.teal,true);text(s,'Agreed retrieval quality, useful recommendations, acceptable latency and a clear human review process.',80,669,1420,100,33);
}
// 20: Closing with an actual decision, not presenter instructions.
{
const s=slide('Research planning with an inspectable evidence trail','Conclusion',`Close on the business result. The MVP ties a question to external evidence, canonical topics, internal coverage, a graph and proposed research actions. Library QA provides cited answers through its own route. Recommend a controlled analyst evaluation before claiming measurable impact. The remaining appendix provides exact contracts and calculation details.`,true);
text(s,'A market question becomes a ranked research decision.\nA client question becomes a cited internal answer.',80,292,1390,155,43,C.white,true);
text(s,'The next step is a controlled analyst evaluation\non a representative question set.',80,530,1320,110,36,'#BDD0DE');
text(s,'Technical appendix follows',80,730,1200,45,23,C.mint);
}
// 21
{
const s=slide('Agent contracts: planning through attention','Technical appendix',source('backend/app/agents/nodes.py, backend/app/services/topics.py'));
table(s,['Agent','Reads from state','Adds or updates'],[
['01 Planner','question, forced_intent','intent, research_area, queries, plan, reasoning'],
['02 Scout','queries, research_area, force_refresh','articles[], signal_source, scout_stats'],
['03 Topic Analyst','articles[], research_area','topics[], topic_objects[], normalisation'],
['04 Attention Analyst','topics and article/date/source counts','momentum and recency fields on topics'],
],{y:253,height:395,widths:[330,500,610]});
note(s,'A node returns a partial state update. The shared state retains earlier fields, including the original articles.');
}
// 22
{
const s=slide('Agent contracts: coverage through review','Technical appendix',source('backend/app/agents/nodes.py, backend/app/services/coverage.py'));
table(s,['Agent','Reads from state','Adds or updates'],[
['05 Librarian','topic labels + descriptions, internal index','coverage by slug, matched_docs and topic scores'],
['06 Graph Curator','topic_objects and accepted coverage','graph summary, question and node/link snapshot'],
['07 Gap Analyst','topic attention and coverage','gaps[], priority, quadrant and portfolio'],
['08 Synthesizer','question and computed analytics','answer, executive_summary and recommendations'],
['09 Critic','narrative and supplied analytics','verdict, groundedness and critique_issues'],
],{y:244,height:490,widths:[330,500,610]});
note(s,'topic_objects retain internal entity mappings. Serializable topics and the complete result support UI inspection and replay.');
}
// 23
{
const s=slide('The three dictionaries preserve mapping during cleanup','Topic Analyst detail',`This small example is illustrative. Article0 extracts AI Governance and Agentic AI. Article1 extracts ai governance. Article2 extracts AI Governance and Clinical Oversight. Normalization yields ai governance three times, agentic ai once and clinical oversight once. surface_counter counts extracted mentions per normalized phrase, surface_articles records article indexes, surface_original retains a display phrase. Final topic mention_count counts unique URLs after mapping, not repeated phrases. ${source('backend/app/services/topics.py: discover_topics')}`);
table(s,['Normalized phrase','surface_counter','surface_articles','surface_original'],[
['ai governance','3','[0, 1, 2]','AI Governance'],
['agentic ai','1','[0]','Agentic AI'],
['clinical oversight','1','[2]','Clinical Oversight'],
],{y:257,height:310,widths:[385,280,315,460]});
para(s,'Counts and provenance have different jobs','Counter measures phrase frequency. The article map preserves evidence and enables URL deduplication.',80,620,680);
para(s,'The final topic can span several phrases','If governance and oversight merge, article 2 contributes one distinct URL to that topic.',870,620,650);
}
// 24
{
const s=slide('Centroids form groups, then the model names them','Topic Analyst detail',`Normalized embeddings make a dot product equal cosine similarity. For each phrase vector, the greedy algorithm compares it with current cluster centroids. It joins the best cluster when score>=.93 or starts a new cluster. After a join it averages member vectors and renormalizes the centroid. This is order-dependent and is not an all-pairs comparison or guaranteed topic count. Canonicalization receives group IDs, phrases and frequency information and returns member_groups. These group IDs let code map back to phrase indexes and article indexes. The model may merge several input groups into a final topic. ${source('backend/app/services/topics.py: semantic_clusters, canonicalise, discover_topics')}`);
para(s,'1. Compare normalized vectors','score = dot(vector, centroid)\nJoin the nearest group at score ≥ 0.93.\nOtherwise create a new group.',80,259,650);
para(s,'2. Update the centroid','Mean of all member vectors, normalized again.\nLater phrases compare with this updated centroid.',850,259,650);
rule(s,80,507,1440);text(s,'Naming-call output',80,550,600,50,31,C.teal,true);
text(s,'label: “Clinical AI Governance”\nmember_groups: [0, 2]\ncategory + description',80,618,660,125,29);
text(s,'Groups 0 and 2 identify the original phrases.\nTheir article indexes recover URLs, dates and entities.\nThe final output is a topic record with its evidence.',850,585,655,155,28,C.muted);
}
// 25
{
const s=slide('Coverage mathematics and missing-data rules','Scoring detail',`Verdict and reason come from the LLM. Coverage score and age come from Python. Freshness=1 for age<=120,0 for age>=450,otherwise1-(age-120)/330. Usable weight=verdict_weight*(.25+.75*freshness). Coverage=.6*min(1,sum(usable)/5)+.4*max(usable). Age uses calendar-day differences with future dates clamped to0. Missing or malformed dates map to999. No accepted documents returns coverage0,doc_count0,staleness999. This sentinel means unknown/no dated accepted evidence, not an actual age measurement. Proxy verdict is partial only at similarity>=.74,otherwise unrelated. Proxy-only coverage cannot exceed.50 with five fresh partial matches. ${source('backend/app/services/coverage.py')}`);
text(s,'usable = relevance × (0.25 + 0.75 × freshness)',80,244,1440,65,37,C.teal,true);
text(s,'coverage = 0.6 × min(1, Σ usable / 5) + 0.4 × max(usable)',80,337,1440,95,35,C.ink,true);
table(s,['Input or condition','Implementation'],[
['Relevance','Covers 1.0, partial 0.5, tangential/unrelated 0'],
['Freshness','1 through day 120, linear decline to 0 at day 450'],
['Staleness','Age of newest accepted document'],
['Missing date / no matches','999 is a sentinel. No matches also returns coverage 0.'],
],{y:477,height:261,widths:[470,970]});
}
// 26
{
const s=slide('Failure behavior and production boundaries','Reliability detail',source('backend/app/agents/nodes.py, backend/app/services/coverage.py, backend/app/services/run_history.py, backend/app/api/agent.py'));
table(s,['Condition','Current behavior','Remaining work'],[
['Coverage judge unavailable','Labelled partial/unrelated similarity proxy','Calibrate fallback and monitor degradation'],
['No internal retrieval evidence','Abstain or expose unavailable coverage','Improve corpus and retrieval evaluation'],
['Narrative generation fails','Computed summary can remain available','Retry budgets and incident monitoring'],
['Browser stream closes','Worker can continue and save the run','Durable cancellation and resumable jobs'],
['Live services slow or unavailable','Replay an explicitly selected DB snapshot','Operational monitoring and concurrency controls'],
],{y:246,height:480,widths:[380,555,505]});
note(s,'Production work includes authentication, document access control, request-scoped telemetry and adversarial-input evaluation.');
}

const candidate=path.join(BUILD,'candidate.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
await fs.writeFile(path.join(BUILD,'manifest.json'),JSON.stringify({title:'Demand Sensing Intelligence',author:'Yashu Gupta',mainSlides:20,slides:manifest},null,2));
for(let i=0;i<manifest.length;i++){const s=p.slides.items[i];const b=await p.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(OUT,manifest[i].image),new Uint8Array(await b.arrayBuffer()));const l=await s.export({format:'layout'});await fs.writeFile(path.join(BUILD,`slide-${i+1}.layout.json`),await l.text());console.log(`Rendered ${i+1}/${manifest.length}`);}
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
await finalizePresentation({workspaceDir:ROOT,candidatePath:candidate,finalPath:path.join(OUT,nodeProcess.argv[2]||'Demand-Sensing-Executive.pptx'),pythonExecutable:PY,integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit',...nativeTables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:nativeTables,fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:path.join(BUILD,`${nodeProcess.argv[2]||'Demand-Sensing-Executive.pptx'}.validation.json`)});
await fs.copyFile(path.join(BUILD,'manifest.json'),path.join(OUT,'manifest.json'));
console.log(`Finalized ${manifest.length} slides in ${OUT}`);
