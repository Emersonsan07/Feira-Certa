let marketData = [];
let groupedProducts = {};
let currentChart = null;

// Notas fiscais com mais de este número de meses serão ignoradas nos cálculos
// de frequência e ciclo de consumo (mas mantidas no histórico de preços).
const DATA_CUTOFF_MONTHS = 5;

// Helper: Cor por Categoria
function getColorClassForCategory(cat) {
    if (!cat) return 'outros';
    const c = cat.toLowerCase();
    if (c.includes('hortifruti')) return 'hortifruti';
    if (c.includes('açougue') || c.includes('acougue') || c.includes('carne')) return 'acougue';
    if (c.includes('limpeza')) return 'limpeza';
    if (c.includes('higiene')) return 'higiene';
    if (c.includes('laticínios') || c.includes('laticinios') || c.includes('frio')) return 'laticinios';
    if (c.includes('mercearia')) return 'mercearia';
    if (c.includes('bebida')) return 'bebidas';
    if (c.includes('doce') || c.includes('snack')) return 'doces';
    if (c.includes('padaria')) return 'padaria';
    if (c.includes('utilidad') || c.includes('pet')) return 'utilidades';
    return 'outros';
}

// Cart State
// Structure: { "ProductName": { price: 10.50, qty: 1 } }
let shoppingCart = {};
let activeCategory = 'Todas';
let itemOverrides = JSON.parse(localStorage.getItem('feiraCertaOverrides')) || {};
let excludedItems = JSON.parse(localStorage.getItem('feiraCertaExcludedItems')) || [];

const productsGrid = document.getElementById('productsGrid');
const searchInput = document.getElementById('searchInput');
const statusMessage = document.getElementById('statusMessage');
const searchBarWrapper = document.getElementById('searchBarWrapper');

