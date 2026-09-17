import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob,PresentationFile} from 'file:///C:/Users/yashu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const root=path.resolve(import.meta.dirname,'..');
const final=path.join(root,'presentation',process.argv[2] || 'Demand-Sensing-Executive-v5.pptx');
const revision=path.basename(final,'.pptx');
const renderDir=path.join(root,'presentation','slides',revision);
await fs.mkdir(renderDir,{recursive:true});
const manifestPath=path.join(root,'presentation','manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const p=await PresentationFile.importPptx(await FileBlob.load(final));
if(manifest.slides.length!==p.slides.items.length) throw new Error('Manifest and final deck slide counts differ');
for(let i=0;i<p.slides.items.length;i++){
  const bytes=await p.export({slide:p.slides.items[i],format:'png',scale:1});
  const imageName=`slide-${String(i+1).padStart(2,'0')}.png`;
  await fs.writeFile(path.join(renderDir,imageName),new Uint8Array(await bytes.arrayBuffer()));
  manifest.slides[i].image=`slides/${revision}/${imageName}`;
  console.log(`Rendered ${i+1}/${p.slides.items.length}`);
}
await fs.copyFile(final,path.join(root,'presentation','Demand-Sensing-Executive.pptx'));
manifest.revision=revision;
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2));
console.log('Rendered all final PowerPoint slides and updated the canonical download');
