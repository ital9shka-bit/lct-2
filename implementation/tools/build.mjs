import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdir,readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
await import('./build-extended-banks.mjs');
for(const file of await readdir(new URL('../src/',import.meta.url)))if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',fileURLToPath(new URL('../src/'+file,import.meta.url))]);
const clientFiles=(await readdir(new URL('../client/',import.meta.url))).filter(f=>f.endsWith('.js'));
for(const file of clientFiles)execFileSync(process.execPath,['--check',fileURLToPath(new URL('../client/'+file,import.meta.url))]);
const source=new URL('../../prototype-v13/',import.meta.url);
let html=await readFile(new URL('template.html',source),'utf8');
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
html=html.replace('<!-- V13_STYLES -->','<style>'+await readFile(new URL('assessment.css',source),'utf8')+'\n'+await readFile(new URL('../client/app.css',import.meta.url),'utf8')+'</style>');
html=html.replace('<!-- V13_SCRIPT -->','<script src="/candidate-ui.js" defer></script><script src="/opportunities-ui.js" defer></script><script src="/potential-ui.js" defer></script><script src="/assessment-ui.js" defer></script><script src="/talent-ui.js" defer></script><script src="/testing-guide.js" defer></script><script src="/auth-ui.js" defer></script><script src="/app.js" defer></script>');
html=html.replace('Почта и сервер не подключены; можно сразу открыть готовый пример.','Сервер сохраняет данные в PostgreSQL; код отправляется в локальный почтовый ящик.').replace('В демо письмо не отправляется. Код для проверки интерфейса: 123456.','На демостенде письмо сохраняется в Mailpit. Код: 123456.');
html=html.replace(/<title>.*?<\/title>/,'<title>ООП — Объекто-ориентированный поиск</title>');
html=html.replace('</head>','<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="alternate icon" href="/favicon.ico" sizes="16x16 32x32 48x48">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">\n</head>');
// Remove static demo records from pages supplied by the API. Preserve the design shell and forms.
for(const id of ['candidate-dashboard','candidate-vacancies','candidate-applications','candidate-vacancy-detail','candidate-settings','employer-dashboard','employer-search','employer-candidate','employer-invitations','employer-vacancies','employer-applications','demo-validation']){
 const rx=new RegExp('(<section\\b[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(</section>)');html=html.replace(rx,'$1$2');
}
html=html.replace(/<div class="demo-role-switch">[\s\S]*?<\/div>/,'<span id="sessionLabel" class="tiny muted"></span>');
html=html.replace(/<div class="role-box">[\s\S]*?<\/div>/,'');
html=html.replace(/<div class="sidebar-foot">[\s\S]*?<\/div>/,'<div class="sidebar-foot">Объекто-ориентированный поиск<br>Хакатон · вымышленные данные</div>');
html=html.replace(/onclick="resetDemo\(\)"[^>]*>.*?<\/button>/,'onclick="logout()">Выйти</button>');
html=html.replace(/onclick="openDemoGuide\(\)"[^>]*>.*?<\/button>/,'onclick="openDemoGuide()">Сценарий демо</button>');
html=html.replace(/<span class="demo-pill"[^>]*>DEMO v13 · локально<\/span>/,'');
html=html.replace('DEMO v13 · локально','ООП · сервер').replace('ООП · сервер','Хакатон · демо').replace('Данные хранятся в браузере. Сервер, почта и AI не подключены.','Данные хранятся в PostgreSQL.');
await mkdir(new URL('../public/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/index.html',import.meta.url),html);
for(const file of clientFiles)await writeFile(new URL('../public/'+file,import.meta.url),await readFile(new URL('../client/'+file,import.meta.url)));
for(const file of ['favicon.svg','favicon.ico','apple-touch-icon.png'])await copyFile(new URL('../client/assets/'+file,import.meta.url),new URL('../public/'+file,import.meta.url));
await mkdir(new URL('../public/demo/',import.meta.url),{recursive:true});
for(const file of ['index.html','player.css','player.js'])await copyFile(new URL('../client/demo/'+file,import.meta.url),new URL('../public/demo/'+file,import.meta.url));
execFileSync(process.execPath,['--check',fileURLToPath(new URL('../client/demo/player.js',import.meta.url))]);
for(const file of ['oop-demo.mp4','oop-demo-poster.jpg'])await copyFile(new URL('../../docs/media/'+file,import.meta.url),new URL('../public/demo/'+file,import.meta.url));
console.log('Built HTML from prototype-v13; CSS and embedded source assets preserved');