document.addEventListener('DOMContentLoaded', () => {
    // Attempt to load CSV automatically
    loadCSVFile('resultado_feira.csv');

    // Setup input file listener
    const fileInput = document.getElementById('fileInput');
    const importBtn = document.getElementById('importBtn');

    if (importBtn) {
        importBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
    }

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                delimiter: ";",
                complete: function (results) {
                    const isFirstLoad = marketData.length === 0;
                    processData(results.data, isFirstLoad);
                    setStatus(`✅ Arquivo "${file.name}" carregado com sucesso.`);
                    fileInput.value = '';
                }
            });
        }
    });

    searchInput.addEventListener('input', () => {
        renderProducts(searchInput.value);
    });

    document.getElementById('closeModal').addEventListener('click', closeModal);

    const closeEditModalBtn = document.getElementById('closeEditModal');
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => {
            document.getElementById('editModal').classList.remove('active');
        });
    }

    // Back to Top Button Logic
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            // Fechar o carrinho tbm, caso o usuário chame isso de "recolher o menu"
            const cartModal = document.getElementById('cartModal');
            if (cartModal && cartModal.classList.contains('active')) {
                cartModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Backup/Restore Configs Events
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    const importBackupBtn = document.getElementById('importBackupBtn');
    const backupFile = document.getElementById('backupFileInput');

    // Dropdown Toggles (Configurações)
    const mobileConfigBtn = document.getElementById('mobileConfigBtn');
    const configGroup = document.getElementById('configGroup');
    if (mobileConfigBtn && configGroup) {
        mobileConfigBtn.addEventListener('click', (e) => {
            e.preventDefault();
            configGroup.classList.toggle('open');
        });

        // Esconder menu se clicar fora (no celular)
        document.addEventListener('click', (e) => {
            if (!mobileConfigBtn.contains(e.target) && !configGroup.contains(e.target)) {
                configGroup.classList.remove('open');
            }
        });
    }

    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const dataStr = localStorage.getItem('feiraCertaOverrides');
            if (!dataStr || dataStr === '{}') {
                setStatus("Não há nomes ou categorias personalizadas para fazer backup.", true);
                return;
            }
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `feira_certa_backup_nomes_${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setStatus("Backup das edições baixado com sucesso!");
        });
    }

    if (importBackupBtn) {
        importBackupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            backupFile.click();
        });
    }

    if (backupFile) {
        backupFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const jsonObj = JSON.parse(evt.target.result);
                        // Mesclar edicoes pra não perder as do celular/PC qdo restaurar
                        itemOverrides = { ...itemOverrides, ...jsonObj };
                        localStorage.setItem('feiraCertaOverrides', JSON.stringify(itemOverrides));
                        processData(marketData, true);
                        setStatus("Backup restaurado da nuvem com sucesso!");
                    } catch (err) {
                        setStatus("Arquivo de backup .json inválido ou corrompido.", true);
                    }
                    backupFile.value = '';
                };
                reader.readAsText(file);
            }
        });
    }

    // Cart Events
    const openCartBtn = document.getElementById('openCartBtn');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const cartModal = document.getElementById('cartModal');
    const clearCartBtn = document.getElementById('clearCartBtn');
    const shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');

    openCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cartModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    closeCartBtn.addEventListener('click', () => {
        cartModal.classList.remove('active');
        document.body.style.overflow = '';
    });

    // Close on overlay click
    cartModal.addEventListener('click', (e) => {
        if (e.target === cartModal) {
            cartModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    clearCartBtn.addEventListener('click', () => {
        shoppingCart = {};
        updateCartUI();
        renderProducts(searchInput.value); // Re-render to clear button states
    });

    shareWhatsAppBtn.addEventListener('click', () => {
        shareViaWhatsApp();
    });

    const smartListBtn = document.getElementById('smartListBtn');
    if (smartListBtn) {
        smartListBtn.addEventListener('click', generateSmartList);
    }

    const expiringListBtn = document.getElementById('expiringListBtn');
    if (expiringListBtn) {
        expiringListBtn.addEventListener('click', generateExpiringList);
    }

    const cartBudgetInput = document.getElementById('cartBudgetInput');
    if (cartBudgetInput) {
        cartBudgetInput.addEventListener('input', updateCartUI);
    }

    const navDashboardBtn = document.getElementById('navDashboardBtn');
    const navProductsBtn = document.getElementById('navProductsBtn');
    const dashboardView = document.getElementById('dashboardView');
    const productsView = document.getElementById('productsView');

    // Quick action buttons no dashboard
    const quickSmartListBtn = document.getElementById('quickSmartListBtn');
    const quickExpiringBtn = document.getElementById('quickExpiringBtn');
    if (quickSmartListBtn) quickSmartListBtn.addEventListener('click', () => { openCartAndRun(generateSmartList); });
    if (quickExpiringBtn) quickExpiringBtn.addEventListener('click', () => { openCartAndRun(generateExpiringList); });

    function showView(view) {
        const isDash = view === 'dashboard';
        dashboardView.style.display = isDash ? 'block' : 'none';
        productsView.style.display = isDash ? 'none' : 'block';
        if (searchBarWrapper) searchBarWrapper.style.display = isDash ? 'none' : 'block';
        navDashboardBtn.classList.toggle('active', isDash);
        navProductsBtn.classList.toggle('active', !isDash);
    }

    if (navDashboardBtn && navProductsBtn) {
        navDashboardBtn.addEventListener('click', (e) => { e.preventDefault(); showView('dashboard'); });
        navProductsBtn.addEventListener('click', (e) => { e.preventDefault(); showView('products'); });
        showView('dashboard');
    }

    // Atualiza hint dos botões de acordo com o dia
    updateQuickActionHints();

    const adjustToBudgetBtn = document.getElementById('adjustToBudgetBtn');
    if (adjustToBudgetBtn) {
        adjustToBudgetBtn.addEventListener('click', () => {
            adjustCartToBudget();
        });
    }

    const manageExcludedBtn = document.getElementById('manageExcludedBtn');
    if (manageExcludedBtn) {
        manageExcludedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            renderExcludedItems();
            document.getElementById('excludedModal').classList.add('active');
            const configGroup = document.getElementById('configGroup');
            if (configGroup) configGroup.classList.remove('open');
        });
    }

    const closeExcludedModal = document.getElementById('closeExcludedModal');
    if (closeExcludedModal) {
        closeExcludedModal.addEventListener('click', () => {
            document.getElementById('excludedModal').classList.remove('active');
        });
    }

    const restoreAllExcludedBtn = document.getElementById('restoreAllExcludedBtn');
    if (restoreAllExcludedBtn) {
        restoreAllExcludedBtn.addEventListener('click', restoreAllProducts);
    }
});

function openCartAndRun(fn) {
    const cartModal = document.getElementById('cartModal');
    cartModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    fn();
}

function updateQuickActionHints() {
    const day = new Date().getDate();
    const hintEl = document.getElementById('smartListHint');
    const subtitleEl = document.getElementById('quickActionsSubtitle');
    const periodBadge = document.getElementById('cartPeriodBadge');
    let period, hint;
    if (day <= 10) {
        period = 'Início do mês';
        hint = 'Lista completa para começo do mês';
    } else if (day >= 21) {
        period = 'Fim do mês';
        hint = 'Preparação para o próximo mês';
    } else {
        period = 'Meio do mês';
        hint = 'Itens ainda não comprados este mês';
    }
    if (hintEl) hintEl.textContent = hint;
    if (subtitleEl) subtitleEl.textContent = period;
    if (periodBadge) periodBadge.textContent = period;
}

function setStatus(msg, isError = false) {
    statusMessage.style.display = 'block';
    statusMessage.textContent = msg;
    statusMessage.style.color = isError ? '#ef4444' : '#60a5fa';
    statusMessage.style.borderColor = isError ? '#ef4444' : '#60a5fa';
    statusMessage.style.background = isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';

    if (!isError) {
        setTimeout(() => { statusMessage.style.display = 'none'; }, 4000);
    }
}

function loadCSVFile(filename) {
    fetch(filename)
        .then(response => {
            if (!response.ok) throw new Error("Não foi possível carregar automaticamente. Por favor, use o botão 'Carregar CSV'.");
            return response.text();
        })
        .then(csvText => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                delimiter: ";",
                complete: function (results) {
                    processData(results.data, true); // replace for the first one
                    setStatus("Dados automáticos carregados com sucesso.");
                }
            });
        })
        .catch(err => {
            console.warn(err);
            setStatus(err.message, true);
        });
}

function processData(data, replace = true) {
    if (replace) {
        marketData = data;
        groupedProducts = {};
    } else {
        marketData = marketData.concat(data); // Append
    }

    // Carregar compras salvas no localStorage
    const userPurchases = JSON.parse(localStorage.getItem('feiraCertaUserPurchases')) || [];

    // Unir os dados históricos do CSV e os dados inseridos manualmente pelo usuário
    const allData = [...marketData];
    userPurchases.forEach(p => {
        allData.push({
            'Produto': p.product,
            'Fornecedor': p.market,
            'Preço': (p.price || 0).toString(),
            'Quantidade': (p.qty || 1).toString(),
            'Unidade': p.unit || 'UN',
            'Data': p.date
        });
    });

    let markets = new Set();
    let dates = [];

    // Reprocess entirely 
    groupedProducts = {};

    allData.forEach(row => {
        const originalProduct = row['Produto']?.trim();
        if (!originalProduct) return;
        if (excludedItems.includes(originalProduct)) return; // Ignorar itens excluídos
        const dateRaw = row['Data']?.trim();
        const market = row['Fornecedor']?.trim();

        // Check overrides
        let product = originalProduct;
        let customCat = null;

        if (itemOverrides[originalProduct]) {
            if (itemOverrides[originalProduct].customName) {
                product = itemOverrides[originalProduct].customName;
            }
            if (itemOverrides[originalProduct].customCategory) {
                customCat = itemOverrides[originalProduct].customCategory;
            }
        }

        const unitKey = Object.keys(row).find(k => k.toLowerCase().includes('unit'));
        let rawPriceStr = (unitKey ? row[unitKey] : "0").toString();

        rawPriceStr = rawPriceStr.replace(/\s/g, '').replace(',', '.');
        const price = parseFloat(rawPriceStr);
        const unit = row['Unidade'] || 'UN';

        let qtyRaw = row['Quantidade'] ? row['Quantidade'].toString().replace(/\s/g, '').replace(',', '.') : "1";
        let parsedQty = parseFloat(qtyRaw);
        if (isNaN(parsedQty) || parsedQty <= 0) parsedQty = 1;

        if (!product) return;

        if (!groupedProducts[product]) {
            groupedProducts[product] = [];
        }

        groupedProducts[product].push({
            date: dateRaw,
            datetime: parseDate(dateRaw),
            market: market,
            price: isNaN(price) ? 0 : price,
            qty: parsedQty,
            unit: unit,
            originalName: originalProduct,
            customCategory: customCat
        });

        if (market) markets.add(market);

        const dt = parseDate(dateRaw);
        if (dt) dates.push(dt);
    });

    // Update stats
    document.getElementById('totalProducts').textContent = Object.keys(groupedProducts).length;
    document.getElementById('totalMarkets').textContent = markets.size;

    if (dates.length > 0) {
        const validDates = dates.filter(d => !isNaN(d));
        if (validDates.length > 0) {
            const latestDate = new Date(Math.max(...validDates));
            document.getElementById('lastDate').textContent = latestDate.toLocaleDateString('pt-BR');
        }
    }

    // Gasto do mês atual
    const now = new Date();
    const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let curMonthTotal = 0;
    Object.values(groupedProducts).forEach(hist => {
        hist.forEach(h => {
            if (h.datetime && !isNaN(h.datetime)) {
                const mk = `${h.datetime.getFullYear()}-${String(h.datetime.getMonth() + 1).padStart(2, '0')}`;
                if (mk === curMonthKey) curMonthTotal += h.price * h.qty;
            }
        });
    });
    const statMonthEl = document.getElementById('statMonthTotal');
    if (statMonthEl) {
        statMonthEl.style.display = curMonthTotal > 0 ? 'flex' : 'none';
        const el = document.getElementById('currentMonthTotal');
        if (el) el.textContent = formatCurrency(curMonthTotal);
    }

    // Mostrar secao de acoes rapidas
    const qaSection = document.getElementById('quickActionsSection');
    if (qaSection) qaSection.style.display = 'block';

    initCategoryFilters();
    renderProducts();
    updateFinanceDashboard();
    renderCategorySpending();
    initCalendar();
    updateExcludedCount();
}

function resolveCategory(name) {
    if (groupedProducts[name] && groupedProducts[name][0].customCategory) {
        return groupedProducts[name][0].customCategory;
    }
    return getCategory(name);
}

function initCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;

    // As categorias originais
    const cats = new Set();
    Object.keys(groupedProducts).forEach(name => cats.add(resolveCategory(name)));

    const sortedCats = Array.from(cats).sort((a, b) => {
        if (a === 'Outros') return 1;
        if (b === 'Outros') return -1;
        return a.localeCompare(b);
    });

    container.innerHTML = '';

    const btnTodas = document.createElement('button');
    btnTodas.className = `category-chip ${activeCategory === 'Todas' ? 'active' : ''}`;
    btnTodas.textContent = 'Topo';
    btnTodas.addEventListener('click', () => {
        activeCategory = 'Todas';
        updateCategoryUI();
        const grid = document.getElementById('productsGrid');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    container.appendChild(btnTodas);

    sortedCats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-chip color-${getColorClassForCategory(cat)} ${activeCategory === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.addEventListener('click', () => {
            activeCategory = cat;
            updateCategoryUI();

            const safeId = "cat-" + cat.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
            const target = document.getElementById(safeId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        container.appendChild(btn);
    });
}

function updateCategoryUI() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;
    container.querySelectorAll('.category-chip').forEach(btn => {
        if (btn.textContent === activeCategory) {
            btn.classList.add('active');
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            btn.classList.remove('active');
        }
    });
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
    }
    return new Date(dateStr);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function renderProducts(filter = '') {
    productsGrid.innerHTML = '';
    const query = filter.toLowerCase();

    const productNames = Object.keys(groupedProducts).filter(name =>
        name.toLowerCase().includes(query)
    );

    // Group filtered products by category
    const categorizedDisplay = {};
    productNames.forEach(name => {
        const cat = resolveCategory(name);
        if (!categorizedDisplay[cat]) {
            categorizedDisplay[cat] = [];
        }
        categorizedDisplay[cat].push(name);
    });

    // Sort categories alphabetically (Outros at the end)
    const categories = Object.keys(categorizedDisplay).sort((a, b) => {
        if (a === 'Outros') return 1;
        if (b === 'Outros') return -1;
        return a.localeCompare(b);
    });

    if (categories.length === 0) {
        productsGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum produto listado. Tente carregar o arquivo CSV.</div>';
        return;
    }

    categories.forEach(cat => {
        // Obter ID seguro para ancorar o scroll
        const safeId = "cat-" + cat.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
        const colorName = getColorClassForCategory(cat);

        // Create Category Header
        const header = document.createElement('div');
        header.id = safeId;
        header.className = "section-header w-100";
        header.style.gridColumn = "1 / -1";
        header.innerHTML = `<h2 class="color-${colorName}"><i class="ph ph-tag"></i> ${cat}</h2>`;
        productsGrid.appendChild(header);

        // Sort items inside category alphabetically
        categorizedDisplay[cat].sort();

        categorizedDisplay[cat].forEach(name => {
            const history = groupedProducts[name];
            // Sort history by date descending
            history.sort((a, b) => b.datetime - a.datetime);

            const latestEntry = history[0];
            const formattedName = name;

            const card = document.createElement('div');
            card.className = "product-card card-" + colorName;

            const inCart = shoppingCart[name] !== undefined;
            const cartBtnClass = inCart ? 'btn-cart in-cart' : 'btn-cart';
            const cartIcon = inCart ? '<i class="ph ph-trash"></i>' : '<i class="ph ph-plus"></i>';
            const cartBtnTitle = inCart ? 'Remover da Lista' : 'Adicionar à Lista';

            card.innerHTML = `
                <div class="product-title" title="${formattedName}">${formattedName}</div>
                <div class="product-latest">
                    <div class="price-tag">${formatCurrency(latestEntry.price)}</div>
                    <div class="market-tag">
                        <i class="ph ph-storefront"></i>
                        <span style="max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${latestEntry.market}">
                            ${latestEntry.market}
                        </span>
                    </div>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                    Última compra: ${latestEntry.date} &bull; Unidade: ${latestEntry.unit}
                </div>
                <div class="sparkline-container" title="Variação de Preço">
                    ${generateSparklineSVG(history, colorName)}
                </div>
                <div class="product-actions">
                    <button class="btn-outline view-history-btn" data-product="${name}" title="Ver Histórico">
                        <i class="ph ph-chart-line-up"></i>
                    </button>
                    <button class="btn-outline edit-product-btn" data-product="${name}" title="Editar Nome e Categoria">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn-outline delete-product-btn" data-product="${name}" title="Ocultar Produto" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.2);">
                        <i class="ph ph-trash"></i>
                    </button>
                    <button class="${cartBtnClass} toggle-cart-btn" data-product="${name}" data-price="${latestEntry.price}" title="${cartBtnTitle}">
                        ${cartIcon}
                    </button>
                </div>
            `;
            productsGrid.appendChild(card);
        });
    });

    // Attach History Events
    document.querySelectorAll('.view-history-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prodName = e.currentTarget.getAttribute('data-product');
            openModal(prodName);
        });
    });

    // Attach Edit Events
    document.querySelectorAll('.edit-product-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prodName = e.currentTarget.getAttribute('data-product');
            openEditModal(prodName);
        });
    });

    // Attach Delete Events
    document.querySelectorAll('.delete-product-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prodName = e.currentTarget.getAttribute('data-product');
            excludeProduct(prodName);
        });
    });

    // Attach Cart Events
    document.querySelectorAll('.toggle-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prodName = e.currentTarget.getAttribute('data-product');
            const price = parseFloat(e.currentTarget.getAttribute('data-price'));
            toggleCartItem(prodName, price);
            renderProducts(searchInput.value); // Quick re-render to update button state
        });
    });
}

function generateSparklineSVG(history, colorName) {
    if (!history || history.length < 2) return '<div class="sparkline-empty">Poucos dados numéricos</div>';

    const data = [...history].sort((a, b) => a.datetime - b.datetime).map(h => h.price);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const width = 100;
    const height = 30;
    const padding = 3;

    // Convert price values to XY coordinates mapping to SVG bounds
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        let y = height / 2; // default centered straight line if all prices are equal
        if (range !== 0) {
            y = height - padding - ((val - min) / range) * (height - padding * 2);
        }
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const svgId = 'spark_' + Math.random().toString(36).substr(2, 9);

    return `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="sparkline-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="${svgId}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="var(--cat-${colorName})" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="var(--cat-${colorName})" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <polyline fill="none" stroke="var(--cat-${colorName})" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${points.join(' ')}"/>
            <polygon fill="url(#${svgId})" points="${points[0].split(',')[0]},${height} ${points.join(' ')} ${points[points.length - 1].split(',')[0]},${height}"/>
        </svg>
    `;
}

function generateSmartList() {
    if (!groupedProducts || Object.keys(groupedProducts).length === 0) {
        setStatus("Nenhum dado carregado para gerar a lista inteligente.", true);
        return;
    }

    const today = new Date();
    const todayMs = today.getTime();
    const dayOfMonth = today.getDate();

    // Corte temporal: ignorar compras mais antigas que DATA_CUTOFF_MONTHS para cálculo de frequência
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);

    // Detectar período do mês:
    // Início: dias 1–10 → sugerir lista completa para o mês que começa
    // Final:  dias 21+  → sugerir lista completa para o próximo mês
    // Meio:   dias 11–20 → lista parcial (itens essenciais ainda não comprados este mês)
    let periodoLabel;
    let compradoEsseMes = false;
    if (dayOfMonth <= 10) {
        periodoLabel = 'início do mês';
    } else if (dayOfMonth >= 21) {
        periodoLabel = 'fim do mês (preparação para o próximo)';
    } else {
        periodoLabel = 'meio do mês';
        compradoEsseMes = true; // neste caso filtramos itens JÁ comprados este mês
    }

    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    const productsByFrequency = Object.keys(groupedProducts)
        .map(name => {
            const history = groupedProducts[name];

            // Histórico com datas válidas (completo — para saber quando foi comprado)
            const validHistory = history.filter(h => h.datetime && !isNaN(h.datetime.getTime()));
            if (validHistory.length < 1) return null;

            const sortedHistory = [...validHistory].sort((a, b) => b.datetime - a.datetime);
            const msSinceLastPurchase = todayMs - sortedHistory[0].datetime.getTime();

            // Ignorar itens comprados nos últimos 3 dias (acabou de ser comprado)
            if (msSinceLastPurchase < (3 * 24 * 60 * 60 * 1000)) return null;

            // No meio do mês: pular itens já comprados este mês
            if (compradoEsseMes) {
                const compradoNoMes = validHistory.some(h => {
                    const mk = `${h.datetime.getFullYear()}-${h.datetime.getMonth()}`;
                    return mk === currentMonthKey;
                });
                if (compradoNoMes) return null;
            }

            // Usar apenas histórico recente (dentro do cutoff) para calcular frequência e quantidade
            const recentHistory = validHistory.filter(h => h.datetime.getTime() >= cutoffMs);
            // Se não há histórico recente mas tem histórico antigo, usa o antigo (produto voltou)
            const histForCalc = recentHistory.length >= 1 ? recentHistory : validHistory;

            // Detectar em qual período do mês o item costuma ser comprado
            // Calcular o dia médio de compra (1–31)
            let totalDayOfMonth = 0;
            histForCalc.forEach(h => { totalDayOfMonth += h.datetime.getDate(); });
            const avgBuyDayOfMonth = totalDayOfMonth / histForCalc.length;

            // Para início/fim do mês: incluir itens cujo dia médio de compra corresponde ao período
            // Para meio do mês: já filtrado acima
            if (!compradoEsseMes) {
                if (dayOfMonth <= 10) {
                    // Queremos itens tipicamente comprados entre dia 1 e 15
                    if (avgBuyDayOfMonth > 17) return null;
                } else if (dayOfMonth >= 21) {
                    // Queremos itens tipicamente comprados entre dia 15 e 31
                    if (avgBuyDayOfMonth < 13) return null;
                }
            }

            // Agrupar por mês para calcular quantidade mensal média
            const qtyByMonth = {};
            histForCalc.forEach(h => {
                const monthKey = `${h.datetime.getFullYear()}-${h.datetime.getMonth()}`;
                if (!qtyByMonth[monthKey]) qtyByMonth[monthKey] = 0;
                qtyByMonth[monthKey] += h.qty;
            });

            const monthsCount = Object.keys(qtyByMonth).length;
            let totalMonthlyQty = 0;
            Object.values(qtyByMonth).forEach(qty => totalMonthlyQty += qty);
            const avgMonthlyQty = totalMonthlyQty / monthsCount;
            const recommendedQty = Math.max(1, Math.round(avgMonthlyQty));

            return {
                name: name,
                frequency: histForCalc.length,
                monthsCount: monthsCount,
                recommendedQty: recommendedQty,
                latestPrice: sortedHistory[0].price,
                avgBuyDayOfMonth: avgBuyDayOfMonth
            };
        })
        .filter(item => item !== null)
        .sort((a, b) => {
            if (b.monthsCount !== a.monthsCount) return b.monthsCount - a.monthsCount;
            return b.frequency - a.frequency;
        });

    const topItems = productsByFrequency.slice(0, 200);

    let addedCount = 0;
    topItems.forEach(item => {
        if (!shoppingCart[item.name]) {
            shoppingCart[item.name] = { price: item.latestPrice, qty: item.recommendedQty };
            addedCount += item.recommendedQty;
        }
    });

    updateCartUI();
    renderProducts(searchInput.value);

    if (addedCount > 0) {
        setStatus(`🛒 Feira do ${periodoLabel}: ${topItems.length} produtos sugeridos pelo histórico!`);
    } else {
        setStatus("Todos os itens sugeridos já estão na sua lista.");
    }
}

function generateExpiringList() {
    if (!groupedProducts || Object.keys(groupedProducts).length === 0) {
        setStatus("Nenhum dado carregado.", true);
        return;
    }

    const todayMs = new Date().getTime();

    // Corte temporal: para o ciclo de consumo só contar compras recentes
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);

    let expiringCandidates = [];

    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];

        // Histórico com datas válidas
        const validHistory = history.filter(h => h.datetime && !isNaN(h.datetime.getTime()));
        if (validHistory.length < 2) return;

        // Para cálculo do ciclo: usar apenas dados dentro do cutoff
        const recentHistory = validHistory.filter(h => h.datetime.getTime() >= cutoffMs);
        // Precisa de ao menos 2 pontos recentes para calcular o ciclo confiável
        // Se não houver, usar todo o histórico como fallback
        const histForCycle = recentHistory.length >= 2 ? recentHistory : validHistory;

        const sortedForCycle = [...histForCycle].sort((a, b) => a.datetime - b.datetime);

        // Agrupar por dia para evitar duplicatas de itens na mesma nota
        const byDay = {};
        sortedForCycle.forEach(h => {
            const dayKey = h.datetime.toISOString().slice(0, 10);
            if (!byDay[dayKey]) byDay[dayKey] = { ms: h.datetime.getTime(), qty: 0 };
            byDay[dayKey].qty += h.qty;
        });

        const dayKeys = Object.keys(byDay).sort();
        if (dayKeys.length < 2) return;

        // Calcular ciclo médio de consumo (ms por unidade)
        let totalDiffMs = 0;
        let totalUnitsConsumed = 0;
        for (let i = 1; i < dayKeys.length; i++) {
            totalDiffMs += (byDay[dayKeys[i]].ms - byDay[dayKeys[i - 1]].ms);
            totalUnitsConsumed += byDay[dayKeys[i - 1]].qty;
        }
        if (totalUnitsConsumed <= 0) return;

        const avgCycleMsPerUnit = totalDiffMs / totalUnitsConsumed;

        // Calcular urgência com base na última compra REAL (pode ser mais antiga que o cutoff)
        const allSorted = [...validHistory].sort((a, b) => b.datetime - a.datetime);
        const lastEntry = allSorted[0];
        const lastPurchaseMs = lastEntry.datetime.getTime();
        const msSinceLastPurchase = todayMs - lastPurchaseMs;

        // Quantidade da última compra (agrupada pelo dia)
        const lastDayKey = lastEntry.datetime.toISOString().slice(0, 10);
        let lastQty = 0;
        validHistory.forEach(h => {
            if (h.datetime.toISOString().slice(0, 10) === lastDayKey) lastQty += h.qty;
        });
        if (lastQty <= 0) lastQty = 1;

        const expectedLifeTimeMs = lastQty * avgCycleMsPerUnit;
        if (expectedLifeTimeMs <= 0) return;

        const urgencyScore = msSinceLastPurchase / expectedLifeTimeMs;

        // Score entre 0.7 (quase na hora) e 3.5 (deveria ter comprado há tempo)
        // Abaixo de 0.7 = tem estoque ainda; acima de 3.5 = provavelmente parou de usar
        if (urgencyScore >= 0.7 && urgencyScore <= 3.5) {
            // Quantidade recomendada: média das compras recentes por vez
            let totalRecentQty = 0;
            sortedForCycle.forEach(h => totalRecentQty += h.qty);
            const avgRecentQty = totalRecentQty / sortedForCycle.length;
            const recommendedQty = Math.max(1, Math.round(avgRecentQty));

            // Rótulo de urgência para informar o usuário
            let urgencyLabel = '';
            if (urgencyScore >= 2.0) urgencyLabel = '🔴 Atrasado';
            else if (urgencyScore >= 1.0) urgencyLabel = '🟠 Na hora';
            else urgencyLabel = '🟡 Em breve';

            expiringCandidates.push({
                name: name,
                urgency: urgencyScore,
                urgencyLabel: urgencyLabel,
                recommendedQty: recommendedQty,
                latestPrice: lastEntry.price,
                cycleAvgDays: Math.round(avgCycleMsPerUnit / (24 * 60 * 60 * 1000))
            });
        }
    });

    expiringCandidates.sort((a, b) => b.urgency - a.urgency);

    // Limitar a 20 itens para reposição semanal
    const topItems = expiringCandidates.slice(0, 20);

    let addedCount = 0;
    topItems.forEach(item => {
        if (!shoppingCart[item.name]) {
            shoppingCart[item.name] = { price: item.latestPrice, qty: item.recommendedQty };
            addedCount += item.recommendedQty;
        }
    });

    updateCartUI();
    renderProducts(searchInput.value);

    if (addedCount > 0) {
        const atrasados = expiringCandidates.filter(i => i.urgency >= 2.0).length;
        let msg = `🔄 Reposição semanal: ${topItems.length} itens precisam ser repostos.`;
        if (atrasados > 0) msg += ` (${atrasados} atrasados!)`;
        setStatus(msg);
    } else if (topItems.length > 0) {
        setStatus("Os itens que precisam de reposição já estão na sua lista.");
    } else {
        setStatus("Nenhum item precisa de reposição agora (ou faltam dados históricos).");
    }
}

function toggleCartItem(name, price) {
    if (shoppingCart[name]) {
        delete shoppingCart[name];
    } else {
        shoppingCart[name] = { price: price, qty: 1 };
    }
    updateCartUI();
}

function updateCartQuantity(name, delta) {
    if (shoppingCart[name]) {
        shoppingCart[name].qty += delta;
        if (shoppingCart[name].qty <= 0) {
            delete shoppingCart[name];
        }
    }
    updateCartUI();
    renderProducts(searchInput.value);
}

function updateCartUI() {
    const listContainer = document.getElementById('cartItemsList');
    const badge = document.getElementById('cartBadge');
    const totalEl = document.getElementById('cartTotalValue');
    const shareBtn = document.getElementById('shareWhatsAppBtn');

    listContainer.innerHTML = '';

    let totalItems = 0;
    let totalPrice = 0;

    const itemsKeys = Object.keys(shoppingCart);

    if (itemsKeys.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-cart-msg">
                <i class="ph ph-basket" style="font-size: 2.5rem; opacity: 0.3;"></i>
                <p>Sua lista está vazia.</p>
                <p style="font-size: 0.8rem;">Use os botões acima para gerar sugestões ou adicione produtos na aba Produtos.</p>
            </div>`;
        badge.style.display = 'none';
        totalEl.textContent = 'R$ 0,00';
        shareBtn.style.display = 'none';
        
        const adjustBtn = document.getElementById('adjustToBudgetBtn');
        if (adjustBtn) adjustBtn.style.display = 'none';
        return;
    }

    shareBtn.style.display = 'flex';

    // Calcular orçamento cumulativo por prioridade
    const budgetInput = document.getElementById('cartBudgetInput');
    const targetBudget = parseFloat(budgetInput?.value) || 0;

    // Ordenar itens globalmente por prioridade decrescente (Alta -> Média -> Baixa) e alfabético
    const weight = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
    const sortedGlobalItems = [...itemsKeys].sort((a, b) => {
        const prioA = getPriority(a);
        const prioB = getPriority(b);
        if (weight[prioB] !== weight[prioA]) {
            return weight[prioB] - weight[prioA];
        }
        return a.localeCompare(b);
    });

    // Determinar quais itens excedem o orçamento
    let accumulated = 0;
    const exceedsBudget = {};
    let hasExceedingItems = false;

    sortedGlobalItems.forEach(name => {
        const item = shoppingCart[name];
        const cost = item.price * item.qty;
        if (targetBudget > 0 && accumulated + cost > targetBudget) {
            exceedsBudget[name] = true;
            hasExceedingItems = true;
        } else {
            exceedsBudget[name] = false;
        }
        accumulated += cost;
    });

    // Exibir/ocultar botão de ajuste ao orçamento
    const adjustBtn = document.getElementById('adjustToBudgetBtn');
    if (adjustBtn) {
        adjustBtn.style.display = (targetBudget > 0 && hasExceedingItems) ? 'flex' : 'none';
    }

    // Agrupar itens por categoria para exibição
    const groupedCart = {};
    itemsKeys.forEach(name => {
        const cat = resolveCategory(name);
        if (!groupedCart[cat]) groupedCart[cat] = [];
        groupedCart[cat].push(name);
    });

    const categories = Object.keys(groupedCart).sort((a, b) => {
        if (a === 'Outros') return 1;
        if (b === 'Outros') return -1;
        return a.localeCompare(b);
    });

    categories.forEach(cat => {
        const colorClass = getColorClassForCategory(cat);
        const categoryColor = getComputedStyle(document.documentElement).getPropertyValue(`--cat-${colorClass}`).trim() || '#ef4444';

        // Category section header
        const header = document.createElement('div');
        header.className = 'cart-category-title';
        header.style.color = categoryColor;
        header.textContent = cat;
        listContainer.appendChild(header);

        // Ordenar itens dentro da categoria por prioridade decrescente, depois alfabético
        groupedCart[cat].sort((a, b) => {
            const prioA = getPriority(a);
            const prioB = getPriority(b);
            if (weight[prioB] !== weight[prioA]) {
                return weight[prioB] - weight[prioA];
            }
            return a.localeCompare(b);
        });

        groupedCart[cat].forEach(name => {
            const item = shoppingCart[name];
            totalItems += item.qty;
            totalPrice += (item.price * item.qty);

            // Calculate historical average
            const history = groupedProducts[name];
            let avgPrice = item.price;
            if (history && history.length > 0) {
                const validPrices = history.map(h => h.price).filter(p => p > 0);
                if (validPrices.length > 0) {
                    avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
                }
            }

            const priority = getPriority(name);
            const isExceeded = exceedsBudget[name];

            const card = document.createElement('div');
            card.className = `cart-item-card ${isExceeded ? 'exceeds-budget' : ''}`;
            card.style.setProperty('--item-accent', categoryColor);

            card.innerHTML = `
                <div class="cart-item-details">
                    <div class="cart-item-name" title="${name}">${name}</div>
                    <div class="cart-item-stats">
                        <select class="cart-item-priority-select" data-name="${name}">
                            <option value="Alta" ${priority === 'Alta' ? 'selected' : ''}>🔴 Alta</option>
                            <option value="Média" ${priority === 'Média' ? 'selected' : ''}>🟡 Média</option>
                            <option value="Baixa" ${priority === 'Baixa' ? 'selected' : ''}>🟢 Baixa</option>
                        </select>
                        <span title="Preço Médio Histórico" style="margin-left: 0.5rem;">Média: ${formatCurrency(avgPrice)}</span>
                        <span class="item-total-val" style="margin-left: auto;">${formatCurrency(item.price * item.qty)}</span>
                    </div>
                </div>
                <div class="cart-qty-controls">
                    <button class="cart-qty-btn dec-btn" data-name="${name}"><i class="ph ph-minus"></i></button>
                    <span class="cart-qty-value">${item.qty}</span>
                    <button class="cart-qty-btn inc-btn" data-name="${name}"><i class="ph ph-plus"></i></button>
                </div>
                <button class="cart-remove-item-btn" data-name="${name}" title="Remover da lista">
                    <i class="ph ph-trash"></i>
                </button>
            `;
            listContainer.appendChild(card);
        });
    });

    badge.style.display = 'inline-block';
    badge.textContent = totalItems;
    totalEl.textContent = formatCurrency(totalPrice);

    // Atualizar barra de progresso do orçamento
    const budgetProgress = document.getElementById('cartBudgetProgress');
    const pctLabel = document.getElementById('budgetPctLabel');
    if (budgetInput && budgetProgress) {
        const target = parseFloat(budgetInput.value) || 0;
        if (target > 0) {
            const rawPct = (totalPrice / target) * 100;
            const pct = Math.min(rawPct, 100);
            budgetProgress.style.width = pct + '%';
            if (totalPrice > target) {
                budgetProgress.classList.add('over-budget');
                if (pctLabel) { pctLabel.textContent = `${rawPct.toFixed(0)}% — acima do orçamento!`; pctLabel.style.color = '#f87171'; }
            } else {
                budgetProgress.classList.remove('over-budget');
                if (pctLabel) { pctLabel.textContent = `${rawPct.toFixed(0)}% do orçamento`; pctLabel.style.color = rawPct > 80 ? '#fbbf24' : 'var(--text-secondary)'; }
            }
        } else {
            budgetProgress.style.width = '0%';
            if (pctLabel) pctLabel.textContent = 'Defina um orçamento acima';
        }
    }

    // Attach qty events inside cart
    document.querySelectorAll('.dec-btn').forEach(btn => {
        btn.addEventListener('click', (e) => updateCartQuantity(e.currentTarget.getAttribute('data-name'), -1));
    });
    document.querySelectorAll('.inc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => updateCartQuantity(e.currentTarget.getAttribute('data-name'), 1));
    });

    // Ouvintes para o seletor de prioridade rápida no carrinho
    document.querySelectorAll('.cart-item-priority-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const name = e.currentTarget.getAttribute('data-name');
            const newPriority = e.currentTarget.value;
            setPriority(name, newPriority);
            updateCartUI(); // Re-renderiza para recalcular
        });
    });

    // Ouvintes para o botão de exclusão rápida no carrinho
    document.querySelectorAll('.cart-remove-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const name = e.currentTarget.getAttribute('data-name');
            delete shoppingCart[name];
            updateCartUI();
            renderProducts(searchInput.value); // atualiza botão da aba produtos
        });
    });
}

