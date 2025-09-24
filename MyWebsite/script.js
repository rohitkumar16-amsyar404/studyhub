// Utilities
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

// Tabs
const tabTeacher = qs('#tab-teacher');
const tabStudent = qs('#tab-student');
const panelTeacher = qs('#panel-teacher');
const panelStudent = qs('#panel-student');

function switchTab(target){
  if(target === 'teacher'){
    tabTeacher.classList.add('active');
    tabTeacher.setAttribute('aria-selected','true');
    tabStudent.classList.remove('active');
    tabStudent.setAttribute('aria-selected','false');
    panelTeacher.classList.remove('hidden');
    panelStudent.classList.add('hidden');
  } else {
    tabStudent.classList.add('active');
    tabStudent.setAttribute('aria-selected','true');
    tabTeacher.classList.remove('active');
    tabTeacher.setAttribute('aria-selected','false');
    panelStudent.classList.remove('hidden');
    panelTeacher.classList.add('hidden');
  }
}

tabTeacher.addEventListener('click', ()=> switchTab('teacher'));
tabStudent.addEventListener('click', ()=> switchTab('student'));

// Elements
const statusMsg = qs('#statusMsg');
const fileInput = qs('#fileInput');
const dropZone = qs('#dropZone');
const fileList = qs('#fileList');
const textInput = qs('#textInput');
const noteTitle = qs('#noteTitle');
const preview = qs('#preview');
const btnGenerate = qs('#btnGenerate');
const materialsList = qs('#materialsList');

// Modals
const quizModal = qs('#quizModal');
const quizTitle = qs('#quizTitle');
const quizContainer = qs('#quizContainer');
const submitQuizBtn = qs('#submitQuiz');
const mapModal = qs('#mapModal');
const mapTitle = qs('#mapTitle');
const mapContainer = qs('#mapContainer');

// Storage keys
const STORAGE_KEY = 'materials_v1';

// Load existing materials
let materials = loadMaterials();
renderMaterialsList();

function loadMaterials(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.warn('Failed to load materials', e);
    return [];
  }
}
function saveMaterials(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
}

// Dropzone and file list UI
function updateFileListUI(){
  const files = Array.from(fileInput.files || []);
  fileList.innerHTML = '';
  files.forEach(f => {
    const li = document.createElement('li');
    li.textContent = `${f.name} (${Math.round(f.size/1024)} KB)`;
    fileList.appendChild(li);
  });
}

fileInput.addEventListener('change', updateFileListUI);

['dragenter','dragover'].forEach(evt => {
  dropZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });
});
['dragleave','drop'].forEach(evt => {
  dropZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    e.stopPropagation();
    if(evt==='drop'){
      const dt = e.dataTransfer;
      if(dt && dt.files && dt.files.length){
        // Merge with existing FileList by creating a new DataTransfer
        const dataTransfer = new DataTransfer();
        Array.from(fileInput.files || []).forEach(f => dataTransfer.items.add(f));
        Array.from(dt.files).forEach(f => dataTransfer.items.add(f));
        fileInput.files = dataTransfer.files;
        updateFileListUI();
      }
    }
    dropZone.classList.remove('dragover');
  });
});

// PDF text extraction using pdf.js
async function extractTextFromPdf(file){
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for(let pageNum=1; pageNum<=pdf.numPages; pageNum++){
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map(i => i.str).join(' ');
    text += '\n' + pageText;
  }
  return text;
}

async function readFilesAsText(files){
  const outputs = [];
  for(const file of files){
    if(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')){
      outputs.push(await extractTextFromPdf(file));
    } else {
      outputs.push(await file.text());
    }
  }
  return outputs.join('\n');
}

// Simple NLP-ish helpers
function cleanText(text){
  return text.replace(/\s+/g,' ').replace(/[^\w\s\.,;:!\?\-\(\)]/g,' ').trim();
}

function splitSentences(text){
  return text.split(/(?<=[\.!?])\s+/).map(s=>s.trim()).filter(Boolean);
}

function extractKeyPhrases(text, limit=12){
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9\-']+/g) || [];
  const stop = new Set(['the','a','an','in','on','and','or','of','to','is','are','was','were','be','as','for','with','that','by','from','at','this','it','its','their','there','which','we','you','they','he','she','but','about','into','than','then','so','such','can','could','may','might','must','should','have','has','had','not','no','yes','if','when','where','who','whom','what','why','how']);
  const freq = new Map();
  for(const w of words){
    if(stop.has(w) || w.length < 3) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0, limit).map(([w])=>w);
}

