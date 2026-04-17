import os
import csv
import xml.etree.ElementTree as ET
import re
from datetime import datetime, timedelta
import shutil
import requests
from bs4 import BeautifulSoup

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

# Definir os namespaces usados no XML da NFe
ns = {'nfe': 'https://www.dfe.ms.gov.br/nfe/consulta/'}

def processar_xml(caminho_arquivo):
    itens_extraidos = []
    try:
        tree = ET.parse(caminho_arquivo)
        root = tree.getroot()
        
        nfe = root.find('.//nfe:NFe', ns)
        if nfe is None:
            nfe = root if root.tag.endswith('NFe') else None
            
        if nfe is None:
            return []

        infNFe = nfe.find('nfe:infNFe', ns)
        if infNFe is None:
            return []

        emitente_xml = infNFe.find('.//nfe:emit/nfe:xNome', ns)
        fornecedor = emitente_xml.text if emitente_xml is not None else "Desconhecido"

        ide_xml = infNFe.find('.//nfe:ide/nfe:dhEmi', ns)
        if ide_xml is None:
            ide_xml = infNFe.find('.//nfe:ide/nfe:dEmi', ns)
            
        data_emissao = "Desconhecida"
        if ide_xml is not None:
            try:
                data_str = ide_xml.text[:10]
                data_obj = datetime.strptime(data_str, '%Y-%m-%d')
                data_emissao = data_obj.strftime('%d/%m/%Y')
            except ValueError:
                data_emissao = ide_xml.text[:10]

        para_cada_det = infNFe.findall('nfe:det', ns)
        for det in para_cada_det:
            prod = det.find('nfe:prod', ns)
            if prod is not None:
                nome = prod.find('nfe:xProd', ns).text if prod.find('nfe:xProd', ns) is not None else ""
                qtd = prod.find('nfe:qCom', ns).text if prod.find('nfe:qCom', ns) is not None else "0"
                unidade = prod.find('nfe:uCom', ns).text if prod.find('nfe:uCom', ns) is not None else ""
                v_unit = prod.find('nfe:vUnCom', ns).text if prod.find('nfe:vUnCom', ns) is not None else "0"
                v_total = prod.find('nfe:vProd', ns).text if prod.find('nfe:vProd', ns) is not None else "0"
                
                v_unit = v_unit.replace('.', ',')
                v_total = v_total.replace('.', ',')
                qtd = qtd.replace('.', ',')

                # Usaremos o nome do arquivo para identificar de qual feira é esse item
                nome_arquivo = os.path.basename(caminho_arquivo)
                itens_extraidos.append([nome_arquivo, data_emissao, fornecedor, nome, qtd, unidade, v_unit, v_total])
    except Exception as e:
        print(f"Erro ao processar XML {caminho_arquivo}: {e}")
    return itens_extraidos

def processar_pdf_nfce(caminho_arquivo):
    if not HAS_PDFPLUMBER:
        print("Biblioteca pdfplumber não está instalada. Execute: pip install pdfplumber")
        return []
        
    itens_extraidos = []
    try:
        texto_completo = ""
        with pdfplumber.open(caminho_arquivo) as pdf:
            for page in pdf.pages:
                texto_pagina = page.extract_text()
                if texto_pagina:
                    texto_completo += texto_pagina + "\n"
        
        linhas = texto_completo.split('\n')
        
        fornecedor = "Desconhecido"
        data_emissao = "Desconhecida"
        
        # Expressões regulares para o formato NFC-e
        regex_data = re.compile(r"Emissão:\s*(\d{2}/\d{2}/\d{4})")
        regex_item_linha1 = re.compile(r"^(.*?)\s*\(Código:\s*\d+\s*\)\s*Vl\.?\s*Total")
        regex_item_linha2 = re.compile(r"Qtde\.:\s*([\d,]+)\s*UN:\s*([A-Za-z]+)\s*Vl\.\s*Unit\.:\s*([\d,]+)\s+([\d,]+)")
        
        # Encontrar Fornecedor e Data
        for i, linha in enumerate(linhas):
            if "CNPJ:" in linha and i > 0 and fornecedor == "Desconhecido":
                fornecedor = linhas[i-1].strip()
            
            match_data = regex_data.search(linha)
            if match_data and data_emissao == "Desconhecida":
                data_emissao = match_data.group(1)
        
        # Encontrar Itens
        nome_temp = None
        for linha in linhas:
            linha = linha.strip()
            
            match_l1 = regex_item_linha1.search(linha)
            if match_l1:
                nome_temp = match_l1.group(1).strip()
                continue
                
            match_l2 = regex_item_linha2.search(linha)
            if match_l2 and nome_temp:
                qtd = match_l2.group(1)
                unidade = match_l2.group(2)
                v_unit = match_l2.group(3)
                v_total = match_l2.group(4)
                
                # Usaremos o nome do arquivo para identificar de qual feira é esse item
                nome_arquivo = os.path.basename(caminho_arquivo)
                itens_extraidos.append([nome_arquivo, data_emissao, fornecedor, nome_temp, qtd, unidade, v_unit, v_total])
                nome_temp = None # resetar para o proximo
                
    except Exception as e:
        print(f"Erro ao processar PDF {caminho_arquivo}: {e}")
    
    return itens_extraidos

