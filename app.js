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
                    if (typeof replenishEstoqueFromLatestInvoice === 'function') {
                        replenishEstoqueFromLatestInvoice(results.data);
                    }
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
    const navCompareBtn = document.getElementById('navCompareBtn');
    const dashboardView = document.getElementById('dashboardView');
    const productsView = document.getElementById('productsView');
    const compareView = document.getElementById('compareView');

    // Quick action buttons no dashboard
    const quickSmartListBtn = document.getElementById('quickSmartListBtn');
    const quickExpiringBtn = document.getElementById('quickExpiringBtn');
    if (quickSmartListBtn) quickSmartListBtn.addEventListener('click', () => { openCartAndRun(generateSmartList); });
    if (quickExpiringBtn) quickExpiringBtn.addEventListener('click', () => { openCartAndRun(generateExpiringList); });

    function showView(view) {
        const isDash = view === 'dashboard';
        const isProd = view === 'products';
        const isComp = view === 'compare';

        dashboardView.style.display = isDash ? 'block' : 'none';
        productsView.style.display = isProd ? 'block' : 'none';
        compareView.style.display = isComp ? 'block' : 'none';

        if (searchBarWrapper) searchBarWrapper.style.display = isProd ? 'block' : 'none';

        navDashboardBtn.classList.toggle('active', isDash);
        navProductsBtn.classList.toggle('active', isProd);
        if (navCompareBtn) navCompareBtn.classList.toggle('active', isComp);

        if (isComp) {
            updateCompareView();
        }
    }

    if (navDashboardBtn && navProductsBtn) {
        navDashboardBtn.addEventListener('click', (e) => { e.preventDefault(); showView('dashboard'); });
        navProductsBtn.addEventListener('click', (e) => { e.preventDefault(); showView('products'); });
        if (navCompareBtn) {
            navCompareBtn.addEventListener('click', (e) => { e.preventDefault(); showView('compare'); });
        }
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

    // Ouvintes para os controles de Comparativo
    const compMonthA = document.getElementById('compareMonthA');
    const compMonthB = document.getElementById('compareMonthB');
    const compCatFilter = document.getElementById('compareCategoryFilter');
    const compPriceFilter = document.getElementById('comparePriceChangeFilter');

    if (compMonthA) compMonthA.addEventListener('change', updateCompareView);
    if (compMonthB) compMonthB.addEventListener('change', updateCompareView);
    if (compCatFilter) compCatFilter.addEventListener('change', renderCompareItems);
    if (compPriceFilter) compPriceFilter.addEventListener('change', renderCompareItems);
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
        period = 'Primeira semana';
        hint = 'Lista completa para a feira mensal';
    } else if (day >= 21) {
        period = 'Última semana';
        hint = 'Lista completa para a feira mensal';
    } else {
        period = 'Meio do mês';
        hint = 'Itens pendentes da feira mensal';
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

function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-|\/)\S/g, function(m) { return m.toUpperCase(); });
}