function generateQuizFromText(text, count=5){
  const sentences = splitSentences(text);
  const phrases = extractKeyPhrases(text, 20);
  const questions = [];
  for(let i=0;i<Math.min(count, phrases.length);i++){
    const key = phrases[i];
    const s = sentences.find(st => st.toLowerCase().includes(key));
    const questionStem = s ? s.replace(new RegExp(key, 'i'), '_____') : `What best describes: ${key}?`;
    const correct = s ? key : key;
    const distractors = phrases.filter(p => p !== key).slice(i, i+3);
    const options = shuffle([correct, ...distractors]).slice(0,4);
    questions.push({ id: `q${i+1}`, question: questionStem, options, answer: correct });
  }
  return questions;
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// Simple radial mind map layout
function generateMindMapData(text, maxNodes=12){
  const center = (noteTitle.value || extractTitle(text) || 'Notes').slice(0,80);
  const topics = extractKeyPhrases(text, maxNodes);
  return { center, topics };
}

function extractTitle(text){
  const firstLine = text.trim().split(/\n/)[0];
  if(firstLine && firstLine.length < 100) return firstLine;
  return null;
}

function renderMindMapSvg(mapData){
  const width = 1000, height = 520;
  const cx = width/2, cy = height/2;
  const r = 170;
  const nodes = mapData.topics.map((t, idx) => {
    const angle = (idx / mapData.topics.length) * Math.PI * 2 - Math.PI/2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { label: t, x, y };
  });

  const svgParts = [];
  svgParts.push(`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`);
  // Links
  for(const n of nodes){
    svgParts.push(`<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" stroke="#243055" stroke-width="2"/>`);
  }
  // Center node
  svgParts.push(`<circle cx="${cx}" cy="${cy}" r="60" fill="#4f46e5" />`);
  svgParts.push(`<text x="${cx}" y="${cy}" fill="white" font-size="16" text-anchor="middle" dominant-baseline="middle">${escapeXml(mapData.center)}</text>`);
  // Topic nodes
  for(const n of nodes){
    svgParts.push(`<g>`);
    svgParts.push(`<circle cx="${n.x}" cy="${n.y}" r="34" fill="#111a2e" stroke="#243055" stroke-width="2"/>`);
    svgParts.push(`<text x="${n.x}" y="${n.y}" fill="#eef2ff" font-size="12" text-anchor="middle" dominant-baseline="middle">${escapeXml(n.label)}</text>`);
    svgParts.push(`</g>`);
  }
  svgParts.push(`</svg>`);
  return svgParts.join('');
}

function escapeXml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&apos;'}[c]));
}

// Generate flow
btnGenerate.addEventListener('click', async () => {
  try{
    statusMsg.textContent = 'Reading input...';
    let combinedText = '';
    const files = Array.from(fileInput.files || []);
    if(files.length){
      combinedText += await readFilesAsText(files);
    }
    if(textInput.value.trim()){
      combinedText += '\n' + textInput.value.trim();
    }
    combinedText = cleanText(combinedText);

    if(!combinedText){
      statusMsg.textContent = 'Please upload a PDF/TXT or paste some text.';
      return;
    }

    statusMsg.textContent = 'Generating quiz and mind map...';
    const questions = generateQuizFromText(combinedText, 6);
    const mapData = generateMindMapData(combinedText, 12);

    const material = {
      id: 'm_' + Date.now(),
      title: (noteTitle.value || mapData.center || 'Notes').trim(),
      createdAt: new Date().toISOString(),
      questions,
      mapData,
      tags: extractKeyPhrases(combinedText, 6)
    };
    materials.unshift(material);
    saveMaterials();
    renderMaterialsList();
    renderPreview(material);

    statusMsg.textContent = 'Generated successfully.';
    noteTitle.value='';
    textInput.value='';
    fileInput.value='';
    switchTab('student');
  }catch(e){
    console.error(e);
    statusMsg.textContent = 'Error: ' + e.message;
  }
});

function renderPreview(material){
  preview.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'muted';
  title.textContent = material.title;
  const chips = document.createElement('div');
  chips.className = 'row';
  material.tags.forEach(t => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = t;
    chips.appendChild(c);
  });
  preview.appendChild(title);
  preview.appendChild(chips);
}

function renderMaterialsList(){
  materialsList.innerHTML = '';
  if(!materials.length){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No materials yet. Generate some from the Teacher tab.';
    materialsList.appendChild(empty);
    return;
  }
  for(const m of materials){
    const card = document.createElement('div');
    card.className = 'material';
    const h4 = document.createElement('h4');
    h4.textContent = m.title;
    const meta = document.createElement('div');
    meta.className = 'row';
    (m.tags || []).forEach(t=>{
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = t;
      meta.appendChild(chip);
    });
    const actions = document.createElement('div');
    actions.className = 'row';
    const quizBtn = document.createElement('button');
    quizBtn.className = 'primary';
    quizBtn.textContent = 'Take Quiz';
    quizBtn.addEventListener('click', ()=> openQuiz(m));
    const mapBtn = document.createElement('button');
    mapBtn.className = 'secondary';
    mapBtn.textContent = 'View Mind Map';
    mapBtn.addEventListener('click', ()=> openMap(m));

    actions.appendChild(quizBtn);
    actions.appendChild(mapBtn);

    card.appendChild(h4);
    card.appendChild(meta);
    card.appendChild(actions);

    materialsList.appendChild(card);
  }
}

function openQuiz(material){
  quizTitle.textContent = 'Quiz — ' + material.title;
  quizContainer.innerHTML = '';
  material.questions.forEach((q, idx) => {
    const block = document.createElement('div');
    block.className = 'q';
    const p = document.createElement('p');
    p.textContent = `${idx+1}. ${q.question}`;
    block.appendChild(p);
    const opts = document.createElement('div');
    for(const opt of q.options){
      const id = `${material.id}_${q.id}_${opt}`;
      const label = document.createElement('label');
      label.style.display = 'block';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${material.id}_${q.id}`;
      input.value = opt;
      input.id = id;
      const span = document.createElement('span');
      span.textContent = ' ' + opt;
      label.appendChild(input);
      label.appendChild(span);
      opts.appendChild(label);
    }
    block.appendChild(opts);
    quizContainer.appendChild(block);
  });
  if(typeof quizModal.showModal === 'function') quizModal.showModal();

  submitQuizBtn.onclick = () => {
    let correct = 0;
    material.questions.forEach(q => {
      const selected = qs(`input[name="${material.id}_${q.id}"]:checked`);
      if(selected && selected.value === q.answer) correct++;
    });
    const score = `${correct}/${material.questions.length}`;
    alert('Your score: ' + score);
  };
}

function openMap(material){
  mapTitle.textContent = 'Mind Map — ' + material.title;
  mapContainer.innerHTML = renderMindMapSvg(material.mapData);
  if(typeof mapModal.showModal === 'function') mapModal.showModal();
}


