const zlib = require("zlib");

const signatures = {
  central: 0x02014b50,
  eocd: 0x06054b50,
  local: 0x04034b50
};

const decodeXml = (text) =>
  String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)));

const findEndRecord = (buffer) => {
  const start = Math.max(0, buffer.length - 65557);
  for (let index = buffer.length - 22; index >= start; index -= 1) {
    if (buffer.readUInt32LE(index) === signatures.eocd) return index;
  }
  throw new Error("Excel 文件不是有效的 xlsx 压缩包");
};

const unzipEntries = (buffer) => {
  const eocd = findEndRecord(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let count = 0; count < totalEntries; count += 1) {
    if (buffer.readUInt32LE(offset) !== signatures.central) break;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== signatures.local) {
      throw new Error("Excel 文件内部结构损坏");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content =
      compression === 0
        ? compressed
        : compression === 8
          ? zlib.inflateRawSync(compressed)
          : null;
    if (content) entries.set(fileName, content);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const textNodes = (xml) =>
  [...String(xml || "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");

const readSharedStrings = (entries) => {
  const xml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => textNodes(match[1]));
};

const cellValue = (cellXml, sharedStrings) => {
  const type = cellXml.match(/\bt="([^"]+)"/)?.[1] || "";
  if (type === "inlineStr") return textNodes(cellXml);
  const value = decodeXml(cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "");
  if (type === "s") return sharedStrings[Number(value)] || "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value || textNodes(cellXml);
};

const sheetText = (xml, sharedStrings) =>
  [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)]
    .map((row) =>
      [...row[1].matchAll(/<c(?:\s[^>]*)?>([\s\S]*?)<\/c>/g)]
        .map((cell) => cellValue(cell[0], sharedStrings).trim())
        .filter(Boolean)
        .join("\t")
    )
    .filter(Boolean)
    .join("\n");

const extractXlsxText = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error("Excel 文件为空");
  const entries = unzipEntries(buffer);
  const sharedStrings = readSharedStrings(entries);
  const sheets = [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([name, content], index) => {
      const text = sheetText(content.toString("utf8"), sharedStrings);
      return text ? `工作表 ${index + 1}\n${text}` : "";
    })
    .filter(Boolean);

  if (!sheets.length) throw new Error("Excel 中未提取到任务文本");
  return sheets.join("\n\n").slice(0, 12000);
};

module.exports = {
  extractXlsxText
};
