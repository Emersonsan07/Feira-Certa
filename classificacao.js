/* ==========================================================================
   Feira Certa - Central de Classificação
   - Fila de itens pendentes (sem categoria) com sugestão automática
   - Separar / mesclar grupos de produtos
   - Detector de conflitos e duplicatas
   - Painel de saúde da classificação
   Depende de app.js (groupedProducts, itemOverrides, processData, etc.)
   ========================================================================== */
(function () {
    'use strict';

    const CATEGORIES = [
        'Limpeza', 'Higiene Pessoal', 'Hortifruti - Frutas', 'Hortifruti - Legumes',
        'Açougue', 'Laticínios & Frios', 'Mercearia Básica', 'Bebidas',
        'Doces & Snacks', 'Padaria', 'Utilidades', 'Outros'
    ];
    const IGNORED_KEY = 'feiraCertaClsIgnoredPairs';
    const PENDING_PAGE = 40;

    // ---------- Estado da interface ----------
    let currentTab = 'pending';
    let pendingShown = PENDING_PAGE;
    let expandedGroup = null;
    let groupSearch = '';
    let onlyMulti = true;
    let ignoredPairs = new Set(JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]'));

    // ---------- Utilidades ----------
    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const STOP = new Set(['KG', 'UN', 'UND', 'GR', 'ML', 'LT', 'PCT', 'CX', 'COM', 'SEM', 'PCT']);

    function tokens(s) {
        return norm(s).split(/[^A-Z0-9]+/)
            .filter(t => t.length >= 3 && !/^\d/.test(t) && !STOP.has(t));
    }

    function tokenMatch(x, y) {
        if (x === y) return true;
        return Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x));
    }

    function similarity(a, b) {
        if (!a.length || !b.length) return 0;
        let m = 0;
        for (const x of a) if (b.some(y => tokenMatch(x, y))) m++;
        return m / Math.sqrt(a.length * b.length);
    }

    function colorVar(cat) {
        return `var(--cat-${getColorClassForCategory(cat)})`;
    }

    function persist() {
        localStorage.setItem('feiraCertaOverrides', JSON.stringify(itemOverrides));
    }

    // ---------- Integração com app.js ----------
    // 1) Respeita agrupamentos personalizados (separar / mesclar grupos)
    const autoSimplifiedName = getSimplifiedName;
    getSimplifiedName = function (name) {
        const ov = itemOverrides[name];
        if (ov && ov.customGroup) return ov.customGroup;
        return autoSimplifiedName(name);
    };

    // 2) Atualiza painéis sempre que os dados são reprocessados
    const baseProcessData = processData;
    processData = function () {
        const r = baseProcessData.apply(this, arguments);
        try { onDataChanged(); } catch (e) { console.warn('Classificação:', e); }
        return r;
    };

    // ---------- Modelo de dados ----------
    function buildModel() {
        const groups = Object.keys(groupedProducts).map(name => {
            const origs = {};
            groupedProducts[name].forEach(h => {
                if (h.originalName) origs[h.originalName] = (origs[h.originalName] || 0) + 1;
            });
            const names = Object.keys(origs);
            const ovs = names.map(o => itemOverrides[o] || {});
            const cat = resolveCategory(name);
            const reviewed = ovs.some(v => v.customCategory || v.reviewed);
            const manual = ovs.some(v => v.customCategory || v.customGroup || v.reviewed);

            // Categoria efetiva de cada nome original (para detectar conflitos)
            const effective = new Set(names.map((o, i) => ovs[i].customCategory || getCategory(name)));

            return {
                name, cat, origs, names, reviewed, manual,
                pending: cat === 'Outros' && !reviewed,
                conflict: names.length > 1 && effective.size > 1,
                tokens: tokens(name)
            };
        });

        const pending = groups.filter(g => g.pending);
        const conflicts = groups.filter(g => g.conflict);
        const duplicates = findDuplicates(groups);
        const manual = groups.filter(g => g.manual && !g.pending).length;
        const auto = groups.length - pending.length - manual;

        return { groups, pending, conflicts, duplicates, manual, auto };
    }

    function findDuplicates(groups) {
        const index = {};
        groups.forEach((g, i) => g.tokens.forEach(t => { (index[t] = index[t] || []).push(i); }));
        const seen = new Set();
        const pairs = [];
        Object.values(index).forEach(list => {
            if (list.length > 60) return; // palavra muito genérica
            for (let a = 0; a < list.length; a++) {
                for (let b = a + 1; b < list.length; b++) {
                    const i = list[a], j = list[b];
                    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const A = groups[i], B = groups[j];
                    const s = norm(A.name) === norm(B.name) ? 1 : similarity(A.tokens, B.tokens);
                    if (s < 0.8) continue;
                    const id = [A.name, B.name].sort().join('||');
                    if (ignoredPairs.has(id)) continue;
                    pairs.push({ A, B, score: s, id });
                }
            }
        });
        return pairs.sort((x, y) => y.score - x.score);
    }

    // ---------- Sugestões por similaridade ----------
    function buildReferences(model) {
        const refs = [];
        model.groups.forEach(g => {
            if (g.pending) return;
            g.names.forEach(o => refs.push({ t: tokens(o), cat: g.cat }));
            refs.push({ t: g.tokens, cat: g.cat });
        });
        return refs;
    }

    function suggest(group, refs) {
        const best = {};
        const mine = [tokens(group.name)].concat(group.names.map(tokens));
        mine.forEach(mt => {
            if (!mt.length) return;
            refs.forEach(r => {
                const s = similarity(mt, r.t);
                if (s > (best[r.cat] || 0)) best[r.cat] = s;
            });
        });
        const list = Object.entries(best)
            .filter(([cat, s]) => s >= 0.34 && cat !== 'Outros')
            .sort((a, b) => b[1] - a[1]);
        if (!list.length) return [];
        const top = list[0][1];
        const second = list[1] ? list[1][1] : 0;
        return list.slice(0, 2).map(([cat, s], i) => {
            const conf = i === 0 ? s * (top / (top + second * 0.6)) : s * 0.6;
            return { cat, conf: Math.min(0.99, conf) };
        });
    }

    // ---------- Ações ----------
    function ensureOv(orig) {
        if (!itemOverrides[orig]) itemOverrides[orig] = {};
        return itemOverrides[orig];
    }

    function setCategory(group, cat) {
        group.names.forEach(o => {
            const ov = ensureOv(o);
            ov.customCategory = cat;
            ov.reviewed = true;
        });
    }

    function commit(msg) {
        persist();
        processData(marketData, true);
        if (typeof updateCartUI === 'function') updateCartUI();
        if (msg && typeof setStatus === 'function') setStatus(msg);
        renderModal();
    }

    function moveOriginals(originals, targetRaw, fallbackCat) {
        let target = (targetRaw || '').trim();
        if (!target || !originals.length) return false;

        // Reaproveita um grupo existente (ignorando maiúsculas/acentos)
        const existing = Object.keys(groupedProducts).find(n => norm(n) === norm(target));
        if (existing) target = existing;
        const cat = existing ? resolveCategory(existing) : fallbackCat;

        originals.forEach(o => {
            const ov = ensureOv(o);
            if (autoSimplifiedName(o) === target) delete ov.customGroup;
            else ov.customGroup = target;
            ov.customCategory = cat;
            ov.reviewed = true;
        });
        return true;
    }

    // ---------- Painel de saúde ----------
    function healthHtml(model, compact) {
        const total = model.groups.length;
        if (!total) return '';
        const done = total - model.pending.length;
        const pct = Math.round((done / total) * 100);
        const msg = model.pending.length === 0
            ? '🎉 Tudo classificado!'
            : `${model.pending.length} ${model.pending.length === 1 ? 'item aguarda' : 'itens aguardam'} classificação`;
        return `
            <div class="cls-health ${compact ? 'compact' : ''}">
                <div class="cls-health-top">
                    <div><span class="cls-health-pct">${pct}%</span> <span class="cls-health-msg">${msg}</span></div>
                </div>
                <div class="cls-bar"><div class="cls-bar-fill" style="width:${pct}%"></div></div>
                <div class="cls-health-chips">
                    <span class="cls-chip ok" title="Classificados por regra automática"><i class="ph ph-magic-wand"></i> ${model.auto} automáticos</span>
                    <span class="cls-chip man" title="Ajustados por você"><i class="ph ph-hand-pointing"></i> ${model.manual} manuais</span>
                    <span class="cls-chip ${model.pending.length ? 'warn' : 'ok'}"><i class="ph ph-question"></i> ${model.pending.length} pendentes</span>
                    <span class="cls-chip ${model.conflicts.length ? 'warn' : 'ok'}"><i class="ph ph-warning"></i> ${model.conflicts.length} conflitos</span>
                    <span class="cls-chip ${model.duplicates.length ? 'warn' : 'ok'}"><i class="ph ph-copy"></i> ${model.duplicates.length} duplicatas</span>
                </div>
            </div>`;
    }

    function onDataChanged() {
        const model = buildModel();
        updateDashboardCard(model);
        updateMenuBadge(model);
        const modal = document.getElementById('classificacaoModal');
        if (modal && modal.classList.contains('active')) renderModal(model);
    }

    function updateDashboardCard(model) {
        const stats = document.querySelector('#dashboardView .stats-grid');
        if (!stats) return;
        let card = document.getElementById('clsHealthCard');
        if (!card) {
            card = document.createElement('section');
            card.id = 'clsHealthCard';
            card.className = 'cls-dash-card';
            stats.insertAdjacentElement('afterend', card);
        }
        if (!model.groups.length) { card.style.display = 'none'; return; }
        card.style.display = '';
        card.innerHTML = `
            <div class="cls-dash-head">
                <h3><i class="ph ph-tag"></i> Saúde da Classificação</h3>
                <button class="cls-btn primary" id="clsOpenFromDash"><i class="ph ph-sliders-horizontal"></i> Organizar</button>
            </div>
            ${healthHtml(model, true)}`;
        card.querySelector('#clsOpenFromDash').addEventListener('click', () => openModal());
    }

    function updateMenuBadge(model) {
        const badge = document.getElementById('clsMenuCount');
        if (badge) badge.textContent = model.pending.length + model.conflicts.length + model.duplicates.length;
    }

    // ---------- Modal ----------
    function createModal() {
        if (document.getElementById('classificacaoModal')) return;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'classificacaoModal';
        modal.innerHTML = `
            <div class="modal-content cls-modal">
                <button class="close-modal" id="closeClassificacaoModal"><i class="ph ph-x"></i></button>
                <h2><i class="ph ph-tag"></i> Central de Classificação</h2>
                <div id="clsHealthHost"></div>
                <div class="cls-tabs" id="clsTabs">
                    <button data-tab="pending" class="active">Pendentes <b id="clsTabPending">0</b></button>
                    <button data-tab="issues">Conflitos e duplicatas <b id="clsTabIssues">0</b></button>
                    <button data-tab="groups">Grupos</button>
                </div>
                <div class="cls-body" id="clsBody"></div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        modal.querySelector('#closeClassificacaoModal').addEventListener('click', closeModal);
        modal.querySelector('#clsTabs').addEventListener('click', e => {
            const b = e.target.closest('button[data-tab]');
            if (!b) return;
            currentTab = b.dataset.tab;
            renderModal();
        });
        modal.querySelector('#clsBody').addEventListener('click', onBodyClick);
        modal.querySelector('#clsBody').addEventListener('change', onBodyChange);
        modal.querySelector('#clsBody').addEventListener('input', onBodyInput);
    }

    function openModal() {
        createModal();
        document.getElementById('classificacaoModal').classList.add('active');
        renderModal();
    }

    function closeModal() {
        const m = document.getElementById('classificacaoModal');
        if (m) m.classList.remove('active');
    }

    function renderModal(passedModel) {
        const modal = document.getElementById('classificacaoModal');
        if (!modal) return;
        const model = passedModel || buildModel();
        const body = modal.querySelector('#clsBody');
        const scroll = body.scrollTop;

        modal.querySelector('#clsHealthHost').innerHTML = healthHtml(model, false);
        modal.querySelector('#clsTabPending').textContent = model.pending.length;
        modal.querySelector('#clsTabIssues').textContent = model.conflicts.length + model.duplicates.length;
        modal.querySelectorAll('#clsTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));

        // Não recria o campo de busca enquanto o usuário digita
        if (currentTab === 'groups') {
            renderGroupsTab(body, model);
        } else {
            body.innerHTML = currentTab === 'pending' ? pendingHtml(model) : issuesHtml(model);
        }
        body.scrollTop = scroll;
    }

    // ---------- Aba: Pendentes ----------
    function catOptions(selected) {
        return CATEGORIES.map(c => `<option value="${esc(c)}"${c === selected ? ' selected' : ''}>${esc(c)}</option>`).join('');
    }

    function pendingHtml(model) {
        if (!model.pending.length) {
            return `<div class="cls-empty"><i class="ph ph-seal-check"></i><p>Nenhum item pendente. Tudo classificado!</p></div>`;
        }
        const refs = buildReferences(model);
        const items = model.pending
            .map(g => ({ g, sugs: suggest(g, refs) }))
            .sort((a, b) => (b.sugs[0] ? b.sugs[0].conf : 0) - (a.sugs[0] ? a.sugs[0].conf : 0));

        const confident = items.filter(i => i.sugs[0] && i.sugs[0].conf >= 0.7).length;
        const shown = items.slice(0, pendingShown);

        const bulk = confident
            ? `<button class="cls-btn primary" data-action="accept-all"><i class="ph ph-magic-wand"></i> Aceitar ${confident} sugest${confident === 1 ? 'ão' : 'ões'} com alta confiança (≥70%)</button>`
            : '';

        const cards = shown.map(({ g, sugs }) => {
            const examples = g.names.slice(0, 3).map(esc).join(' · ') + (g.names.length > 3 ? ` · +${g.names.length - 3}` : '');
            const sugHtml = sugs.length
                ? sugs.map((s, i) => `
                    <button class="cls-sug ${i === 0 ? 'main' : ''}" style="--c:${colorVar(s.cat)}"
                        data-action="apply" data-cat="${esc(s.cat)}">
                        <i class="ph ph-lightbulb"></i> ${esc(s.cat)} <em>${Math.round(s.conf * 100)}%</em>
                    </button>`).join('')
                : '<span class="cls-nosug">Sem sugestão: nenhum item parecido classificado ainda</span>';
            return `
                <div class="cls-card" data-g="${esc(g.name)}">
                    <div class="cls-card-head">
                        <strong>${esc(g.name)}</strong>
                        <span class="cls-sub">${g.names.length} ${g.names.length === 1 ? 'nome' : 'nomes'} · ${groupedProducts[g.name].length} compras</span>
                    </div>
                    <div class="cls-origs">${examples}</div>
                    <div class="cls-sugs">${sugHtml}</div>
                    <div class="cls-actions">
                        <select class="cls-select" data-action="pick">
                            <option value="">Escolher outra categoria…</option>
                            ${catOptions('')}
                        </select>
                        <button class="cls-btn ghost" data-action="keep" title="Confirmar que este item pertence mesmo a Outros">Manter em Outros</button>
                    </div>
                </div>`;
        }).join('');

        const more = items.length > shown.length
            ? `<button class="cls-btn ghost w-100" data-action="more">Mostrar mais (${items.length - shown.length})</button>` : '';

        return `<div class="cls-toolbar">${bulk}</div>${cards}${more}`;
    }

    // ---------- Aba: Conflitos e duplicatas ----------
    function issuesHtml(model) {
        if (!model.conflicts.length && !model.duplicates.length) {
            return `<div class="cls-empty"><i class="ph ph-seal-check"></i><p>Nenhum conflito ou duplicata encontrado.</p></div>`;
        }
        let html = '';

        if (model.conflicts.length) {
            html += `<h4 class="cls-section"><i class="ph ph-warning"></i> Conflitos de categoria</h4>
                     <p class="cls-hint">Nomes do mesmo grupo estão em categorias diferentes. Escolha a correta para unificar.</p>`;
            html += model.conflicts.map(g => {
                const rows = g.names.map(o => {
                    const ov = itemOverrides[o] || {};
                    const c = ov.customCategory || getCategory(g.name);
                    return `<li>${esc(o)} <span class="cls-pill" style="--c:${colorVar(c)}">${esc(c)}</span></li>`;
                }).join('');
                const cats = [...new Set(g.names.map(o => (itemOverrides[o] || {}).customCategory || getCategory(g.name)))];
                return `
                    <div class="cls-card" data-g="${esc(g.name)}">
                        <div class="cls-card-head"><strong>${esc(g.name)}</strong></div>
                        <ul class="cls-list">${rows}</ul>
                        <div class="cls-sugs">
                            ${cats.map(c => `<button class="cls-sug" style="--c:${colorVar(c)}" data-action="apply" data-cat="${esc(c)}">Unificar em ${esc(c)}</button>`).join('')}
                        </div>
                    </div>`;
            }).join('');
        }

        if (model.duplicates.length) {
            html += `<h4 class="cls-section"><i class="ph ph-copy"></i> Possíveis duplicatas</h4>
                     <p class="cls-hint">Grupos com nomes muito parecidos. Mescle se forem o mesmo produto.</p>`;
            html += model.duplicates.slice(0, 40).map(p => `
                <div class="cls-card" data-a="${esc(p.A.name)}" data-b="${esc(p.B.name)}" data-id="${esc(p.id)}">
                    <div class="cls-pair">
                        <div><strong>${esc(p.A.name)}</strong><span class="cls-pill" style="--c:${colorVar(p.A.cat)}">${esc(p.A.cat)}</span></div>
                        <i class="ph ph-arrows-left-right"></i>
                        <div><strong>${esc(p.B.name)}</strong><span class="cls-pill" style="--c:${colorVar(p.B.cat)}">${esc(p.B.cat)}</span></div>
                    </div>
                    <div class="cls-actions">
                        <button class="cls-btn primary" data-action="merge-into-a">Mesclar em «${esc(p.A.name)}»</button>
                        <button class="cls-btn primary" data-action="merge-into-b">Mesclar em «${esc(p.B.name)}»</button>
                        <button class="cls-btn ghost" data-action="ignore-pair">São diferentes</button>
                    </div>
                </div>`).join('');
        }
        return html;
    }

    // ---------- Aba: Grupos (separar / mesclar) ----------
    function renderGroupsTab(body, model) {
        let host = body.querySelector('#clsGroupsHost');
        if (!host) {
            body.innerHTML = `
                <p class="cls-hint">Abra um grupo para <b>separar</b> nomes em outro grupo (novo ou existente) ou <b>mesclar</b> tudo em outro.</p>
                <div class="cls-toolbar">
                    <input type="search" id="clsGroupSearch" class="cls-input" placeholder="Buscar grupo…" value="${esc(groupSearch)}">
                    <label class="cls-check"><input type="checkbox" id="clsOnlyMulti" ${onlyMulti ? 'checked' : ''}> Só grupos com vários nomes</label>
                </div>
                <datalist id="clsGroupNames"></datalist>
                <div id="clsGroupsHost"></div>`;
            host = body.querySelector('#clsGroupsHost');
        }
        body.querySelector('#clsGroupNames').innerHTML =
            model.groups.map(g => `<option value="${esc(g.name)}"></option>`).join('');

        const q = norm(groupSearch);
        let list = model.groups.filter(g => (!q || norm(g.name).includes(q) || g.names.some(o => norm(o).includes(q))));
        if (onlyMulti && !q) list = list.filter(g => g.names.length > 1);
        list.sort((a, b) => b.names.length - a.names.length || a.name.localeCompare(b.name));

        if (!list.length) {
            host.innerHTML = `<div class="cls-empty"><i class="ph ph-magnifying-glass"></i><p>Nenhum grupo encontrado.</p></div>`;
            return;
        }

        host.innerHTML = list.slice(0, 60).map(g => {
            const open = expandedGroup === g.name;
            const inner = open ? `
                <ul class="cls-list selectable">
                    ${g.names.map(o => `
                        <li><label><input type="checkbox" class="cls-orig" value="${esc(o)}"> <span>${esc(o)}</span>
                        <em>${g.origs[o]}×</em>${(itemOverrides[o] || {}).customGroup ? '<span class="cls-tag">manual</span>' : ''}</label></li>`).join('')}
                </ul>
                <div class="cls-move">
                    <input class="cls-input" list="clsGroupNames" id="clsTarget" placeholder="Mover selecionados para o grupo… (digite um novo nome ou escolha existente)">
                    <button class="cls-btn primary" data-action="move-selected"><i class="ph ph-arrows-split"></i> Separar / Mover</button>
                </div>
                <div class="cls-actions">
                    <button class="cls-btn ghost" data-action="select-all">Selecionar todos</button>
                    <button class="cls-btn ghost" data-action="merge-all"><i class="ph ph-git-merge"></i> Mesclar grupo inteiro no destino</button>
                    <button class="cls-btn ghost" data-action="reset-auto"><i class="ph ph-arrow-counter-clockwise"></i> Voltar ao agrupamento automático</button>
                </div>` : '';
            return `
                <div class="cls-group ${open ? 'open' : ''}" data-g="${esc(g.name)}">
                    <button class="cls-group-head" data-action="toggle">
                        <span class="cls-pill" style="--c:${colorVar(g.cat)}">${esc(g.cat)}</span>
                        <strong>${esc(g.name)}</strong>
                        <span class="cls-sub">${g.names.length} ${g.names.length === 1 ? 'nome' : 'nomes'}</span>
                        <i class="ph ph-caret-${open ? 'up' : 'down'}"></i>
                    </button>
                    ${inner}
                </div>`;
        }).join('') + (list.length > 60 ? `<p class="cls-hint">Mostrando 60 de ${list.length}. Use a busca para refinar.</p>` : '');
    }

    // ---------- Eventos do corpo do modal ----------
    function findGroup(name) {
        return buildModel().groups.find(g => g.name === name);
    }

    function onBodyInput(e) {
        if (e.target.id === 'clsGroupSearch') {
            groupSearch = e.target.value;
            renderGroupsTab(document.getElementById('clsBody'), buildModel());
        }
    }

    function onBodyChange(e) {
        const t = e.target;
        if (t.id === 'clsOnlyMulti') {
            onlyMulti = t.checked;
            renderModal();
            return;
        }
        if (t.dataset.action === 'pick' && t.value) {
            const card = t.closest('.cls-card');
            const g = findGroup(card.dataset.g);
            if (!g) return;
            setCategory(g, t.value);
            leave(card, () => commit(`"${g.name}" classificado como ${t.value}.`));
        }
    }

    function leave(card, fn) {
        card.classList.add('leaving');
        setTimeout(fn, 220);
    }

    function onBodyClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.tagName === 'SELECT') return;
        const action = btn.dataset.action;
        const card = btn.closest('.cls-card');
        const groupEl = btn.closest('.cls-group');

        switch (action) {
            case 'apply': {
                const g = findGroup(card.dataset.g);
                if (!g) return;
                setCategory(g, btn.dataset.cat);
                leave(card, () => commit(`"${g.name}" → ${btn.dataset.cat}`));
                break;
            }
            case 'keep': {
                const g = findGroup(card.dataset.g);
                if (!g) return;
                setCategory(g, 'Outros');
                leave(card, () => commit(`"${g.name}" mantido em Outros.`));
                break;
            }
            case 'more':
                pendingShown += PENDING_PAGE;
                renderModal();
                break;
            case 'accept-all': {
                const model = buildModel();
                const refs = buildReferences(model);
                let n = 0;
                model.pending.forEach(g => {
                    const s = suggest(g, refs)[0];
                    if (s && s.conf >= 0.7) { setCategory(g, s.cat); n++; }
                });
                commit(`${n} sugest${n === 1 ? 'ão aplicada' : 'ões aplicadas'}.`);
                break;
            }
            case 'merge-into-a':
            case 'merge-into-b': {
                const a = findGroup(card.dataset.a), b = findGroup(card.dataset.b);
                if (!a || !b) return;
                const [dest, src] = action === 'merge-into-a' ? [a, b] : [b, a];
                moveOriginals(src.names, dest.name, dest.cat);
                leave(card, () => commit(`"${src.name}" mesclado em "${dest.name}".`));
                break;
            }
            case 'ignore-pair':
                ignoredPairs.add(card.dataset.id);
                localStorage.setItem(IGNORED_KEY, JSON.stringify([...ignoredPairs]));
                leave(card, () => { processData(marketData, true); });
                break;
            case 'toggle':
                expandedGroup = expandedGroup === groupEl.dataset.g ? null : groupEl.dataset.g;
                renderGroupsTab(document.getElementById('clsBody'), buildModel());
                break;
            case 'select-all':
                groupEl.querySelectorAll('.cls-orig').forEach(c => { c.checked = true; });
                break;
            case 'move-selected':
            case 'merge-all': {
                const g = findGroup(groupEl.dataset.g);
                const target = groupEl.querySelector('#clsTarget').value;
                if (!g) return;
                if (!target.trim()) { setStatus('Informe o grupo de destino.', true); return; }
                const picked = action === 'merge-all'
                    ? g.names
                    : [...groupEl.querySelectorAll('.cls-orig:checked')].map(c => c.value);
                if (!picked.length) { setStatus('Selecione ao menos um nome.', true); return; }
                moveOriginals(picked, target, g.cat);
                expandedGroup = null;
                commit(`${picked.length} ${picked.length === 1 ? 'nome movido' : 'nomes movidos'} para "${target.trim()}".`);
                break;
            }
            case 'reset-auto': {
                const g = findGroup(groupEl.dataset.g);
                if (!g) return;
                const picked = [...groupEl.querySelectorAll('.cls-orig:checked')].map(c => c.value);
                (picked.length ? picked : g.names).forEach(o => {
                    if (itemOverrides[o]) { delete itemOverrides[o].customGroup; delete itemOverrides[o].customCategory; delete itemOverrides[o].reviewed; }
                });
                expandedGroup = null;
                commit('Agrupamento automático restaurado.');
                break;
            }
        }
    }

    // ---------- Inicialização ----------
    function init() {
        createModal();

        const cfg = document.getElementById('configGroup');
        if (cfg && !document.getElementById('classificacaoBtn')) {
            const a = document.createElement('a');
            a.href = '#';
            a.id = 'classificacaoBtn';
            a.innerHTML = '<i class="ph ph-tag"></i> Classificação (<span id="clsMenuCount">0</span>)';
            a.addEventListener('click', e => {
                e.preventDefault();
                cfg.classList.remove('open');
                openModal();
            });
            cfg.insertBefore(a, cfg.firstChild);
        }
        if (Object.keys(groupedProducts).length) onDataChanged();
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    window.openClassificacao = openModal;
    init();
})();
