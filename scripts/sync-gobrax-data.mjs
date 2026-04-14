import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPREADSHEET_ID = '1Jh08X0rCtI5rx82Teu4HRnXofHG2CTwGhpCAfKj9sDY';
const SHEETS = [
  { name: 'Marco', gid: '1685318905', order: 3 },
  { name: 'Abril', gid: '641346232', order: 4 },
  { name: 'Maio', gid: '322757605', order: 5 },
  { name: 'Junho', gid: '706345560', order: 6 },
  { name: 'Julho', gid: '1415754015', order: 7 },
  { name: 'Agosto', gid: '919511949', order: 8 },
  { name: 'Setembro', gid: '801949435', order: 9 },
  { name: 'Outubro', gid: '330406732', order: 10 },
  { name: 'Novembro', gid: '1146622031', order: 11 },
  { name: 'Dezembro', gid: '1324616894', order: 12 },
  { name: 'Meta', sheetName: 'Meta', order: 99, type: 'meta', optional: true }
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'gobrax-data.js');

function parseGoogleResponse(text) {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start === -1 || end === -1) {
    throw new Error('Formato de resposta Google invalido.');
  }

  const payload = JSON.parse(text.slice(start + 1, end));
  if (payload.status !== 'ok' || !payload.table) {
    throw new Error(`Resposta Google sem tabela valida: ${payload.status}`);
  }

  return payload.table;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasMetaColumns(headers) {
  const normalized = headers.map((header) => normalizeKey(header));
  return normalized.some((header) => (
    header === 'meta'
    || header === 'meta km l'
    || header === 'meta consumo'
    || header === 'meta de consumo'
    || header === 'motorista'
    || header === 'condutor'
    || header === 'motorista alocado'
  ));
}

async function fetchSheet(sheet) {
  const ref = sheet.gid ? `gid=${sheet.gid}` : `sheet=${encodeURIComponent(sheet.sheetName || sheet.name)}`;
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${ref}&tqx=out:json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${sheet.name}: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buffer);
  const table = parseGoogleResponse(text);
  const headers = table.cols.map((col, index) => col.label || col.id || `col_${index}`);
  if (sheet.type === 'meta' && !hasMetaColumns(headers)) {
    if (sheet.optional) return null;
    throw new Error(`Aba ${sheet.name} nao possui colunas de meta validas.`);
  }
  const rows = (table.rows || []).map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      const cell = row?.c?.[index];
      const value = cell?.f ?? cell?.v ?? '';
      out[header] = value == null ? '' : String(value);
    });
    return out;
  });

  return {
    name: sheet.name,
    sourceName: sheet.sheetName || sheet.name,
    gid: sheet.gid || null,
    order: sheet.order,
    type: sheet.type || null,
    rows
  };
}

async function main() {
  const sheets = [];
  for (const sheet of SHEETS) {
    const loaded = await fetchSheet(sheet);
    if (!loaded) {
      console.log(`IGNORADO ${sheet.name}: aba sem colunas de meta publicadas`);
      continue;
    }
    sheets.push(loaded);
    console.log(`OK ${sheet.name}: ${loaded.rows.length} linhas`);
  }

  const payload = {
    spreadsheetId: SPREADSHEET_ID,
    generatedAt: new Date().toISOString(),
    sheets
  };

  const content = `window.GOBRAX_DATA = ${JSON.stringify(payload, null, 2)};\n`;
  await mkdir(projectRoot, { recursive: true });
  await writeFile(outputPath, content, 'utf8');
  console.log(`Arquivo gerado em ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
