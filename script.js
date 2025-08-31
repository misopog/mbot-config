// elements
const stepsEl = document.getElementById('steps');
const emptyStateEl = document.getElementById('emptyState');
const jsonPreview = document.getElementById('jsonPreview');
const configNameEl = document.getElementById('configName');
const configUrlEl = document.getElementById('configUrl');

const addStepBtn = document.getElementById('addStepBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const importFile = document.getElementById('importFile');

const modalBackdrop = document.getElementById('modalBackdrop');
const customCodeArea = document.getElementById('customCodeArea');
const closeModalBtn = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModal');
const saveModalBtn = document.getElementById('saveModal');

let activeCustomStepId = null;

// helpers
function uid() { return 's_' + Math.random().toString(36).slice(2, 9); }
function toBase64(str) {
    const enc = new TextEncoder();
    const bytes = enc.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
function fromBase64(b64) {
    if (!b64) return '';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function renderEmpty() { emptyStateEl.style.display = stepsEl.children.length ? 'none' : 'block'; }

function newStepData() {
    return { id: uid(), xpath: '', type: 'click', valueSource: null, pythonCode: null, customValue: '' };
}

function createStepEl(data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'step';
    wrapper.draggable = true;
    wrapper.dataset.id = data.id || uid();
    wrapper.dataset.pythonCode = data.pythonCode || '';

    wrapper.innerHTML = `
    <div class="drag" title="drag to reorder">≡</div>
    <div>
      <div class="fields">
        <div>
          <label>xpath</label>
          <input type="text" class="inp-xpath" placeholder="//button[@id='submit']"
            value="${escapeHtml(data.xpath || '')}" />
        </div>
        <div>
          <label>type</label>
          <select class="sel-type">
            <option value="click" ${data.type === 'click' ? 'selected' : ''}>click</option>
            <option value="write" ${data.type === 'write' ? 'selected' : ''}>write</option>
          </select>
        </div>
        <div class="write-extra" style="display:${data.type === 'write' ? 'block' : 'none'}">
          <label>value source</label>
          <select class="sel-source">
            <option value="mail" ${data.valueSource === 'mail' ? 'selected' : ''}>mail</option>
            <option value="password" ${data.valueSource === 'password' ? 'selected' : ''}>password</option>
            <option value="phone" ${data.valueSource === 'phone' ? 'selected' : ''}>phone</option>
            <option value="pythonCode" ${data.valueSource === 'pythonCode' ? 'selected' : ''}>python code</option>
            <option value="custom" ${data.valueSource === 'custom' ? 'selected' : ''}>custom</option>
          </select>
        </div>
      </div>
      <div class="step-actions">
        <span class="muted" style="margin-right:auto">id: <code>${data.id}</code></span>
        <input type="text" class="inp-custom" placeholder="enter custom text"
          value="${escapeHtml(data.customValue || '')}"
          style="display:${data.type === 'write' && data.valueSource === 'custom' ? 'inline-block' : 'none'}" />
        <button class="btn-custom"
          style="display:${data.type === 'write' && data.valueSource === 'pythonCode' ? 'inline-flex' : 'none'}">
          edit python code
        </button>
        <button class="btn-remove">delete</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:center">
      <span class="badge">#<span class="ord">0</span></span>
    </div>
  `;

    // refs
    const inpXpath = wrapper.querySelector('.inp-xpath');
    const selType = wrapper.querySelector('.sel-type');
    const writeExtra = wrapper.querySelector('.write-extra');
    const selSource = wrapper.querySelector('.sel-source');
    const inpCustom = wrapper.querySelector('.inp-custom');
    const btnRemove = wrapper.querySelector('.btn-remove');
    const btnCustom = wrapper.querySelector('.btn-custom');

    // events
    inpXpath.addEventListener('input', () => { updateState(); saveToLocal(); });
    inpCustom.addEventListener('input', () => { updateState(); saveToLocal(); });

    selType.addEventListener('change', () => {
        writeExtra.style.display = selType.value === 'write' ? 'block' : 'none';
        btnCustom.style.display = (selType.value === 'write' && selSource.value === 'pythonCode') ? 'inline-flex' : 'none';
        inpCustom.style.display = (selType.value === 'write' && selSource.value === 'custom') ? 'inline-block' : 'none';
        updateState(); saveToLocal();
    });

    if (selSource) selSource.addEventListener('change', () => {
        btnCustom.style.display = (selType.value === 'write' && selSource.value === 'pythonCode') ? 'inline-flex' : 'none';
        inpCustom.style.display = (selType.value === 'write' && selSource.value === 'custom') ? 'inline-block' : 'none';
        updateState(); saveToLocal();
    });

    btnRemove.addEventListener('click', () => {
        wrapper.remove();
        renumber();
        updateState();
        saveToLocal();
        renderEmpty();
    });

    btnCustom.addEventListener('click', () => {
        activeCustomStepId = wrapper.dataset.id;
        customCodeArea.value = fromBase64(wrapper.dataset.pythonCode || '');
        openModal();
    });

    // drag handlers
    wrapper.addEventListener('dragstart', (e) => {
        wrapper.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', wrapper.dataset.id);
    });
    wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
        renumber();
        updateState();
        saveToLocal();
    });

    return wrapper;
}


function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getSteps() {
    const list = [];
    [...stepsEl.children].forEach((el, idx) => {
        const id = el.dataset.id;
        const xpath = el.querySelector('.inp-xpath')?.value.trim() || '';
        const type = el.querySelector('.sel-type')?.value || 'click';
        let valueSource = null;
        let pythonCode = null;
        let customValue = '';
        if (type === 'write') {
            valueSource = el.querySelector('.sel-source')?.value || 'mail';
            if (valueSource === 'pythonCode') pythonCode = el.dataset.pythonCode || null;
            if (valueSource === 'custom') customValue = el.querySelector('.inp-custom')?.value || '';
        }
        list.push({ id, order: idx + 1, xpath, type, valueSource, pythonCode, customValue });
    });
    return list;
}

function renumber() { stepsEl.querySelectorAll('.step .ord').forEach((el, idx) => el.textContent = idx + 1); }

function updateState() {
    const data = { name: configNameEl.value.trim(), url: configUrlEl.value.trim(), steps: getSteps() };
    jsonPreview.textContent = JSON.stringify(data, null, 2);
}

function addStep(prefill) {
    const el = createStepEl(prefill || newStepData());
    stepsEl.appendChild(el);
    renumber(); updateState(); renderEmpty(); saveToLocal();
    const inp = el.querySelector('.inp-xpath'); if (inp) inp.focus();
}

function clearAll() {
    if (confirm('clear all steps?')) {
        stepsEl.innerHTML = '';
        updateState(); renderEmpty(); localStorage.removeItem('misobot_config');
    }
}

function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// dragover: live reorder
stepsEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterEl = getDragAfterElement(stepsEl, e.clientY);
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    if (afterEl == null) stepsEl.appendChild(dragging);
    else stepsEl.insertBefore(dragging, afterEl);
    renumber(); updateState();
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.step:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (const child of draggableElements) {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
    }
    return closest.element;
}