function getCategory(name) {
    const n = name.toLowerCase();

    if (n.match(/(detergente|det |sabao|sabão|sb |amaciante|amac |agua sanit|água sanit|qboa|desinfetante|desinf |esponja|limpador|limp |veja|alcool|álcool|lava roup|lav louc|lustr mov|des vim|odor |sac ass|saco lixo|bob extrusa|inset |l vidro|sapólio|sapon|sab barra|comfort|downy|triex|lr |bom ar|lysoform)/)) return "Limpeza";

    if (n.match(/(shampoo|condicionador|sabonete|st lux|st liq|st |creme dental|cd colgate|cd |escova|desodorante|d a |rexona|pap hig|ph |absorvente|abs |fralda|apar barb|algodao|algodão|bastonete|prot diar|cr skala|sbt |sh\+co|toalha umed|toal|lenço|oleo cr|higiene)/)) return "Higiene Pessoal";

    if (n.match(/(banana|maça|maçã|maca |\bmaca\b|uva|pera|laranja|limao|limão|mamao|mamão|melancia|melao|melão|mexerica|morango|purapolpa|polpa|maracuj|abacate|fruta)/)) return "Hortifruti - Frutas";

    if (n.match(/(tomate|cebola|alho|batata|cenoura|alface|couve|brocolis|brócolis|pimentao|pimentão|abobora|abóbora|mandioca|mand |repolho|salsa |salada|cheiro verde)/)) return "Hortifruti - Legumes";

    if (n.match(/(frango|carne|bife|acem|alcatra|peito|f peito|coxa|file|filé|filezinho|peixe|linguica|linguiça|ling |salsicha|sals |porco|bacon|hamb|texas burg|patinho|costelinha|burguer|tilapia|tilápia|salmao|salmão|fraldinha)/)) return "Açougue";

    if (n.match(/(biscoito|bisc |bolacha|chocolate|choc |ch |ch bis|ch neu|salgadinho|sorvete|sorv |doce|bombom|ruffles|achoc |mms|cr avela|goiab |d l |batat palh|palha|ovo alp|ovo pascoa|biju|casq )/)) return "Doces & Snacks";

    if (n.match(/(leite|lte |queijo|qjo |qj |muss |mussarela|presunto|pres |mortadela|mort |manteiga|margarina|marg |iorgute|iogurte|iog |requeijao|requeijão|rq |danone|cr cheese|cr leite|l cond|leit cond|ovos|ovo )/)) return "Laticínios & Frios";

    if (n.match(/(arroz|arr | feij |feijao|feijão|macarrao|macarrão|mac |oleo|óleo|ol soj|azeite|sal |sal$|acucar|açúcar|cafe|café|caf |farinha|far |f lactea|milho|flocao|extrato|ext |ex tom|extr tom|molho|m shoyu|shoyu|ervilha|amido|maizena|aveia|oregano|temp |chimichu|farofa|goma|paprica|massa rap10|tapioca|catchup|cat |ketchup|maionese|maion |mostarda|barbec|louro|\bmel\b|mel )/)) return "Mercearia Básica";

    if (n.match(/(cerveja|refrigerante|suco|agua|água|ag |vinho|vin |vodka|coca |cha |chá |v q morg|sprite|guarana|del valle)/)) return "Bebidas";

    if (n.match(/(pao|pão|p forma|torrada|bolo|mb italac|lasanha|rosq|chipa)/)) return "Padaria";

    if (n.match(/(pap alumin|folha alum|filme pvc|film |pap toalha|t pap|sacola|filtro|isopor|sc herm)/)) return "Utilidades";

    return "Outros";
}

