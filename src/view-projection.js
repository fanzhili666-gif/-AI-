"use strict";

const LABELS = Object.freeze({
  device: "设备",
  issue: "现象",
  owner: "负责人",
  deadline: "截止时间",
  priority: "优先级",
  status: "状态",
});

function projectEntity(entity, fields) {
  const selected = Array.isArray(fields) && fields.length ? fields : Object.keys(LABELS);
  return selected
    .filter((field) => Object.hasOwn(LABELS, field) && entity[field] !== undefined && entity[field] !== null)
    .map((field) => `${LABELS[field]}：${entity[field]}`);
}

module.exports = { LABELS, projectEntity };
