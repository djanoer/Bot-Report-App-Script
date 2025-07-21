/**
 * @file Parser.js
 * @author Djanoer Team
 * @date 2023-06-15
 *
 * @description
 * Bertanggung jawab untuk mem-parsing (mengurai) blok teks dari pesan yang di-forward.
 * Didesain untuk mengenali berbagai format laporan dan mengekstrak metrik-metrik
 * penting menjadi format data yang terstruktur.
 */

/**
 * [FINAL v1.5.0] Router utama untuk parsing.
 */
function parseForwardedMessage(textBlock) {
  const lowerCaseText = textBlock.toLowerCase();

  if (lowerCaseText.includes('hpe storage alletra')) {
    return parseAlletraReport(textBlock);
  } else if (lowerCaseText.includes('storage vsp e790')) {
    return parseVspReport(textBlock);
  }
  return null;
}

/**
 * [FINAL v1.5.0] Parser HPE Alletra dengan Regex yang diperkuat.
 * Fungsi ini HANYA mengekstrak data mentah apa adanya.
 */
function parseAlletraReport(textBlock) {
  const data = {};
  
  const extract = (regex) => {
    const match = textBlock.match(regex);
    if (!match) return null;
    return { value: parseFloat(match[1].replace(/,/g, '')), unit: (match[2] || '').trim() };
  };

  const nameMatch = textBlock.match(/MA-STORAGE\s*:\s*(HPE STORAGE ALLETRA \w+)/i);
  if (nameMatch) data.storageName = nameMatch[1].trim();

  data.usage = extract(/Usage\s*:\s*([\d.]+)\s*(\w+)/i);
  data.totalCapacity = extract(/Total Capacity\s*:\s*([\d.]+)\s*(\w+)/i);
  data.snapshot = extract(/Snapshot Usage\s*:\s*([\d.]+)\s*(\w+)/i);
  data.latency = extract(/Latency\s*:\s*([\d.]+)\s*(\w+)/i);
  data.iops = extract(/IOPS\s*:\s*([\d.]+)\s*(\w+)/i);
  data.throughput = extract(/Throughput\s*:\s*([\d.]+)\s*(\w+)/i);
  data.cpu = extract(/CPU\s*:\s*(\d+)\s*(%)/i);
  data.reduction = extract(/Reductions\s*:\s*([\d.]+)\s*(\w+)/i);

  return data;
}

/**
 * [FINAL v1.c] Parser Storage VSP dengan Regex yang diperkuat.
 */
function parseVspReport(textBlock) {
  const data = {};
  
  const extract = (regex) => {
    const match = textBlock.match(regex);
    if (!match) return null;
    return { value: parseFloat(match[1].replace(/,/g, '')), unit: (match[2] || '').trim() };
  };
    
  const nameMatch = textBlock.match(/Storage (VSP E790 \w+)/i);
  if (nameMatch) data.storageName = nameMatch[1].trim();
  
  data.usage = extract(/Pool Used\s*:\s*([\d.]+)\s*(TiB)/i);
  data.iops = extract(/IOPS\s*:\s*([\d,]+)\s*(Operations\/s)/i);
  data.throughput = extract(/Bandwidth\s*:\s*([\d.]+)\s*(GiB\/s)/i);
  data.latency = extract(/Response Time\s*:\s*([\d.]+)\s*(ms)/i);
  data.cpu = extract(/MP Utilization\s*:\s*(\d+)\s*(%)/i);
  data.reduction = extract(/Reduction\s*:\s*([\d.]+):1/i);

  return data;
}