function getSimplifiedName(name) {
    if (!name) return '';
    const n = name.toUpperCase().trim();

    // Regras específicas de padronização para agrupar itens duplicados/similares
    if (n.includes('PAO FRANCES') || n.includes('PÃO FRANCÊS')) return 'Pão Francês';
    if (n.includes('MUSS') || n.includes('MUSSARELA') || n.includes('QJO MUS')) return 'Queijo Mussarela';
    if (n.includes('PRESUNTO') || n.includes('PRES SADIA') || n.includes('PRES NOBRE')) return 'Presunto';
    if (n.includes('MORTADELA') || n.includes('MORT ') || n.includes('MORTAD')) return 'Mortadela';
    
    if (n.includes('LTE ') || n.includes('LEITE ')) {
        if (n.includes('PÓ') || n.includes(' EM PO') || n.includes(' EM PÓ')) return 'Leite em Pó';
        if (n.includes('COND')) return 'Leite Condensado';
        return 'Leite Líquido';
    }
    if (n.includes('CR LEITE') || n.includes('CR LEIT') || n.includes('CREME LEITE') || n.includes('CREME DE LEITE')) return 'Creme de Leite';
    if (n.includes('L COND') || n.includes('LEIT COND')) return 'Leite Condensado';
    
    if (n.includes('COCA COLA') || n.includes('COCA-COLA')) {
        if (n.includes('S/AC') || n.includes('ZERO') || n.includes('S/ AC')) return 'Coca-Cola Sem Açúcar';
        return 'Coca-Cola';
    }
    
    if (n.includes('BANANA')) {
        if (n.includes('PRATA')) return 'Banana Prata';
        if (n.includes('NANICA')) return 'Banana Nanica';
        return 'Banana';
    }
    if (n.includes('MAMAO') || n.includes('MAMÃO')) {
        if (n.includes('PAPAYA') || n.includes('PAPAIA')) return 'Mamão Papaya';
        if (n.includes('FORMOSA')) return 'Mamão Formosa';
        return 'Mamão';
    }
    if (n.includes('CEBOLA')) {
        if (n.includes('ROXA')) return 'Cebola Roxa';
        return 'Cebola';
    }
    if (n.includes('TOMATE')) {
        if (n.includes('ROMA') || n.includes('ITALIANO') || n.includes('RASTEIRO')) return 'Tomate Italiano / Rasteiro';
        return 'Tomate';
    }
    if (n.includes('CENOURA')) return 'Cenoura';
    if (n.includes('BATATA')) {
        if (n.includes('DOCE')) return 'Batata Doce';
        if (n.includes('PALHA')) return 'Batata Palha';
        return 'Batata';
    }
    if (n.includes('OVOS') || n.includes('OVO ')) return 'Ovos';
    if (n.includes('DET ') || n.includes('DETERGENTE') || n.includes('DET.YP')) return 'Detergente Líquido';
    if (n.includes('SAB LUX') || n.includes('SABONETE') || n.includes('SBT ') || n.includes('ST LUX') || n.includes('SAB BARRA')) return 'Sabonete';
    if (n.includes('SACOLA')) return 'Sacola Plástica';
    if (n.includes('PAPRICA') || n.includes('PÁPRICA')) return 'Páprica Defumada';
    if (n.includes('TAPIOCA') || n.includes('GOMA BEIJUBOM')) return 'Tapioca';
    if (n.includes('BISC ') || n.includes('BISCOITO') || n.includes('BOLACHA') || n.includes('CLUB SOCIAL')) return 'Biscoito';
    if (n.includes('MAC ') || n.includes('MACARRAO') || n.includes('MACARRÃO') || n.includes('ESPAG') || n.includes('PENNE') || n.includes('LASANHA')) return 'Macarrão / Massas';
    if (n.includes('EXT TOM') || n.includes('EXTR TOM') || n.includes('EXTRATO TOM') || n.includes('MOLHO TOMATE') || n.includes('MOLHO DE TOMATE') || n.includes('PASSATA') || n.includes('MOLHO QUERO') || n.includes('EXT QUERO')) return 'Extrato / Molho de Tomate';
    if (n.includes('MARG ') || n.includes('MARGARINA') || n.includes('MANTEIGA') || n.includes('QUALY')) return 'Margarina / Manteiga';
    if (n.includes('ARR ') || n.includes('ARROZ')) return 'Arroz';
    if (n.includes('CAF ') || n.includes('CAFE') || n.includes('CAFÉ')) return 'Café';
    if (n.includes('SALS ') || n.includes('SALSICHA')) return 'Salsicha';
    if (n.includes('TEXAS BURGUER') || n.includes('HAMB ') || n.includes('HAMBURGUER') || n.includes('BURGUER')) return 'Hambúrguer';
    if (n.includes('FILE PEITO') || n.includes('FILÉ PEITO') || n.includes('F PEITO') || n.includes('FILEZINHO') || n.includes('SASSAM') || n.includes('FGO BELLO') || n.includes('M PEITO')) return 'Peito de Frango (Filé/Sassami)';
    if (n.includes('COENTRO') || n.includes('SALSA ') || n.includes('CHEIRO VERDE') || n.includes('CHEIRO-VERDE')) return 'Cheiro Verde / Temperos';
    if (n.includes('REPOLHO')) return 'Repolho';
    if (n.includes('ALFACE')) return 'Alface';
    if (n.includes('COUVE')) return 'Couve';
    if (n.includes('BROCOLIS') || n.includes('BRÓCOLIS')) return 'Brócolis';
    if (n.includes('SUCO') || n.includes('DEL VALLE') || n.includes('TAMPICO')) return 'Suco';
    if (n.includes('IOG ') || n.includes('IOGURTE') || n.includes('IOG LIQ') || n.includes('IOG MOLICO') || n.includes('IOG NESTLE') || n.includes('IOG ITAM')) return 'Iogurte';
    if (n.includes('GUARANA') || n.includes('SPRITE') || n.includes('REFRIGERANTE')) return 'Refrigerante';
    if (n.includes('FAROFA')) return 'Farofa';
    if (n.includes('AGUA MIN') || n.includes('AGUA S/G') || n.includes('AG AQUARELA')) return 'Água Mineral';
    if (n.includes('AGUA SANIT') || n.includes('ÁGUA SANIT') || n.includes('QBOA')) return 'Água Sanitária';
    if (n.includes('AMAC ') || n.includes('AMACIANTE') || n.includes('COMFORT') || n.includes('DOWNY')) return 'Amaciante de Roupas';
    if (n.includes('ABS ') || n.includes('ABSORVENTE') || n.includes('PROT DIAR') || n.includes('CAREFREE')) return 'Absorvente Higiênico';
    if (n.includes('TOAL PIQUITUCHO') || n.includes('TOA COTTON') || n.includes('TOALHA UMEDECIDA')) return 'Toalha Umedecida';
    if (n.includes('FILME PVC') || n.includes('FILM WYDA')) return 'Filme PVC';
    if (n.includes('SC HERM') || n.includes('SACO HERM')) return 'Saco Hermético';
    if (n.includes('DESI ') || n.includes('DESINFETANTE') || n.includes('LYSOFORM') || n.includes('LIMP QBOA')) return 'Desinfetante';
    if (n.includes('FILTRO BRIGITTA') || n.includes('FILTRO BRAS') || n.includes('FILTRO 3 COR')) return 'Filtro de Café';
    if (n.includes('FERMENTO')) return 'Fermento';
    if (n.includes('LIXEIRA')) return 'Lixeira';
    if (n.includes('SHAMPOO') || n.includes('CONDICIONADOR') || n.includes('SH+CO') || n.includes('CR ELSEVE') || n.includes('MASC OX')) return 'Shampoo / Condicionador';
    if (n.includes('ESPONJA') || n.includes('ESP ')) return 'Esponja de Limpeza';
    if (n.includes('SACO LIXO')) return 'Saco de Lixo';

    return toTitleCase(name);
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
    
    // Evitar duplicar compras locais que já estejam refletidas nos dados do CSV
    const existingSignatures = new Set(marketData.map(d => {
        const prod = d['Produto']?.trim() || '';
        const mkt = d['Fornecedor']?.trim() || '';
        const date = d['Data']?.trim() || '';
        const qty = d['Quantidade']?.toString().replace(/\s/g, '').replace(',', '.') || '1';
        const price = d['Valor Unitário (R$)']?.toString().replace(/\s/g, '').replace(',', '.') || '0';
        return `${prod}_${mkt}_${date}_${qty}_${price}`;
    }));

    userPurchases.forEach(p => {
        const qtyStr = (p.qty || 1).toString();
        const priceStr = (p.price || 0).toString();
        const sig = `${p.product}_${p.market}_${p.date}_${qtyStr}_${priceStr}`;
        if (!existingSignatures.has(sig)) {
            allData.push({
                'Produto': p.product,
                'Fornecedor': p.market,
                'Preço': priceStr,
                'Quantidade': qtyStr,
                'Unidade': p.unit || 'UN',
                'Data': p.date
            });
        }
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
        } else {
            // Apply automatic simplification if no custom override exists
            product = getSimplifiedName(originalProduct);
        }

        const unitKey = Object.keys(row).find(k => k.toLowerCase().includes('unit') || k.toLowerCase().includes('preço') || k.toLowerCase().includes('preco'));
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

    // Inicializa meses do Comparativo
    initCompareMonths();
    if (document.getElementById('compareView') && document.getElementById('compareView').style.display === 'block') {
        updateCompareView();
    }
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

// Categorias consideradas perecíveis (compra semanal)
const PERISHABLE_CATEGORIES = [
    'Hortifruti - Frutas', 'Hortifruti - Legumes', 'Laticínios & Frios', 'Padaria'
];

// Verifica se um produto é perecível (compra semanal)
function isPerishable(name) {
    const cat = resolveCategory(name);
    return PERISHABLE_CATEGORIES.some(p => cat.includes(p.split(' ')[0]));
}

function generateSmartList() {
    if (!groupedProducts || Object.keys(groupedProducts).length === 0) {
        setStatus("Nenhum dado carregado para gerar a lista inteligente.", true);
        return;
    }

    const today = new Date();
    const todayMs = today.getTime();
    const dayOfMonth = today.getDate();
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);

    let periodoLabel;
    let compradoEsseMes = false;
    if (dayOfMonth <= 10) {
        periodoLabel = 'primeira semana';
    } else if (dayOfMonth >= 21) {
        periodoLabel = 'última semana';
    } else {
        periodoLabel = 'meio do mês';
        compradoEsseMes = true;
    }

    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    const scoredProducts = Object.keys(groupedProducts)
        .map(name => {
            const history = groupedProducts[name];
            const validHistory = history.filter(h => h.datetime && !isNaN(h.datetime.getTime()));
            if (validHistory.length < 1) return null;

            const sortedHistory = [...validHistory].sort((a, b) => b.datetime - a.datetime);
            const msSinceLast = todayMs - sortedHistory[0].datetime.getTime();

            // Ignorar comprado nos últimos 3 dias
            if (msSinceLast < (3 * 24 * 60 * 60 * 1000)) return null;

            // Perecíveis (frutas, legumes, frios, padaria) são geridos pela Reposição Semanal;
            // excluí-los da Feira do Mês evita duplicação
            if (isPerishable(name)) return null;

            // No meio do mês: pular itens já comprados este mês
            if (compradoEsseMes) {
                const jaComprado = validHistory.some(h => {
                    const mk = `${h.datetime.getFullYear()}-${h.datetime.getMonth()}`;
                    return mk === currentMonthKey;
                });
                if (jaComprado) return null;
            }

            const recentHistory = validHistory.filter(h => h.datetime.getTime() >= cutoffMs);
            const histForCalc = recentHistory.length >= 1 ? recentHistory : validHistory;

            // A feira mensal é feita na primeira ou última semana de cada mês.
            // Portanto, não filtramos os itens pelo dia médio de compra, garantindo que
            // a lista completa da feira mensal seja gerada seja qual for a semana escolhida.

            // Calcular quantidade e gasto mensais médios
            const byMonth = {};
            histForCalc.forEach(h => {
                const mk = `${h.datetime.getFullYear()}-${h.datetime.getMonth()}`;
                if (!byMonth[mk]) byMonth[mk] = { qty: 0, spend: 0 };
                byMonth[mk].qty += h.qty;
                byMonth[mk].spend += h.price * h.qty;
            });

            const months = Object.values(byMonth);
            const monthsCount = months.length;
            const avgMonthlyQty = months.reduce((s, m) => s + m.qty, 0) / monthsCount;
            const avgMonthlySpend = months.reduce((s, m) => s + m.spend, 0) / monthsCount;
            const recommendedQty = Math.max(1, Math.round(avgMonthlyQty));

            // Score = meses presentes × gasto mensal médio
            // Itens caros e recorrentes ficam no topo
            const score = monthsCount * avgMonthlySpend;

            return {
                name,
                score,
                monthsCount,
                frequency: histForCalc.length,
                recommendedQty,
                latestPrice: sortedHistory[0].price,
                avgMonthlySpend
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    const topItems = scoredProducts.slice(0, 150);

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
        setStatus(`🛒 Feira do ${periodoLabel}: ${topItems.length} itens priorizados por recorrência e valor!`);
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
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);

    // Separar candidatos: perecíveis (prioridade máxima) e demais itens com ciclo curto
    let perishaveis = [];
    let outrosCandidatos = [];

    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];
        const validHistory = history.filter(h => h.datetime && !isNaN(h.datetime.getTime()));
        if (validHistory.length < 1) return;

        const allSorted = [...validHistory].sort((a, b) => b.datetime - a.datetime);
        const lastEntry = allSorted[0];
        const msSinceLast = todayMs - lastEntry.datetime.getTime();

        // Ignorar se comprado há menos de 2 dias
        if (msSinceLast < (2 * 24 * 60 * 60 * 1000)) return;

        const isPerish = isPerishable(name);

        // --- Cálculo do ciclo de consumo ---
        const recentHistory = validHistory.filter(h => h.datetime.getTime() >= cutoffMs);
        const histForCycle = recentHistory.length >= 2 ? recentHistory : validHistory;
        const sortedForCycle = [...histForCycle].sort((a, b) => a.datetime - b.datetime);

        // Agrupar por dia
        const byDay = {};
        sortedForCycle.forEach(h => {
            const dk = h.datetime.toISOString().slice(0, 10);
            if (!byDay[dk]) byDay[dk] = { ms: h.datetime.getTime(), qty: 0 };
            byDay[dk].qty += h.qty;
        });
        const dayKeys = Object.keys(byDay).sort();

        // Para perecíveis com apenas 1 ocorrência, usar ciclo fixo de 7 dias
        let avgCycleMsPerUnit;
        if (dayKeys.length >= 2) {
            let diffMs = 0, units = 0;
            for (let i = 1; i < dayKeys.length; i++) {
                diffMs += byDay[dayKeys[i]].ms - byDay[dayKeys[i - 1]].ms;
                units += byDay[dayKeys[i - 1]].qty;
            }
            avgCycleMsPerUnit = units > 0 ? diffMs / units : 7 * 24 * 60 * 60 * 1000;
        } else if (isPerish) {
            // Perecível com 1 compra: assume ciclo de 7 dias
            avgCycleMsPerUnit = 7 * 24 * 60 * 60 * 1000;
        } else {
            return; // Não-perecível sem histórico suficiente: pular
        }

        // Quantidade da última compra (agrupada pelo dia)
        const lastDayKey = lastEntry.datetime.toISOString().slice(0, 10);
        let lastQty = 0;
        validHistory.forEach(h => {
            if (h.datetime.toISOString().slice(0, 10) === lastDayKey) lastQty += h.qty;
        });
        if (lastQty <= 0) lastQty = 1;

        const expectedLifeMs = lastQty * avgCycleMsPerUnit;
        if (expectedLifeMs <= 0) return;

        const urgencyScore = msSinceLast / expectedLifeMs;

        // Perecíveis: incluir a partir de 0.5 (já estão quase no fim)
        // Não-perecíveis: só incluir entre 0.7 e 3.5
        const minScore = isPerish ? 0.5 : 0.7;
        const maxScore = isPerish ? 5.0 : 3.5;
        if (urgencyScore < minScore || urgencyScore > maxScore) return;

        // Quantidade mínima recomendada para reposição semanal
        // Perecíveis: 1 unidade (quantidade mínima)
        // Demais: média histórica
        let recommendedQty;
        if (isPerish) {
            recommendedQty = 1;
        } else {
            const totalRecentQty = sortedForCycle.reduce((s, h) => s + h.qty, 0);
            recommendedQty = Math.max(1, Math.round(totalRecentQty / sortedForCycle.length));
        }

        let urgencyLabel;
        if (urgencyScore >= 2.0) urgencyLabel = '🔴 Atrasado';
        else if (urgencyScore >= 1.0) urgencyLabel = '🟠 Na hora';
        else urgencyLabel = '🟡 Em breve';

        const candidate = {
            name,
            urgency: urgencyScore,
            urgencyLabel,
            recommendedQty,
            latestPrice: lastEntry.price,
            isPerish,
            cycleAvgDays: Math.round(avgCycleMsPerUnit / (24 * 60 * 60 * 1000))
        };

        if (isPerish) {
            perishaveis.push(candidate);
        } else {
            outrosCandidatos.push(candidate);
        }
    });

    // Ordenar: perecíveis por urgência, depois demais por urgência
    perishaveis.sort((a, b) => b.urgency - a.urgency);
    outrosCandidatos.sort((a, b) => b.urgency - a.urgency);

    // Perecíveis têm prioridade: até 15 itens perecíveis + 5 outros
    const topPerish = perishaveis.slice(0, 15);
    const topOutros = outrosCandidatos.slice(0, 5);
    const topItems = [...topPerish, ...topOutros];

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
        const atrasados = topItems.filter(i => i.urgency >= 2.0).length;
        const emBreve = topItems.filter(i => i.urgency < 1.0).length;
        let msg = `🥬 Reposição semanal: ${topPerish.length} perecíveis + ${topOutros.length} outros.`;
        if (atrasados > 0) msg += ` (${atrasados} atrasados!)`;
        else if (emBreve > 0) msg += ` (${emBreve} chegando ao fim)`;
        setStatus(msg);
    } else if (topItems.length > 0) {
        setStatus("Os itens de reposição já estão na sua lista.");
    } else {
        setStatus("Nenhum perecível precisa de reposição agora (ou faltam dados históricos).");
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

        // Calcular total e qtd da categoria
        let catQty = 0;
        let catTotal = 0;
        groupedCart[cat].forEach(name => {
            const item = shoppingCart[name];
            catQty += item.qty;
            catTotal += item.price * item.qty;
        });

        // Category section header
        const header = document.createElement('div');
        header.className = 'cart-category-title';
        header.style.color = categoryColor;
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        
        header.innerHTML = `
            <span>${cat}</span>
            <span style="font-size: 0.85rem; font-weight: normal; opacity: 0.9;">
                ${catQty} item(s) &bull; ${formatCurrency(catTotal)}
            </span>
        `;
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

    if (n.match(/(detergente|det |sabao|sabão|sb |amaciante|amac |agua sanit|água sanit|qboa|desinfetante|desinf |esponja|limpador|limp |veja|alcool|álcool|lava roup|lav louc|lustr mov|des vim|odor |sac ass|saco lixo|bob extrusa|inset |l vidro|sapólio|sapon|sab barra|comfort|downy|triex|lr |bom ar|lysoform|multiuso|multi uso|pedra sanit|desengord|tira mancha|vassoura|rodo|pano|flanela|balde|saco|lixeira|omo|ariel|ype|brilhante|tixan|vanish|cloro|naftalina|desodorizador|lustra|cera)/)) return "Limpeza";

    if (n.match(/(shampoo|condicionador|sabonete|st lux|st liq|st |creme dental|cd colgate|cd |escova|desodorante|d a |rexona|pap hig|ph |absorvente|abs |fralda|apar barb|algodao|algodão|bastonete|prot diar|cr skala|sbt |sh\+co|toalha umed|toal|lenço|oleo cr|higiene|fio dental|enxaguante|barbear|pre barba|pos barba|laminas|hastes|hidratante|talco|creme pele|seda|pantene|dove|nivea|colgate|sensodyne|close up|oral b|listerine|palmolive|protex|bozzano|gillette|always|intimus|sempre livre|pampers|huggies|cremer|cotonete)/)) return "Higiene Pessoal";

    if (n.match(/(banana|maça|maçã|maca |\bmaca\b|uva|pera|laranja|limao|limão|mamao|mamão|melancia|melao|melão|mexerica|morango|purapolpa|polpa|maracuj|abacate|fruta|kiwi|manga|tangerina|goiaba|ameixa|caju|coco|pêssego|pessego|abacaxi|tanger|ponkan|tâmara|tamara|figo|amora|cereja|framboesa|mirtilo|physalis|roma|romã|nectarina|pitaia|carambola|jaca|caqui|graviola|cupuaçu|cupuacu|marolo)/)) return "Hortifruti - Frutas";

    if (n.match(/(tomate|cebola|alho|batata|cenoura|alface|couve|brocolis|brócolis|pimentao|pimentão|abobora|abóbora|mandioca|mand |repolho|salsa |salada|cheiro verde|pepino|beterraba|chuchu|berinjela|quiabo|vagem|rucula|rúcula|espinafre|agrião|agriao|coentro|cebolinha|hortela|hortelã|pimenta|gengibre|acelga|alcachofra|alcaparra|alecrim|alho-poro|alho-poró|aspargo|basilico|manjericao|manjericão|couve-flor|couve-de-bruxelas|endivia|endívia|ervilha|funcho|jiló|jilo|maxixe|mostarda|nabo|palmito|rabanete|salvia|sálvia|tomilho)/)) return "Hortifruti - Legumes";

    if (n.match(/(frango|carne|bife|acem|alcatra|peito|f peito|coxa|file|filé|filezinho|peixe|linguica|linguiça|ling |salsicha|sals |porco|bacon|hamb|texas burg|patinho|costelinha|burguer|tilapia|tilápia|salmao|salmão|fraldinha|maminha|picanha|cupim|lagarto|lombo|pernil|costela|moida|moída|bovino|suino|suíno|sardinha|atum|pescoço|sobrecoxa|moela|coração|coracao|asa|gizzard|drumet|sassami|tulipa|paleta|coxão|coxao|chã|cha|músculo|musculo|rabada|mocotó|mocoto|toscana|calabresa|tender|panceta|pancetta|toucinho|codorna|pato|marreco|coelho|javali|carneiro|ovelha|bode|cordeiro|cabrito|pescada|merluza|bacalhau|camarão|camarao|lagosta|lula|polvo|marisco|mexilhão|mexilhao|ostra|caranguejo|siri)/)) return "Açougue";

    if (n.match(/(biscoito|bisc |bolacha|chocolate|choc |ch |ch bis|ch neu|salgadinho|sorvete|sorv |doce|bombom|ruffles|achoc |mms|cr avela|goiab |d l |batat palh|palha|ovo alp|ovo pascoa|biju|casq |balas|pirulito|chiclete|amendoim|pipoca|gelatina|pudim|marshmallow|sobremesa|waffer|wafer|paçoca|pacoca|snack|fini|jujuba|torrone|pé de moleque|pe de moleque|rapadura|cocada|doce de leite|nutella|ovomaltine|toddy|nescau|achocolatado|cacau|cookies|rosquinha|tortuguita|kit kat|lacta|nestle|nestlé|garoto|hersheys|milka|trento|club social|pit stop|passatempo|negresco|oreo|bono|trakinas)/)) return "Doces & Snacks";

    if (n.match(/(leite|lte |queijo|qjo |qj |muss |mussarela|presunto|pres |mortadela|mort |manteiga|margarina|marg |iorgute|iogurte|iog |requeijao|requeijão|rq |danone|cr cheese|cr leite|l cond|leit cond|ovos|ovo |peito de peru|salame|provolone|parmesao|parmesão|coalho|ricota|yakult|nata|petit suisse|frios|laticinio|chesse|gorgonzola|cheddar|prato|minas|padrão|padrao|frescal|cottage|brie|camembert|mussarela de búfala|mussarela de bufala|cream cheese|leite de coco|leite de amêndoas|leite de amendoas|leite de soja|leite desnatado|leite integral|leite semi|bebida láctea|bebida lactea|chancliche|mascarpone)/)) return "Laticínios & Frios";

    if (n.match(/(arroz|arr | feij |feijao|feijão|macarrao|macarrão|mac |oleo|óleo|ol soj|azeite|sal |sal$|acucar|açúcar|cafe|café|caf |farinha|far |f lactea|milho|flocao|extrato|ext |ex tom|extr tom|molho|m shoyu|shoyu|ervilha|amido|maizena|aveia|oregano|temp |chimichu|farofa|goma|paprica|massa rap10|tapioca|catchup|cat |ketchup|maionese|maion |mostarda|barbec|louro|\bmel\b|mel |atum|seleta|azeitona|cogumelo|palmito|vinagre|cald|knorr|sazon|miojo|lamen|sop |canela|cravo|baunilha|adoçante|adocante|granola|cereal|mucilon|leite em po|ninho|trigo|fubá|fuba|polvilho|doce|azedo|lentilha|grão de bico|grao de bico|canjica|gergelim|linhaça|linhaca|chia|sagu|fermento|pó químico|po quimico|bicarbonato|gelatina|creme cebola|sopa|caldo galinha|caldo carne|caldo legumes|extrato tomate|molho tomate|polpa tomate|passata|molho pimenta|molho ingles|molho inglês|molho de alho|azeite de oliva|óleo de soja|oleo soja|óleo de girassol|oleo girassol|óleo de milho|oleo milho|óleo de canola|oleo canola|óleo de algodão|oleo algodao|banha|sal refinado|sal grosso|sal marinho|sal rosa|açúcar refinado|acucar refinado|açúcar cristal|acucar cristal|açúcar demerara|acucar demerara|açúcar mascavo|acucar mascavo|açúcar light|açúcar coco|adoçante líquido|adoçante em pó|café em pó|cafe po|café solúvel|cafe soluvel|café em grãos|cafe graos|cápsula café|capsula cafe|chá mate|cha mate|chá preto|cha preto|chá verde|cha verde|chá camomila|cha camomila|chá erva doce|cha erva doce)/)) return "Mercearia Básica";

    if (n.match(/(cerveja|refrigerante|suco|agua|água|ag |vinho|vin |vodka|coca |cha |chá |v q morg|sprite|guarana|del valle|pepsi|fanta|kuat|antarctica|skol|brahma|heineken|amstel|monster|red bull|energetico|energético|gin|rum|cachaça|licor|whisky|champagne|espumante|bebida|refri|ice)/)) return "Bebidas";

    if (n.match(/(pao|pão|p forma|torrada|bolo|mb italac|lasanha|rosq|chipa|croissant|baguete|bisnag|panet|chocott|pizza|esfiha|salgado|torta|pao de queijo|pão de queijo|cuca|broa|sonho|panific|pão francês|pao frances|pão de hambúrguer|pao hamburguer|pão de cachorro quente|pao cachorro quente|pão sírio|pao sirio|pão australiano|pao australiano|pão integral|pao integral|pão multigrãos|pao multigraos|pão centeio|pao centeio|colomba pascal|donuts|carolina|bomba chocolate|mil folhas|quindim|pudim padaria|torta doce|torta salgada|quiche|empada|empadão|pastel|folhado|pão de batata|pao batata|enroladinho|esfiha fechada|esfiha aberta)/)) return "Padaria";

    if (n.match(/(pap alumin|folha alum|filme pvc|film |pap toalha|t pap|sacola|filtro|isopor|sc herm|guardanapo|papel toalha|fita|pilha|bateria|lampada|lâmpada|fosforo|fósforo|vela|carvao|carvão|espeto|grelha|isqueiro|prendedor|cabide|pote|vasilha|tijela|garfo|faca|colher|copo descartável|copo descartavel|prato descartável|prato descartavel|talher descartável|talher descartavel|guardanapo de papel|papel alumínio|papel aluminio|papel manteiga|filme de pvc|filme plástico|filme plastico|saco hermético|saco hermetico|saco zip|saco para congelamento|saco para assar|saco assar|acendedor|espeto de madeira|espeto madeira|espeto de bambu|espeto bambu|grelha descartável|grelha descartavel|prendedor de roupas|prendedor roupas|varal|cabide plástico|cabide plastico|pilha aa|pilha aaa|pilha de lítio|pilha de litio|bateria 9v|lâmpada led|lampada led|lâmpada fluorescente|lampada fluorescente|vela de cera|vela votiva|vela flutuante|vela perfumada|repelente elétrico|repelente eletrico)/)) return "Utilidades";

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

    // Agrupar compras pelo nome do produto + mercado + preço para somar a quantidade e evitar repetições
    const groupedPurchases = {};
    purchases.forEach(p => {
        const key = `${p.name}_${p.market || ''}_${p.price}`;
        if (!groupedPurchases[key]) {
            groupedPurchases[key] = { ...p };
        } else {
            groupedPurchases[key].qty += p.qty;
        }
    });

    const uniquePurchases = Object.values(groupedPurchases);

    dateEl.textContent = `${d}/${m}/${y} — ${uniquePurchases.length} item(ns) distinto(s)`;

    list.innerHTML = '';
    const sorted = uniquePurchases.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
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
let ffHideChecked = false;

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
    ffHideChecked = false;

    // Reset visibility toggle button
    const toggleBtn = document.getElementById('ffToggleCheckedBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="ph ph-eye"></i>';
        toggleBtn.classList.remove('active');
        toggleBtn.title = "Ocultar itens comprados";
    }

    const listEl = document.getElementById('ffList');
    if (listEl) {
        listEl.classList.remove('hide-checked');
    }

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

function updateFFCategoryBadges() {
    const container = document.getElementById('ffCategoryFilter');
    if (!container) return;

    container.querySelectorAll('.ff-cat-chip').forEach(btn => {
        const cat = btn.dataset.category;
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
    });
}

function renderFFList() {
    const list = document.getElementById('ffList');
    if (!list) return;
    list.innerHTML = '';

    // Apply the current state of hide-checked to the list element
    list.classList.toggle('hide-checked', ffHideChecked);

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

        // Ordenar itens por ordem alfabética para manter a lista estável ao marcar itens
        grouped[cat].sort((a, b) => a.localeCompare(b));

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

            // Click principal = marcar como checked / volta para pending (em-lugar)
            el.addEventListener('click', (e) => {
                if (e.target.closest('.ff-notfound-btn') || e.target.closest('.ff-item-price-input')) return;

                const cur = ffState[name];
                const nextState = cur === 'checked' ? 'pending' : 'checked';
                ffState[name] = nextState;

                // Atualizar classes e ícones diretamente na DOM para evitar layout shifts
                el.className = `ff-item ${nextState !== 'pending' ? nextState : ''}`;
                const checkCircle = el.querySelector('.ff-check-circle');
                if (checkCircle) {
                    checkCircle.innerHTML = nextState === 'checked' ? '<i class="ph ph-check"></i>' : '';
                }

                // Feedback Háptico/Vibração
                if (navigator.vibrate) navigator.vibrate(15);

                updateFFProgress();
                updateFFCategoryBadges();
            });

            // Botão não encontrei (em-lugar)
            el.querySelector('.ff-notfound-btn').addEventListener('click', (e) => {
                e.stopPropagation();

                const cur = ffState[name];
                const nextState = cur === 'not-found' ? 'pending' : 'not-found';
                ffState[name] = nextState;

                // Atualizar classes e ícones diretamente na DOM para evitar layout shifts
                el.className = `ff-item ${nextState !== 'pending' ? nextState : ''}`;
                const checkCircle = el.querySelector('.ff-check-circle');
                if (checkCircle) {
                    checkCircle.innerHTML = nextState === 'not-found' ? '<i class="ph ph-x"></i>' : '';
                }

                // Feedback Háptico/Vibração
                if (navigator.vibrate) navigator.vibrate(15);

                updateFFProgress();
                updateFFCategoryBadges();
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

    const ffToggleCheckedBtn = document.getElementById('ffToggleCheckedBtn');
    if (ffToggleCheckedBtn) {
        ffToggleCheckedBtn.addEventListener('click', () => {
            ffHideChecked = !ffHideChecked;
            const ffListEl = document.getElementById('ffList');
            if (ffListEl) {
                ffListEl.classList.toggle('hide-checked', ffHideChecked);
            }
            ffToggleCheckedBtn.classList.toggle('active', ffHideChecked);
            ffToggleCheckedBtn.innerHTML = ffHideChecked ? '<i class="ph ph-eye-slash"></i>' : '<i class="ph ph-eye"></i>';
            ffToggleCheckedBtn.title = ffHideChecked ? "Mostrar itens comprados" : "Ocultar itens comprados";
        });
    }

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

// ============================================================
//  COMPARATIVO MÊS A MÊS
// ============================================================

function getYearMonthKey(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function getAvailableMonths() {
    const months = new Set();
    Object.values(groupedProducts).forEach(history => {
        history.forEach(h => {
            if (h.datetime && !isNaN(h.datetime.getTime())) {
                const key = getYearMonthKey(h.datetime);
                if (key) months.add(key);
            }
        });
    });
    return Array.from(months).sort();
}

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function formatMonthKey(key) {
    if (!key) return '';
    const [year, month] = key.split('-');
    const mIdx = parseInt(month, 10) - 1;
    return `${MONTH_NAMES_SHORT[mIdx]} / ${year}`;
}

function initCompareMonths() {
    const monthASelect = document.getElementById('compareMonthA');
    const monthBSelect = document.getElementById('compareMonthB');
    if (!monthASelect || !monthBSelect) return;

    const months = getAvailableMonths();

    // Salva o valor atual para tentar restaurar após repopular
    const valA = monthASelect.value;
    const valB = monthBSelect.value;

    monthASelect.innerHTML = '';
    monthBSelect.innerHTML = '';

    if (months.length === 0) {
        monthASelect.innerHTML = '<option value="">Nenhum dado</option>';
        monthBSelect.innerHTML = '<option value="">Nenhum dado</option>';
        return;
    }

    months.forEach(m => {
        const optionText = formatMonthKey(m);
        monthASelect.add(new Option(optionText, m));
        monthBSelect.add(new Option(optionText, m));
    });

    // Tenta restaurar seleções anteriores
    if (months.includes(valA)) {
        monthASelect.value = valA;
    } else if (months.length >= 2) {
        monthASelect.value = months[months.length - 2];
    } else {
        monthASelect.value = months[0];
    }

    if (months.includes(valB)) {
        monthBSelect.value = valB;
    } else if (months.length >= 1) {
        monthBSelect.value = months[months.length - 1];
    } else {
        monthBSelect.value = months[0];
    }
}

function updateCompareView() {
    const monthASelect = document.getElementById('compareMonthA');
    const monthBSelect = document.getElementById('compareMonthB');
    if (!monthASelect || !monthBSelect) return;

    const monthA = monthASelect.value;
    const monthB = monthBSelect.value;

    const grid = document.getElementById('compareCategoriesGrid');
    const tbody = document.getElementById('compareTableBody');

    if (!monthA || !monthB) {
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 2rem; color:var(--text-secondary);">Por favor, selecione dois meses para comparar.</div>';
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding: 2rem;">Nenhum dado para exibir.</td></tr>';
        return;
    }

    // Atualizar títulos das colunas na tabela de itens
    const thMonthA = document.getElementById('thMonthA');
    const thMonthB = document.getElementById('thMonthB');
    if (thMonthA) thMonthA.textContent = formatMonthKey(monthA);
    if (thMonthB) thMonthB.textContent = formatMonthKey(monthB);

    const categoryExpenses = {};
    const itemsComparison = [];

    // Obter todas as categorias conhecidas e inicializá-las
    const cats = new Set();
    Object.keys(groupedProducts).forEach(name => cats.add(resolveCategory(name)));
    cats.forEach(c => {
        categoryExpenses[c] = { totalA: 0, totalB: 0 };
    });

    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];
        const category = resolveCategory(name);

        const purchasesA = history.filter(h => h.datetime && getYearMonthKey(h.datetime) === monthA);
        const purchasesB = history.filter(h => h.datetime && getYearMonthKey(h.datetime) === monthB);

        // Somar para gastos de categorias
        purchasesA.forEach(h => {
            if (categoryExpenses[category]) {
                categoryExpenses[category].totalA += h.price * h.qty;
            }
        });
        purchasesB.forEach(h => {
            if (categoryExpenses[category]) {
                categoryExpenses[category].totalB += h.price * h.qty;
            }
        });

        // Calcular preços unitários médios
        let priceA = null;
        let priceB = null;

        if (purchasesA.length > 0) {
            const sumPrices = purchasesA.reduce((sum, h) => sum + h.price, 0);
            priceA = sumPrices / purchasesA.length;
        }

        if (purchasesB.length > 0) {
            const sumPrices = purchasesB.reduce((sum, h) => sum + h.price, 0);
            priceB = sumPrices / purchasesB.length;
        }

        if (priceA !== null || priceB !== null) {
            let changeType = 'Manteve';
            let changePct = 0;

            if (priceA !== null && priceB !== null) {
                changePct = ((priceB - priceA) / priceA) * 100;
                if (changePct > 0.01) {
                    changeType = 'Aumentou';
                } else if (changePct < -0.01) {
                    changeType = 'Baixou';
                } else {
                    changeType = 'Manteve';
                    changePct = 0;
                }
            } else if (priceA !== null && priceB === null) {
                changeType = 'NaoCompradoB';
            } else if (priceA === null && priceB !== null) {
                changeType = 'NaoCompradoA';
            }

            itemsComparison.push({
                name,
                category,
                priceA,
                priceB,
                changeType,
                changePct
            });
        }
    });

    renderCompareCategories(categoryExpenses);
    window.compareItemsData = itemsComparison;
    renderCompareItems();
}

function renderCompareCategories(categoryExpenses) {
    const grid = document.getElementById('compareCategoriesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const sortedCats = Object.keys(categoryExpenses).sort((a, b) => {
        return categoryExpenses[b].totalB - categoryExpenses[a].totalB;
    });

    const colorMap = {
        hortifruti: '#22c55e', acougue: '#ef4444', limpeza: '#3b82f6',
        higiene: '#d946ef', laticinios: '#eab308', mercearia: '#f97316',
        bebidas: '#0ea5e9', doces: '#ec4899', padaria: '#f59e0b',
        utilidades: '#8b5cf6', outros: '#a1a1aa'
    };

    let totalGeralA = 0;
    let totalGeralB = 0;

    sortedCats.forEach(cat => {
        const { totalA, totalB } = categoryExpenses[cat];
        totalGeralA += totalA;
        totalGeralB += totalB;

        if (totalA === 0 && totalB === 0) return;

        const diff = totalB - totalA;
        const diffPct = totalA > 0 ? (diff / totalA) * 100 : 0;

        const colorKey = getColorClassForCategory(cat);
        const color = colorMap[colorKey] || '#6366f1';

        const card = document.createElement('div');
        card.className = 'compare-cat-card';
        card.style.setProperty('--card-accent', color);

        let diffText = '';
        let diffClass = '';
        if (diff > 0.01) {
            diffText = `+${formatCurrency(diff)} (+${diffPct.toFixed(0)}%)`;
            diffClass = 'trend-up';
        } else if (diff < -0.01) {
            diffText = `${formatCurrency(diff)} (${diffPct.toFixed(0)}%)`;
            diffClass = 'trend-down';
        } else {
            diffText = `Sem variação`;
            diffClass = 'trend-equal';
        }

        card.innerHTML = `
            <div class="cat-name">${cat}</div>
            <div class="cat-values">
                <div class="val-month"><span>Mês A:</span> <strong>${formatCurrency(totalA)}</strong></div>
                <div class="val-month"><span>Mês B:</span> <strong>${formatCurrency(totalB)}</strong></div>
            </div>
            <div class="cat-trend ${diffClass}">
                <i class="ph ${diff > 0.01 ? 'ph-trend-up' : diff < -0.01 ? 'ph-trend-down' : 'ph-equals'}"></i>
                <span>${diffText}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            const catFilter = document.getElementById('compareCategoryFilter');
            if (catFilter) {
                catFilter.value = cat;
                renderCompareItems();

                const tableSection = document.querySelector('.compare-details-section');
                if (tableSection) {
                    tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });

        grid.appendChild(card);
    });

    if (totalGeralA > 0 || totalGeralB > 0) {
        const diffGeral = totalGeralB - totalGeralA;
        const diffGeralPct = totalGeralA > 0 ? (diffGeral / totalGeralA) * 100 : 0;

        let diffGeralText = '';
        let diffGeralClass = '';
        if (diffGeral > 0.01) {
            diffGeralText = `+${formatCurrency(diffGeral)} (+${diffGeralPct.toFixed(1)}%)`;
            diffGeralClass = 'trend-up';
        } else if (diffGeral < -0.01) {
            diffGeralText = `${formatCurrency(diffGeral)} (${diffGeralPct.toFixed(1)}%)`;
            diffGeralClass = 'trend-down';
        } else {
            diffGeralText = `Sem variação`;
            diffGeralClass = 'trend-equal';
        }

        const totalCard = document.createElement('div');
        totalCard.className = 'compare-cat-card total-card';
        totalCard.style.setProperty('--card-accent', 'linear-gradient(135deg, #60a5fa, #a78bfa)');
        totalCard.innerHTML = `
            <div class="cat-name">TOTAL GERAL</div>
            <div class="cat-values">
                <div class="val-month"><span>Mês A:</span> <strong>${formatCurrency(totalGeralA)}</strong></div>
                <div class="val-month"><span>Mês B:</span> <strong>${formatCurrency(totalGeralB)}</strong></div>
            </div>
            <div class="cat-trend ${diffGeralClass}">
                <i class="ph ${diffGeral > 0.01 ? 'ph-trend-up' : diffGeral < -0.01 ? 'ph-trend-down' : 'ph-equals'}"></i>
                <span>${diffGeralText}</span>
            </div>
        `;

        totalCard.addEventListener('click', () => {
            const catFilter = document.getElementById('compareCategoryFilter');
            if (catFilter) {
                catFilter.value = 'Todas';
                renderCompareItems();
            }
        });

        grid.insertBefore(totalCard, grid.firstChild);
    }

    const catFilter = document.getElementById('compareCategoryFilter');
    if (catFilter) {
        const activeVal = catFilter.value;
        catFilter.innerHTML = '<option value="Todas">Todas as Categorias</option>';
        sortedCats.forEach(cat => {
            const { totalA, totalB } = categoryExpenses[cat];
            if (totalA > 0 || totalB > 0) {
                catFilter.add(new Option(cat, cat));
            }
        });
        if (Array.from(catFilter.options).some(opt => opt.value === activeVal)) {
            catFilter.value = activeVal;
        } else {
            catFilter.value = 'Todas';
        }
    }
}

function renderCompareItems() {
    const tbody = document.getElementById('compareTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const categoryFilter = document.getElementById('compareCategoryFilter')?.value || 'Todas';
    const priceChangeFilter = document.getElementById('comparePriceChangeFilter')?.value || 'Todos';

    let filtered = window.compareItemsData || [];

    if (categoryFilter !== 'Todas') {
        filtered = filtered.filter(item => item.category === categoryFilter);
    }

    if (priceChangeFilter !== 'Todos') {
        filtered = filtered.filter(item => item.changeType === priceChangeFilter);
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-secondary);">Nenhum item corresponde aos filtros selecionados.</td></tr>`;
        return;
    }

    filtered.forEach(item => {
        const tr = document.createElement('tr');

        let varBadge = '';
        if (item.changeType === 'Aumentou') {
            varBadge = `<span class="badge-price-change badge-price-up"><i class="ph ph-arrow-up"></i> +${item.changePct.toFixed(1)}%</span>`;
        } else if (item.changeType === 'Baixou') {
            varBadge = `<span class="badge-price-change badge-price-down"><i class="ph ph-arrow-down"></i> ${item.changePct.toFixed(1)}%</span>`;
        } else if (item.changeType === 'Manteve') {
            varBadge = `<span class="badge-price-change badge-price-equal"><i class="ph ph-equals"></i> 0%</span>`;
        } else if (item.changeType === 'NaoCompradoB') {
            varBadge = `<span class="badge-price-change badge-price-missing" title="Não comprado no Mês B">Não comprado B</span>`;
        } else if (item.changeType === 'NaoCompradoA') {
            varBadge = `<span class="badge-price-change badge-price-new" title="Novo item no Mês B">Novo em B</span>`;
        }

        const priceAText = item.priceA !== null ? formatCurrency(item.priceA) : '<span style="color:var(--text-secondary); opacity:0.4;">-</span>';
        const priceBText = item.priceB !== null ? formatCurrency(item.priceB) : '<span style="color:var(--text-secondary); opacity:0.4;">-</span>';

        const colorClass = getColorClassForCategory(item.category);

        tr.innerHTML = `
            <td style="font-weight: 500;">${item.name}</td>
            <td><span class="category-pill color-${colorClass}">${item.category}</span></td>
            <td class="text-right font-mono">${priceAText}</td>
            <td class="text-right font-mono" style="font-weight:700;">${priceBText}</td>
            <td class="text-center">${varBadge}</td>
            <td class="text-center">
                <button class="btn-outline-sm view-item-history" data-name="${item.name}" title="Ver Histórico Completo">
                    <i class="ph ph-chart-line-up"></i>
                </button>
            </td>
        `;

        tr.querySelector('.view-item-history').addEventListener('click', (e) => {
            const name = e.currentTarget.getAttribute('data-name');
            openModal(name);
        });

        tbody.appendChild(tr);
    });
}

// ============================================================
//  NAVEGAÇÃO — PLANNER VIEW
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const navPlannerBtn = document.getElementById('navPlannerBtn');
    if (navPlannerBtn) {
        navPlannerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showPlannerView();
        });
    }

    const generatePlanBtn = document.getElementById('generatePlanBtn');
    if (generatePlanBtn) generatePlanBtn.addEventListener('click', generateMonthlyPlan);

    const navEstoqueBtn = document.getElementById('navEstoqueBtn');
    if (navEstoqueBtn) navEstoqueBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openEstoqueModal();
    });

    const closeEstoqueModal = document.getElementById('closeEstoqueModal');
    if (closeEstoqueModal) closeEstoqueModal.addEventListener('click', () => {
        document.getElementById('estoqueModal').classList.remove('active');
    });

    // Fechar clicando fora
    const estoqueModal = document.getElementById('estoqueModal');
    if (estoqueModal) estoqueModal.addEventListener('click', (e) => {
        if (e.target === estoqueModal) estoqueModal.classList.remove('active');
    });

    const toggleEstoqueFormBtn = document.getElementById('toggleEstoqueFormBtn');
    if (toggleEstoqueFormBtn) toggleEstoqueFormBtn.addEventListener('click', () => {
        document.getElementById('estoqueForm').classList.toggle('open');
    });

    const saveEstoqueItemBtn = document.getElementById('saveEstoqueItemBtn');
    if (saveEstoqueItemBtn) saveEstoqueItemBtn.addEventListener('click', saveEstoqueItem);

    const alertCard = document.getElementById('estoqueDashAlertCard');
    if (alertCard) alertCard.addEventListener('click', openEstoqueModal);

    const reporEstoqueNotaBtn = document.getElementById('reporEstoqueNotaBtn');
    if (reporEstoqueNotaBtn) {
        reporEstoqueNotaBtn.addEventListener('click', () => {
            replenishEstoqueFromLatestInvoice();
        });
    }

    // Inicializar alertas de estoque ao carregar
    updateEstoqueDashAlert();
});

