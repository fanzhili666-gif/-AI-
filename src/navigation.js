"use strict";

function dispatchNavigationActions(actions, handlers) {
  let scrollDelta = 0;
  const flushScroll = () => {
    if (scrollDelta === 0) return;
    handlers.scroll(Math.max(-240, Math.min(240, scrollDelta)));
    scrollDelta = 0;
  };

  for (const action of actions) {
    if (handlers.isHistoryOpen()) {
      flushScroll();
      if (action === "up" || action === "down") {
        const index = handlers.getHistoryIndex();
        const direction = action === "up" ? -1 : 1;
        const nextIndex = Math.max(
          0,
          Math.min(handlers.getHistoryCount() - 1, index + direction),
        );
        if (nextIndex !== index) handlers.setHistoryIndex(nextIndex);
      } else if (action === "activate") {
        handlers.activateHistory(handlers.getHistoryIndex());
        handlers.closeHistory();
      } else if (action === "back") {
        handlers.setHistoryIndex(handlers.getInitialHistoryIndex());
        handlers.closeHistory();
      } else if (action === "left") {
        handlers.closeHistory();
        handlers.returnToCurrent();
      }
      continue;
    }

    if (action === "back") {
      flushScroll();
      handlers.returnToCurrent();
    } else if (action === "up") {
      scrollDelta -= 80;
    } else if (action === "down") {
      scrollDelta += 80;
    } else if (action === "activate") {
      flushScroll();
      if (!handlers.isHistoryOpening()) handlers.openHistory();
    } else if (action === "left") {
      flushScroll();
      if (handlers.isViewingArchive()) handlers.returnToCurrent();
    } else if (action === "right") {
      flushScroll();
      if (!handlers.isHistoryOpening()) handlers.openHistory();
    }
  }

  flushScroll();
}

module.exports = { dispatchNavigationActions };
