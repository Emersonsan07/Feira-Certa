let marketData = [];
let groupedProducts = {};
let currentChart = null;

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

const productsGrid = document.getElementById('productsGrid');
const searchInput = document.getElementById('searchInput');
const statusMessage = document.getElementById('statusMessage');

document.addEventListener('DOMContentLoaded', () => {
    // Attempt to load CSV automatically
    loadCSVFile('resultado_feira.csv');

    // Setup input file listener
    const fileInput = document.getElementById('fileInput');
    const importBtn = document.getElementById('importBtn');

    importBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                delimiter: ";", // Force semicolon since it's the structure
                complete: function (results) {
                    // APPEND data instead of replacing
                    const isFirstLoad = marketData.length === 0;
                    if (isFirstLoad) {
                        processData(results.data, true);
                    } else {
                        processData(results.data, false);
                    }
                    setStatus(`Arquivo "${file.name}" carregado com sucesso.`);
                    fileInput.value = ''; // Reset input to allow loading the same file again if needed
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
            const cartSidebar = document.getElementById('cartSidebar');
            if (cartSidebar && cartSidebar.classList.contains('open')) {
                cartSidebar.classList.remove('open');
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
    const cartSidebar = document.getElementById('cartSidebar');
    const clearCartBtn = document.getElementById('clearCartBtn');
    const shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');

    openCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cartSidebar.classList.add('open');
    });

    closeCartBtn.addEventListener('click', () => {
        cartSidebar.classList.remove('open');
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
});

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

    let markets = new Set();
    let dates = [];

    // Reprocess entirely 
    groupedProducts = {};

    marketData.forEach(row => {
        const originalProduct = row['Produto']?.trim();
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

    initCategoryFilters();
    renderProducts();
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

    // Sort products by frequency
    const productsByFrequency = Object.keys(groupedProducts).map(name => {
        const history = groupedProducts[name];
        const sortedHistory = [...history].sort((a, b) => b.datetime - a.datetime);

        // Calculate average quantity
        let totalQty = 0;
        history.forEach(h => totalQty += h.qty);
        const avgQty = totalQty / history.length;
        const recommendedQty = Math.max(1, Math.round(avgQty));

        return {
            name: name,
            frequency: history.length,
            recommendedQty: recommendedQty,
            latestPrice: sortedHistory[0].price
        };
    }).sort((a, b) => b.frequency - a.frequency);

    const topItems = productsByFrequency.slice(0, 15);

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
        setStatus(`Lista inteligente gerada! ${addedCount} itens mais comprados foram adicionados.`);
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
    let expiringCandidates = [];

    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];
        const sortedHistory = [...history].sort((a, b) => a.datetime - b.datetime);
        const latestPrice = sortedHistory[sortedHistory.length - 1].price;

        let totalQty = 0;
        history.forEach(h => totalQty += h.qty);
        const avgQty = totalQty / history.length;
        const recommendedQty = Math.max(1, Math.round(avgQty));

        let validDatesMs = [];
        let lastDateMsObj = null;

        sortedHistory.forEach(h => {
            const time = h.datetime.getTime();
            if (lastDateMsObj !== time) {
                validDatesMs.push(time);
                lastDateMsObj = time;
            }
        });

        if (validDatesMs.length >= 2) {
            let totalDiffMs = 0;
            for (let i = 1; i < validDatesMs.length; i++) {
                totalDiffMs += (validDatesMs[i] - validDatesMs[i - 1]);
            }
            const avgCycleMs = totalDiffMs / (validDatesMs.length - 1);

            const lastPurchaseMs = validDatesMs[validDatesMs.length - 1];
            const msSinceLastPurchase = todayMs - lastPurchaseMs;

            const urgencyScore = msSinceLastPurchase / avgCycleMs;

            if (urgencyScore >= 0.75) {
                expiringCandidates.push({
                    name: name,
                    urgency: urgencyScore,
                    recommendedQty: recommendedQty,
                    latestPrice: latestPrice
                });
            }
        }
    });

    expiringCandidates.sort((a, b) => b.urgency - a.urgency);
    const topItems = expiringCandidates.slice(0, 15);

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
        setStatus(`Sugestão ativada! ${addedCount} itens que provavelmente estão acabando foram adicionados.`);
    } else if (topItems.length > 0) {
        setStatus("Os itens que estão acabando já estão na sua lista.");
    } else {
        setStatus("Nenhum item em estado crítico de estoque no momento (ou faltam dados).");
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
        listContainer.innerHTML = '<div class="empty-cart-msg">Sua lista está vazia. Adicione produtos na tela principal.</div>';
        badge.style.display = 'none';
        totalEl.textContent = 'R$ 0,00';
        shareBtn.style.display = 'none';
        return;
    }

    shareBtn.style.display = 'flex';

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
        const header = document.createElement('div');
        header.style.fontSize = '0.85rem';
        header.style.fontWeight = 'bold';
        header.style.color = `var(--cat-${colorClass})`;
        header.style.marginTop = '1rem';
        header.style.marginBottom = '0.5rem';
        header.style.textTransform = 'uppercase';
        header.innerHTML = `<i class="ph ph-tag"></i> ${cat}`;
        listContainer.appendChild(header);

        groupedCart[cat].sort();

        groupedCart[cat].forEach(name => {
            const item = shoppingCart[name];
            totalItems += item.qty;
            totalPrice += (item.price * item.qty);

            const el = document.createElement('div');
            el.className = 'cart-item';
            el.innerHTML = `
                <div class="cart-item-info">
                    <h4 title="${name}">${name}</h4>
                    <p>${formatCurrency(item.price)} cada</p>
                    <div style="font-weight:600; color:var(--success); margin-top:2px;">
                        ${formatCurrency(item.price * item.qty)}
                    </div>
                </div>
                <div class="cart-item-actions">
                    <button class="qty-btn dec-btn" data-name="${name}">-</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn inc-btn" data-name="${name}">+</button>
                </div>
            `;
            listContainer.appendChild(el);
        });
    });

    badge.style.display = 'inline-block';
    badge.textContent = totalItems;
    totalEl.textContent = formatCurrency(totalPrice);

    // Attach qty events inside cart
    document.querySelectorAll('.dec-btn').forEach(btn => {
        btn.addEventListener('click', (e) => updateCartQuantity(e.currentTarget.getAttribute('data-name'), -1));
    });
    document.querySelectorAll('.inc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => updateCartQuantity(e.currentTarget.getAttribute('data-name'), 1));
    });
}