function showPlannerView() {
    ['dashboardView','productsView','compareView','plannerView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === 'plannerView') ? 'block' : 'none';
    });
    const sbw = document.getElementById('searchBarWrapper');
    if (sbw) sbw.style.display = 'none';
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const btn = document.getElementById('navPlannerBtn');
    if (btn) btn.classList.add('active');
    renderReplenishmentPanel();
}

// ============================================================
//  FUNCIONALIDADE 1 — REPOSIÇÃO AUTOMÁTICA SEMANAL
// ============================================================
function renderReplenishmentPanel() {
    const grid = document.getElementById('replenishmentGrid');
    const hint = document.getElementById('replenDateHint');
    if (!grid) return;

    if (!groupedProducts || Object.keys(groupedProducts).length === 0) {
        grid.innerHTML = '<div class="replen-empty"><i class="ph ph-clock-countdown"></i><span>Carregue seu CSV para ver sugestões.</span></div>';
        return;
    }

    const todayMs  = Date.now();
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);
    const candidates = [];

    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];
        const valid = history.filter(h => h.datetime && !isNaN(h.datetime.getTime()));
        if (valid.length < 2) return;

        const recent = valid.filter(h => h.datetime.getTime() >= cutoffMs);
        const forCycle = recent.length >= 2 ? recent : valid;
        const sorted = [...forCycle].sort((a, b) => a.datetime - b.datetime);

        const byDay = {};
        sorted.forEach(h => {
            const k = h.datetime.toISOString().slice(0, 10);
            if (!byDay[k]) byDay[k] = { ms: h.datetime.getTime(), qty: 0 };
            byDay[k].qty += h.qty;
        });
        const days = Object.keys(byDay).sort();
        if (days.length < 2) return;

        let diffMs = 0, units = 0;
        for (let i = 1; i < days.length; i++) {
            diffMs += byDay[days[i]].ms - byDay[days[i - 1]].ms;
            units  += byDay[days[i - 1]].qty;
        }
        if (units <= 0) return;

        const cyclePerUnit = diffMs / units;
        const allSorted = [...valid].sort((a, b) => b.datetime - a.datetime);
        const lastMs = allSorted[0].datetime.getTime();
        const lastDayKey = allSorted[0].datetime.toISOString().slice(0, 10);
        let lastQty = 0;
        valid.forEach(h => { if (h.datetime.toISOString().slice(0, 10) === lastDayKey) lastQty += h.qty; });
        if (lastQty <= 0) lastQty = 1;

        const urgency = (todayMs - lastMs) / (lastQty * cyclePerUnit);
        if (urgency >= 0.7 && urgency <= 3.5) {
            let label, cls;
            if (urgency >= 2.0) { label = '🔴 Atrasado'; cls = 'urgency-atrasado'; }
            else if (urgency >= 1.0) { label = '🟠 Na hora';  cls = 'urgency-nahora'; }
            else { label = '🟡 Em breve'; cls = 'urgency-embreve'; }

            const avgQty = forCycle.reduce((s, h) => s + h.qty, 0) / forCycle.length;
            candidates.push({
                name, urgency, label, cls,
                qty: Math.max(1, Math.round(avgQty)),
                price: allSorted[0].price,
                cycleDays: Math.round(cyclePerUnit / (24 * 60 * 60 * 1000))
            });
        }
    });

    candidates.sort((a, b) => b.urgency - a.urgency);

    const now = new Date();
    if (hint) hint.textContent = `Semana de ${now.toLocaleDateString('pt-BR')} — ${candidates.length} item(ns) a repor`;

    if (candidates.length === 0) {
        grid.innerHTML = '<div class="replen-empty"><i class="ph ph-check-circle"></i><span>Tudo em dia! Nenhum item precisa de reposição agora.</span></div>';
        return;
    }

    grid.innerHTML = '';
    candidates.slice(0, 24).forEach(item => {
        const inCart = !!shoppingCart[item.name];
        const badgeCls = item.cls.replace('urgency-', '');
        const card = document.createElement('div');
        card.className = `replen-card ${item.cls}`;
        card.innerHTML = `
            <div class="replen-card-name" title="${item.name}">${item.name}</div>
            <div class="replen-card-meta">
                <span class="replen-urgency-badge badge-${badgeCls}">${item.label}</span>
                <span class="replen-price">${formatCurrency(item.price)}</span>
            </div>
            <div style="font-size:0.72rem;color:var(--text-secondary)">Ciclo ~${item.cycleDays}d · Qtd sugerida: ${item.qty}</div>
            <button class="replen-add-btn ${inCart ? 'added' : ''}" data-name="${item.name}" data-price="${item.price}" data-qty="${item.qty}">
                <i class="ph ${inCart ? 'ph-check' : 'ph-shopping-cart-simple'}"></i>
                ${inCart ? 'Na lista' : 'Adicionar à Lista'}
            </button>
        `;
        card.querySelector('.replen-add-btn').addEventListener('click', () => {
            if (!shoppingCart[item.name]) {
                shoppingCart[item.name] = { price: item.price, qty: item.qty };
            } else {
                delete shoppingCart[item.name];
            }
            updateCartUI();
            renderReplenishmentPanel();
        });
        grid.appendChild(card);
    });
}

