(() => {
  "use strict";
  const APP_VERSION =
    (window.TWENTY_ONE_CONFIG && window.TWENTY_ONE_CONFIG.siteVersion) ||
    "1.0.0";
  const START_DISTANCE = 5;
  const START_BET = 1;
  const TURN_TIME_MS = 35000;
  const MAX_LOG = 18;
  const NUMBER_VALUES = Array.from({ length: 11 }, (_, index) => index + 1);
  const root = document.getElementById("app");
  const TRUMP_IDS = [
    "2-card",
    "3-card",
    "4-card",
    "5-card",
    "6-card",
    "7-card",
    "go17",
    "go24",
    "go27",
    "one-up",
    "two-up",
    "shield",
    "shield-plus",
    "bless",
    "bloodshed",
    "destroy",
    "friendship",
    "reincarnation",
    "hush",
    "perfect-draw",
    "refresh",
    "remove",
    "return",
    "exchange",
    "disservice",
  ];
  const TRUMP_LIBRARY = {
    "2-card": makeTrump("2-card", "2-Card", "instant", "Add Number", "Draw the 2 if it is still in the deck.", { exactValue: 2 }),
    "3-card": makeTrump("3-card", "3-Card", "instant", "Add Number", "Draw the 3 if it is still in the deck.", { exactValue: 3 }),
    "4-card": makeTrump("4-card", "4-Card", "instant", "Add Number", "Draw the 4 if it is still in the deck.", { exactValue: 4 }),
    "5-card": makeTrump("5-card", "5-Card", "instant", "Add Number", "Draw the 5 if it is still in the deck.", { exactValue: 5 }),
    "6-card": makeTrump("6-card", "6-Card", "instant", "Add Number", "Draw the 6 if it is still in the deck.", { exactValue: 6 }),
    "7-card": makeTrump("7-card", "7-Card", "instant", "Add Number", "Draw the 7 if it is still in the deck.", { exactValue: 7 }),
    go17: makeTrump("go17", "Go For 17", "persistent", "Goal", "Change the target to 17.", { target: 17 }),
    go24: makeTrump("go24", "Go For 24", "persistent", "Goal", "Change the target to 24.", { target: 24 }),
    go27: makeTrump("go27", "Go For 27", "persistent", "Goal", "Change the target to 27.", { target: 27 }),
    "one-up": makeTrump("one-up", "One-Up", "persistent", "Bet", "Raise the opponent's damage by 1.", { betDelta: 1 }),
    "two-up": makeTrump("two-up", "Two-Up", "persistent", "Bet", "Raise the opponent's damage by 2.", { betDelta: 2 }),
    shield: makeTrump("shield", "Shield", "persistent", "Defense", "Reduce your incoming damage by 1.", { shieldDelta: 1 }),
    "shield-plus": makeTrump("shield-plus", "Shield+", "persistent", "Defense", "Reduce your incoming damage by 2.", { shieldDelta: 2 }),
    bless: makeTrump("bless", "Bless", "persistent", "Defense", "If this round would kill you, Bless saves you once.", { blessing: true }),
    bloodshed: makeTrump("bloodshed", "Bloodshed", "persistent", "Bet", "Raise the opponent's damage by 1 and draw 1 trump.", { betDelta: 1, extraTrump: 1 }),
    destroy: makeTrump("destroy", "Destroy", "instant", "Counter", "Destroy the opponent's most recent placed trump.", {}),
    friendship: makeTrump("friendship", "Friendship", "instant", "Swing", "Both players draw 2 trumps.", {}),
    reincarnation: makeTrump("reincarnation", "Reincarnation", "instant", "Counter", "Destroy the opponent's latest trump and draw 1 trump.", {}),
    hush: makeTrump("hush", "Hush", "instant", "Deck", "Draw a hidden card from the deck.", {}),
    "perfect-draw": makeTrump("perfect-draw", "Perfect Draw", "instant", "Deck", "Draw the best possible card from the deck.", {}),
    refresh: makeTrump("refresh", "Refresh", "instant", "Deck", "Return your whole hand to the deck and draw 2 new cards.", {}),
    remove: makeTrump("remove", "Remove", "instant", "Deck", "Return your opponent's latest removable card to the deck.", {}),
    return: makeTrump("return", "Return", "instant", "Deck", "Return your latest removable card to the deck.", {}),
    exchange: makeTrump("exchange", "Exchange", "instant", "Deck", "Swap the latest removable card from each player.", {}),
    disservice: makeTrump("disservice", "Disservice", "instant", "Deck", "Force your opponent to draw a visible card.", {}),
  };
  const runtime = {
    renderQueued: false,
    turnInterval: null,
    turnDeadline: 0,
    turnActivePlayer: null,
    botTimer: null,
    peer: null,
    peerKind: "client",
    peerOpening: null,
    roomConnection: null,
    heartbeatInterval: null,
    reconnectTimer: null,
    roomListToken: 0,
    processedRemoteActions: new Set(),
    autoJoinAttempted: false,
  };
  const state = {
    screen: "menu",
    menu: {
      playerName: localStorage.getItem("twentyone.playerName") || "Player 1",
      secondName: localStorage.getItem("twentyone.secondName") || "Player 2",
      onlineName: localStorage.getItem("twentyone.onlineName") || "Player Online",
    },
    ui: {
      modal: null,
      viewerIndex: 0,
      passOverlay: false,
      notice: "",
    },
    game: null,
    online: {
      role: "browser",
      peerConfig: loadPeerConfig(),
      peerStatus: "idle",
      peerError: "",
      peerId: "",
      connectionStatus: "offline",
      roomList: [],
      roomMeta: null,
      roomCodeInput: "",
      discoveryError: "",
      isRefreshing: false,
      localHash: "",
      remoteHash: "",
      syncWarning: "",
      reconnectAttempts: 0,
    },
  };
  root.addEventListener("click", onRootClick);
  root.addEventListener("input", onRootInput);
  window.addEventListener("beforeunload", () => {
    sendRoomMessage({ type: "leave", reason: "window-close" });
    cleanupOnlineRuntime(true);
  });
  boot();
  function makeTrump(id, name, mode, family, description, extra) {
    return Object.assign(
      {
        id,
        name,
        mode,
        family,
        description,
      },
      extra || {}
    );
  }
  function boot() {
    state.online.roomCodeInput = getRoomCodeFromUrl() || "";
    render();
    if (state.online.roomCodeInput) {
      state.screen = "online-browser";
      render();
      queueMicrotask(() => {
        if (!runtime.autoJoinAttempted) {
          runtime.autoJoinAttempted = true;
          safeAsync(openOnlineBrowser);
        }
      });
    }
  }
  // == SECTION: CONFIG AND UTILS ==
  function loadPeerConfig() {
    const defaults = (window.TWENTY_ONE_CONFIG && window.TWENTY_ONE_CONFIG.peer) || {};
    return {
      host: localStorage.getItem("twentyone.peer.host") || defaults.host || "your-peer-server.example.com",
      port: Number(localStorage.getItem("twentyone.peer.port") || defaults.port || 443),
      path: localStorage.getItem("twentyone.peer.path") || defaults.path || "/twentyone",
      secure: localStorage.getItem("twentyone.peer.secure") !== null ? localStorage.getItem("twentyone.peer.secure") !== "false" : defaults.secure !== false,
      debug: Number(defaults.debug || 1),
    };
  }
  function savePeerConfig(config) {
    state.online.peerConfig = {
      host: String(config.host || "").trim(),
      port: Number(config.port || 443),
      path: normalizePath(config.path || "/twentyone"),
      secure: !!config.secure,
      debug: Number(config.debug || 1),
    };
    localStorage.setItem("twentyone.peer.host", state.online.peerConfig.host);
    localStorage.setItem("twentyone.peer.port", String(state.online.peerConfig.port));
    localStorage.setItem("twentyone.peer.path", state.online.peerConfig.path);
    localStorage.setItem("twentyone.peer.secure", String(state.online.peerConfig.secure));
    state.online.peerError = "";
    state.online.discoveryError = "";
  }
  function normalizePath(path) { return path && path.startsWith("/") ? path : `/${path || "twentyone"}`; }
  function getPeerOptions() {
    const config = state.online.peerConfig;
    return {
      host: config.host,
      port: config.port,
      path: normalizePath(config.path),
      secure: config.secure,
      debug: config.debug,
    };
  }
  function isPeerConfigReady() { return !!state.online.peerConfig.host && !/your-peer-server/i.test(state.online.peerConfig.host); }
  function getPeerHttpBase() {
    const config = state.online.peerConfig;
    const protocol = config.secure ? "https" : "http";
    const defaultPort = (config.secure && Number(config.port) === 443) || (!config.secure && Number(config.port) === 80);
    const portPart = defaultPort ? "" : `:${config.port}`;
    return `${protocol}://${config.host}${portPart}${normalizePath(config.path)}`;
  }
  function getRoomCodeFromUrl() { return new URLSearchParams(window.location.search).get("room") || ""; }
  function setRoomCodeInUrl(roomId) {
    const params = new URLSearchParams(window.location.search);
    if (roomId) {
      params.set("room", roomId);
    } else {
      params.delete("room");
    }
    const next = params.toString();
    history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }
  function otherPlayer(index) { return index === 0 ? 1 : 0; }
  function hashToUint32(input) { let hash = 2166136261; const value = String(input); for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
  function consumeRandom(source) { source.rngState = (source.rngState + 0x6d2b79f5) >>> 0; let value = source.rngState; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }
  function shuffleWithSeed(values, seed) { const copy = values.slice(); const holder = { rngState: hashToUint32(seed) || 1 }; for (let index = copy.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(consumeRandom(holder) * (index + 1)); const temp = copy[index]; copy[index] = copy[swapIndex]; copy[swapIndex] = temp; } return copy; }
  function randomCode(prefix) { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let output = prefix ? `${prefix}-` : ""; const holder = { rngState: hashToUint32(`${Date.now()}-${Math.random()}`) }; for (let index = 0; index < 6; index += 1) { output += alphabet[Math.floor(consumeRandom(holder) * alphabet.length)]; } return output; }
  function cloneSimple(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) { return String(value === undefined || value === null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  // == SECTION: GAME ENGINE ==
  function createCard(game, value, ownerIndex, options) {
    return {
      uid: `${game.roundNumber}-${ownerIndex}-${game.nextCardOrder}`,
      value,
      ownerIndex,
      hiddenFromOpponent: !!options.hiddenFromOpponent,
      source: options.source || "draw",
      recentEligible: options.recentEligible !== false,
      drawOrder: game.nextCardOrder++,
    };
  }
  function createPlayer(name, control, peerId) {
    return {
      name,
      control,
      peerId: peerId || "",
      sawDistance: START_DISTANCE,
      hand: [],
      trumps: [],
      stayed: false,
      timedOut: false,
    };
  }
  function buildGame(mode, players) {
    return {
      mode,
      phase: "playing",
      roundNumber: 0,
      baseBet: START_BET,
      seed: "",
      rngState: 1,
      nextCardOrder: 1,
      activePlayer: 0,
      deck: [],
      trumpDeck: [],
      placedTrumps: [],
      log: [],
      result: null,
      actionSeq: 0,
      players,
    };
  }
  function computeGameHash(game) {
    const plain = {
      mode: game.mode,
      phase: game.phase,
      roundNumber: game.roundNumber,
      baseBet: game.baseBet,
      seed: game.seed,
      rngState: game.rngState,
      nextCardOrder: game.nextCardOrder,
      activePlayer: game.activePlayer,
      deck: game.deck.slice(),
      trumpDeck: game.trumpDeck.slice(),
      placedTrumps: game.placedTrumps.map((item) => ({
        uid: item.uid,
        id: item.id,
        ownerIndex: item.ownerIndex,
        placedOrder: item.placedOrder,
      })),
      players: game.players.map((player) => ({
        name: player.name,
        sawDistance: player.sawDistance,
        stayed: player.stayed,
        timedOut: player.timedOut,
        trumps: player.trumps.slice(),
        hand: player.hand.map((card) => ({
          uid: card.uid,
          value: card.value,
          hiddenFromOpponent: card.hiddenFromOpponent,
          source: card.source,
          recentEligible: card.recentEligible,
          drawOrder: card.drawOrder,
        })),
      })),
      result: game.result ? {
        winnerIndex: game.result.winnerIndex,
        loserIndex: game.result.loserIndex,
        damage: game.result.damage,
        reason: game.result.reason,
        blessSaved: game.result.blessSaved,
      } : null,
    };
    let hash = 5381;
    const text = JSON.stringify(plain);
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 33) ^ text.charCodeAt(index);
    }
    return (hash >>> 0).toString(16);
  }
  function pushLog(game, message) {
    game.log.unshift(message);
    game.log = game.log.slice(0, MAX_LOG);
  }
  function getCurrentTarget(game) {
    for (let index = game.placedTrumps.length - 1; index >= 0; index -= 1) {
      const item = game.placedTrumps[index];
      if (TRUMP_LIBRARY[item.id].target) {
        return TRUMP_LIBRARY[item.id].target;
      }
    }
    return 21;
  }
  function getHandTotal(game, playerIndex) {
    return game.players[playerIndex].hand.reduce((total, card) => total + card.value, 0);
  }
  function getVisibleTotal(game, playerIndex, viewerIndex) {
    const revealAll = game.phase !== "playing";
    return game.players[playerIndex].hand.reduce((total, card) => {
      if (revealAll || viewerIndex === playerIndex || !card.hiddenFromOpponent) {
        return total + card.value;
      }
      return total;
    }, 0);
  }
  function getGoalDelta(game, playerIndex) {
    return Math.abs(getCurrentTarget(game) - getHandTotal(game, playerIndex));
  }
  function getBetPressure(game, playerIndex) {
    const enemyIndex = otherPlayer(playerIndex);
    const attack = game.placedTrumps.filter((item) => item.ownerIndex === enemyIndex).reduce((total, item) => total + (TRUMP_LIBRARY[item.id].betDelta || 0), 0);
    const shields = game.placedTrumps.filter((item) => item.ownerIndex === playerIndex).reduce((total, item) => total + (TRUMP_LIBRARY[item.id].shieldDelta || 0), 0);
    return Math.max(0, game.baseBet + attack - shields);
  }
  function hasBless(game, playerIndex) {
    return game.placedTrumps.some((item) => item.ownerIndex === playerIndex && TRUMP_LIBRARY[item.id].blessing);
  }
  function removeExistingGoal(game) {
    game.placedTrumps = game.placedTrumps.filter((item) => !TRUMP_LIBRARY[item.id].target);
  }
  function placePersistentTrump(game, playerIndex, trumpId) {
    if (TRUMP_LIBRARY[trumpId].target) {
      removeExistingGoal(game);
    }
    game.placedTrumps.push({
      uid: `${trumpId}-${game.roundNumber}-${game.placedTrumps.length + 1}`,
      id: trumpId,
      ownerIndex: playerIndex,
      placedOrder: game.placedTrumps.length + 1,
    });
  }
  function drawTrump(game, playerIndex, count, reason) {
    let drawn = 0;
    while (drawn < count && game.trumpDeck.length) {
      const trumpId = game.trumpDeck.shift();
      game.players[playerIndex].trumps.push(trumpId);
      drawn += 1;
      pushLog(game, `${game.players[playerIndex].name} gained ${TRUMP_LIBRARY[trumpId].name} (${reason}).`);
    }
    return drawn;
  }
  function insertCardBackIntoDeck(game, card) {
    const insertionIndex = Math.floor(consumeRandom(game) * (game.deck.length + 1));
    game.deck.splice(insertionIndex, 0, card.value);
  }
  function removeCardByIndex(player, cardIndex) {
    if (cardIndex < 0 || cardIndex >= player.hand.length) {
      return null;
    }
    return player.hand.splice(cardIndex, 1)[0];
  }
  function findRecentEligibleCard(game, playerIndex) {
    const player = game.players[playerIndex];
    let best = null;
    player.hand.forEach((card, index) => {
      if (!card.recentEligible) {
        return;
      }
      if (card.hiddenFromOpponent && player.hand.length === 1) {
        return;
      }
      if (!best || card.drawOrder > best.card.drawOrder) {
        best = { card, index };
      }
    });
    return best;
  }
  function drawNumberCard(game, playerIndex, options) {
    const pick = options || {};
    let deckIndex = 0;
    if (pick.exactValue !== undefined) {
      deckIndex = game.deck.indexOf(pick.exactValue);
    } else if (typeof pick.findIndex === "function") {
      deckIndex = pick.findIndex(game.deck.slice());
    }
    if (deckIndex < 0 || deckIndex >= game.deck.length) {
      return null;
    }
    const value = game.deck.splice(deckIndex, 1)[0];
    const card = createCard(game, value, playerIndex, {
      hiddenFromOpponent: !!pick.hiddenFromOpponent,
      source: pick.source || "draw",
      recentEligible: pick.recentEligible !== false,
    });
    game.players[playerIndex].hand.push(card);
    return card;
  }
  function drawPerfectCard(game, playerIndex) {
    const target = getCurrentTarget(game);
    const total = getHandTotal(game, playerIndex);
    const scored = game.deck.map((value, index) => {
      const nextTotal = total + value;
      return {
        index,
        value,
        busted: nextTotal > target,
        distance: Math.abs(target - nextTotal),
      };
    });
    if (!scored.length) {
      return null;
    }
    scored.sort((left, right) => {
      if (left.busted !== right.busted) {
        return left.busted ? 1 : -1;
      }
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return right.value - left.value;
    });
    return drawNumberCard(game, playerIndex, {
      findIndex() {
        return scored[0].index;
      },
      hiddenFromOpponent: false,
      source: "perfect-draw",
    });
  }
  function destroyLatestEnemyTrump(game, playerIndex) {
    for (let index = game.placedTrumps.length - 1; index >= 0; index -= 1) {
      if (game.placedTrumps[index].ownerIndex !== playerIndex) {
        return game.placedTrumps.splice(index, 1)[0];
      }
    }
    return null;
  }
  function applyTrump(game, playerIndex, trumpId) {
    const player = game.players[playerIndex];
    const enemyIndex = otherPlayer(playerIndex);
    const enemy = game.players[enemyIndex];
    const trump = TRUMP_LIBRARY[trumpId];
    if (trump.exactValue !== undefined) {
      const card = drawNumberCard(game, playerIndex, {
        exactValue: trump.exactValue,
        hiddenFromOpponent: false,
        source: trump.id,
      });
      pushLog(game, card ? `${player.name} used ${trump.name} and drew ${card.value}.` : `${player.name} used ${trump.name}, but the card was gone.`);
      return;
    }
    switch (trumpId) {
      case "go17":
      case "go24":
      case "go27":
      case "one-up":
      case "two-up":
      case "shield":
      case "shield-plus":
      case "bless":
        placePersistentTrump(game, playerIndex, trumpId);
        if (trump.target) {
          pushLog(game, `${player.name} changed the target to ${trump.target}.`);
        } else if (trump.shieldDelta) {
          pushLog(game, `${player.name} used ${trump.name} and lowered incoming damage by ${trump.shieldDelta}.`);
        } else if (trump.betDelta) {
          pushLog(game, `${player.name} used ${trump.name} and raised ${enemy.name}'s danger by ${trump.betDelta}.`);
        } else {
          pushLog(game, `${player.name} used Bless and is protected from death.`);
        }
        break;
      case "bloodshed":
        placePersistentTrump(game, playerIndex, trumpId);
        pushLog(game, `${player.name} used Bloodshed and raised ${enemy.name}'s danger by 1.`);
        drawTrump(game, playerIndex, 1, "Bloodshed");
        break;
      case "destroy": {
        const removed = destroyLatestEnemyTrump(game, playerIndex);
        pushLog(game, removed ? `${player.name} destroyed ${enemy.name}'s ${TRUMP_LIBRARY[removed.id].name}.` : `${player.name} used Destroy, but there was nothing to remove.`);
        break;
      }
      case "reincarnation": {
        const removed = destroyLatestEnemyTrump(game, playerIndex);
        if (removed) {
          pushLog(game, `${player.name} used Reincarnation and broke ${enemy.name}'s ${TRUMP_LIBRARY[removed.id].name}.`);
          drawTrump(game, playerIndex, 1, "Reincarnation");
        } else {
          pushLog(game, `${player.name} used Reincarnation, but there was no valid target.`);
        }
        break;
      }
      case "friendship":
        drawTrump(game, playerIndex, 2, "Friendship");
        drawTrump(game, enemyIndex, 2, "Friendship");
        pushLog(game, `${player.name} used Friendship. Both players drew 2 trumps.`);
        break;
      case "hush": {
        const card = drawNumberCard(game, playerIndex, {
          hiddenFromOpponent: true,
          source: "hush",
        });
        pushLog(game, card ? `${player.name} used Hush and drew a hidden card.` : `${player.name} used Hush, but the deck was empty.`);
        break;
      }
      case "perfect-draw": {
        const card = drawPerfectCard(game, playerIndex);
        pushLog(game, card ? `${player.name} used Perfect Draw and found ${card.value}.` : `${player.name} used Perfect Draw, but no card was available.`);
        break;
      }
      case "refresh": {
        const cards = player.hand.splice(0, player.hand.length);
        cards.forEach((card) => insertCardBackIntoDeck(game, card));
        const first = drawNumberCard(game, playerIndex, {
          hiddenFromOpponent: false,
          source: "refresh",
        });
        const second = drawNumberCard(game, playerIndex, {
          hiddenFromOpponent: true,
          source: "refresh",
        });
        pushLog(game, first || second ? `${player.name} refreshed the hand and drew 2 new cards.` : `${player.name} used Refresh, but no cards could be redrawn.`);
        break;
      }
      case "remove": {
        const target = findRecentEligibleCard(game, enemyIndex);
        if (target) {
          const removedCard = removeCardByIndex(enemy, target.index);
          insertCardBackIntoDeck(game, removedCard);
          pushLog(game, `${player.name} removed ${enemy.name}'s latest card (${removedCard.value}).`);
        } else {
          pushLog(game, `${player.name} used Remove, but ${enemy.name} had no valid card.`);
        }
        break;
      }
      case "return": {
        const target = findRecentEligibleCard(game, playerIndex);
        if (target) {
          const removedCard = removeCardByIndex(player, target.index);
          insertCardBackIntoDeck(game, removedCard);
          pushLog(game, `${player.name} returned the latest card (${removedCard.value}) to the deck.`);
        } else {
          pushLog(game, `${player.name} used Return, but had no valid card to send back.`);
        }
        break;
      }
      case "exchange": {
        const ownCardRef = findRecentEligibleCard(game, playerIndex);
        const enemyCardRef = findRecentEligibleCard(game, enemyIndex);
        if (ownCardRef && enemyCardRef) {
          const ownCard = player.hand[ownCardRef.index];
          const foeCard = enemy.hand[enemyCardRef.index];
          player.hand[ownCardRef.index] = Object.assign({}, foeCard, {
            ownerIndex: playerIndex,
            drawOrder: game.nextCardOrder++,
          });
          enemy.hand[enemyCardRef.index] = Object.assign({}, ownCard, {
            ownerIndex: enemyIndex,
            drawOrder: game.nextCardOrder++,
          });
          pushLog(game, `${player.name} exchanged the latest cards with ${enemy.name}.`);
        } else {
          pushLog(game, `${player.name} used Exchange, but one side was missing a valid card.`);
        }
        break;
      }
      case "disservice": {
        const card = drawNumberCard(game, enemyIndex, {
          hiddenFromOpponent: false,
          source: "disservice",
        });
        pushLog(game, card ? `${player.name} forced ${enemy.name} to draw ${card.value}.` : `${player.name} used Disservice, but the deck was empty.`);
        break;
      }
      default:
        pushLog(game, `${player.name} used ${trump.name}, but nothing happened.`);
    }
  }
  function prepareRound(game, seed) {
    game.phase = "playing";
    game.roundNumber += 1;
    game.seed = seed;
    game.rngState = hashToUint32(`${seed}:live`) || 1;
    game.nextCardOrder = 1;
    game.deck = shuffleWithSeed(NUMBER_VALUES, `${seed}:deck`);
    game.trumpDeck = shuffleWithSeed(TRUMP_IDS, `${seed}:trump`);
    game.placedTrumps = [];
    game.actionSeq = 0;
    game.result = null;
    game.activePlayer = (game.roundNumber - 1) % 2;
    game.players.forEach((player) => {
      player.hand = [];
      player.trumps = [];
      player.stayed = false;
      player.timedOut = false;
    });
    for (let playerIndex = 0; playerIndex < game.players.length; playerIndex += 1) {
      drawNumberCard(game, playerIndex, {
        hiddenFromOpponent: false,
        source: "initial-visible",
        recentEligible: true,
      });
      drawNumberCard(game, playerIndex, {
        hiddenFromOpponent: true,
        source: "initial-hidden",
        recentEligible: false,
      });
      drawTrump(game, playerIndex, 2, "round-start");
    }
    pushLog(game, `Round ${game.roundNumber} started. Target ${getCurrentTarget(game)}.`);
  }
  function createMatch(mode, names) {
    const players =
      mode === "bot"
        ? [createPlayer(names[0], "local"), createPlayer(names[1], "bot")]
        : [createPlayer(names[0], "local"), createPlayer(names[1], mode === "online" ? "remote" : "local")];
    const game = buildGame(mode, players);
    prepareRound(game, generateSeed(mode));
    state.game = game;
    state.screen = "game";
    state.ui.viewerIndex = mode === "online" ? getOnlineLocalPlayerIndex() : 0;
    state.ui.passOverlay = mode === "local" && game.activePlayer !== state.ui.viewerIndex;
    state.online.localHash = computeGameHash(game);
    state.online.remoteHash = "";
    state.online.syncWarning = "";
  }
  function generateSeed(label) { return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
  function resolveRound(game) {
    const target = getCurrentTarget(game);
    const first = {
      index: 0,
      total: getHandTotal(game, 0),
      timedOut: game.players[0].timedOut,
      busted: getHandTotal(game, 0) > target,
    };
    const second = {
      index: 1,
      total: getHandTotal(game, 1),
      timedOut: game.players[1].timedOut,
      busted: getHandTotal(game, 1) > target,
    };
    let winnerIndex = null;
    let loserIndex = null;
    let reason = "tie";
    if (first.timedOut && !second.timedOut) {
      winnerIndex = 1;
      loserIndex = 0;
      reason = "timeout";
    } else if (second.timedOut && !first.timedOut) {
      winnerIndex = 0;
      loserIndex = 1;
      reason = "timeout";
    } else if (first.busted && second.busted) {
      if (first.total < second.total) {
        winnerIndex = 0;
        loserIndex = 1;
        reason = "double-bust";
      } else if (second.total < first.total) {
        winnerIndex = 1;
        loserIndex = 0;
        reason = "double-bust";
      }
    } else if (first.busted && !second.busted) {
      winnerIndex = 1;
      loserIndex = 0;
      reason = "bust";
    } else if (second.busted && !first.busted) {
      winnerIndex = 0;
      loserIndex = 1;
      reason = "bust";
    } else {
      const firstDelta = Math.abs(target - first.total);
      const secondDelta = Math.abs(target - second.total);
      if (firstDelta < secondDelta) {
        winnerIndex = 0;
        loserIndex = 1;
        reason = "closer";
      } else if (secondDelta < firstDelta) {
        winnerIndex = 1;
        loserIndex = 0;
        reason = "closer";
      }
    }
    let damage = 0;
    let blessSaved = false;
    let matchWinnerIndex = null;
    if (loserIndex !== null) {
      damage = getBetPressure(game, loserIndex);
      if (hasBless(game, loserIndex) && damage >= game.players[loserIndex].sawDistance && game.players[loserIndex].sawDistance > 0) {
        blessSaved = true;
        damage = 0;
      }
      game.players[loserIndex].sawDistance = Math.max(0, game.players[loserIndex].sawDistance - damage);
      if (game.players[loserIndex].sawDistance <= 0) {
        matchWinnerIndex = winnerIndex;
      }
    }
    game.baseBet = blessSaved ? Math.max(0, game.baseBet - 1) : game.baseBet + 1;
    game.result = {
      winnerIndex,
      loserIndex,
      target,
      damage,
      blessSaved,
      reason,
      matchWinnerIndex,
      totals: [first.total, second.total],
    };
    game.phase = matchWinnerIndex === null ? "round-end" : "match-end";
    if (winnerIndex === null) {
      pushLog(game, `Round ${game.roundNumber} ended in a tie. The saw stayed put.`);
    } else {
      pushLog(game, `${game.players[winnerIndex].name} won round ${game.roundNumber}. ${game.players[loserIndex].name} lost ${damage} distance.`);
      if (blessSaved) {
        pushLog(game, `${game.players[loserIndex].name}'s Bless prevented a lethal hit.`);
      }
      if (matchWinnerIndex !== null) {
        pushLog(game, `${game.players[matchWinnerIndex].name} won the whole match.`);
      }
    }
  }
  function advanceTurn(game, actorIndex) {
    if (game.players.every((player) => player.stayed)) {
      resolveRound(game);
      return;
    }
    const enemyIndex = otherPlayer(actorIndex);
    game.activePlayer = game.players[enemyIndex].stayed ? actorIndex : enemyIndex;
  }
  function applyAction(game, action) {
    if (!game) {
      return false;
    }
    if (action.type === "next-round") {
      if (game.phase !== "round-end") {
        return false;
      }
      prepareRound(game, action.seed);
      return true;
    }
    if (game.phase !== "playing") {
      return false;
    }
    const actor = action.playerIndex;
    if (actor !== game.activePlayer) {
      return false;
    }
    const player = game.players[actor];
    if (!player || player.stayed) {
      return false;
    }
    if (action.type === "play-trump") {
      const trumpId = player.trumps.splice(action.trumpIndex, 1)[0];
      if (!trumpId) {
        return false;
      }
      applyTrump(game, actor, trumpId);
      return true;
    }
    if (action.type === "draw-card") {
      const card = drawNumberCard(game, actor, {
        hiddenFromOpponent: false,
        source: "draw",
      });
      pushLog(game, card ? `${player.name} drew ${card.value}.` : `${player.name} tried to draw, but the deck was empty.`);
      advanceTurn(game, actor);
      return true;
    }
    if (action.type === "stay") {
      player.stayed = true;
      pushLog(game, `${player.name} stayed.`);
      advanceTurn(game, actor);
      return true;
    }
    if (action.type === "timeout") {
      player.stayed = true;
      player.timedOut = true;
      pushLog(game, `${player.name} ran out of time and auto-stayed.`);
      advanceTurn(game, actor);
      return true;
    }
    return false;
  }
  function buildAction(type, payload) {
    const game = state.game;
    const seq = game ? game.actionSeq + 1 : 1;
    return Object.assign(
      {
        type,
        seq,
        seed: game ? game.seed : "",
        actionId: `${game ? game.roundNumber : 0}-${seq}-${Date.now()}`,
      },
      payload || {}
    );
  }
  function getOnlineLocalPlayerIndex() { return state.online.role === "guest" ? 1 : 0; }
  function getViewerIndex() {
    if (!state.game) {
      return 0;
    }
    if (state.game.mode === "online") {
      return getOnlineLocalPlayerIndex();
    }
    if (state.game.mode === "bot") {
      return 0;
    }
    return state.ui.viewerIndex;
  }
  function isTimerAuthority() {
    if (!state.game) {
      return false;
    }
    return state.game.mode !== "online" || state.online.role === "host";
  }
  function startTurnFlow() {
    clearTimeout(runtime.botTimer);
    clearInterval(runtime.turnInterval);
    runtime.botTimer = null;
    runtime.turnInterval = null;
    runtime.turnDeadline = 0;
    runtime.turnActivePlayer = null;
    if (!state.game || state.game.phase !== "playing") {
      queueRender();
      return;
    }
    if (state.game.mode === "local" && state.ui.viewerIndex !== state.game.activePlayer) {
      state.ui.passOverlay = true;
      queueRender();
      return;
    }
    state.ui.passOverlay = false;
    runtime.turnActivePlayer = state.game.activePlayer;
    runtime.turnDeadline = Date.now() + TURN_TIME_MS;
    runtime.turnInterval = window.setInterval(() => {
      if (!state.game || state.game.phase !== "playing") {
        clearInterval(runtime.turnInterval);
        runtime.turnInterval = null;
        return;
      }
      if (isTimerAuthority() && runtime.turnActivePlayer === state.game.activePlayer && Date.now() >= runtime.turnDeadline) {
        clearInterval(runtime.turnInterval);
        runtime.turnInterval = null;
        performLocalGameAction(buildAction("timeout", { playerIndex: state.game.activePlayer }));
        return;
      }
      queueRender();
    }, 250);
    if (state.game.players[state.game.activePlayer].control === "bot") {
      runtime.botTimer = window.setTimeout(() => {
        runBotTurn();
      }, 900);
    }
    queueRender();
  }
  function getTimeLeftMs() {
    if (!state.game || state.game.phase !== "playing" || !runtime.turnDeadline) {
      return TURN_TIME_MS;
    }
    return Math.max(0, runtime.turnDeadline - Date.now());
  }
  function performLocalGameAction(action) {
    if (!state.game) {
      return;
    }
    const applied = applyAction(state.game, action);
    if (!applied) {
      return;
    }
    state.game.actionSeq = Math.max(state.game.actionSeq, action.seq || 0);
    state.online.localHash = computeGameHash(state.game);
    state.online.syncWarning = "";
    if (state.game.mode === "online") {
      sendRoomMessage({
        type: "action",
        action,
        hashAfter: state.online.localHash,
      });
    }
    postActionHousekeeping(action);
  }
  function applyRemoteGameAction(payload) {
    if (!state.game || runtime.processedRemoteActions.has(payload.action.actionId)) {
      return;
    }
    runtime.processedRemoteActions.add(payload.action.actionId);
    const applied = applyAction(state.game, payload.action);
    if (!applied) {
      if (state.online.role === "host") {
        sendSnapshot("remote-rejected");
      }
      return;
    }
    state.game.actionSeq = Math.max(state.game.actionSeq, payload.action.seq || 0);
    state.online.localHash = computeGameHash(state.game);
    if (state.online.localHash !== payload.hashAfter) {
      state.online.syncWarning = "Desync detectado. Sincronizando snapshot...";
      if (state.online.role === "host") {
        sendSnapshot("hash-mismatch");
      } else {
        sendRoomMessage({
          type: "state-hash",
          mismatch: true,
          seq: payload.action.seq,
          hash: state.online.localHash,
        });
      }
    } else {
      sendRoomMessage({
        type: "state-hash",
        mismatch: false,
        seq: payload.action.seq,
        hash: state.online.localHash,
      });
    }
    postActionHousekeeping(payload.action);
  }
  function postActionHousekeeping(action) {
    if (!state.game) {
      return;
    }
    if (state.game.mode === "local" && state.game.phase === "playing") {
      state.ui.passOverlay = state.ui.viewerIndex !== state.game.activePlayer;
    }
    if (action.type === "next-round") {
      runtime.processedRemoteActions.clear();
    }
    startTurnFlow();
    queueRender();
  }
  function runBotTurn() {
    if (!state.game || state.game.phase !== "playing") {
      return;
    }
    const activePlayer = state.game.players[state.game.activePlayer];
    if (activePlayer.control !== "bot") {
      return;
    }
    const candidate = chooseBotAction();
    if (candidate) {
      performLocalGameAction(candidate);
    }
  }
  function chooseBotAction() {
    const game = state.game;
    const botIndex = game.activePlayer;
    const enemyIndex = otherPlayer(botIndex);
    const target = getCurrentTarget(game);
    const ownTotal = getHandTotal(game, botIndex);
    const enemyVisible = getVisibleTotal(game, enemyIndex, botIndex);
    const enemyHidden = game.players[enemyIndex].hand.filter((card) => card.hiddenFromOpponent).length;
    const estimatedEnemy = enemyVisible + enemyHidden * 5;
    const danger = getBetPressure(game, botIndex);
    const couldDie = danger >= game.players[botIndex].sawDistance;
    const available = game.players[botIndex].trumps.slice();
    const findTrumpIndex = (id) => available.indexOf(id);
    const canUse = (id) => findTrumpIndex(id) >= 0;
    if (couldDie && canUse("bless")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("bless") });
    }
    if (danger > 0 && canUse("shield-plus")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("shield-plus") });
    }
    if (danger > 1 && canUse("shield")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("shield") });
    }
    if (ownTotal > target && canUse("return") && findRecentEligibleCard(game, botIndex)) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("return") });
    }
    if (ownTotal > target && canUse("exchange") && findRecentEligibleCard(game, botIndex) && findRecentEligibleCard(game, enemyIndex)) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("exchange") });
    }
    if (ownTotal > target && canUse("refresh")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("refresh") });
    }
    if (ownTotal < target && canUse("perfect-draw")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("perfect-draw") });
    }
    if (estimatedEnemy >= target - 1 && canUse("disservice")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("disservice") });
    }
    if (canUse("destroy") && game.placedTrumps.some((item) => item.ownerIndex === enemyIndex)) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("destroy") });
    }
    if (ownTotal === 17 && canUse("go17") && target !== 17) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("go17") });
    }
    if (ownTotal === 24 && canUse("go24") && target !== 24) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("go24") });
    }
    if (ownTotal === 27 && canUse("go27") && target !== 27) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("go27") });
    }
    if (ownTotal < target - 3 && canUse("7-card") && game.deck.includes(7)) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("7-card") });
    }
    if (ownTotal < estimatedEnemy && canUse("two-up")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("two-up") });
    }
    if (ownTotal < estimatedEnemy && canUse("one-up")) {
      return buildAction("play-trump", { playerIndex: botIndex, trumpIndex: findTrumpIndex("one-up") });
    }
    const safeCards = game.deck.filter((value) => ownTotal + value <= target);
    const shouldStay = ownTotal >= target || (ownTotal >= target - 2 && ownTotal >= estimatedEnemy) || (!safeCards.length && ownTotal >= estimatedEnemy);
    if (shouldStay) {
      return buildAction("stay", { playerIndex: botIndex });
    }
    if (ownTotal <= target - 4 || safeCards.length) {
      return buildAction("draw-card", { playerIndex: botIndex });
    }
    return buildAction("stay", { playerIndex: botIndex });
  }
  // == SECTION: ONLINE ==
  async function openOnlineBrowser() {
    state.screen = "online-browser";
    queueRender();
    if (!isPeerConfigReady()) {
      state.online.discoveryError = "Configura el PeerServer antes de abrir el online.";
      queueRender();
      return;
    }
    await ensurePeer("client");
    await refreshRooms();
    if (state.online.roomCodeInput && getRoomCodeFromUrl()) {
      await joinRoom(state.online.roomCodeInput);
    }
  }
  function sanitizeRoomCode(input) { return String(input || "").trim().toUpperCase(); }
  async function ensurePeer(kind, roomId) {
    if (!window.Peer) {
      throw new Error("PeerJS no se pudo cargar.");
    }
    const expectedPrefix = kind === "room" ? "room-" : "client-";
    if (runtime.peer && state.online.peerStatus === "open" && state.online.peerId.startsWith(expectedPrefix)) {
      return runtime.peer;
    }
    if (runtime.peerOpening) {
      return runtime.peerOpening;
    }
    cleanupOnlineRuntime(false);
    state.online.peerStatus = "connecting";
    state.online.peerError = "";
    queueRender();
    runtime.peerOpening = new Promise((resolve, reject) => {
      const peerId = kind === "room" ? roomId : randomCode("client");
      const peer = new window.Peer(peerId, getPeerOptions());
      runtime.peer = peer;
      runtime.peerKind = kind;
      peer.on("open", (id) => {
        runtime.peerOpening = null;
        state.online.peerStatus = "open";
        state.online.peerId = id;
        wirePeerEvents(peer);
        queueRender();
        resolve(peer);
      });
      peer.on("error", (error) => {
        runtime.peerOpening = null;
        state.online.peerStatus = "error";
        state.online.peerError = String(error && error.message ? error.message : error);
        queueRender();
        reject(error);
      });
    });
    return runtime.peerOpening;
  }
  function wirePeerEvents(peer) {
    peer.on("connection", (connection) => {
      wireConnection(connection);
    });
    peer.on("disconnected", () => {
      state.online.peerStatus = "disconnected";
      queueRender();
    });
    peer.on("close", () => {
      state.online.peerStatus = "closed";
      queueRender();
    });
  }
  function wireConnection(connection) {
    connection.on("data", (message) => handleRoomMessage(message, connection));
    connection.on("close", () => handleConnectionClose(connection));
    connection.on("error", () => handleConnectionClose(connection));
  }
  function handleConnectionClose(connection) {
    if (!runtime.roomConnection || connection.peer !== runtime.roomConnection.peer) {
      return;
    }
    stopHeartbeat();
    state.online.connectionStatus = "disconnected";
    if (state.online.role === "guest" && state.screen !== "menu") {
      attemptReconnect();
    }
    queueRender();
  }
  function stopHeartbeat() {
    clearInterval(runtime.heartbeatInterval);
    runtime.heartbeatInterval = null;
  }
  function startHeartbeat() {
    stopHeartbeat();
    runtime.heartbeatInterval = window.setInterval(() => {
      sendRoomMessage({
        type: "heartbeat",
        at: Date.now(),
      });
    }, 5000);
  }
  function attemptReconnect() {
    if (!state.online.roomMeta || state.online.role !== "guest") {
      return;
    }
    clearTimeout(runtime.reconnectTimer);
    state.online.reconnectAttempts += 1;
    runtime.reconnectTimer = window.setTimeout(() => {
      safeAsync(async () => {
        await ensurePeer("client");
        await joinRoom(state.online.roomMeta.roomId, true);
        state.online.syncWarning = "Reconexion completada.";
        queueRender();
      });
    }, Math.min(1000 * state.online.reconnectAttempts, 5000));
  }
  async function refreshRooms() {
    if (!isPeerConfigReady()) {
      state.online.discoveryError = "Configura host, port y path para poder listar salas.";
      queueRender();
      return;
    }
    state.online.isRefreshing = true;
    state.online.discoveryError = "";
    const token = ++runtime.roomListToken;
    queueRender();
    try {
      await ensurePeer("client");
      const response = await fetch(`${getPeerHttpBase()}/peers`, {
        mode: "cors",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Room discovery failed with status ${response.status}.`);
      }
      const peerIds = await response.json();
      const roomIds = peerIds.filter((peerId) => peerId.startsWith("room-") && peerId !== state.online.peerId);
      const roomMetas = await Promise.all(roomIds.map((roomId) => requestRoomMeta(roomId)));
      if (token !== runtime.roomListToken) {
        return;
      }
      state.online.roomList = roomMetas.filter(Boolean).filter((room) => room.visibility === "public" && room.players < 2 && room.version === APP_VERSION).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    } catch (error) {
      state.online.discoveryError = String(error && error.message ? error.message : error);
    } finally {
      state.online.isRefreshing = false;
      queueRender();
    }
  }
  function requestRoomMeta(roomId) {
    return new Promise((resolve) => {
      if (!runtime.peer) {
        resolve(null);
        return;
      }
      const connection = runtime.peer.connect(roomId, {
        reliable: true,
        metadata: {
          type: "meta-request",
          requester: state.online.peerId,
        },
      });
      let settled = false;
      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          connection.close();
        } catch (error) {
          // Ignore close errors from short listing probes.
        }
        resolve(value);
      };
      connection.on("open", () => {
        connection.send({
          type: "hello",
          request: "room-meta",
          version: APP_VERSION,
        });
      });
      connection.on("data", (message) => {
        if (message.type === "room-meta") {
          finish(message.room);
        }
      });
      connection.on("error", () => finish(null));
      connection.on("close", () => finish(null));
      window.setTimeout(() => finish(null), 1800);
    });
  }
  function openCreateRoomModal() {
    state.ui.modal = "create-room";
    queueRender();
  }
  async function createRoomFromModal() {
    const roomName = (document.getElementById("create-room-name") || {}).value || "";
    const playerName = (document.getElementById("create-player-name") || {}).value || "";
    const visibility = (document.getElementById("create-room-visibility") || {}).value || "public";
    const safePlayerName = String(playerName).trim() || state.menu.onlineName || "Host";
    const safeRoomName = String(roomName).trim() || `Mesa de ${safePlayerName}`;
    const roomId = randomCode("room");
    localStorage.setItem("twentyone.onlineName", safePlayerName);
    state.menu.onlineName = safePlayerName;
    await ensurePeer("room", roomId);
    state.online.role = "host";
    state.online.connectionStatus = "hosting";
    state.online.roomMeta = {
      roomId,
      roomName: safeRoomName,
      hostPeerId: roomId,
      hostName: safePlayerName,
      guestName: "",
      visibility,
      players: 1,
      status: "lobby",
      createdAt: new Date().toISOString(),
      version: APP_VERSION,
    };
    state.online.roomCodeInput = roomId;
    state.ui.modal = null;
    state.screen = "online-lobby";
    state.online.syncWarning = "";
    setRoomCodeInUrl(roomId);
    queueRender();
  }
  async function joinRoom(roomId, isReconnect) {
    const safeRoomId = sanitizeRoomCode(roomId);
    if (!safeRoomId) {
      return;
    }
    await ensurePeer("client");
    state.online.connectionStatus = isReconnect ? "reconnecting" : "joining";
    state.online.syncWarning = "";
    queueRender();
    const connection = runtime.peer.connect(safeRoomId, {
      reliable: true,
      metadata: {
        type: "join-request",
        requester: state.online.peerId,
      },
    });
    wireConnection(connection);
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (handler) => (value) => {
        if (settled) {
          return;
        }
        settled = true;
        handler(value);
      };
      const resolveOnce = done(resolve);
      const rejectOnce = done(reject);
      connection.on("open", () => {
        connection.send({
          type: "join-request",
          version: APP_VERSION,
          guestName: state.menu.onlineName || "Guest",
          fromPeerId: state.online.peerId,
          reconnect: !!isReconnect,
        });
      });
      connection.on("data", (message) => {
        if (message.type === "join-accept") {
          runtime.roomConnection = connection;
          state.online.role = "guest";
          state.online.connectionStatus = "connected";
          state.online.roomMeta = message.room;
          state.online.reconnectAttempts = 0;
          state.screen = message.room.status === "playing" ? "game" : "online-lobby";
          state.ui.modal = null;
          setRoomCodeInUrl(message.room.roomId);
          startHeartbeat();
          queueRender();
          resolveOnce(message);
        } else if (message.type === "join-reject") {
          state.online.connectionStatus = "rejected";
          state.online.syncWarning = message.reason || "No fue posible entrar a la sala.";
          try {
            connection.close();
          } catch (error) {
            // Ignore close errors after rejection.
          }
          queueRender();
          rejectOnce(new Error(message.reason || "Join rejected"));
        }
      });
      connection.on("error", (error) => rejectOnce(error));
    });
  }
  function sendRoomMessage(message) {
    if (!runtime.roomConnection || !runtime.roomConnection.open) {
      return;
    }
    runtime.roomConnection.send(message);
  }
  function sendSnapshot(reason) {
    if (state.online.role !== "host" || !state.game) {
      return;
    }
    sendRoomMessage({
      type: "snapshot",
      reason,
      game: cloneSimple(state.game),
      room: cloneSimple(state.online.roomMeta),
    });
  }
  function handleRoomMessage(message, connection) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "hello" && message.request === "room-meta") {
      if (state.online.role === "host" && state.online.roomMeta) {
        connection.send({
          type: "room-meta",
          room: cloneSimple(state.online.roomMeta),
        });
      }
      return;
    }
    if (message.type === "join-request") {
      if (state.online.role !== "host" || !state.online.roomMeta) {
        connection.send({ type: "join-reject", reason: "Host not ready." });
        return;
      }
      if (state.online.roomMeta.players >= 2 && connection.peer !== (runtime.roomConnection && runtime.roomConnection.peer)) {
        connection.send({ type: "join-reject", reason: "The room is already full." });
        return;
      }
      runtime.roomConnection = connection;
      state.online.roomMeta.players = 2;
      state.online.roomMeta.guestName = message.guestName || "Guest";
      state.online.connectionStatus = "connected";
      state.screen = state.game ? "game" : "online-lobby";
      connection.send({
        type: "join-accept",
        room: cloneSimple(state.online.roomMeta),
      });
      startHeartbeat();
      if (state.game) {
        window.setTimeout(() => {
          sendSnapshot("rejoin");
        }, 120);
      }
      queueRender();
      return;
    }
    if (message.type === "start-game") {
      state.game = cloneSimple(message.game);
      state.screen = "game";
      state.online.localHash = computeGameHash(state.game);
      state.online.remoteHash = "";
      state.online.syncWarning = "";
      startTurnFlow();
      queueRender();
      return;
    }
    if (message.type === "action") {
      applyRemoteGameAction(message);
      return;
    }
    if (message.type === "state-hash") {
      state.online.remoteHash = message.hash;
      if (message.mismatch && state.online.role === "host") {
        sendSnapshot("guest-mismatch");
      }
      queueRender();
      return;
    }
    if (message.type === "snapshot") {
      state.game = cloneSimple(message.game);
      state.online.roomMeta = cloneSimple(message.room);
      state.online.localHash = computeGameHash(state.game);
      state.online.syncWarning = "Snapshot aplicado para resincronizar el juego.";
      startTurnFlow();
      queueRender();
      return;
    }
    if (message.type === "heartbeat") {
      state.online.connectionStatus = "synced";
      queueRender();
      return;
    }
    if (message.type === "leave") {
      state.online.syncWarning = "La otra persona salio de la sala.";
      if (state.online.role === "host" && state.online.roomMeta) {
        state.online.roomMeta.players = 1;
        state.online.roomMeta.guestName = "";
        runtime.roomConnection = null;
        state.online.connectionStatus = "hosting";
      } else {
        leaveRoomToBrowser();
      }
      queueRender();
    }
  }
  function cleanupOnlineRuntime(skipPeerDestroy) {
    clearInterval(runtime.heartbeatInterval);
    clearInterval(runtime.turnInterval);
    clearTimeout(runtime.botTimer);
    clearTimeout(runtime.reconnectTimer);
    runtime.heartbeatInterval = null;
    runtime.turnInterval = null;
    runtime.botTimer = null;
    runtime.reconnectTimer = null;
    runtime.turnDeadline = 0;
    runtime.turnActivePlayer = null;
    runtime.processedRemoteActions.clear();
    if (runtime.roomConnection) {
      try {
        runtime.roomConnection.close();
      } catch (error) {
        // Ignore close errors while resetting room state.
      }
    }
    runtime.roomConnection = null;
    if (!skipPeerDestroy && runtime.peer) {
      try {
        runtime.peer.destroy();
      } catch (error) {
        // Ignore destroy errors when the peer already shut down.
      }
      runtime.peer = null;
      state.online.peerId = "";
      state.online.peerStatus = "idle";
    }
  }
  function leaveRoomToBrowser() {
    sendRoomMessage({ type: "leave", reason: "left-manually" });
    cleanupOnlineRuntime(false);
    state.game = null;
    state.screen = "online-browser";
    state.online.role = "browser";
    state.online.connectionStatus = "offline";
    state.online.roomMeta = null;
    state.online.localHash = "";
    state.online.remoteHash = "";
    state.online.reconnectAttempts = 0;
    state.ui.passOverlay = false;
    setRoomCodeInUrl("");
    queueRender();
  }
  function startHostedOnlineGame() {
    if (state.online.role !== "host" || !state.online.roomMeta || state.online.roomMeta.players < 2) {
      return;
    }
    createMatch("online", [
      state.online.roomMeta.hostName,
      state.online.roomMeta.guestName || "Guest",
    ]);
    state.online.roomMeta.status = "playing";
    state.online.localHash = computeGameHash(state.game);
    sendRoomMessage({
      type: "start-game",
      game: cloneSimple(state.game),
    });
    startHeartbeat();
    startTurnFlow();
    queueRender();
  }
  // == SECTION: UI ==
  function handleGameButton(action, dataset) {
    if (!state.game) {
      return;
    }
    const localPlayerIndex = state.game.mode === "online" ? getOnlineLocalPlayerIndex() : state.game.activePlayer;
    if (action === "draw-card") {
      performLocalGameAction(buildAction("draw-card", { playerIndex: localPlayerIndex }));
      return;
    }
    if (action === "stay") {
      performLocalGameAction(buildAction("stay", { playerIndex: localPlayerIndex }));
      return;
    }
    if (action === "use-trump") {
      performLocalGameAction(buildAction("play-trump", {
        playerIndex: localPlayerIndex,
        trumpIndex: Number(dataset.trumpIndex),
      }));
      return;
    }
    if (action === "next-round") {
      performLocalGameAction(buildAction("next-round", { seed: generateSeed("round") }));
    }
  }
  function isLocalTurn() {
    if (!state.game || state.game.phase !== "playing" || state.ui.passOverlay) {
      return false;
    }
    if (state.game.mode === "bot") {
      return state.game.activePlayer === 0;
    }
    if (state.game.mode === "local") {
      return true;
    }
    return state.game.activePlayer === getOnlineLocalPlayerIndex();
  }
  function canAdvanceRound() {
    if (!state.game || state.game.phase !== "round-end") {
      return false;
    }
    return state.game.mode !== "online" || state.online.role === "host";
  }
  function onRootClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) {
      return;
    }
    const action = trigger.dataset.action;
    const dataset = trigger.dataset;
    switch (action) {
      case "start-bot":
        localStorage.setItem("twentyone.playerName", state.menu.playerName);
        createMatch("bot", [state.menu.playerName || "Player 1", "Mr Saw Bot"]);
        startTurnFlow();
        queueRender();
        break;
      case "start-local":
        localStorage.setItem("twentyone.playerName", state.menu.playerName);
        localStorage.setItem("twentyone.secondName", state.menu.secondName);
        createMatch("local", [state.menu.playerName || "Player 1", state.menu.secondName || "Player 2"]);
        startTurnFlow();
        queueRender();
        break;
      case "open-online":
        safeAsync(openOnlineBrowser);
        break;
      case "back-menu":
        leaveRoomToMenu();
        break;
      case "refresh-rooms":
        safeAsync(refreshRooms);
        break;
      case "open-create-room":
        openCreateRoomModal();
        break;
      case "close-modal":
        state.ui.modal = null;
        queueRender();
        break;
      case "save-peer-config":
        submitPeerConfig();
        break;
      case "join-room":
        safeAsync(() => joinRoom(dataset.roomId));
        break;
      case "join-by-code":
        safeAsync(() => joinRoom(state.online.roomCodeInput));
        break;
      case "create-room-submit":
        safeAsync(createRoomFromModal);
        break;
      case "leave-room":
        leaveRoomToBrowser();
        break;
      case "start-online-match":
        startHostedOnlineGame();
        break;
      case "confirm-pass":
        state.ui.viewerIndex = state.game.activePlayer;
        state.ui.passOverlay = false;
        startTurnFlow();
        queueRender();
        break;
      case "use-trump":
      case "draw-card":
      case "stay":
      case "next-round":
        if (action !== "next-round" && !isLocalTurn()) {
          return;
        }
        if (action === "next-round" && !canAdvanceRound()) {
          return;
        }
        handleGameButton(action, dataset);
        break;
      case "open-peer-config":
        state.ui.modal = "peer-config";
        queueRender();
        break;
      case "copy-room-code":
        copyRoomCode();
        break;
      default:
        break;
    }
  }
  function onRootInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }
    if (target.id === "menu-player-name") {
      state.menu.playerName = target.value;
    } else if (target.id === "menu-second-name") {
      state.menu.secondName = target.value;
    } else if (target.id === "online-player-name") {
      state.menu.onlineName = target.value;
      localStorage.setItem("twentyone.onlineName", target.value);
    } else if (target.id === "join-room-code") {
      state.online.roomCodeInput = target.value.toUpperCase();
    }
  }
  function submitPeerConfig() {
    savePeerConfig({
      host: (document.getElementById("peer-host") || {}).value || "",
      port: (document.getElementById("peer-port") || {}).value || 443,
      path: (document.getElementById("peer-path") || {}).value || "/twentyone",
      secure: ((document.getElementById("peer-secure") || {}).value || "true") === "true",
    });
    state.ui.modal = null;
    cleanupOnlineRuntime(false);
    queueRender();
  }
  function leaveRoomToMenu() {
    if (state.online.role !== "browser" || runtime.peer) {
      cleanupOnlineRuntime(false);
      state.online.role = "browser";
      state.online.connectionStatus = "offline";
      state.online.roomMeta = null;
      state.online.localHash = "";
      state.online.remoteHash = "";
    }
    clearInterval(runtime.turnInterval);
    clearTimeout(runtime.botTimer);
    state.game = null;
    state.screen = "menu";
    state.ui.modal = null;
    state.ui.passOverlay = false;
    setRoomCodeInUrl("");
    queueRender();
  }
  function copyRoomCode() {
    const roomId = state.online.roomMeta && state.online.roomMeta.roomId;
    if (!roomId || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${roomId}`).then(() => {
      state.ui.notice = "Enlace copiado al portapapeles.";
      queueRender();
      window.setTimeout(() => {
        state.ui.notice = "";
        queueRender();
      }, 2000);
    }).catch(() => {
      state.ui.notice = "No se pudo copiar el enlace.";
      queueRender();
    });
  }
  function safeAsync(task) { Promise.resolve().then(task).catch((error) => { state.ui.notice = String(error && error.message ? error.message : error); queueRender(); }); }
  function queueRender() { if (runtime.renderQueued) { return; } runtime.renderQueued = true; window.requestAnimationFrame(() => { runtime.renderQueued = false; render(); }); }
  function render() { root.innerHTML = `<div class="app-shell">${renderTopbar()}${renderCurrentScreen()}${renderModal()}${renderPassOverlay()}</div>`; }
  function renderTopbar() {
    const roomMeta = state.online.roomMeta;
    const onlineStatus = roomMeta ? `${roomMeta.roomName} - ${roomMeta.players}/2` : state.online.peerStatus === "open" ? `Peer ${state.online.peerId}` : "Offline";
    return `
      <header class="panel topbar">
        <div class="brand">
          <div class="eyebrow">Static Horror Card Table</div>
          <h1>Twenty One</h1>
          <div class="subtle">Bot, local y online P2P listos para GitHub Pages.</div>
        </div>
        <div class="nav-actions">
          <span class="status-pill ${state.online.connectionStatus === "connected" || state.online.connectionStatus === "synced" ? "online" : "warning"}">${escapeHtml(onlineStatus)}</span>
          ${state.screen !== "menu" ? '<button class="ghost-button" data-action="back-menu">Volver al menu</button>' : ""}
        </div>
      </header>
    `;
  }
  function renderCurrentScreen() {
    switch (state.screen) {
      case "online-browser":
        return renderOnlineBrowser();
      case "online-lobby":
        return renderOnlineLobby();
      case "game":
        return renderGameScreen();
      case "menu":
      default:
        return renderMenu();
    }
  }
  function renderMenu() {
    return `
      <section class="panel hero">
        <div class="hero-copy">
          <div class="eyebrow">GitHub-ready</div>
          <h2>Juega una mesa de Twenty One con cartas 1..11 y todos los trumps.</h2>
          <p>La version web incluye partidas contra bot, local en la misma pantalla y online P2P con PeerJS, lobby publico, codigo de sala y resincronizacion por snapshot.</p>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="menu-player-name">Jugador 1</label>
            <input id="menu-player-name" value="${escapeHtml(state.menu.playerName)}" placeholder="Player 1" />
          </div>
          <div class="field">
            <label for="menu-second-name">Jugador 2 local</label>
            <input id="menu-second-name" value="${escapeHtml(state.menu.secondName)}" placeholder="Player 2" />
          </div>
          <div class="field">
            <label for="online-player-name">Nombre online</label>
            <input id="online-player-name" value="${escapeHtml(state.menu.onlineName)}" placeholder="Player Online" />
          </div>
        </div>
        <div class="mode-grid">
          <article class="mode-card">
            <div class="eyebrow">Solo</div>
            <h3>Contra bot</h3>
            <p>IA sin trampa que usa informacion publica, bot heuristico y las 25 cartas especiales.</p>
            <footer><button class="button" data-action="start-bot">Entrar a la mesa</button></footer>
          </article>
          <article class="mode-card">
            <div class="eyebrow">Couch Play</div>
            <h3>2 jugadores local</h3>
            <p>Un mismo dispositivo, mano oculta, overlay de pasar el dispositivo y temporizador por turno.</p>
            <footer><button class="button" data-action="start-local">Jugar local</button></footer>
          </article>
          <article class="mode-card">
            <div class="eyebrow">P2P</div>
            <h3>Online</h3>
            <p>Lobby con salas publicas, boton recargar, crear sala y union por codigo sobre PeerJS.</p>
            <footer>
              <button class="button" data-action="open-online">Abrir lobby</button>
              <button class="ghost-button" data-action="open-peer-config">Configurar server</button>
            </footer>
          </article>
        </div>
      </section>
    `;
  }
  function renderOnlineBrowser() {
    const roomCards = state.online.roomList.length
      ? state.online.roomList.map((room) => `
          <article class="room-card">
            <header>
              <div class="eyebrow">${escapeHtml(room.visibility)}</div>
              <h3>${escapeHtml(room.roomName)}</h3>
              <p>Host: ${escapeHtml(room.hostName)}</p>
            </header>
            <div class="meta-row">
              <span class="chip">Codigo ${escapeHtml(room.roomId)}</span>
              <span class="chip">${room.players}/2</span>
              <span class="chip">${escapeHtml(room.status)}</span>
            </div>
            <p class="muted">Version ${escapeHtml(room.version)} - Creada ${new Date(room.createdAt).toLocaleString()}</p>
            <footer><button class="button" data-action="join-room" data-room-id="${escapeHtml(room.roomId)}">Unirse</button></footer>
          </article>
        `).join("")
      : '<div class="empty-state">No hay salas publicas disponibles todavia.</div>';
    return `
      <section class="panel browser">
        <div class="browser-header">
          <div class="server-card">
            <div class="eyebrow">Peer server</div>
            <h3>${escapeHtml(state.online.peerConfig.host)}</h3>
            <p>Path ${escapeHtml(state.online.peerConfig.path)} - Port ${escapeHtml(String(state.online.peerConfig.port))}</p>
            <div class="status-row">
              <span class="status-pill ${state.online.peerStatus === "open" ? "online" : "warning"}">${escapeHtml(state.online.peerStatus)}</span>
              <button class="small-button" data-action="open-peer-config">Editar</button>
            </div>
          </div>
          <div class="server-card">
            <div class="eyebrow">Union rapida</div>
            <h3>Entrar por codigo</h3>
            <div class="field-inline">
              <label for="join-room-code">Codigo de sala</label>
              <input id="join-room-code" value="${escapeHtml(state.online.roomCodeInput)}" placeholder="ROOM-ABC123" />
            </div>
            <div class="online-actions">
              <button class="button" data-action="join-by-code">Unirse</button>
            </div>
          </div>
        </div>
        ${state.online.discoveryError ? `<div class="status-pill danger">${escapeHtml(state.online.discoveryError)}</div>` : ""}
        ${state.ui.notice ? `<div class="status-pill warning">${escapeHtml(state.ui.notice)}</div>` : ""}
        <div class="section-title">
          <div class="eyebrow">Salas publicas</div>
          <h2>Lobby estilo Roblox</h2>
          <p>Las salas publicas se reconstruyen con discovery sobre PeerServer. Las privadas entran por codigo.</p>
        </div>
        <div class="room-list">${roomCards}</div>
        <div class="online-footer">
          <button class="ghost-button" data-action="refresh-rooms">${state.online.isRefreshing ? "Recargando..." : "Recargar salas"}</button>
          <button class="button" data-action="open-create-room">Crear sala</button>
          <span class="spacer"></span>
          <span class="muted">Peer ${escapeHtml(state.online.peerId || "sin conectar")}</span>
        </div>
      </section>
    `;
  }
  function renderOnlineLobby() {
    const room = state.online.roomMeta;
    if (!room) {
      return renderOnlineBrowser();
    }
    const slots = [
      { label: "Host", name: room.hostName, state: "Dentro" },
      { label: "Invitado", name: room.guestName || "Esperando jugador...", state: room.players >= 2 ? "Dentro" : "Libre" },
    ];
    return `
      <section class="panel lobby">
        <div class="section-title">
          <div class="eyebrow">Sala activa</div>
          <h2>${escapeHtml(room.roomName)}</h2>
          <p>Codigo <span class="room-code">${escapeHtml(room.roomId)}</span> - ${escapeHtml(room.visibility)} - ${room.players}/2</p>
        </div>
        <div class="lobby-grid">
          <div class="panel server-card">
            <div class="eyebrow">Jugadores</div>
            <div class="lobby-slots">
              ${slots.map((slot) => `
                <div class="slot-card">
                  <div class="eyebrow">${escapeHtml(slot.label)}</div>
                  <h3>${escapeHtml(slot.name)}</h3>
                  <p>${escapeHtml(slot.state)}</p>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="panel server-card">
            <div class="eyebrow">Estado</div>
            <h3>${escapeHtml(state.online.connectionStatus)}</h3>
            <p>${state.online.role === "host" ? "Cuando la sala tenga dos jugadores, el host puede arrancar la partida." : "Esperando a que el host inicie la partida."}</p>
            ${state.online.syncWarning ? `<div class="status-pill warning">${escapeHtml(state.online.syncWarning)}</div>` : ""}
            <div class="lobby-actions">
              <button class="button" data-action="copy-room-code">Copiar enlace</button>
              ${state.online.role === "host" ? `<button class="ghost-button" data-action="start-online-match" ${room.players < 2 ? "disabled" : ""}>Iniciar partida</button>` : ""}
              <button class="danger-button" data-action="leave-room">Salir</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }
  function renderGameScreen() {
    if (!state.game) {
      return renderMenu();
    }
    const game = state.game;
    const viewerIndex = getViewerIndex();
    const localPlayerIndex = game.mode === "online" ? getOnlineLocalPlayerIndex() : viewerIndex;
    const bottomIndex = viewerIndex;
    const topIndex = otherPlayer(bottomIndex);
    const target = getCurrentTarget(game);
    const timerSeconds = Math.ceil(getTimeLeftMs() / 1000);
    return `
      <section class="panel game-layout">
        <div class="game-board">
          <div class="table-layout">
            <div class="player-panels">
              ${renderPlayerPanel(topIndex, viewerIndex, "opponent")}
              ${renderCenterPanel(target, timerSeconds)}
              ${renderPlayerPanel(bottomIndex, viewerIndex, "self")}
            </div>
            <div class="panel action-zone">
              <div class="action-header">
                <div class="eyebrow">Acciones</div>
                <h3>${escapeHtml(game.players[localPlayerIndex].name)}</h3>
                <p>${isLocalTurn() ? "Puedes usar comodines, robar o plantarte." : "Esperando la jugada del otro lado."}</p>
              </div>
              <div class="game-actions">
                <button class="button" data-action="draw-card" ${!isLocalTurn() ? "disabled" : ""}>Robar carta</button>
                <button class="ghost-button" data-action="stay" ${!isLocalTurn() ? "disabled" : ""}>Plantarse</button>
              </div>
              <div class="trump-grid">${renderTrumpHand(localPlayerIndex)}</div>
            </div>
          </div>
          <aside class="panel log-card">
            <div class="eyebrow">Registro</div>
            <h3>Ultimas jugadas</h3>
            <div class="log-list">
              ${game.log.length ? game.log.map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`).join("") : '<div class="empty-state">El registro aparecera aqui.</div>'}
            </div>
          </aside>
        </div>
      </section>
      ${game.result ? renderResultOverlay(game.result, target) : ""}
    `;
  }
  function renderPlayerPanel(playerIndex, viewerIndex, panelRole) {
    const game = state.game;
    const player = game.players[playerIndex];
    const target = getCurrentTarget(game);
    const total = getHandTotal(game, playerIndex);
    const visibleTotal = getVisibleTotal(game, playerIndex, viewerIndex);
    const revealAll = game.phase !== "playing";
    const active = game.phase === "playing" && game.activePlayer === playerIndex;
    const statusBits = [];
    if (player.stayed) { statusBits.push("Plantado"); }
    if (player.timedOut) { statusBits.push("Timeout"); }
    if (total > target) { statusBits.push("Overkill"); }
    return `
      <section class="player-panel ${active ? "active" : "waiting"}">
        <div class="player-top">
          <div>
            <div class="eyebrow">${panelRole === "self" ? "Tu lado" : "Rival"}</div>
            <h3>${escapeHtml(player.name)}</h3>
          </div>
          <div class="status-row">
            <span class="player-tag">Distancia ${player.sawDistance}</span>
            <span class="player-tag">Peligro ${getBetPressure(game, playerIndex)}</span>
            ${statusBits.length ? `<span class="player-tag">${escapeHtml(statusBits.join(" - "))}</span>` : ""}
          </div>
          <div class="player-total">${revealAll || viewerIndex === playerIndex ? total : `${visibleTotal}+?`}</div>
        </div>
        <div class="hand-grid">
          ${player.hand.length ? player.hand.map((card) => renderCard(card, playerIndex, viewerIndex, revealAll || viewerIndex === playerIndex)).join("") : '<div class="card empty">Sin cartas</div>'}
        </div>
        <div class="pill-row">
          ${game.placedTrumps.filter((item) => item.ownerIndex === playerIndex).map((item) => `<span class="chip">${escapeHtml(TRUMP_LIBRARY[item.id].name)}</span>`).join("") || '<span class="muted">Sin trumps persistentes en mesa.</span>'}
        </div>
      </section>
    `;
  }
  function renderCard(card, ownerIndex, viewerIndex, reveal) {
    if (!reveal && ownerIndex !== viewerIndex && card.hiddenFromOpponent) {
      return `
        <article class="card hidden">
          <div class="card-title">Hidden Card</div>
          <div class="card-value">?</div>
          <div class="card-note">${escapeHtml(card.source)}</div>
        </article>
      `;
    }
    return `
      <article class="card ${card.hiddenFromOpponent ? "hidden" : ""}">
        <div class="card-title">${escapeHtml(card.source)}</div>
        <div class="card-value">${escapeHtml(String(card.value))}</div>
        <div class="card-note">${card.hiddenFromOpponent ? "Oculta al rival" : "Visible"}</div>
      </article>
    `;
  }
  function renderTrumpHand(playerIndex) {
    const trumps = state.game.players[playerIndex].trumps;
    if (!trumps.length) {
      return '<div class="empty-state">No quedan trumps en tu mano.</div>';
    }
    return trumps.map((trumpId, index) => {
      const trump = TRUMP_LIBRARY[trumpId];
      return `
        <article class="trump-card">
          <div class="eyebrow">${escapeHtml(trump.family)}</div>
          <h3>${escapeHtml(trump.name)}</h3>
          <p>${escapeHtml(trump.description)}</p>
          <footer><button class="small-button" data-action="use-trump" data-trump-index="${index}" ${!isLocalTurn() ? "disabled" : ""}>Usar</button></footer>
        </article>
      `;
    }).join("");
  }
  function renderCenterPanel(target, timerSeconds) {
    const game = state.game;
    const left = game.players[0];
    const right = game.players[1];
    const totalDistance = Math.max(1, left.sawDistance + right.sawDistance);
    const sawPosition = (left.sawDistance / totalDistance) * 100;
    const leftFill = ((START_DISTANCE - left.sawDistance) / START_DISTANCE) * 50;
    const rightFill = ((START_DISTANCE - right.sawDistance) / START_DISTANCE) * 50;
    return `
      <section class="center-panel">
        <div class="saw-meter">
          <div class="eyebrow">Mr Saw</div>
          <div class="status-row">
            <span class="chip">${escapeHtml(left.name)} ${left.sawDistance}</span>
            <span class="chip">${escapeHtml(right.name)} ${right.sawDistance}</span>
          </div>
          <div class="meter-track">
            <div class="meter-fill-left" style="width:${leftFill}%"></div>
            <div class="meter-fill-right" style="width:${rightFill}%"></div>
            <div class="meter-saw" style="left:${sawPosition}%"></div>
          </div>
        </div>
        <div class="summary-grid">
          <div class="metric-card"><div class="eyebrow">Objetivo</div><strong>${target}</strong></div>
          <div class="metric-card"><div class="eyebrow">Apuesta base</div><strong>${game.baseBet}</strong></div>
          <div class="metric-card"><div class="eyebrow">Ronda</div><strong>${game.roundNumber}</strong></div>
          <div class="metric-card"><div class="eyebrow">Tiempo</div><strong>${timerSeconds}s</strong></div>
        </div>
        ${state.game.mode === "online" ? `
          <div class="status-row">
            <span class="status-pill ${state.online.connectionStatus === "connected" || state.online.connectionStatus === "synced" ? "online" : "warning"}">${escapeHtml(state.online.connectionStatus)}</span>
            ${state.online.syncWarning ? `<span class="status-pill warning">${escapeHtml(state.online.syncWarning)}</span>` : ""}
          </div>
        ` : ""}
      </section>
    `;
  }
  function renderResultOverlay(result, target) {
    const game = state.game;
    const winner = result.winnerIndex !== null ? game.players[result.winnerIndex].name : "Empate";
    const loser = result.loserIndex !== null ? game.players[result.loserIndex].name : "Nadie";
    return `
      <div class="overlay">
        <article class="result-card">
          <div class="eyebrow">${game.phase === "match-end" ? "Partida terminada" : "Fin de ronda"}</div>
          <h3>${escapeHtml(winner)}</h3>
          <p>Objetivo ${target} - Totales ${result.totals[0]} / ${result.totals[1]}</p>
          <div class="value">${result.winnerIndex === null ? "Empate" : `${escapeHtml(loser)} pierde ${result.damage}`}</div>
          ${result.blessSaved ? "<p>Bless salvo una derrota letal y la apuesta base bajara para la siguiente ronda.</p>" : ""}
          <div class="button-row">
            ${game.phase === "round-end" ? `<button class="button" data-action="next-round" ${!canAdvanceRound() ? "disabled" : ""}>${canAdvanceRound() ? "Siguiente ronda" : "Esperando al host"}</button>` : ""}
            <button class="ghost-button" data-action="back-menu">Volver al menu</button>
          </div>
        </article>
      </div>
    `;
  }
  function renderModal() {
    if (state.ui.modal === "create-room") {
      return `
        <div class="modal-backdrop">
          <article class="modal-card">
            <div class="eyebrow">Crear sala</div>
            <h3>Arma una mesa como en Roblox</h3>
            <form>
              <div class="field">
                <label for="create-room-name">Nombre de sala</label>
                <input id="create-room-name" value="Mesa de ${escapeHtml(state.menu.onlineName || "Host")}" />
              </div>
              <div class="field">
                <label for="create-player-name">Tu nombre</label>
                <input id="create-player-name" value="${escapeHtml(state.menu.onlineName)}" />
              </div>
              <div class="field">
                <label for="create-room-visibility">Visibilidad</label>
                <select id="create-room-visibility">
                  <option value="public">Publica</option>
                  <option value="private">Privada</option>
                </select>
              </div>
              <div class="button-row">
                <button type="button" class="button" data-action="create-room-submit">Crear sala</button>
                <button type="button" class="ghost-button" data-action="close-modal">Cancelar</button>
              </div>
            </form>
          </article>
        </div>
      `;
    }
    if (state.ui.modal === "peer-config") {
      return `
        <div class="modal-backdrop">
          <article class="modal-card">
            <div class="eyebrow">Peer server</div>
            <h3>Configurar discovery y senalizacion</h3>
            <form>
              <div class="field">
                <label for="peer-host">Host</label>
                <input id="peer-host" value="${escapeHtml(state.online.peerConfig.host)}" placeholder="peer.example.com" />
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="peer-port">Port</label>
                  <input id="peer-port" value="${escapeHtml(String(state.online.peerConfig.port))}" />
                </div>
                <div class="field">
                  <label for="peer-path">Path</label>
                  <input id="peer-path" value="${escapeHtml(state.online.peerConfig.path)}" />
                </div>
                <div class="field">
                  <label for="peer-secure">Secure</label>
                  <select id="peer-secure">
                    <option value="true" ${state.online.peerConfig.secure ? "selected" : ""}>true</option>
                    <option value="false" ${!state.online.peerConfig.secure ? "selected" : ""}>false</option>
                  </select>
                </div>
              </div>
              <div class="button-row">
                <button type="button" class="button" data-action="save-peer-config">Guardar</button>
                <button type="button" class="ghost-button" data-action="close-modal">Cerrar</button>
              </div>
            </form>
          </article>
        </div>
      `;
    }
    return "";
  }
  function renderPassOverlay() {
    if (!state.ui.passOverlay || !state.game) {
      return "";
    }
    const player = state.game.players[state.game.activePlayer];
    return `
      <div class="overlay">
        <article class="modal-card">
          <div class="eyebrow">Cambio de turno</div>
          <h3>Pasa el dispositivo a ${escapeHtml(player.name)}</h3>
          <p>La mano oculta se mostrara cuando pulses el boton.</p>
          <div class="button-row">
            <button class="button" data-action="confirm-pass">Estoy listo</button>
          </div>
        </article>
      </div>
    `;
  }
})();
