import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob,PresentationFile} from 'file:///C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const root=path.resolve(import.meta.dirname,'..');
const final=path.join(root,'presentation','Demand-Sensing-Executive-v2.pptx');
const p=await PresentationFile.importPptx(await FileBlob.load(final));
for(let i=0;i<p.slides.items.length;i++){
  const bytes=await p.export({slide:p.slides.items[i],format:'png',scale:1});
  await fs.writeFile(path.join(root,'presentation','slides',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await bytes.arrayBuffer()));
}
await fs.copyFile(final,path.join(root,'presentation','Demand-Sensing-Executive.pptx'));
console.log('Rendered all final PowerPoint slides and updated the canonical download');