def processar_url_nfce(url):
    itens_extraidos = []
    try:
        # A página da Sefaz muitas vezes exige os headers corretos para não bloquear o acesso
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            print(f"Erro ao acessar {url}: Status {response.status_code}")
            return []
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Encontrar fornecedor (mercado)
        fornecedor = "Desconhecido"
        # Tenta padrao comum (id u20, class txtTopo ou dentro do cabeçalho)
        nome_emitente = soup.find('div', id='u20')
        if not nome_emitente:
            nome_emitente = soup.find('div', class_='txtTopo')
            
        if nome_emitente:
            fornecedor = nome_emitente.text.strip()
            
        # Pega a data de emissão
        data_emissao = "Desconhecida"
        for elemento in soup.find_all(['li', 'div', 'span', 'strong']):
            texto = elemento.get_text()
            if 'Emissão' in texto or 'Emissao' in texto:
                match = re.search(r'(\d{2}/\d{2}/\d{4})', texto)
                if match:
                    data_emissao = match.group(1)
                    break
        
        # Pega os produtos (tabela tabResult ou itens avulsos)
        tabela = soup.find('table', id='tabResult')
        if not tabela:
            tabela = soup
            
        itens_html = tabela.find_all('tr', id=re.compile(r'^Item'))
        if not itens_html:
            itens_html = tabela.find_all('tr')
            
        for item in itens_html:
            nome_tag = item.find('span', class_='txtTit')
            if not nome_tag:
                # Tenta outra estrutura comum se txtTit nao existir
                tds = item.find_all('td')
                if len(tds) >= 4:
                    nome = tds[0].get_text(strip=True)
                    qtd = tds[1].get_text(strip=True).replace(',', '.')
                    unidade = tds[2].get_text(strip=True)
                    v_unit = tds[3].get_text(strip=True).replace(',', '.')
                    v_total = str(float(qtd) * float(v_unit))
                    v_unit = v_unit.replace('.', ',')
                    v_total = v_total.replace('.', ',')
                    qtd = qtd.replace('.', ',')
                    nome_arquivo_url = url.split('?')[-1][:20] if '?' in url else url[-20:]
                    itens_extraidos.append([nome_arquivo_url, data_emissao, fornecedor, nome, qtd, unidade, v_unit, v_total])
                continue
                
            nome = nome_tag.get_text(strip=True)
            
            qtd_tag = item.find('span', class_='Rqtd')
            qtd = qtd_tag.get_text(strip=True).replace('Qtde.:', '').strip() if qtd_tag else "0"
            
            un_tag = item.find('span', class_='RUN')
            unidade = un_tag.get_text(strip=True).replace('UN:', '').strip() if un_tag else ""
            
            vu_tag = item.find('span', class_='RvlUnit')
            v_unit = vu_tag.get_text(strip=True).replace('Vl. Unit.:', '').strip() if vu_tag else "0"
            
            vt_tag = item.find('span', class_='valor')
            v_total = "0"
            if item.find_all('span', class_='valor'):
                v_total = item.find_all('span', class_='valor')[-1].get_text(strip=True)
            
            # Limpeza caso a raspa traga lixo
            qtd = re.sub(r'[^\d,]', '', qtd)
            v_unit = re.sub(r'[^\d,]', '', v_unit)
            v_total = re.sub(r'[^\d,]', '', v_total)
            
            nome_arquivo_url = url.split('?')[-1][:20] if '?' in url else url[-20:]
            
            itens_extraidos.append([nome_arquivo_url, data_emissao, fornecedor, nome, qtd, unidade, v_unit, v_total])
            
    except Exception as e:
        print(f"Erro ao processar URL: {e}")
        
    return itens_extraidos