function shareViaWhatsApp() {
    const itemsKeys = Object.keys(shoppingCart);
    if (itemsKeys.length === 0) return;

    let totalPrice = 0;

    // Agrupar itens por categoria
    const groupedCart = {};
    itemsKeys.forEach(name => {
        const cat = resolveCategory(name);
        if (!groupedCart[cat]) groupedCart[cat] = [];
        groupedCart[cat].push(name);
    });

    let text = "🛒 *Lista da Feira Certa*\n\n";

    // Ordenar categorias colocando "Outros" no final
    const categories = Object.keys(groupedCart).sort((a, b) => {
        if (a === 'Outros') return 1;
        if (b === 'Outros') return -1;
        return a.localeCompare(b);
    });

    categories.forEach(cat => {
        text += `*🛍 ${cat}*\n`;

        groupedCart[cat].forEach(name => {
            const item = shoppingCart[name];
            totalPrice += (item.price * item.qty);

            // Calcula o preço médio do produto
            let avgPriceText = '';
            if (groupedProducts && groupedProducts[name]) {
                const history = groupedProducts[name];
                let sum = 0;
                let count = 0;
                history.forEach(h => {
                    if (h.price > 0) { sum += h.price; count++; }
                });
                if (count > 0) {
                    const avgPrice = sum / count;
                    avgPriceText = ` - Média: ${formatCurrency(avgPrice)}`;
                }
            }

            text += `• ${item.qty}x ${name}${avgPriceText}\n`;
        });
        text += `\n`; // Linha em branco para separar as categorias
    });

    text += `💰 *Estimativa:* ${formatCurrency(totalPrice)}`;

    const encodedText = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encodedText}`;

    // Tentar copiar o texto inteiro para a área de transferência primeiro (evita o problema se o link falhar ao carregar no celular devido ao limite de caracteres)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            setStatus("Lista grande copiada! Redirecionando para o WhatsApp...");
            window.open(url, '_blank');
        }).catch(err => {
            window.open(url, '_blank');
        });
    } else {
        window.open(url, '_blank');
    }
}

function openModal(productName) {
    const history = groupedProducts[productName];
    const chartHistory = [...history].sort((a, b) => a.datetime - b.datetime);

    document.getElementById('modalTitle').textContent = productName;

    // Stats pills
    const statsRow = document.getElementById('chartStatsRow');
    if (statsRow) {
        const prices = history.map(h => h.price).filter(p => p > 0);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const avgP = prices.reduce((a, b) => a + b, 0) / prices.length;
        const sorted = [...history].sort((a, b) => a.datetime - b.datetime);
        const firstP = sorted[0].price;
        const lastP = sorted[sorted.length - 1].price;
        const varPct = firstP > 0 ? ((lastP - firstP) / firstP * 100).toFixed(1) : 0;
        const varClass = varPct > 0 ? 'up' : 'down';
        const varSign = varPct > 0 ? '+' : '';
        statsRow.innerHTML = `
            <div class="chart-stat-pill">⏱ <span>${history.length} compras</span></div>
            <div class="chart-stat-pill">Mín: <strong>${formatCurrency(minP)}</strong></div>
            <div class="chart-stat-pill">Méd: <strong>${formatCurrency(avgP)}</strong></div>
            <div class="chart-stat-pill">Máx: <strong>${formatCurrency(maxP)}</strong></div>
            <div class="chart-stat-pill ${varClass}">Variação: <strong>${varSign}${varPct}%</strong></div>
        `;
    }
    // Setup Chart
    const ctx = document.getElementById('priceChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    const labels = chartHistory.map(h => {
        let abbr = h.market ? h.market.split(' ')[0] : 'Mercado';
        return `${h.date} (${abbr})`;
    });
    const dataPoints = chartHistory.map(h => h.price);

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor (R$)',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderWidth: 2,
                tension: 0.3,
                pointBackgroundColor: '#10b981',
                pointRadius: 5,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return formatCurrency(context.raw);
                        }
                    }
                }
            }
        }
    });

    // Populate List
    const listContainer = document.getElementById('modalHistoryList');
    listContainer.innerHTML = '';

    // Sort descending for list
    const listHistory = [...history].sort((a, b) => b.datetime - a.datetime);

    listHistory.forEach(h => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div>
                <div class="history-market">${h.market || 'Desconhecido'} <span style="font-weight:normal;font-size:0.8rem">- ${h.unit}</span></div>
                <div class="history-date">${h.date}</div>
            </div>
            <div class="history-price">${formatCurrency(h.price)}</div>
        `;
        listContainer.appendChild(item);
    });

    document.getElementById('chartModal').classList.add('active');
}

