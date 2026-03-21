# 🛒 Guia Rápido: Como usar o Feira Certa

Bem-vindo ao **Feira Certa**, sua plataforma pessoal para acompanhar os gastos de mercado, evitar a inflação e planejar as próximas compras da melhor forma possível!

Aqui está o passo a passo completo para usar o sistema desde a leitura das suas notas fiscais até a organização da sua próxima lista de compras.

---

## Passo 1: Salvar as Notas Fiscais
Sempre que fizer uma compra no mercado, você receberá um cupom fiscal. O sistema consegue ler arquivos **PDF** (da Nota Fiscal de Consumidor Eletrônica - NFC-e) ou arquivos **XML**.

1. Pegue o arquivo da sua nota fiscal (baixado do site da SEFAZ, ou enviado por e-mail pelo mercado).
2. Salve esse arquivo dentro da pasta chamada `xml_notas` que fica junto dos arquivos do sistema:
   * **Caminho:** `Desktop/Feira Certa/xml_notas/`

## Passo 2: Extrair os Dados (Processamento)
Agora vamos transformar esses arquivos difíceis de ler em uma tabela organizada.

1. Abra o seu Terminal / Prompt de Comando.
2. Navegue até a pasta do sistema ou abra a pasta diretamente no VS Code.
3. Execute o script em Python que faz a mágica:
   ```bash
   python processar_nfe.py
   ```
4. Ele vai ler todos os PDFs e XMLs dentro de `xml_notas` e criar (ou atualizar) um arquivo chamado **`resultado_feira.csv`**.

> **Dica:** O script precisa da biblioteca `pdfplumber` para ler os PDFs perfeitamente. Se não tiver, lembre-se de instalar rodando `pip install pdfplumber`.

## Passo 3: Abrir o Painel "Feira Certa"
Agora que os dados foram organizados no CSV, vamos para a parte visual e inteligente.

1. Navegue até a mesma pasta (`Desktop/Feira Certa/`).
2. Dê um **duplo clique** no arquivo **`index.html`** para abri-lo no seu navegador (Chrome, Edge, Safari, etc).
3. O painel será aberto. Se os dados não renderizarem sozinhos logo de cara, é por causa do bloqueio de segurança "Local" do seu navegador. 
4. Caso isso aconteça, clique no botão azul no topo direito: **"Carregar CSV"** e selecione aquele arquivo `resultado_feira.csv` que acabamos de criar.

## Passo 4: Explorar seus Gastos
A sua tela de **Dashboard** está dividida para te dar o controle total:

* **Estatísticas no Topo:** Total de produtos diferentes que você já comprou, em quantos mercados diferentes, e a data da sua feira mais recente.
* **Busca:** Digite "Arroz", "Cerveja" ou o que quiser no campo de busca para encontrar rápido o produto.
* **Ver Histórico:** Em cada cartãozinho de produto, clique no botão "Ver Histórico". Ele vai abrir um **Gráfico de Preço**, mostrando como o preço oscilou nas últimas semanas e qual mercado cobrou cada valor.

## Passo 5: Criar e Compartilhar sua Lista Previsível
Sua despensa está vazia e você precisa ir ao mercado? Planeje a compra e veja quanto vai custar *antes de sair de casa*.

1. Ao lado de cada produto no Dashboard, há um pequeno botão verde com um símbolo de **"+"** (`+ Adicionar à Lista`).
2. Dê um clique nos produtos que precisa repor.
3. No painel lateral esquerdo, clique no botão **"Minha Lista"** (que agora vai ter um número indicando os itens).
4. O painel da lista vai abrir pela direita. Nele você pode:
   * **Ajustar as Quantidades:** Colocar 2x de Arroz, 3x de Sabonete, etc. usando os botões `+` e `-`.
   * **Ver a Estimativa:** No rodapé, o sistema automaticamente calcula o valor que você provavelmente vai gastar amanhã se os preços continuarem parecidos com os da última vez.
5. **Compartilhar (WhatsApp):** Tudo pronto? Clique no botão verde **"Compartilhar"** no fim da lista. O sistema vai abrir o WhatsApp já com a lista organizadinha para você mandar no grupo da família ou para você mesmo e ir varrendo os corredores no mercado lendo no celular!

---
*Feito com automação focada na praticidade da sua rotina.* 🚀