def processar_notas(pasta_notas, arquivo_saida):
    if not os.path.exists(pasta_notas):
        print(f"A pasta {pasta_notas} não existe. Criando...")
        os.makedirs(pasta_notas)

    # Criar pasta 'arquivadas' se não existir
    pasta_arquivadas = os.path.join(pasta_notas, 'arquivadas')
    if not os.path.exists(pasta_arquivadas):
        os.makedirs(pasta_arquivadas)

    arquivos = [f for f in os.listdir(pasta_notas) if f.lower().endswith(('.xml', '.pdf'))]
    
    urls_para_processar = []
    pasta_base_projeto = os.path.dirname(pasta_notas)
    caminho_urls = os.path.join(pasta_base_projeto, 'urls_notas.txt')
    if os.path.exists(caminho_urls):
        with open(caminho_urls, 'r', encoding='utf-8') as f:
            for linha in f:
                url_limpa = linha.strip()
                if url_limpa and url_limpa.startswith('http'):
                    urls_para_processar.append(url_limpa)
    
    if not arquivos and not urls_para_processar:
        print(f"Nenhum arquivo XML/PDF encontrado na pasta {pasta_notas} e urls_notas.txt está vazio ou inexistente.")
        return

    # Ler arquivos já processados do CSV (se existir)
    arquivos_processados = set()
    cabecalho_existe = False
    
    if os.path.exists(arquivo_saida):
        if os.path.getsize(arquivo_saida) > 0:
            cabecalho_existe = True
            try:
                with open(arquivo_saida, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.reader(f, delimiter=';')
                    try:
                        next(reader) # skip header
                    except StopIteration:
                        pass # arquivo pode estar apenas com o BOM do utf8 e não ter cabecalho legível
                    
                    for row in reader:
                        if row and len(row) > 0:
                            arquivos_processados.add(row[0])
            except Exception as e:
                print(f"Erro ao ler histórico de notas CSV: {e}")

    dados_totais = []
    # Limite de 60 dias (aprox. 2 meses)
    data_limite = datetime.now() - timedelta(days=60)

    for arquivo in arquivos:
        if arquivo in arquivos_processados:
            print(f"Ignorado: {arquivo} (já processado anteriormente)")
            continue

        caminho_arquivo = os.path.join(pasta_notas, arquivo)
        extensao = arquivo.lower().split('.')[-1]
        
        itens = []
        if extensao == 'xml':
            itens = processar_xml(caminho_arquivo)
        elif extensao == 'pdf':
            itens = processar_pdf_nfce(caminho_arquivo)
            
        if itens:
            # Pegar a data da nota
            data_str = itens[0][1]
            nota_antiga = False
            
            if data_str != "Desconhecida":
                try:
                    data_obj = datetime.strptime(data_str, '%d/%m/%Y')
                    if data_obj < data_limite:
                        nota_antiga = True
                except ValueError:
                    pass

            if nota_antiga:
                # Se for antiga, mover para arquivadas e não incluir no CSV final
                caminho_destino = os.path.join(pasta_arquivadas, arquivo)
                shutil.move(caminho_arquivo, caminho_destino)
                print(f"Arquivado: {arquivo} (Mais antiga que 60 dias, movida para 'arquivadas')")
            else:
                # Se for recente, adiciona aos dados
                dados_totais.extend(itens)
                print(f"Processado: {arquivo} ({len(itens)} itens)")
        else:
            print(f"Aviso: {arquivo} processado, mas nenhum item extraído.")

    # Processar as URLs
    for url in urls_para_processar:
        if any(url.endswith(p) for p in arquivos_processados) or any(p in url for p in arquivos_processados): 
            # Verificaçao frouxa para url truncada
            continue
            
        print(f"\nProcessando URL online...")
        itens_url = processar_url_nfce(url)
        
        if itens_url:
            data_str = itens_url[0][1]
            nota_antiga = False
            
            if data_str != "Desconhecida":
                try:
                    data_obj = datetime.strptime(data_str, '%d/%m/%Y')
                    if data_obj < data_limite:
                        nota_antiga = True
                except ValueError:
                    pass

            if nota_antiga:
                print(f"Ignorada: URL de {data_str} (Mais antiga que 60 dias)")
            else:
                dados_totais.extend(itens_url)
                print(f"Processado: URL com {len(itens_url)} itens")
        else:
            print(f"Aviso: URL processada, mas nenhum item extraído ou estrutura inválida.")

    if dados_totais:
        # Exportar para CSV - Encoding para PT-BR
        modo_abertura = 'a' if cabecalho_existe else 'w'
        
        with open(arquivo_saida, mode=modo_abertura, newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f, delimiter=';') 
            if not cabecalho_existe:
                writer.writerow(['Nota / Arquivo', 'Data', 'Fornecedor', 'Produto', 'Quantidade', 'Unidade', 'Valor Unitário (R$)', 'Valor Total (R$)'])
            writer.writerows(dados_totais)
            
        print(f"\nSucesso! {len(dados_totais)} novos itens extraídos para '{arquivo_saida}'.")
        print("Você já pode recarregar o sistema e utilizar os novos dados.")
    else:
        print("\nNenhum dado NOVO foi extraído (Os arquivos detectados na pasta já estavam processados no CSV base ou inválidos).")

if __name__ == "__main__":
    pasta_base = os.path.dirname(os.path.abspath(__file__))
    pasta_notas = os.path.join(pasta_base, 'xml_notas')
    arquivo_csv = os.path.join(pasta_base, 'resultado_feira.csv')
    
    print("Iniciando extração de Notas Fiscais e Cupons (PDF/XML)...")
    if not HAS_PDFPLUMBER:
        print("Aviso: pdfplumber não detectado. Apenas arquivos XML serão processados.")
        
    processar_notas(pasta_notas, arquivo_csv)