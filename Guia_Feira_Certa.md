# 🛒 Guia Rápido: Como usar o Feira Certa

Bem-vindo ao **Feira Certa**, sua plataforma pessoal para acompanhar os gastos de mercado, evitar a inflação e planejar as próximas compras da melhor forma possível!

Aqui está o passo a passo completo para usar o sistema, desde a leitura das suas notas fiscais até a organização da sua próxima lista de compras inteligente e o uso dos recursos avançados.

---

## Passo 1: Salvar as Notas Fiscais ou Adicionar URLs

Sempre que fizer uma compra no mercado, você receberá um cupom fiscal. O sistema agora consegue processar:
- Arquivos **PDF** (da Nota Fiscal de Consumidor Eletrônica - NFC-e).
- Arquivos **XML**.
- **Links (URLs)** de notas fiscais geradas online pela SEFAZ.

1. **Para arquivos em PDF/XML:** Pegue o arquivo da sua nota fiscal (baixado do site ou enviado por e-mail). Salve-o dentro da pasta chamada `xml_notas` que fica junto dos arquivos do sistema:
   * **Caminho:** `Desktop/Feira Certa/xml_notas/`
2. **Para links (URLs):** Abra o arquivo `urls_notas.txt` (localizado na pasta principal do Feira Certa) e cole o link da sua nota fiscal em uma nova linha. O sistema irá ler a página da nota online e extrair os produtos automaticamente.

## Passo 2: Extrair os Dados (Processamento)

Agora vamos transformar esses arquivos e links em uma tabela organizada.

1. Abra o seu Terminal / Prompt de Comando.
2. Navegue até a pasta do sistema ou abra a pasta diretamente no VS Code.
3. Execute o script em Python que faz a mágica:
   ```bash
   python processar_nfe.py
   ```
4. Ele vai ler todos os PDFs e XMLs na pasta `xml_notas` e todas as URLs listadas no arquivo `urls_notas.txt`, e criar (ou atualizar) um arquivo chamado **`resultado_feira.csv`**. Notas com mais de 90 dias serão movidas automaticamente para a pasta `arquivadas`.

> **Dica:** O script precisa da biblioteca `pdfplumber` para ler os PDFs perfeitamente. Se não tiver, lembre-se de instalar rodando `pip install pdfplumber`. Ele também requer `requests` e `beautifulsoup4` para extrair os links de URLs.

## Passo 3: Abrir o Painel "Feira Certa"

Agora que os dados foram organizados, vamos para a parte visual e inteligente.

1. Navegue até a mesma pasta (`Desktop/Feira Certa/`).
2. Dê um **duplo clique** no arquivo **`index.html`** para abri-lo no seu navegador.
3. O painel será aberto. O sistema tentará carregar automaticamente seus dados do `resultado_feira.csv`. Se não carregar sozinho (devido a bloqueios de segurança do navegador), clique no botão azul no topo: **"Carregar CSV"** e selecione o arquivo que acabamos de criar.

## Passo 4: Explorar seus Gastos e Categorias

O painel está dividido para te dar controle total. No **Dashboard**, você pode ver:

* **Estatísticas Rápidas:** Gasto total do mês atual, total de produtos diferentes, mercados visitados e a data da última feira.
* **Busca e Filtro por Categoria:** Digite o que deseja buscar ou clique nas tags no topo da página (ex: *Açougue, Hortifruti, Mercearia*) para filtrar rapidamente os produtos dessa categoria.
* **Ver Histórico:** Em cada cartãozinho de produto, clique no ícone de "Ver Histórico" (gráfico de linhas) para abrir um **Gráfico de Preço** detalhado.
* **Editar Nome e Categoria:** Achou que um produto veio com um nome feio ou categoria errada? Clique no ícone de "Lápis" no cartão para personalizá-lo.
* **Ocultar/Excluir Produto:** Itens como sacolas plásticas podem ser escondidos da lista usando o botão da lixeira vermelha. Você pode gerenciar os itens excluídos nas configurações depois.

## Passo 5: Comparativo Mensal de Categorias

Quer saber se você gastou mais com doces ou com carnes em relação ao mês passado?

1. No menu principal, clique na aba **"Comparativo"**.
2. Selecione os dois meses que deseja comparar (Ex: Mês Atual vs Mês Passado).
3. O sistema mostrará gráficos detalhados indicando a variação de preços e o volume gasto em cada categoria. Isso é ótimo para entender os buracos no orçamento!

## Passo 6: Criar e Compartilhar sua Lista Inteligente

A sua despensa está vazia e você precisa ir ao mercado?

1. **Adição Manual:** No Dashboard, há um botão com o símbolo de **"+"** (`+ Adicionar à Lista`) ao lado de cada produto. Clique para ir adicionando itens à sua cesta de compras.
2. **Listas Inteligentes (Ações Rápidas):** No início da página, há botões rápidos. Clique em **"Criar Lista Inteligente"** para que o sistema sugira produtos com base no que você costuma comprar nessa época do mês, ou em **"Ver Itens Vencendo"** para checar os que estão perto de acabar de acordo com seu histórico de consumo!
3. **Gerenciar a Lista:** Clique em **"Minha Lista"** no painel superior. Nela você pode ajustar quantidades e ver uma **Estimativa de Gasto**. Você pode até informar o seu "Orçamento Máximo" e o sistema te ajudará a ajustar as quantidades para caber no bolso.
4. **Compartilhar (WhatsApp):** Tudo pronto? Clique em **"Compartilhar"** no fim da lista. O sistema vai abrir o WhatsApp com a lista limpinha e pronta, facilitando a ida ao mercado!

---
*Feito com automação focada na praticidade da sua rotina financeira.* 🚀