function getCategory(name) {
    const n = name.toLowerCase();

    if (n.match(/(detergente|det |sabao|sabão|sb |amaciante|amac |agua sanit|qboa|desinfetante|desinf |esponja|limpador|limp |veja|alcool|lava roup|lav louc|lustr mov|des vim|odor |sac ass|saco lixo|bob extrusa|inset |l vidro|sapólio|sapon|sab barra|comfort|downy|triex|lr |bom ar|lysoform)/)) return "Limpeza";

    if (n.match(/(shampoo|condicionador|sabonete|st lux|st liq|st |creme dental|cd colgate|cd |escova|desodorante|d a |rexona|pap hig|ph |absorvente|abs |fralda|apar barb|algodao|bastonete|prot diar|cr skala|sbt |sh\+co|toalha umed|toal|lenço|oleo cr|higiene)/)) return "Higiene Pessoal";

    if (n.match(/(banana|maça|maçã|maca |maca\b|uva|pera|laranja|limao|limão|mamao|mamão|melancia|melao|mexerica|morango|purapolpa|polpa|maracuj|abacate)/)) return "Hortifruti - Frutas";

    if (n.match(/(tomate|cebola|alho|batata|cenoura|alface|couve|brocolis|pimentao|pimentão|abobora|mandioca|mand |repolho|salsa |salada)/)) return "Hortifruti - Legumes";

    if (n.match(/(frango|carne|bife|acem|alcatra|peito|f peito|coxa|file|filezinho|peixe|linguica|linguiça|ling |salsicha|sals |porco|bacon|hamb|texas burg|patinho|costelinha|burguer|tilapia|tilápia|salmao)/)) return "Açougue";

    if (n.match(/(biscoito|bisc |bolacha|chocolate|choc |ch |ch bis|ch neu|salgadinho|sorvete|doce|bombom|ruffles|achoc |mms|cr avela|goiab |d l |batat palh|palha|ovo alp|ovo pascoa)/)) return "Doces & Snacks";

    if (n.match(/(leite|lte |queijo|qjo |muss |mussarela|presunto|pres |mortadela|mort |manteiga|margarina|marg |iorgute|iogurte|iog |requeijao|requeijão|rq |danone|cr cheese|cr leite|l cond|leit cond|ovos|ovo )/)) return "Laticínios & Frios";

    if (n.match(/(arroz|arr | feij |feijao|feijão|macarrao|macarrão|mac |oleo|óleo|ol soj|azeite|sal |sal$|acucar|açúcar|cafe|café|caf |farinha|far |f lactea|milho|flocao|extrato|ext |ex tom|extr tom|molho|m shoyu|shoyu|ervilha|amido|maizena|aveia|oregano|temp |chimichu|farofa|goma|paprica|massa rap10|tapioca|catchup|cat |ketchup|maionese|maion |mostarda|barbec)/)) return "Mercearia Básica";

    if (n.match(/(cerveja|refrigerante|suco|agua|água|ag |vinho|vin |vodka|coca |cha |v q morg|sprite|guarana|del valle)/)) return "Bebidas";

    if (n.match(/(pao|pão|p forma|torrada|bolo|mb italac|lasanha|rosq)/)) return "Padaria";

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
    // sort ascending for chart
    const chartHistory = [...history].sort((a, b) => a.datetime - b.datetime);

    document.getElementById('modalTitle').textContent = productName;

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

    document.getElementById('editModal').classList.add('active');

    document.getElementById('saveEditBtn').onclick = () => saveProductEdit(name, originals);
}

function saveProductEdit(currentName, originalNames) {
    const customName = document.getElementById('editCustomName').value.trim();
    const customCat = document.getElementById('editCategory').value;

    originalNames.forEach(orig => {
        if (!itemOverrides[orig]) itemOverrides[orig] = {};
        itemOverrides[orig].customName = customName || orig;
        itemOverrides[orig].customCategory = customCat;
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
