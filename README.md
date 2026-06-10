# Escala — Pão com Linguiça

Escala de voluntários com 12 vagas por dia/turno, sincronizada com o Google Forms.

## Como rodar

Precisa de Node.js 18 ou superior.

    npm install
    npm start

Abra http://localhost:3000

## Como ligar no Google Forms (sincronização automática)

1. Abra a planilha de respostas do Forms no Google Planilhas
2. Arquivo → Compartilhar → **Publicar na web**
3. Selecione a aba das respostas e o formato **Valores separados por vírgula (.csv)**
4. Publique, copie o link e cole no painel "Sincronização" da página
5. O servidor busca as respostas a cada 5 minutos (configurável com a variável SYNC_MINUTES)

Alternativa sem publicar: copie as linhas da planilha e cole no campo de importação manual.

## Remoções

No modo "✏️ Editar escala", o × ao lado de cada nome tira a pessoa daquele dia/turno
específico. As remoções ficam salvas no banco e são preservadas a cada sincronização —
a pessoa só volta se você clicar em "restaurar".

## Banco de dados

Arquivo `data/db.json`, criado automaticamente. Para backup, basta copiar esse arquivo.

## Variáveis de ambiente (opcionais)

- `PORT` — porta do servidor (padrão 3000)
- `SYNC_MINUTES` — intervalo da sincronização automática (padrão 5; use 0 para desligar)
- `ADMIN_PIN` — se definido, remover/restaurar/sincronizar/importar pedem esse PIN
  (recomendado se o link da escala for compartilhado com muita gente)

Exemplo: `ADMIN_PIN=1234 npm start`