// ============================================================
//  FUNCIONALIDADE 2 — CONTROLE DE ESTOQUE DOMÉSTICO
// ============================================================
let estoqueItems = JSON.parse(localStorage.getItem('feiraCertaEstoque')) || [];

function saveEstoque() {
    localStorage.setItem('feiraCertaEstoque', JSON.stringify(estoqueItems));
}

function openEstoqueModal() {
    // Preencher sugestões com produtos já conhecidos
    const dl = document.getElementById('estoqueProductSuggest');
    if (dl && groupedProducts) {
        dl.innerHTML = '';
        Object.keys(groupedProducts).slice(0, 120).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            dl.appendChild(opt);
        });
    }
    renderEstoqueList();
    document.getElementById('estoqueModal').classList.add('active');
}

function saveEstoqueItem() {
    const name   = (document.getElementById('estoqueItemName').value || '').trim();
    if (!name) { setStatus('⚠️ Informe o nome do produto.', true); return; }
    const qty    = parseFloat(document.getElementById('estoqueItemQty').value)    || 1;
    const unit   = document.getElementById('estoqueItemUnit').value;
    const expiry = document.getElementById('estoqueItemExpiry').value || null;
    const minQty = parseFloat(document.getElementById('estoqueItemMinQty').value) || 1;

    const existing = estoqueItems.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
        estoqueItems[existing] = { ...estoqueItems[existing], qty, unit, expiry, minQty };
    } else {
        estoqueItems.push({ id: Date.now(), name, qty, unit, expiry, minQty });
    }
    saveEstoque();

    document.getElementById('estoqueItemName').value   = '';
    document.getElementById('estoqueItemQty').value    = '1';
    document.getElementById('estoqueItemExpiry').value = '';
    document.getElementById('estoqueItemMinQty').value = '1';
    document.getElementById('estoqueForm').classList.remove('open');

    renderEstoqueList();
    updateEstoqueDashAlert();
    setStatus(`✅ "${name}" salvo no estoque doméstico.`);
}

