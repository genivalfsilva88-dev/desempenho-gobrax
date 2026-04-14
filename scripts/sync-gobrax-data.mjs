import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED_DOC_ID = '2PACX-1vSLoNqOJGDJe9FqcOzjsXNNnSGE3h_X04xFtkvi7K4X1fUkGAN968V_hDS9KJtH-lbBbkm-RSVC0Mjr';
const SHEETS = [
  { name: 'Março', gid: '0', order: 3 },
  { name: 'Abril', gid: '1046930752', order: 4 },
  { name: 'Maio', gid: '79362452', order: 5 },
  { name: 'Junho', gid: '967342850', order: 6 },
  { name: 'Julho', gid: '303673235', order: 7 },
  { name: 'Agosto', gid: '1720965887', order: 8 },
  { name: 'Setembro', gid: '993423638', order: 9 },
  { name: 'Outubro', gid: '842319723', order: 10 },
  { name: 'Novembro', gid: '163450483', order: 11 },
  { name: 'Dezembro', gid: '698561355', order: 12 },
  { name: 'Meta', gid: '1218984725', order: 99, type: 'meta', optional: true },
  { name: 'Motorista por veiculo', gid: '1093491459', order: 100, type: 'motorista', optional: true }
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'gobrax-data.js');

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

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseCsv(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });

  return { headers, rows };
}

async function fetchSheet(sheet) {
  const url = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_DOC_ID}/pub?gid=${sheet.gid}&single=true&output=csv`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${sheet.name}: ${response.status}`);
  }

  const text = await response.text();
  const { headers, rows } = parseCsv(text);

  if ((sheet.type === 'meta' || sheet.type === 'motorista') && !hasMetaColumns(headers)) {
    if (sheet.optional) return null;
    throw new Error(`Aba ${sheet.name} nao possui colunas auxiliares validas.`);
  }

  return {
    name: sheet.name,
    sourceName: sheet.name,
    gid: sheet.gid,
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
    spreadsheetId: PUBLISHED_DOC_ID,
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
