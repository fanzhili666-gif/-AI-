"use strict";

const SOP_ENTRIES = Object.freeze([
  {
    id: "sop-pump-pressure-high",
    title: "泵压力偏高处置",
    keywords: ["泵", "压力偏高", "压力异常"],
    steps: ["确认压力表读数与报警记录", "检查出口阀门和管路是否堵塞", "按维护规程安排复查"],
    data_source: "demo",
  },
  {
    id: "sop-temperature-high",
    title: "设备温度偏高处置",
    keywords: ["温度偏高", "温度异常", "过热"],
    steps: ["确认温度传感器读数", "检查散热和负载情况", "记录处理结果并复核"],
    data_source: "demo",
  },
]);

function searchSop(query, entries = SOP_ENTRIES) {
  const terms = String(query || "").trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries
    .map((entry) => {
      const haystack = [entry.title, ...entry.keywords, ...entry.steps].join("");
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);
}

module.exports = { SOP_ENTRIES, searchSop };
