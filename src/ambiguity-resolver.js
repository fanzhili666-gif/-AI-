"use strict";

const ORDINALS = Object.freeze({
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
});

function ordinalToIndex(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value - 1;
  if (typeof value !== "string") return null;
  if (/^\d+$/.test(value)) return Number(value) - 1;
  if (value === "十") return 9;
  if (value.startsWith("十")) return 9 + (ORDINALS[value.slice(1)] || 0);
  if (value.endsWith("十")) return (ORDINALS[value[0]] || 0) * 10 - 1;
  if (value.length === 2 && value[1] === "十") return (ORDINALS[value[0]] || 0) * 10 - 1;
  return ORDINALS[value] === undefined ? null : ORDINALS[value] - 1;
}

function resolveTarget({ items, target = {}, currentIndex = null }) {
  if (!Array.isArray(items)) throw new Error("歧义判断 items 必须是数组");
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new Error("歧义判断 target 必须是对象");
  }

  if (target.id !== undefined) {
    const matches = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item && item.id === target.id);
    if (matches.length === 1) return { status: "resolved", ...matches[0], reason: "explicit_id" };
    if (matches.length > 1) return ambiguous(matches, "duplicate_id");
    return { status: "rejected", message: "未找到指定行动项", reason: "id_not_found" };
  }

  const index = ordinalToIndex(target.ordinal);
  if (index !== null) {
    if (index >= 0 && index < items.length) {
      return { status: "resolved", item: items[index], index, reason: "ordinal" };
    }
    return { status: "rejected", message: "指定的行动项序号不存在", reason: "ordinal_not_found" };
  }

  if (currentIndex !== null) {
    if (Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < items.length) {
      return { status: "resolved", item: items[currentIndex], index: currentIndex, reason: "current" };
    }
    throw new Error("歧义判断 currentIndex 无效");
  }

  if (target.field && target.value !== undefined) {
    const matches = items
      .map((item, itemIndex) => ({ item, index: itemIndex }))
      .filter(({ item }) => item && item[target.field] === target.value);
    if (matches.length === 1) return { status: "resolved", ...matches[0], reason: "unique_field" };
    if (matches.length > 1) return ambiguous(matches, "multiple_field_matches");
    return { status: "rejected", message: "没有匹配的行动项", reason: "field_not_found" };
  }

  if (items.length === 1) return { status: "resolved", item: items[0], index: 0, reason: "only_item" };
  if (items.length > 1) {
    return ambiguous(items.map((item, index) => ({ item, index })), "multiple_candidates");
  }
  return { status: "rejected", message: "当前没有可操作的行动项", reason: "no_items" };
}

function ambiguous(matches, reason) {
  return {
    status: "ambiguous",
    message: "当前有多个候选行动项，请指定序号或明确目标",
    candidates: matches.map(({ item, index }) => ({
      index,
      id: item.id || null,
      summary: item.action || item.issue || item.device || "",
    })),
    reason,
  };
}

module.exports = { ordinalToIndex, resolveTarget };
