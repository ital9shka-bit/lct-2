#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
qa_id="oop-expert-qa-$(date +%s)-$$"
qa_dir="$repo_root/.qa/$qa_id"
mkdir -p "$qa_dir"
# Dedicated project, image, database volume, ports and environment. No live .env is read.
qa_port="${QA_PORT:-19088}"
qa_mail_port="${QA_MAIL_PORT:-19089}"
bash scripts/setup.sh --output=".qa/$qa_id/env" --origin="http://127.0.0.1:$qa_port" --port="$qa_port" --mail-port="$qa_mail_port"
export APP_IMAGE="oop-platform:$qa_id"
compose=(docker compose --project-name "$qa_id" --env-file "$qa_dir/env" -f implementation/compose.yaml)
cleanup() {
  result=$?
  trap - EXIT
  if (( result != 0 )); then
    "${compose[@]}" logs --no-color --tail=80 api worker migrate > "$qa_dir/services.log" 2>&1 || true
    printf 'Verification failed; diagnostics: %s\n' "$qa_dir" >&2
  fi
  "${compose[@]}" down --volumes --remove-orphans > "$qa_dir/cleanup.log" 2>&1 || true
  rm -f "$qa_dir/env"
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" up --build --wait --wait-timeout 180
"${compose[@]}" exec -T api npm test | tee "$qa_dir/unit.log"
"${compose[@]}" exec -T api npm run test:integration | tee "$qa_dir/integration.log"
"${compose[@]}" exec -T api node --input-type=module -e '
import assert from "node:assert/strict";
const base="http://127.0.0.1:8088";
for(const path of ["/health","/","/favicon.svg","/favicon.ico","/apple-touch-icon.png","/api/v1/meta","/api/v1/openapi"]){
 const r=await fetch(base+path);assert.equal(r.status,200,path);
 if(path==="/"){const html=await r.text();assert.match(html,/Объекто-ориентированный поиск/);assert.match(html,/favicon.svg/);}
 if(path.includes("favicon")||path.includes("apple-touch"))assert.ok((await r.arrayBuffer()).byteLength>100,path);
 if(path.endsWith("meta")){const meta=await r.json();assert.equal(meta.llm_mode,"manual");assert.equal(meta.environment,"demo");assert.equal(meta.ai_available,false);}
 if(path.endsWith("openapi")){const spec=await r.json();const methods=["get","post","put","patch","delete"];console.log("OpenAPI:",Object.keys(spec.paths).length,"paths,",Object.values(spec.paths).reduce((n,p)=>n+Object.keys(p).filter(k=>methods.includes(k)).length,0),"operations");}
}
console.log("Health, HTML, icons and runtime API contract: passed");
const page=await fetch(base+"/demo/");assert.equal(page.status,200);assert.match(await page.text(),/<video[^>]*controls/);
for(const path of ["/demo/player.css","/demo/player.js","/demo/oop-demo-poster.jpg"]){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.ok((await r.arrayBuffer()).byteLength>100,path);}
const head=await fetch(base+"/demo/oop-demo.mp4",{method:"HEAD"});assert.equal(head.status,200);assert.match(head.headers.get("content-type"),/video\/mp4/);assert.equal(head.headers.get("accept-ranges"),"bytes");assert.ok(Number(head.headers.get("content-length"))>1000000);
const range=await fetch(base+"/demo/oop-demo.mp4",{headers:{Range:"bytes=0-1023"}});assert.equal(range.status,206);assert.match(range.headers.get("content-range"),/^bytes 0-1023\//);assert.equal((await range.arrayBuffer()).byteLength,1024);
console.log("Public demo page, video headers and byte-range seeking without authentication: passed");
const docPage=await fetch(base+"/docs/");assert.equal(docPage.status,200);assert.match(await docPage.text(),/id="document-page"/);
for(const path of ["/docs/reader.js","/docs/document.css"]){const r=await fetch(base+path);assert.equal(r.status,200,path);}
const manifest=await fetch(base+"/docs/pages.json");assert.equal(manifest.status,200);const {pages}=await manifest.json();assert.equal(pages.length,54);
for(const path of pages){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.match(r.headers.get("content-type"),/image\/jpeg/);assert.ok((await r.arrayBuffer()).byteLength>1000,path);}
const pdf=await fetch(base+"/docs/oop-technical-documentation.pdf");assert.equal(pdf.status,200);assert.match(pdf.headers.get("content-type"),/application\/pdf/);assert.match(pdf.headers.get("content-disposition"),/^inline;/);assert.match(pdf.headers.get("content-security-policy"),/frame-ancestors \x27none\x27/);
const pdfBytes=new Uint8Array(await pdf.arrayBuffer());assert.equal(new TextDecoder().decode(pdfBytes.slice(0,5)),"%PDF-");
const sourcePdf=await (await import("node:fs/promises")).readFile("public/docs/oop-technical-documentation.pdf");assert.deepEqual(pdfBytes,new Uint8Array(sourcePdf));
const download=await fetch(base+"/docs/oop-technical-documentation.pdf?download=1",{method:"HEAD"});assert.equal(download.status,200);assert.match(download.headers.get("content-disposition"),/^attachment;/);assert.equal(download.headers.get("content-length"),String(pdfBytes.length));assert.match(download.headers.get("content-disposition"),/filename\*=UTF-8/);
const partialPdf=await fetch(base+"/docs/oop-technical-documentation.pdf",{headers:{Range:"bytes=0-1023"}});assert.equal(partialPdf.status,206);assert.equal((await partialPdf.arrayBuffer()).byteLength,1024);
const mainPage=await fetch(base+"/");assert.match(mainPage.headers.get("content-security-policy"),/frame-ancestors \x27none\x27/);
console.log("All 54 PDF preview pages, original file bytes, download headers, ranges and framing policy: passed");
'
printf 'Clean Docker build and tests passed. Logs: %s\n' "$qa_dir"
