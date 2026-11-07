"use strict";

function splitSegments(text) {
  return String(text || "")
    .split(/[\n\r，。；;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseRuleActionItems(text) {
  const raw = String(text || "");
  const voiceMatch = raw.match(
    /((?:三|四|五|六|七|八|九|十|\d+)号泵)([^，。；;]*?)(?:，|,|\s|$).*?安排([\u4e00-\u9fff]{2})(今天|明天|后天|本周)?(?:上午|下午)?(?:去|进行|负责)?([^，。；;]*?)(?:一下)?(?:，|,|。|；|;|$)/,
  );
  if (voiceMatch) {
    const latest = raw.match(/(?:最晚(?:时间)?(?:不超过)?|截止时间(?:改成|修改为|调整为|变更为))\s*(今天|明天|后天|本周)(上午|下午)?/);
    const reassigned = raw.match(/负责人(?:交给|改成|调整为|变更为)\s*([\u4e00-\u9fff]{2,3})/);
    const reviewer = raw.match(/审核人(?:交给|改成|调整为|变更为)\s*([\u4e00-\u9fff]{2,3})/);
    return [{
      device: voiceMatch[1],
      issue: `${voiceMatch[1]}${voiceMatch[2]}`.trim(),
      action: voiceMatch[5].replace(/^(?:去|进行|负责)/, "").trim() || "复查",
      owner: reassigned ? reassigned[1] : voiceMatch[3],
      reviewer: reviewer ? reviewer[1] : "待提取",
      deadline: latest ? `${latest[1]}${latest[2] || ""}` : (voiceMatch[4] || "待提取"),
      status: "待确认",
      data_source: "real",
      is_injected: false,
    }];
  }
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

function isSummaryRequest(text) {
  return /(?:总结|摘要|概括)(?:一下|当前|本次|这次)?/.test(String(text || ""));
}

module.exports = {
  parseRuleActionItems,
  parseDeadlineUpdate,
  isSummaryRequest,
  splitSegments,
};