function closeModal() {
    document.getElementById('chartModal').classList.remove('active');
}

function openEditModal(name) {
    const history = groupedProducts[name];
    const originals = [...new Set(history.map(h => h.originalName))].filter(o => o);

    document.getElementById('editOriginalName').value = originals.join(' | ');
    document.getElementById('editCustomName').value = name;

    const currentCat = resolveCategory(name);
    const selectCat = document.getElementById('editCategory');

    let optionExists = Array.from(selectCat.options).some(opt => opt.value === currentCat);
    if (!optionExists) {
        selectCat.add(new Option(currentCat, currentCat));
    }
    selectCat.value = currentCat;

    const currentPriority = getPriority(name);
    const selectPriority = document.getElementById('editPriority');
    if (selectPriority) selectPriority.value = currentPriority;

    document.getElementById('editModal').classList.add('active');

    document.getElementById('saveEditBtn').onclick = () => saveProductEdit(name, originals);
}

function saveProductEdit(currentName, originalNames) {
    const customName = document.getElementById('editCustomName').value.trim();
    const customCat = document.getElementById('editCategory').value;
    const customPriority = document.getElementById('editPriority').value;

    originalNames.forEach(orig => {
        if (!itemOverrides[orig]) itemOverrides[orig] = {};
        itemOverrides[orig].customName = customName || orig;
        itemOverrides[orig].customCategory = customCat;
        itemOverrides[orig].customPriority = customPriority;
    });

    localStorage.setItem('feiraCertaOverrides', JSON.stringify(itemOverrides));

    // Updates the cart if the name was changed and it is inside the cart
    if (customName && customName !== currentName && shoppingCart[currentName]) {
        shoppingCart[customName] = shoppingCart[currentName];
        delete shoppingCart[currentName];
    }

    document.getElementById('editModal').classList.remove('active');

    // Reprocessar toda a lista com as novas classificações
    processData(marketData, true);
    updateCartUI();
    setStatus("Produto atualizado e agrupado com sucesso!");
}