// modal
function openModal() { modalBackdrop.style.display = 'flex'; }
function closeModal() { modalBackdrop.style.display = 'none'; activeCustomStepId = null; }
closeModalBtn.addEventListener('click', closeModal); cancelModalBtn.addEventListener('click', closeModal);
saveModalBtn.addEventListener('click', () => {
    if (!activeCustomStepId) { closeModal(); return; }
    const code = customCodeArea.value || '';
    const b64 = code ? toBase64(code) : '';
    const el = [...stepsEl.children].find(x => x.dataset.id === activeCustomStepId);
    if (el) { el.dataset.pythonCode = b64; }
    updateState(); saveToLocal(); closeModal();
});

// local storage
function saveToLocal() {
    const data = { name: configNameEl.value.trim(), url: configUrlEl.value.trim(), steps: getSteps() };
    try { localStorage.setItem('misobot_config', JSON.stringify(data)); } catch (e) { }
}
function loadFromLocal() {
    try {
        const raw = localStorage.getItem('misobot_config');
        if (!raw) return;
        const obj = JSON.parse(raw);
        loadFromJSON(obj);
    } catch (e) { }
}

function loadFromJSON(obj) {
    let name = ''; let url = ''; let steps = [];
    if (Array.isArray(obj)) steps = obj;
    else if (obj && typeof obj === 'object') {
        name = obj.name || obj.configName || '';
        url = obj.url || obj.targetUrl || '';
        steps = obj.steps || obj;
    }
    stepsEl.innerHTML = '';
    configNameEl.value = name; configUrlEl.value = url;
    (steps || []).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(item => {
        const pre = {
            id: item.id || uid(),
            xpath: item.xpath || '',
            type: item.type === 'write' ? 'write' : 'click',
            valueSource: item.valueSource || (item.type === 'write' ? 'mail' : null),
            pythonCode: item.pythonCode || '',
            customValue: item.customValue || ''
        };
        const el = createStepEl(pre);
        el.dataset.pythonCode = pre.pythonCode || '';
        stepsEl.appendChild(el);
    });
    renumber(); updateState(); renderEmpty(); saveToLocal();
}

// toolbar actions
addStepBtn.addEventListener('click', () => addStep());
downloadBtn.addEventListener('click', () => download('misobot_config.json', JSON.stringify({ name: configNameEl.value.trim(), url: configUrlEl.value.trim(), steps: getSteps() }, null, 2)));
copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(JSON.stringify({ name: configNameEl.value.trim(), url: configUrlEl.value.trim(), steps: getSteps() }, null, 2));
        copyBtn.textContent = 'copied';
        setTimeout(() => copyBtn.textContent = 'copy json', 900);
    } catch (e) { alert('copy failed'); }
});
clearBtn.addEventListener('click', clearAll);

importFile.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        loadFromJSON(parsed);
    } catch (err) {
        alert('invalid json file');
    } finally {
        importFile.value = '';
    }
});

configNameEl.addEventListener('input', () => { updateState(); saveToLocal(); });
configUrlEl.addEventListener('input', () => { updateState(); saveToLocal(); });

(function init() { renderEmpty(); loadFromLocal(); if (!stepsEl.children.length) addStep(); updateState(); })();
