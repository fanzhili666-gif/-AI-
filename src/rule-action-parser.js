"use strict";

function splitSegments(text) {
  return String(text || "")
    .split(/[\n\r，。；;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseRuleActionItems(text) {
  const segments = splitSegments(text);
  const context = segments.find((segment) => !/^(?:安排|请|让)/.test(segment)) || "";
  return segments
    .map((segment) => {
      const match = segment.match(
        /^(?:安排|请|让)([\u4e00-\u9fff]{2,3}?)(今天|明天|后天|本周)?(?:上午|下午)?(.+)$/,
      );
      if (!match) return null;
      const action = match[3].trim();
      if (!action) return null;
      const deviceMatch = context.match(/([^，。；;\s]+泵)/);
      return {
        device: deviceMatch ? deviceMatch[1] : "待提取",
        issue: context && context !== segment ? context : "待提取",
        action,
        owner: match[1],
        deadline: match[2] || "待提取",
        status: "待确认",
        data_source: "real",
        is_injected: false,
      };
    })
    .filter(Boolean);
}

function parseDeadlineUpdate(text) {
  const match = String(text || "").match(
    /截止时间(?:改成|修改为|调整为|变更为)(今天|明天|后天|本周)(上午|下午)?/,
  );
  return match ? `${match[1]}${match[2] || ""}` : null;
}

module.exports = { parseRuleActionItems, parseDeadlineUpdate, splitSegments };