let financeChartInstance = null;

function updateFinanceDashboard() {
    const section = document.getElementById('financeSection');
    const listEl = document.getElementById('inflationList');
    const ctx = document.getElementById('financeChart');
    if (!section || !listEl || !ctx) return;

    if (Object.keys(groupedProducts).length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'grid';

    // Calculate monthly expenses
    const monthlyExpenses = {};
    const inflationData = [];

    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];

        // Expense sum
        history.forEach(h => {
            if (h.datetime && !isNaN(h.datetime)) {
                const mKey = `${h.datetime.getFullYear()}-${String(h.datetime.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyExpenses[mKey]) monthlyExpenses[mKey] = 0;
                monthlyExpenses[mKey] += (h.price * h.qty);
            }
        });

        // Inflation calculation
        if (history.length > 1) {
            const sorted = [...history].sort((a, b) => a.datetime - b.datetime);
            const latest = sorted[sorted.length - 1].price;

            let sumOld = 0;
            let cntOld = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i].price > 0) {
                    sumOld += sorted[i].price;
                    cntOld++;
                }
            }
            if (cntOld > 0) {
                const avgOld = sumOld / cntOld;
                if (avgOld > 0 && latest > avgOld) {
                    const diffPct = ((latest - avgOld) / avgOld) * 100;
                    if (diffPct > 5) { // Only highlight if increased more than 5%
                        inflationData.push({
                            name: name,
                            pct: diffPct,
                            oldPrice: avgOld,
                            newPrice: latest
                        });
                    }
                }
            }
        }
    });

    // Sort and render inflation list
    inflationData.sort((a, b) => b.pct - a.pct);
    listEl.innerHTML = '';
    const topInflation = inflationData.slice(0, 10); // top 10 vilões

    if (topInflation.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-secondary); font-size:0.85rem; padding:1rem; text-align:center;">Nenhum aumento de preço detectado! 😊</div>';
    } else {
        topInflation.forEach(item => {
            listEl.innerHTML += `
                <div class="inflation-item">
                    <div class="inflation-item-info">
                        <h4 title="${item.name}">${item.name}</h4>
                        <p>Média: ${formatCurrency(item.oldPrice)} ➔ Atual: <strong>${formatCurrency(item.newPrice)}</strong></p>
                    </div>
                    <div class="inflation-badge">+${item.pct.toFixed(0)}%</div>
                </div>
            `;
        });
    }

    // Sort and render chart
    const sortedMonths = Object.keys(monthlyExpenses).sort();
    const labels = [];
    const data = [];

    sortedMonths.forEach(m => {
        const [yy, mm] = m.split('-');
        labels.push(`${mm}/${yy}`);
        data.push(monthlyExpenses[m]);
    });

    if (financeChartInstance) {
        financeChartInstance.destroy();
    }

    financeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gastos (R$)',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a1a1aa' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a1a1aa' }
                }
            }
        }
    });
}

// Render category spending breakdown no dashboard
function renderCategorySpending() {
    const section = document.getElementById('categorySpendingSection');
    const grid = document.getElementById('categorySpendingGrid');
    if (!section || !grid || Object.keys(groupedProducts).length === 0) return;

    const todayMs = Date.now();
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);

    const catTotals = {};
    const catCounts = {};

    Object.keys(groupedProducts).forEach(name => {
        const cat = resolveCategory(name);
        groupedProducts[name].forEach(h => {
            if (h.datetime && !isNaN(h.datetime) && h.datetime.getTime() >= cutoffMs) {
                if (!catTotals[cat]) { catTotals[cat] = 0; catCounts[cat] = 0; }
                catTotals[cat] += h.price * h.qty;
                catCounts[cat]++;
            }
        });
    });

    const cats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    if (cats.length === 0) { section.style.display = 'none'; return; }

    const maxVal = catTotals[cats[0]];
    section.style.display = 'block';
    grid.innerHTML = '';

    const colorMap = {
        hortifruti: '#22c55e', acougue: '#ef4444', limpeza: '#3b82f6',
        higiene: '#d946ef', laticinios: '#eab308', mercearia: '#f97316',
        bebidas: '#0ea5e9', doces: '#ec4899', padaria: '#f59e0b',
        utilidades: '#8b5cf6', outros: '#a1a1aa'
    };

    cats.slice(0, 10).forEach(cat => {
        const colorKey = getColorClassForCategory(cat);
        const color = colorMap[colorKey] || '#6366f1';
        const pct = Math.round((catTotals[cat] / maxVal) * 100);
        const card = document.createElement('div');
        card.className = 'cat-spend-card';
        card.style.setProperty('--card-accent', color);
        card.innerHTML = `
            <div class="cat-spend-name">${cat}</div>
            <div class="cat-spend-value">${formatCurrency(catTotals[cat])}</div>
            <div class="cat-spend-bar-bg"><div class="cat-spend-bar-fill" style="width:${pct}%"></div></div>
            <div class="cat-spend-count">${catCounts[cat]} compras &bull; ${DATA_CUTOFF_MONTHS} meses</div>
        `;
        grid.appendChild(card);
    });
}

// ============================================================
//  CALENDÁRIO DE COMPRAS
// ============================================================
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-indexed

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const CAT_COLOR_MAP = {
    hortifruti: '#22c55e', acougue: '#ef4444', limpeza: '#3b82f6',
    higiene: '#d946ef', laticinios: '#eab308', mercearia: '#f97316',
    bebidas: '#0ea5e9', doces: '#ec4899', padaria: '#f59e0b',
    utilidades: '#8b5cf6', outros: '#a1a1aa'
};

function initCalendar() {
    const section = document.getElementById('calendarSection');
    if (!section) return;
    section.style.display = 'block';

    document.getElementById('calPrevBtn').addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderCalendar();
    });
    document.getElementById('calNextBtn').addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderCalendar();
    });
    document.getElementById('calCloseDetail').addEventListener('click', () => {
        document.getElementById('calendarDayDetail').style.display = 'none';
    });
    renderCalendar();
}

function buildDayMap() {
    // dayMap[YYYY-MM-DD] = [ {name, price, market, cat} ]
    const dayMap = {};
    Object.keys(groupedProducts).forEach(name => {
        const cat = resolveCategory(name);
        groupedProducts[name].forEach(h => {
            if (!h.datetime || isNaN(h.datetime)) return;
            const key = h.datetime.toISOString().slice(0, 10);
            if (!dayMap[key]) dayMap[key] = [];
            dayMap[key].push({ name, price: h.price, qty: h.qty, market: h.market, cat });
        });
    });
    return dayMap;
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calMonthTitle');
    const label = document.getElementById('calendarMonthLabel');
    if (!grid) return;

    title.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;
    const today = new Date();
    const isCurrentMonth = calendarYear === today.getFullYear() && calendarMonth === today.getMonth();
    label.textContent = isCurrentMonth ? 'Mês atual' : '';

    const dayMap = buildDayMap();
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    grid.innerHTML = '';
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    weekdays.forEach(d => {
        const el = document.createElement('div');
        el.className = 'cal-weekday';
        el.textContent = d;
        grid.appendChild(el);
    });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'cal-day empty';
        grid.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const purchases = dayMap[dateKey] || [];
        const isToday = isCurrentMonth && d === today.getDate();

        const cell = document.createElement('div');
        cell.className = 'cal-day' + (purchases.length > 0 ? ' has-purchase' : '') + (isToday ? ' today' : '');

        const numEl = document.createElement('span');
        numEl.className = 'cal-day-num';
        numEl.textContent = d;
        cell.appendChild(numEl);

        if (purchases.length > 0) {
            const dots = document.createElement('div');
            dots.className = 'cal-day-dots';
            // Unique cats, max 4 dots
            const cats = [...new Set(purchases.map(p => getColorClassForCategory(p.cat)))].slice(0, 4);
            cats.forEach(c => {
                const dot = document.createElement('span');
                dot.className = 'cal-dot';
                dot.style.background = CAT_COLOR_MAP[c] || '#6366f1';
                dots.appendChild(dot);
            });
            cell.appendChild(dots);

            cell.addEventListener('click', () => showDayDetail(dateKey, purchases));
        }

        grid.appendChild(cell);
    }
}

function showDayDetail(dateKey, purchases) {
    const detail = document.getElementById('calendarDayDetail');
    const list = document.getElementById('calDetailList');
    const dateEl = document.getElementById('calDetailDate');

    const [y, m, d] = dateKey.split('-');
    dateEl.textContent = `${d}/${m}/${y} — ${purchases.length} compra(s)`;

    list.innerHTML = '';
    const sorted = [...purchases].sort((a, b) => a.cat.localeCompare(b.cat));
    sorted.forEach(p => {
        const item = document.createElement('div');
        item.className = 'cal-detail-item';
        item.innerHTML = `
            <div>
                <div class="cal-detail-item-name" title="${p.name}">${p.name}</div>
                <div class="cal-detail-item-market">${p.market || ''}</div>
            </div>
            <div class="cal-detail-item-price">${formatCurrency(p.price)}<span style="font-weight:400;color:var(--text-secondary);font-size:0.72rem"> ×${p.qty}</span></div>
        `;
        list.appendChild(item);
    });

    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================
//  MODO FAZER FEIRA
// ============================================================
let ffState = {}; // { itemName: 'pending' | 'checked' | 'not-found' }
let ffActiveCat = 'Todos';

function openFazerFeira() {
    const overlay = document.getElementById('fazerFeiraOverlay');
    if (!overlay) return;

    if (Object.keys(shoppingCart).length === 0) {
        setStatus('⚠️ Sua lista está vazia. Gere uma lista antes de fazer a feira.', true);
        return;
    }

    // Init state
    ffState = {};
    Object.keys(shoppingCart).forEach(name => { ffState[name] = 'pending'; });

    // Budget display
    const budget = parseFloat(document.getElementById('cartBudgetInput')?.value) || 0;
    const budgetEl = document.getElementById('ffBudgetDisplay');
    if (budgetEl) budgetEl.textContent = budget > 0 ? `Orçamento: ${formatCurrency(budget)}` : '';

    ffActiveCat = 'Todos';
    const ffSearchInput = document.getElementById('ffSearchInput');
    const ffSearchClearBtn = document.getElementById('ffSearchClearBtn');
    if (ffSearchInput) ffSearchInput.value = '';
    if (ffSearchClearBtn) ffSearchClearBtn.style.display = 'none';

    // Inicializar campo do local/mercado
    const ffMarketInput = document.getElementById('ffMarketInput');
    if (ffMarketInput) ffMarketInput.value = '';

    renderFFCategoryFilter();
    renderFFList();
    updateFFProgress();

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeFazerFeira() {
    const overlay = document.getElementById('fazerFeiraOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

function renderFFCategoryFilter() {
    const container = document.getElementById('ffCategoryFilter');
    if (!container) return;

    const cats = new Set(['Todos']);
    Object.keys(shoppingCart).forEach(name => cats.add(resolveCategory(name)));

    container.innerHTML = '';
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'ff-cat-chip' + (cat === ffActiveCat ? ' active' : '');
        btn.dataset.category = cat;

        let text = cat;
        if (cat === 'Todos') {
            const total = Object.keys(shoppingCart).length;
            const checked = Object.values(ffState).filter(s => s === 'checked').length;
            text = `Todos (${checked}/${total})`;
        } else {
            const itemsInCat = Object.keys(shoppingCart).filter(name => resolveCategory(name) === cat);
            const total = itemsInCat.length;
            const checked = itemsInCat.filter(name => ffState[name] === 'checked').length;
            text = `${cat} (${checked}/${total})`;
        }
        btn.textContent = text;

        btn.addEventListener('click', () => {
            ffActiveCat = cat;
            container.querySelectorAll('.ff-cat-chip').forEach(b => b.classList.toggle('active', b.dataset.category === cat));
            renderFFList();
        });
        container.appendChild(btn);
    });
}

function renderFFList() {
    const list = document.getElementById('ffList');
    if (!list) return;
    list.innerHTML = '';

    const searchQuery = document.getElementById('ffSearchInput')?.value.toLowerCase().trim() || '';

    // Group by category
    const grouped = {};
    Object.keys(shoppingCart).forEach(name => {
        const cat = resolveCategory(name);
        if (ffActiveCat !== 'Todos' && cat !== ffActiveCat) return;
        
        // Filter by search query
        if (searchQuery && !name.toLowerCase().includes(searchQuery) && !cat.toLowerCase().includes(searchQuery)) return;
        
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(name);
    });

    const cats = Object.keys(grouped).sort();
    cats.forEach(cat => {
        const header = document.createElement('div');
        header.className = 'ff-cat-header';
        header.textContent = cat;
        list.appendChild(header);

        // Ordenar itens dentro da categoria: pending (3) -> not-found (2) -> checked (1)
        const weight = { 'pending': 3, 'not-found': 2, 'checked': 1 };
        grouped[cat].sort((a, b) => {
            const stateA = ffState[a] || 'pending';
            const stateB = ffState[b] || 'pending';
            if (weight[stateA] !== weight[stateB]) {
                return weight[stateB] - weight[stateA];
            }
            return a.localeCompare(b);
        });

        grouped[cat].forEach(name => {
            const item = shoppingCart[name];
            const state = ffState[name] || 'pending';
            const colorKey = getColorClassForCategory(cat);
            const color = CAT_COLOR_MAP[colorKey] || '#6366f1';

            const el = document.createElement('div');
            el.className = `ff-item ${state !== 'pending' ? state : ''}`;
            el.style.setProperty('--item-col', color);
            el.dataset.name = name;

            const checkIcon = state === 'checked' ? '<i class="ph ph-check"></i>'
                : state === 'not-found' ? '<i class="ph ph-x"></i>' : '';

            el.innerHTML = `
                <div class="ff-check-circle">${checkIcon}</div>
                <div class="ff-item-info">
                    <div class="ff-item-name" title="${name}">${name}</div>
                    <div class="ff-item-meta">${cat}</div>
                </div>
                <div class="ff-item-right">
                    <div class="ff-item-price-wrapper">
                        <span style="font-size:0.75rem; font-weight:700; color:rgba(45,212,191,0.6)">R$</span>
                        <input type="number" step="0.01" class="ff-item-price-input" value="${item.price.toFixed(2)}" data-name="${name}">
                    </div>
                    <div class="ff-item-qty">Qtd: ${item.qty}</div>
                    <button class="ff-notfound-btn" data-name="${name}">Não achei</button>
                </div>
            `;

            // Click no input de preço - impedir marcar item como comprado
            const priceInput = el.querySelector('.ff-item-price-input');
            priceInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            priceInput.addEventListener('change', (e) => {
                const newPrice = parseFloat(e.target.value) || 0;
                shoppingCart[name].price = newPrice;
                updateFFProgress();
            });
            priceInput.addEventListener('input', (e) => {
                const newPrice = parseFloat(e.target.value) || 0;
                shoppingCart[name].price = newPrice;
                updateFFProgress();
            });

            // Click principal = marcar como checked / volta para pending
            el.addEventListener('click', (e) => {
                if (e.target.closest('.ff-notfound-btn') || e.target.closest('.ff-item-price-input')) return;
                
                const cur = ffState[name];
                ffState[name] = cur === 'checked' ? 'pending' : 'checked';
                
                // Feedback Háptico/Vibração
                if (navigator.vibrate) navigator.vibrate(15);

                updateFFProgress();
                renderFFList();
                renderFFCategoryFilter();
            });

            // Botão não encontrei
            el.querySelector('.ff-notfound-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                
                const cur = ffState[name];
                ffState[name] = cur === 'not-found' ? 'pending' : 'not-found';
                
                // Feedback Háptico/Vibração
                if (navigator.vibrate) navigator.vibrate(15);

                updateFFProgress();
                renderFFList();
                renderFFCategoryFilter();
            });

            list.appendChild(el);
        });
    });
}

function updateFFProgress() {
    const total = Object.keys(ffState).length;
    const checked = Object.values(ffState).filter(s => s === 'checked').length;
    const notFound = Object.values(ffState).filter(s => s === 'not-found').length;

    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

    document.getElementById('ffProgressText').textContent = `${checked} de ${total} itens marcados`;
    document.getElementById('ffProgressBar').style.width = pct + '%';
    document.getElementById('ffCheckedCount').textContent = `${checked} marcados`;
    document.getElementById('ffNotFoundCount').textContent = `${notFound} não enc.`;

    // Running total — soma só dos checked com os preços atualizados
    let running = 0;
    Object.keys(ffState).forEach(name => {
        if (ffState[name] === 'checked' && shoppingCart[name]) {
            running += shoppingCart[name].price * shoppingCart[name].qty;
        }
    });
    document.getElementById('ffRunningTotal').textContent = formatCurrency(running);
}

function finishFazerFeira() {
    const checked = Object.values(ffState).filter(s => s === 'checked').length;
    const notFound = Object.values(ffState).filter(s => s === 'not-found').length;
    const total = Object.keys(ffState).length;

    if (checked === 0) {
        setStatus("⚠️ Nenhum item foi marcado como comprado. Feira finalizada sem salvar.", true);
        closeFazerFeira();
        return;
    }

    let running = 0;
    const newItemsToSave = [];
    const rawToday = new Date();
    const formattedDate = `${String(rawToday.getDate()).padStart(2, '0')}/${String(rawToday.getMonth() + 1).padStart(2, '0')}/${rawToday.getFullYear()}`;

    const marketName = document.getElementById('ffMarketInput')?.value.trim() || 'Supermercado';

    Object.keys(ffState).forEach(name => {
        if (ffState[name] === 'checked' && shoppingCart[name]) {
            const item = shoppingCart[name];
            running += item.price * item.qty;
            
            let originalName = name;
            let unit = 'un';
            if (groupedProducts[name] && groupedProducts[name][0]) {
                originalName = groupedProducts[name][0].originalName;
                unit = groupedProducts[name][0].unit || 'un';
            }

            newItemsToSave.push({
                product: originalName,
                market: marketName,
                price: item.price,
                qty: item.qty,
                unit: unit,
                date: formattedDate
            });
        }
    });

    if (confirm(`🎉 Deseja finalizar a feira e salvar estas ${newItemsToSave.length} compras no histórico de preços?\n\nTotal real: ${formatCurrency(running)} no local "${marketName}"`)) {
        let userPurchases = JSON.parse(localStorage.getItem('feiraCertaUserPurchases')) || [];
        userPurchases = userPurchases.concat(newItemsToSave);
        localStorage.setItem('feiraCertaUserPurchases', JSON.stringify(userPurchases));

        // Limpar o carrinho
        shoppingCart = {};
        updateCartUI();

        // Reprocessar dados (incluir compras salvas no painel e estatísticas)
        processData(marketData, true);

        closeFazerFeira();
        setStatus(`🎉 Feira finalizada! ${checked} itens salvos no histórico. Total: ${formatCurrency(running)}`);
    } else {
        if (confirm("Deseja fechar o modo Fazer Feira sem salvar no histórico?")) {
            closeFazerFeira();
        }
    }
}

// Wire up fazer feira events after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    const navFazerFeiraBtn = document.getElementById('navFazerFeiraBtn');
    if (navFazerFeiraBtn) navFazerFeiraBtn.addEventListener('click', (e) => { e.preventDefault(); openFazerFeira(); });

    const ffCloseBtn = document.getElementById('ffCloseBtn');
    if (ffCloseBtn) ffCloseBtn.addEventListener('click', closeFazerFeira);

    const ffFinishBtn = document.getElementById('ffFinishBtn');
    if (ffFinishBtn) ffFinishBtn.addEventListener('click', finishFazerFeira);

    const ffSearchInput = document.getElementById('ffSearchInput');
    const ffSearchClearBtn = document.getElementById('ffSearchClearBtn');
    if (ffSearchInput) {
        ffSearchInput.addEventListener('input', () => {
            if (ffSearchClearBtn) {
                ffSearchClearBtn.style.display = ffSearchInput.value ? 'block' : 'none';
            }
            renderFFList();
        });
    }
    if (ffSearchClearBtn) {
        ffSearchClearBtn.addEventListener('click', () => {
            ffSearchInput.value = '';
            ffSearchClearBtn.style.display = 'none';
            renderFFList();
            ffSearchInput.focus();
        });
    }
});

// ============================================================
//  PRIORITY & BUDGET ADJUSTMENTS & EXCLUSIONS LOGIC
// ============================================================
function getPriority(name) {
    let originalName = name;
    if (groupedProducts[name] && groupedProducts[name][0]) {
        originalName = groupedProducts[name][0].originalName;
    }
    
    if (itemOverrides[originalName] && itemOverrides[originalName].customPriority) {
        return itemOverrides[originalName].customPriority;
    }
    return 'Média';
}

function setPriority(name, priority) {
    let originalName = name;
    if (groupedProducts[name] && groupedProducts[name][0]) {
        originalName = groupedProducts[name][0].originalName;
    }
    
    if (!itemOverrides[originalName]) {
        itemOverrides[originalName] = {};
    }
    itemOverrides[originalName].customPriority = priority;
    localStorage.setItem('feiraCertaOverrides', JSON.stringify(itemOverrides));
}

function adjustCartToBudget() {
    const budgetInput = document.getElementById('cartBudgetInput');
    const targetBudget = parseFloat(budgetInput?.value) || 0;
    if (targetBudget <= 0) return;

    const itemsKeys = Object.keys(shoppingCart);
    const weight = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
    
    const sortedGlobalItems = [...itemsKeys].sort((a, b) => {
        const prioA = getPriority(a);
        const prioB = getPriority(b);
        if (weight[prioB] !== weight[prioA]) {
            return weight[prioB] - weight[prioA];
        }
        return a.localeCompare(b);
    });

    let accumulated = 0;
    let removedCount = 0;

    sortedGlobalItems.forEach(name => {
        const item = shoppingCart[name];
        const cost = item.price * item.qty;
        if (accumulated + cost > targetBudget) {
            delete shoppingCart[name];
            removedCount++;
        } else {
            accumulated += cost;
        }
    });

    if (removedCount > 0) {
        updateCartUI();
        renderProducts(searchInput.value);
        setStatus(`✂️ Lista ajustada! ${removedCount} item(ns) de menor prioridade removido(s) para caber no orçamento.`);
    } else {
        setStatus("Sua lista já cabe no orçamento definido.");
    }
}

function excludeProduct(name) {
    if (confirm(`Deseja ocultar o produto "${name}" da lista de compras e do histórico?`)) {
        let originalName = name;
        if (groupedProducts[name] && groupedProducts[name][0]) {
            originalName = groupedProducts[name][0].originalName;
        }
        
        if (!excludedItems.includes(originalName)) {
            excludedItems.push(originalName);
            localStorage.setItem('feiraCertaExcludedItems', JSON.stringify(excludedItems));
        }
        
        if (shoppingCart[name]) {
            delete shoppingCart[name];
            updateCartUI();
        }
        
        processData(marketData, true);
        setStatus(`❌ Produto "${name}" ocultado com sucesso.`);
    }
}

function restoreProduct(origName) {
    excludedItems = excludedItems.filter(item => item !== origName);
    localStorage.setItem('feiraCertaExcludedItems', JSON.stringify(excludedItems));
    processData(marketData, true);
    renderExcludedItems();
    setStatus(`✅ Produto restaurado com sucesso.`);
}

function restoreAllProducts() {
    if (excludedItems.length === 0) return;
    if (confirm("Deseja restaurar todos os itens ocultados?")) {
        excludedItems = [];
        localStorage.setItem('feiraCertaExcludedItems', JSON.stringify([]));
        processData(marketData, true);
        renderExcludedItems();
        setStatus("✅ Todos os produtos foram restaurados.");
        document.getElementById('excludedModal').classList.remove('active');
    }
}

function renderExcludedItems() {
    const container = document.getElementById('excludedItemsList');
    if (!container) return;
    container.innerHTML = '';
    
    if (excludedItems.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 1.5rem 0; font-size: 0.9rem;">Nenhum item ocultado.</div>';
        return;
    }
    
    excludedItems.forEach(origName => {
        let displayName = origName;
        if (itemOverrides[origName] && itemOverrides[origName].customName) {
            displayName = itemOverrides[origName].customName;
        }
        
        const div = document.createElement('div');
        div.className = 'excluded-item-row';
        div.innerHTML = `
            <span style="font-size: 0.9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;" title="${displayName}">${displayName}</span>
            <button class="btn-restore-item" data-name="${origName}" title="Restaurar Item">
                <i class="ph ph-arrow-counter-clockwise"></i>
            </button>
        `;
        
        div.querySelector('.btn-restore-item').addEventListener('click', (e) => {
            const nameToRestore = e.currentTarget.getAttribute('data-name');
            restoreProduct(nameToRestore);
        });
        
        container.appendChild(div);
    });
}

function updateExcludedCount() {
    const countEl = document.getElementById('excludedCount');
    if (countEl) {
        countEl.textContent = excludedItems.length;
    }
}

