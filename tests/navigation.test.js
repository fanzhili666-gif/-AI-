"use strict";

const assert = require("node:assert/strict");
const { dispatchNavigationActions } = require("../src/navigation");

function createHarness({ historyOpen = false, viewingArchive = false } = {}) {
  const calls = [];
  let historyIndex = 0;
  const handlers = {
    isHistoryOpen: () => historyOpen,
    isHistoryOpening: () => historyOpen,
    getHistoryIndex: () => historyIndex,
    getHistoryCount: () => 3,
    setHistoryIndex: (index) => {
      historyIndex = index;
      calls.push(["select", index]);
    },
    getInitialHistoryIndex: () => 1,
    activateHistory: (index) => calls.push(["activate-history", index]),
    closeHistory: () => {
      historyOpen = false;
      calls.push(["close-history"]);
    },
    isViewingArchive: () => viewingArchive,
    returnToCurrent: () => {
      viewingArchive = false;
      calls.push(["show-current"]);
    },
    openHistory: () => {
      historyOpen = true;
      calls.push(["open-history"]);
    },
    scroll: (delta) => calls.push(["scroll", delta]),
  };
  return { calls, handlers };
}

{
  const { calls, handlers } = createHarness();
  dispatchNavigationActions(["up", "down", "down", "down", "down"], handlers);
  assert.deepEqual(calls, [["scroll", 240]]);
}

{
  const { calls, handlers } = createHarness();
  dispatchNavigationActions(["activate"], handlers);
  assert.deepEqual(calls, [["open-history"]]);
}

{
  const { calls, handlers } = createHarness({ historyOpen: true });
  dispatchNavigationActions(["down", "activate"], handlers);
  assert.deepEqual(calls, [
    ["select", 1],
    ["activate-history", 1],
    ["close-history"],
  ]);
}

{
  const { calls, handlers } = createHarness({ historyOpen: true });
  dispatchNavigationActions(["back"], handlers);
  assert.deepEqual(calls, [["select", 1], ["close-history"]]);
}

{
  const { calls, handlers } = createHarness({ viewingArchive: true });
  dispatchNavigationActions(["back"], handlers);
  assert.deepEqual(calls, [
    ["show-current"],
  ]);
}

{
  const { calls, handlers } = createHarness({ viewingArchive: true });
  dispatchNavigationActions(["up"], handlers);
  dispatchNavigationActions(["down"], handlers);
  assert.deepEqual(calls, [
    ["scroll", -80],
    ["scroll", 80],
  ]);
}

{
  const { calls, handlers } = createHarness({ viewingArchive: true });
  dispatchNavigationActions(["down", "left", "right"], handlers);
  assert.deepEqual(calls, [
    ["scroll", 80],
    ["show-current"],
    ["open-history"],
  ]);
}

{
  const { calls, handlers } = createHarness({ viewingArchive: true });
  dispatchNavigationActions(["left", "left", "left"], handlers);
  assert.deepEqual(calls, [["show-current"]]);
}

{
  const { calls, handlers } = createHarness();
  dispatchNavigationActions(["right", "right", "right"], handlers);
  assert.deepEqual(calls, [["open-history"]]);
}

{
  const { calls, handlers } = createHarness();
  dispatchNavigationActions(["left", "left"], handlers);
  assert.deepEqual(calls, []);
}

{
  const { calls, handlers } = createHarness({ historyOpen: true });
  dispatchNavigationActions(["left"], handlers);
  assert.deepEqual(calls, [
    ["close-history"],
    ["show-current"],
  ]);
}

console.log("navigation: platform button routing checks passed");