function getEstoqueStatus(item) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (item.expiry) {
        const exp = new Date(item.expiry + 'T00:00:00');
        const diff = Math.round((exp - today) / (24 * 60 * 60 * 1000));
        if (diff < 0)   return { cls: 'estoque-vencido',     badge: 'estoque-badge-vencido', label: `Vencido há ${-diff}d` };
        if (diff === 0) return { cls: 'estoque-vence-breve', badge: 'estoque-badge-vence',   label: 'Vence HOJE' };
        if (diff <= 7)  return { cls: 'estoque-vence-breve', badge: 'estoque-badge-vence',   label: `Vence em ${diff}d` };
    }
    if (item.qty <= item.minQty) return { cls: 'estoque-baixo', badge: 'estoque-badge-baixo', label: 'Estoque baixo' };
    return { cls: '', badge: 'estoque-badge-ok', label: 'OK' };
}

function renderEstoqueList() {
    const container = document.getElementById('estoqueList');
    const alertsEl  = document.getElementById('estoqueAlertsContainer');
    if (!container) return;

    // --- Alertas rápidos ---
    if (alertsEl) {
        alertsEl.innerHTML = '';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const vencidos  = estoqueItems.filter(i => i.expiry && new Date(i.expiry + 'T00:00:00') < today);
        const venceHoje = estoqueItems.filter(i => { if (!i.expiry) return false; const d = new Date(i.expiry + 'T00:00:00'); return d.getTime() === today.getTime(); });
        const venceSem  = estoqueItems.filter(i => { if (!i.expiry) return false; const diff = Math.round((new Date(i.expiry + 'T00:00:00') - today) / 864e5); return diff > 0 && diff <= 7; });
        const baixos    = estoqueItems.filter(i => i.qty <= i.minQty && !vencidos.includes(i) && !venceHoje.includes(i));

        function mkAlert(cls, icon, text) {
            const d = document.createElement('div');
            d.className = `estoque-alert-row ${cls}`;
            d.innerHTML = `<i class="ph ${icon}"></i><span>${text}</span>`;
            alertsEl.appendChild(d);
        }
        if (alertsEl.children.length === 0 && vencidos.length + venceHoje.length + venceSem.length + baixos.length > 0) {
            const title = document.createElement('div');
            title.className = 'estoque-alert-title';
            title.textContent = '⚠️ Alertas Ativos';
            alertsEl.appendChild(title);
        }
        if (vencidos.length)  mkAlert('alert-vencido',      'ph-warning-circle', `Vencido(s): ${vencidos.map(i => i.name).join(', ')}`);
        if (venceHoje.length) mkAlert('alert-vence-hoje',   'ph-clock',          `Vence hoje: ${venceHoje.map(i => i.name).join(', ')}`);
        if (venceSem.length)  mkAlert('alert-vence-semana', 'ph-calendar',       `Vence essa semana: ${venceSem.map(i => i.name).join(', ')}`);
        if (baixos.length)    mkAlert('alert-baixo',         'ph-tray',           `Estoque baixo: ${baixos.map(i => i.name).join(', ')}`);
    }

    if (estoqueItems.length === 0) {
        container.innerHTML = '<div class="estoque-empty"><i class="ph ph-warehouse"></i><span>Estoque vazio. Adicione itens!</span></div>';
        return;
    }

    const order = { 'estoque-vencido': 0, 'estoque-vence-breve': 1, 'estoque-baixo': 2, '': 3 };
    const sorted = [...estoqueItems].sort((a, b) => {
        const oa = order[getEstoqueStatus(a).cls] ?? 3;
        const ob = order[getEstoqueStatus(b).cls] ?? 3;
        return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
    });

    container.innerHTML = '';
    sorted.forEach(item => {
        const st = getEstoqueStatus(item);
        const catIcon = getCategoryIconHtml(resolveCategory(item.name));
        const row = document.createElement('div');
        row.className = `estoque-item-row ${st.cls}`;
        row.innerHTML = `
            <div class="estoque-item-icon">${catIcon}</div>
            <div class="estoque-item-info">
                <div class="estoque-item-name">${item.name}</div>
                <div class="estoque-item-meta">
                    <span>${item.unit}</span>
                    ${item.expiry ? `<span>Val: ${new Date(item.expiry + 'T00:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
                    <span>Mín: ${item.minQty}</span>
                </div>
            </div>
            <span class="estoque-status-badge ${st.badge}">${st.label}</span>
            <div class="estoque-item-qty">
                <button class="estoque-qty-btn" data-id="${item.id}" data-delta="-1"><i class="ph ph-minus"></i></button>
                <span class="estoque-qty-val">${item.qty}</span>
                <button class="estoque-qty-btn" data-id="${item.id}" data-delta="1"><i class="ph ph-plus"></i></button>
            </div>
            <button class="btn-del-estoque" data-id="${item.id}" title="Remover"><i class="ph ph-trash"></i></button>
        `;
        row.querySelectorAll('.estoque-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id    = parseInt(btn.getAttribute('data-id'));
                const delta = parseInt(btn.getAttribute('data-delta'));
                changeEstoqueQty(id, delta);
            });
        });
        row.querySelector('.btn-del-estoque').addEventListener('click', () => {
            removeEstoqueItem(parseInt(item.id));
        });
        container.appendChild(row);
    });
}

function getCategoryIconHtml(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('hortifruti')) return '<i class="ph ph-leaf" style="color:#22c55e"></i>';
    if (c.includes('açougue'))   return '<i class="ph ph-fork-knife" style="color:#ef4444"></i>';
    if (c.includes('limpeza'))   return '<i class="ph ph-sparkle" style="color:#3b82f6"></i>';
    if (c.includes('laticínio')) return '<i class="ph ph-drop" style="color:#eab308"></i>';
    if (c.includes('bebida'))    return '<i class="ph ph-cup" style="color:#0ea5e9"></i>';
    if (c.includes('padaria'))   return '<i class="ph ph-bread" style="color:#f59e0b"></i>';
    if (c.includes('higiene'))   return '<i class="ph ph-heart" style="color:#d946ef"></i>';
    return '<i class="ph ph-package" style="color:#a1a1aa"></i>';
}

function changeEstoqueQty(id, delta) {
    const idx = estoqueItems.findIndex(i => i.id === id);
    if (idx < 0) return;
    estoqueItems[idx].qty = Math.max(0, parseFloat((estoqueItems[idx].qty + delta).toFixed(1)));
    saveEstoque();
    renderEstoqueList();
    updateEstoqueDashAlert();
}

function removeEstoqueItem(id) {
    estoqueItems = estoqueItems.filter(i => i.id !== id);
    saveEstoque();
    renderEstoqueList();
    updateEstoqueDashAlert();
}

function updateEstoqueDashAlert() {
    const alertCount = estoqueItems.filter(item => getEstoqueStatus(item).cls !== '').length;
    const dashDiv  = document.getElementById('estoqueDashAlert');
    const badge    = document.getElementById('estoqueBadge');
    const countEl  = document.getElementById('estoqueDashAlertCount');
    const descEl   = document.getElementById('estoqueDashAlertDesc');

    if (dashDiv)  dashDiv.style.display  = alertCount > 0 ? 'block' : 'none';
    if (badge)    badge.style.display    = alertCount > 0 ? 'inline' : 'none';
    if (countEl)  countEl.textContent    = alertCount;
    if (descEl)   descEl.textContent     = `${alertCount} produto(s) precisam de atenção no estoque`;
}

// ============================================================
//  FUNCIONALIDADE 3 — PLANEJAMENTO MENSAL COM DIVISÃO SEMANAL
// ============================================================
let weekChecks     = JSON.parse(localStorage.getItem('feiraCertaWeekChecks')) || {};
let monthlyPlanCache = null;

function generateMonthlyPlan() {
    if (!groupedProducts || Object.keys(groupedProducts).length === 0) {
        setStatus('⚠️ Carregue o CSV primeiro.', true); return;
    }

    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const label = MONTH_NAMES[month] + ' / ' + year;
    const plannerLabel = document.getElementById('plannerMonthLabel');
    if (plannerLabel) plannerLabel.textContent = `Plano para ${label}`;

    const todayMs  = now.getTime();
    const cutoffMs = todayMs - (DATA_CUTOFF_MONTHS * 30.44 * 24 * 60 * 60 * 1000);

    const items = [];
    Object.keys(groupedProducts).forEach(name => {
        const history = groupedProducts[name];
        const valid = history.filter(h => h.datetime && !isNaN(h.datetime.getTime()));
        if (valid.length < 1) return;

        const recent  = valid.filter(h => h.datetime.getTime() >= cutoffMs);
        const forCalc = recent.length >= 1 ? recent : valid;

        const qtyByMonth = {};
        forCalc.forEach(h => {
            const mk = `${h.datetime.getFullYear()}-${h.datetime.getMonth()}`;
            if (!qtyByMonth[mk]) qtyByMonth[mk] = 0;
            qtyByMonth[mk] += h.qty;
        });
        const months   = Object.keys(qtyByMonth).length;
        const totalQty = Object.values(qtyByMonth).reduce((s, v) => s + v, 0);
        const avgMonthlyQty = Math.max(1, Math.round(totalQty / months));

        let totalDay = 0;
        forCalc.forEach(h => totalDay += h.datetime.getDate());
        const avgDay = totalDay / forCalc.length;

        const sortedByDate = [...valid].sort((a, b) => b.datetime - a.datetime);
        items.push({ name, avgDay, avgMonthlyQty, price: sortedByDate[0].price, months });
    });

    // Ordenar por frequência (mais comprado primeiro)
    items.sort((a, b) => b.months - a.months);
    const topItems = items.slice(0, 120);

    // Distribuir em 4 semanas pelo dia médio de compra
    const weeks = [
        { label: 'Semana 1', range: '1–7',   items: [] },
        { label: 'Semana 2', range: '8–14',  items: [] },
        { label: 'Semana 3', range: '15–21', items: [] },
        { label: 'Semana 4', range: '22–31', items: [] },
    ];

    topItems.forEach(item => {
        const d = item.avgDay;
        let wIdx = 0;
        if (d >= 8  && d < 15)  wIdx = 1;
        else if (d >= 15 && d < 22) wIdx = 2;
        else if (d >= 22)        wIdx = 3;
        weeks[wIdx].items.push(item);
    });

    monthlyPlanCache = { weeks, year, month };
    renderWeeksGrid();
    setStatus(`📅 Plano de ${label} gerado com ${topItems.length} itens em 4 semanas!`);
}

function renderWeeksGrid() {
    const grid = document.getElementById('weeksGrid');
    if (!grid || !monthlyPlanCache) return;

    const { weeks, year, month } = monthlyPlanCache;
    grid.innerHTML = '';

    weeks.forEach((week, wIdx) => {
        if (week.items.length === 0) return;

        const wk = `${year}-${month + 1}-W${wIdx + 1}`;
        if (!weekChecks[wk]) weekChecks[wk] = {};

        const totalEst = week.items.reduce((s, i) => s + i.price * i.avgMonthlyQty, 0);
        const doneCount = week.items.filter(i => weekChecks[wk][i.name]).length;

        const card = document.createElement('div');
        card.className = 'week-card';
        card.innerHTML = `
            <div class="week-card-header">
                <div>
                    <div class="week-title">${week.label} <span style="font-size:0.72rem;color:var(--text-secondary);font-weight:400">(${doneCount}/${week.items.length} ✓)</span></div>
                    <div class="week-date-range">Dias ${week.range}</div>
                </div>
                <span class="week-total-badge">~${formatCurrency(totalEst)}</span>
            </div>
            <div class="week-items-list" id="weekList_${wIdx}"></div>
            <div class="week-card-footer">
                <button class="btn-week-add-all" data-widx="${wIdx}">
                    <i class="ph ph-shopping-cart-simple"></i> Adicionar tudo à lista
                </button>
            </div>
        `;

        const listEl = card.querySelector(`#weekList_${wIdx}`);
        week.items.forEach(item => {
            const checked = !!weekChecks[wk][item.name];
            const row = document.createElement('div');
            row.className = 'week-item-row';
            row.innerHTML = `
                <div class="week-item-check ${checked ? 'done' : ''}" data-wk="${wk}" data-name="${item.name}">
                    ${checked ? '<i class="ph ph-check"></i>' : ''}
                </div>
                <span class="week-item-name ${checked ? 'done-text' : ''}" title="${item.name}">${item.name}</span>
                <span class="week-item-price">${formatCurrency(item.price)}</span>
            `;
            row.querySelector('.week-item-check').addEventListener('click', (e) => {
                const wkk = e.currentTarget.getAttribute('data-wk');
                const nm  = e.currentTarget.getAttribute('data-name');
                weekChecks[wkk][nm] = !weekChecks[wkk][nm];
                localStorage.setItem('feiraCertaWeekChecks', JSON.stringify(weekChecks));
                renderWeeksGrid();
            });
            listEl.appendChild(row);
        });

        card.querySelector('.btn-week-add-all').addEventListener('click', () => {
            let added = 0;
            week.items.forEach(item => {
                if (!shoppingCart[item.name]) {
                    shoppingCart[item.name] = { price: item.price, qty: item.avgMonthlyQty };
                    added++;
                }
            });
            updateCartUI();
            setStatus(`🛒 ${added} itens da ${week.label} adicionados à lista!`);
        });

        grid.appendChild(card);
    });
}

function getLatestInvoiceItems(dataList = null) {
    const entries = [];
    if (dataList) {
        dataList.forEach(row => {
            const originalProduct = row['Produto']?.trim();
            if (!originalProduct) return;
            if (excludedItems.includes(originalProduct)) return;

            const dateRaw = row['Data']?.trim();
            const dt = parseDate(dateRaw);
            if (!dt || isNaN(dt.getTime())) return;

            let qtyRaw = row['Quantidade'] ? row['Quantidade'].toString().replace(/\s/g, '').replace(',', '.') : "1";
            let parsedQty = parseFloat(qtyRaw);
            if (isNaN(parsedQty) || parsedQty <= 0) parsedQty = 1;

            const unit = row['Unidade'] || 'UN';

            let product = originalProduct;
            if (itemOverrides[originalProduct] && itemOverrides[originalProduct].customName) {
                product = itemOverrides[originalProduct].customName;
            } else {
                product = getSimplifiedName(originalProduct);
            }

            entries.push({
                product,
                date: dateRaw,
                datetime: dt,
                qty: parsedQty,
                unit: unit.toLowerCase()
            });
        });
    } else {
        Object.keys(groupedProducts).forEach(product => {
            groupedProducts[product].forEach(h => {
                if (h.datetime && !isNaN(h.datetime.getTime())) {
                    entries.push({
                        product,
                        date: h.date,
                        datetime: h.datetime,
                        qty: h.qty,
                        unit: (h.unit || 'un').toLowerCase()
                    });
                }
            });
        });
    }

    if (entries.length === 0) return [];

    let latestMs = 0;
    entries.forEach(e => {
        if (e.datetime.getTime() > latestMs) {
            latestMs = e.datetime.getTime();
        }
    });

    if (latestMs === 0) return [];

    const latestDateObj = new Date(latestMs);
    const latestDateStr = latestDateObj.toISOString().slice(0, 10);

    const latestEntries = entries.filter(e => {
        return e.datetime.toISOString().slice(0, 10) === latestDateStr;
    });

    return latestEntries;
}

function replenishEstoqueFromLatestInvoice(dataList = null) {
    const itemsToReplenish = getLatestInvoiceItems(dataList);
    if (itemsToReplenish.length === 0) {
        setStatus("⚠️ Nenhuma compra encontrada para repor.", true);
        return;
    }

    const grouped = {};
    itemsToReplenish.forEach(item => {
        if (!grouped[item.product]) {
            grouped[item.product] = { qty: 0, unit: item.unit };
        }
        grouped[item.product].qty += item.qty;
    });

    let addedCount = 0;
    let updatedCount = 0;

    Object.keys(grouped).forEach(name => {
        const info = grouped[name];
        const existingIdx = estoqueItems.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
        if (existingIdx >= 0) {
            estoqueItems[existingIdx].qty = parseFloat((estoqueItems[existingIdx].qty + info.qty).toFixed(1));
            if (info.unit && info.unit !== 'un') {
                estoqueItems[existingIdx].unit = info.unit;
            }
            updatedCount++;
        } else {
            estoqueItems.push({
                id: Date.now() + Math.random(),
                name: name,
                qty: info.qty,
                unit: info.unit || 'un',
                expiry: null,
                minQty: 1
            });
            addedCount++;
        }
    });

    saveEstoque();
    renderEstoqueList();
    updateEstoqueDashAlert();

    const dateStr = itemsToReplenish[0].date;
    setStatus(`📦 Estoque doméstico reabastecido com a nota de ${dateStr} (${addedCount} novos, ${updatedCount} atualizados).`);
}

