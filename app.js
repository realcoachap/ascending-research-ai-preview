// Ask Theo Shell v0.1.11 - Noted by Theo - 2026-06-04
// Clickable Ask Theo chat states with Telegram-clean commands, operator tools, GitHub Pages API routing, and local voice preview.

const thread = document.querySelector("#thread");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#promptInput");
const providerStatus = document.querySelector("#providerStatus");
const modeStatus = document.querySelector("#modeStatus");
const sourceStatus = document.querySelector("#sourceStatus");
const voiceStatus = document.querySelector("#voiceStatus");
const toolButton = document.querySelector("#toolButton");
const toolSheet = document.querySelector("#toolSheet");
const apiBase = typeof window.ASK_THEO_API_BASE === "string" ? window.ASK_THEO_API_BASE.replace(/\/+$/, "") : "";

const state = {
  provider: "sandbox_live",
  liveModel: "glm",
  mode: "quick",
  voice: "en-US-ChristopherNeural",
  lastGatePrompt: ""
};

const answerModeLabels = {
  quick: "Quick Ask",
  deep: "Deep Research",
  risk: "Risk Check",
  source: "Source Hunt",
  lab: "Lab / COA"
};

const commandModeDefaults = {
  ask_theo: "quick",
  deep_research: "deep",
  risk_check: "risk",
  source_hunt: "source",
  analyze_file_image: "lab",
  bloodwork_read: "lab",
  coa_read: "lab",
  compare_compounds: "deep",
  dilution_calculator: "risk",
  notebook_save: "quick",
  journal_entry: "quick",
  injection_site_rotator: "quick",
  progress_photo: "lab",
  library_search: "source"
};

const commandsThatNeedUserText = new Set(["deep_research", "risk_check", "source_hunt", "library_search"]);

let activeTheoAudio = null;
let activeTheoAudioUrl = "";
let activeVoiceButton = null;

function apiUrl(path) {
  return `${apiBase}${path}`;
}

const scenarios = {
  warm: {
    prompt: "What can Theo help me research?",
    provider: "sandbox_live",
    status: "live model",
    answer:
      "Ask me about a compound, study, COA, lab marker, or source claim. I will separate formal evidence from community reports and say when sources are not loaded yet.",
    cards: [
      {
        type: "source",
        tier: "Evidence",
        title: "Ready for source-bound questions",
        body:
          "This preview can show how Theo handles evidence notes, safety checks, source gaps, and Retatrutide example data."
      }
    ]
  },
  retatrutide: {
    prompt: "What can Theo help me check about Retatrutide?",
    provider: "sandbox_live",
    status: "live model with Retatrutide source context",
    answer:
      "Retatrutide is an investigational triple-receptor agonist. I can give you the short version first, then separate clinical sources from community or media claims if you want to dig deeper.",
    cards: [
      {
        type: "source",
        tier: "Peer-reviewed",
        title: "Clinical research signal",
        body:
          "Start with one formal clinical source or trial-design note, then expand only if the user asks for trial results or deeper context."
      },
      {
        type: "t9",
        tier: "Community reports",
        title: "Community / creator signal",
        body:
          "Show one lower-confidence reported-experience or creator-media signal as context, clearly separated from clinical evidence."
      }
    ]
  },
  unloaded: {
    prompt: "Tell me about HGH.",
    provider: "mock",
    status: "compound source not loaded",
    localOnly: true,
    answer:
      "I do not have reviewed sources loaded for {compound} in this temporary preview yet. I can save it as a source gap or route it into Source Hunt, but I should not attach the Retatrutide example to this question.",
    cards: [
      {
        type: "missing",
        tier: "No reviewed sources",
        title: "{compound} is not loaded yet",
        body:
          "The preview only has Retatrutide example sources available right now. Until {compound} sources are reviewed, Theo should say the gap plainly."
      },
      {
        type: "source",
        tier: "Next step",
        title: "Route to Source Hunt",
        body:
          "Queue formal sources, current community reports, and COA/source checks for review before showing compound-specific evidence notes."
      }
    ]
  },
  gate: {
    prompt: "What dose do people start Retatrutide at?",
    provider: "sandbox_live",
    status: "safety check needed",
    answer:
      "I cannot tell you what to take or build a dosing plan. I can show evidence context and separately label anecdotal reports without turning them into instructions.",
    cards: [
      {
        type: "gate",
        tier: "Safety check",
        title: "Safety check",
        body:
          "A clear tap should show evidence context only, not advice, sourcing, titration, administration, or stacks.",
        action: "I understand. Show evidence context."
      },
      {
        type: "withheld",
        tier: "Restricted",
        title: "Restricted details withheld",
        body:
          "Exact quantities, schedules, routes, source names, combinations, procurement details, and personal-use instructions are not displayed in the normal chat view."
      },
      {
        type: "t9",
        tier: "Community reports",
        title: "Reported experiences",
        body:
          "Community claims can be summarized after review, with authority labels and risk caveats, but they stay low-confidence and non-guidance."
      }
    ]
  },
  stale: {
    prompt: "Show current community reports for Retatrutide side effects.",
    provider: "retatrutide_seeded",
    status: "community reports need refresh",
    answer:
      "Formal sources can still answer from reviewed records, but community reports need a refresh for a current-experience question.",
    cards: [
      {
        type: "stale",
        tier: "Needs update",
        title: "Source refresh needed",
        body:
          "The latest community sweep is older than the target recent window. Run Source Hunt before treating reported patterns as current."
      },
      {
        type: "source",
        tier: "Formal sources",
        title: "Formal sources still usable",
        body:
          "Published trial and registry context can remain foundational even when social/community material needs refresh."
      },
      {
        type: "source",
        tier: "Action",
        title: "Source Hunt",
        body:
          "Queue Reddit, public web, creator metadata, and authorized platform checks for a new review set."
      }
    ]
  },
  missing: {
    prompt: "Can you verify this COA number from a lab Theo has never seen?",
    provider: "mock",
    status: "source check unavailable",
    answer:
      "I do not have a clean source match yet. I can preserve the question, label the gap, and route it into COA/source-hunt work instead of inventing a certificate result.",
    cards: [
      {
        type: "missing",
        tier: "No verified source",
        title: "No eligible source match",
        body:
          "No provider adapter or certificate snapshot is available for that identifier in this shell."
      },
      {
        type: "coa",
        tier: "COA",
        title: "COA check details",
        body:
          "Future source checks should show provider, returned certificate, analyte/method details, mismatch flags, and cache status."
      },
      {
        type: "source",
        tier: "Action",
        title: "Save source gap",
        body:
          "The shell keeps the user's question visible and offers a Source Hunt route instead of attaching weak or unrelated citations."
      }
    ]
  }
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanUserText(value) {
  return value
    .replace(/\bT1_regulatory_or_label\b/g, "regulatory or label source")
    .replace(/\bT2_peer_reviewed_clinical\b/g, "peer-reviewed clinical source")
    .replace(/\bT2_trial_registry\b/g, "trial registry source")
    .replace(/\bT3_company_topline_or_conference\b/g, "company or conference update")
    .replace(/\bT5_creator_media\b/g, "creator/media source")
    .replace(/\bT9_user_creator_community_reported_claims\b/g, "community reports")
    .replace(/\bT9_adjacent_public_preprint_analysis\b/g, "community-adjacent preprint")
    .replace(/\brestricted_t9\b/g, "restricted community details")
    .replace(/\bpending aesculon review\b/gi, "pending expert review")
    .replace(/\baesculon\b/gi, "expert review")
    .replaceAll("T9 community reports", "community reports")
    .replaceAll("T9 reports", "community reports")
    .replaceAll("T9 summaries", "community summaries")
    .replaceAll("T9 layer", "community reports")
    .replaceAll("T9 source fixture", "community report source")
    .replaceAll("T9 source", "community report source")
    .replaceAll("T9 material", "community report material")
    .replaceAll("T9 stays", "Community reports stay")
    .replaceAll("T9", "community reports")
    .replaceAll("seeded fixture", "example source set")
    .replaceAll("fixture", "example data")
    .replaceAll("review-gated", "pending review")
    .replaceAll("answer-ready", "ready for answer")
    .replaceAll("restricted flags present", "restricted details withheld")
    .replaceAll("dose-adjacent", "safety-sensitive")
    .replaceAll("Gate acknowledged", "Safety check acknowledged");
}

function cardClass(type) {
  if (type === "source") return "info-card";
  return `info-card ${type}`;
}

function displayCardType(type) {
  const labels = {
    source: "Evidence",
    t9: "Community reports",
    scope: "Outside scope",
    gate: "Safety check",
    withheld: "Restricted",
    stale: "Needs update",
    missing: "No source match",
    coa: "COA",
    tool: "Tool"
  };
  return labels[type] ?? cleanUserText(type);
}

function displayTier(tier) {
  const normalized = tier.toLowerCase();
  const labels = {
    t1_regulatory_or_label: "Regulatory / label",
    t2_peer_reviewed_clinical: "Peer-reviewed clinical",
    t2_trial_registry: "Trial registry",
    t3_company_topline_or_conference: "Company / conference",
    t5_creator_media: "Creator / media",
    t9_user_creator_community_reported_claims: "Community reports",
    t9_adjacent_public_preprint_analysis: "Public preprint",
    restricted_t9: "Restricted details"
  };
  if (labels[normalized]) return labels[normalized];
  if (normalized.includes("t9")) return "Community reports";
  if (normalized === "t2") return "Peer-reviewed";
  if (normalized === "t3") return "Trial context";
  if (normalized === "t7") return "COA";
  if (normalized === "t2/t3") return "Formal sources";
  if (normalized === "gate") return "Safety check";
  if (normalized === "outside scope") return "Outside scope";
  if (normalized === "stale") return "Needs update";
  if (normalized === "missing" || normalized === "source gap") return "No verified source";
  if (normalized === "action") return "Next step";
  return cleanUserText(tier);
}

function renderCard(card) {
  const action = card.action
    ? `<button class="card-action" type="button" data-gate-action>${escapeHtml(cleanUserText(card.action))}</button>`
    : "";
  return `
    <section class="${cardClass(card.type)}" aria-label="${escapeHtml(cleanUserText(card.title))}">
      <div class="card-kicker">
        <span>${escapeHtml(displayCardType(card.type))}</span>
        <span class="badge">${escapeHtml(displayTier(card.tier))}</span>
      </div>
      <h3>${escapeHtml(cleanUserText(card.title))}</h3>
      <p>${escapeHtml(cleanUserText(card.body))}</p>
      ${action}
    </section>
  `;
}

function isPriorityCard(card) {
  return ["scope", "gate", "withheld", "tool"].includes(card.type);
}

function normalizedCardKey(card) {
  return [card.type, card.tier, card.title, card.body]
    .map((part) => cleanUserText(String(part ?? "")).toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

function dedupeCards(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    const key = normalizedCardKey(card);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function renderReferenceDrawer(cards) {
  if (!cards.length) {
    return "";
  }
  const label = cards.length === 1 ? "Optional reference" : "Optional references";
  return `
    <details class="reference-drawer">
      <summary aria-label="${label}. Open only if you want source context.">
        <span class="reference-icon" aria-hidden="true">i</span>
        <span>${label}</span>
        <span class="reference-count">${cards.length}</span>
      </summary>
      <div class="reference-panel">
        <p class="reference-note">Open when you want the source trail.</p>
        <div class="card-grid reference-list">${cards.map(renderCard).join("")}</div>
      </div>
    </details>
  `;
}

function cleanMetaLabel(value) {
  return cleanUserText(value.replaceAll("_", " "));
}

function promptMentionsRetatrutide(prompt) {
  return /\b(retatrutide|reta|ly-?3437943)\b/i.test(prompt);
}

function requestedCompoundLabel(prompt) {
  if (promptMentionsRetatrutide(prompt)) {
    return "Retatrutide";
  }

  const knownPreviewGaps = [
    { label: "HGH Fragment 176-191", pattern: /\b(hgh fragment|human growth hormone fragment|176-191)\b/i },
    { label: "HGH", pattern: /\b(hgh|human growth hormone|somatropin)\b/i },
    { label: "Tirzepatide", pattern: /\b(tirzepatide|mounjaro|zepbound)\b/i },
    { label: "Semaglutide", pattern: /\b(semaglutide|ozempic|wegovy)\b/i },
    { label: "NAD+", pattern: /\b(nad\+?|nicotinamide adenine dinucleotide)\b/i },
    { label: "BPC-157", pattern: /\b(bpc[-\s]?157)\b/i }
  ];
  const matched = knownPreviewGaps.find((candidate) => candidate.pattern.test(prompt));
  if (matched) {
    return matched.label;
  }

  const aboutMatch = prompt.match(
    /\b(?:tell me about|what do you know about|what can you tell me about|explain|research)\s+([a-z0-9][a-z0-9+./-]*(?:\s+[a-z0-9+./-]+){0,3})/i
  );
  if (!aboutMatch) {
    return null;
  }

  const rawLabel = aboutMatch[1].replace(/[?.!,;:]+$/, "").trim();
  const stopLabels = new Set(["a compound", "evidence", "sources", "source", "coa", "lab", "labs", "bloodwork"]);
  return rawLabel && !stopLabels.has(rawLabel.toLowerCase()) ? rawLabel : null;
}

function compoundTemplateText(value, prompt) {
  const compound = requestedCompoundLabel(prompt) ?? "that compound";
  return value.replaceAll("{compound}", compound);
}

function compoundTemplateCards(cards, prompt) {
  return cards.map((card) => ({
    ...card,
    tier: compoundTemplateText(card.tier, prompt),
    title: compoundTemplateText(card.title, prompt),
    body: compoundTemplateText(card.body, prompt),
    action: card.action ? compoundTemplateText(card.action, prompt) : undefined
  }));
}

function toCardFromSource(sourceCard) {
  const isT9 = sourceCard.tier.toLowerCase().includes("t9");
  const isWithheld = Array.isArray(sourceCard.withheldFlags) && sourceCard.withheldFlags.length > 0;
  const meta = [
    sourceCard.sourceType,
    sourceCard.reviewStatus,
    sourceCard.recencyWindow,
    sourceCard.answerAllowed ? "ready for answer" : "pending review",
    isWithheld ? "restricted flags present" : ""
  ]
    .filter(Boolean)
    .map(cleanMetaLabel)
    .join(" · ");

  return {
    type: isT9 ? "t9" : isWithheld ? "withheld" : "source",
    tier: sourceCard.tier,
    title: sourceCard.title,
    body: `${sourceCard.safeSummary}${meta ? ` (${meta})` : ""}`
  };
}

function displayToolStatus(status) {
  const labels = {
    ready: "Ready",
    needs_input: "Needs input",
    coming_soon: "Coming soon",
    guarded: "Guarded",
    saved: "Saved"
  };
  return labels[status] ?? cleanUserText(String(status || "Tool"));
}

function toCardFromTool(toolCard) {
  return {
    type: "tool",
    tier: displayToolStatus(toolCard.status),
    title: toolCard.title || "Theo tool",
    body: [toolCard.body, toolCard.actionLabel ? `Next: ${toolCard.actionLabel}` : ""].filter(Boolean).join(" ")
  };
}

function refusalCardFromResponse(response) {
  if (response.refusalReason === "out_of_scope_controlled_opioid") {
    return {
      type: "scope",
      tier: "Outside scope",
      title: "Outside Theo's compound lane",
      body:
        "Theo keeps fentanyl and other controlled opioids out of the peptide, incretin, AAS, SARM, and SERM research lane."
    };
  }
  if (response.refusalReason === "out_of_scope_controlled_substance") {
    return {
      type: "scope",
      tier: "Outside scope",
      title: "Outside Theo's compound lane",
      body:
        "Theo keeps recreational and high-risk controlled-substance guidance out of the peptide, incretin, AAS, SARM, and SERM research lane."
    };
  }

  return {
    type: response.refusalReason.includes("withheld") ? "withheld" : "gate",
    tier: "Restricted",
    title: response.refusalReason.replaceAll("_", " "),
    body:
      "Theo stopped this before it could become personal guidance, sourcing help, or restricted details."
  };
}

function cardsFromTheoResponse(response) {
  const cards = [];

  if (response.safetyGate?.required && !response.safetyGate.acknowledged && !response.refusalReason) {
    cards.push({
      type: "gate",
      tier: "Safety check",
      title: "Safety check",
      body:
        "This unlocks evidence context only. It does not unlock advice, personal dosing, sourcing, titration, administration, or stacks.",
      action: "I understand. Show evidence context."
    });
  }

  if (response.refusalReason) {
    cards.push(refusalCardFromResponse(response));
  }

  const sourceCards = Array.isArray(response.sourceCards) ? response.sourceCards : [];
  const selectedSourceCards =
    state.mode === "quick"
      ? [
          sourceCards.find((card) => !card.tier.toLowerCase().includes("t9")),
          sourceCards.find((card) => card.tier.toLowerCase().includes("t9"))
        ].filter(Boolean)
      : sourceCards.slice(0, 8);
  cards.push(...selectedSourceCards.map(toCardFromSource));

  const toolCards = Array.isArray(response.toolCards) ? response.toolCards : [];
  cards.push(...toolCards.map(toCardFromTool));

  if (sourceCards.length === 0 && response.mode !== "sandbox_live") {
    cards.push({
      type: "missing",
      tier: "No verified source",
      title: "No sources attached",
      body:
        "Theo keeps the answer honest when no reviewed sources are present, instead of attaching weak or unrelated citations."
    });
  }

  return dedupeCards(cards);
}

function providerLabel(provider) {
  const labels = {
    sandbox_live: "Live Theo",
    mock: "Demo",
    retatrutide_seeded: "Retatrutide example",
    cerebras: "Cerebras GLM",
    openrouter: "OpenRouter GLM",
    zai_flash_glm: "Z.ai GLM",
    gemini: "Gemini",
    groq: "Groq"
  };
  return labels[provider] ?? cleanUserText(provider.replaceAll("_", " "));
}

function modeLabel(mode) {
  return providerLabel(mode);
}

function answerModeLabel(mode) {
  return answerModeLabels[mode] ?? cleanUserText(String(mode || "Quick Ask"));
}

function liveModelLabel(model) {
  const labels = {
    glm: "GLM Auto",
    gemini: "Gemini",
    groq: "Groq"
  };
  return labels[model] ?? cleanUserText(model);
}

function liveProviderPreference() {
  const preferences = {
    glm: "openrouter",
    gemini: "gemini",
    groq: "groq"
  };
  return preferences[state.liveModel] ?? "openrouter";
}

function answerLaneLabel() {
  return state.provider === "sandbox_live"
    ? `${providerLabel(state.provider)} · ${liveModelLabel(state.liveModel)}`
    : providerLabel(state.provider);
}

function selectedProviderIds() {
  const ids = {
    glm: ["openrouter", "zai_flash_glm", "cerebras"],
    gemini: ["gemini"],
    groq: ["groq"]
  };
  return ids[state.liveModel] ?? ["openrouter"];
}

function fallbackSummary(response) {
  if (state.provider !== "sandbox_live") {
    return "";
  }
  const flags = Array.isArray(response.safetyFlags) ? response.safetyFlags : [];
  if (!flags.includes("live_provider_call")) {
    return "";
  }
  if (!selectedProviderIds().includes(response.providerId)) {
    return `${liveModelLabel(state.liveModel)} unavailable; using ${providerLabel(response.providerId)}`;
  }
  return "";
}

function speechText(value) {
  return cleanUserText(value).replace(/\s+/g, " ").trim().slice(0, 1800);
}

function shouldOfferVoice(role, content) {
  return role === "theo" && !content.startsWith("Checking compound match");
}

function renderVoiceControl(role, content) {
  const text = speechText(content);
  if (!text || !shouldOfferVoice(role, content)) {
    return "";
  }
  return `
    <div class="message-actions">
      <button class="voice-button" type="button" data-voice-text="${encodeURIComponent(text)}">
        Listen
      </button>
    </div>
  `;
}

function inferFollowupCompound(prompt, content, cards) {
  const promptCompound = requestedCompoundLabel(prompt || "");
  if (promptCompound) {
    return promptCompound;
  }

  const haystack = [prompt, content, ...cards.flatMap((card) => [card.title, card.body])]
    .filter(Boolean)
    .join(" ");
  if (promptMentionsRetatrutide(haystack)) {
    return "Retatrutide";
  }
  return null;
}

function addFollowupOption(options, seen, label, prompt) {
  const key = label.toLowerCase();
  if (seen.has(key) || options.length >= 4) {
    return;
  }
  seen.add(key);
  options.push({ label, prompt });
}

function hasCardType(cards, types) {
  return cards.some((card) => types.includes(card.type));
}

function hasTextMatch(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function buildFollowupOptions(content, cards = [], context = {}) {
  if (cards.some((card) => ["scope", "gate", "withheld"].includes(card.type))) {
    return [];
  }

  const compound = inferFollowupCompound(context.prompt, content, cards);
  const target = compound || "this topic";
  const haystack = [context.prompt, content, ...cards.flatMap((card) => [card.title, card.body, card.tier])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const options = [];
  const seen = new Set();
  const hasFormalSource = cards.some((card) => !["t9", "missing", "coa", "stale"].includes(card.type));
  const hasCommunitySource = hasCardType(cards, ["t9"]) || hasTextMatch(haystack, [/community/, /creator/, /reddit/, /reported/]);
  const hasMissingSource = hasCardType(cards, ["missing"]) || hasTextMatch(haystack, [/not loaded/, /source gap/, /no reviewed source/]);
  const hasSourceRefresh = hasCardType(cards, ["stale"]) || hasTextMatch(haystack, [/refresh/, /current-experience/, /needs update/]);
  const hasCoaContext = hasCardType(cards, ["coa"]) || hasTextMatch(haystack, [/\bcoa\b/, /certificate/, /source check/]);
  const hasStudyContext = hasTextMatch(haystack, [/phase\s*\d/i, /trial/, /registry/, /nejm/, /study arm/]);
  const hasSafetyContext = hasTextMatch(haystack, [/side effect/, /adverse/, /safety/, /lightheaded/, /dysesthesia/, /gastrointestinal/]);
  const hasComparisonContext = hasTextMatch(haystack, [/tirzepatide/, /mounjaro/, /semaglutide/, /compare/]);

  if (hasMissingSource) {
    addFollowupOption(options, seen, "Run Source Hunt", `Run Source Hunt for ${target}`);
    addFollowupOption(options, seen, "Save source gap", `Save a source gap for ${target}`);
  }
  if (hasSourceRefresh) {
    addFollowupOption(options, seen, "Refresh reports", `Refresh current reports for ${target}`);
  }
  if (hasStudyContext || hasFormalSource) {
    addFollowupOption(options, seen, "Study details", `Show study details for ${target}`);
  }
  if (hasSafetyContext) {
    addFollowupOption(options, seen, "Safety signals", `Show safety signals for ${target}`);
  }
  if (hasCommunitySource) {
    addFollowupOption(options, seen, "Community reports", `Show community reports for ${target}`);
  }
  if (hasCoaContext) {
    addFollowupOption(options, seen, "COA/source check", `Check source or COA context for ${target}`);
  }
  if (hasComparisonContext && compound) {
    addFollowupOption(options, seen, "Compare compounds", `Compare ${compound} with related compounds`);
  }
  if (options.length === 0) {
    addFollowupOption(options, seen, "Pull current sources", `Pull current sources for ${target}`);
    addFollowupOption(options, seen, "Go deeper", `Give me a deeper research answer for ${target}`);
  }

  return options;
}

function renderFollowups(role, content, cards = [], context = {}) {
  if (!shouldOfferVoice(role, content)) {
    return "";
  }
  const options = buildFollowupOptions(content, cards, context);
  if (options.length === 0) {
    return "";
  }
  return `
    <div class="followup-grid" aria-label="Follow-up questions">
      <span>What do you want to dig into next?</span>
      ${options
        .map(
          (option) =>
            `<button type="button" data-followup-prompt="${escapeHtml(option.prompt)}">${escapeHtml(option.label)}</button>`
        )
        .join("")}
    </div>
  `;
}

async function requestTheo(prompt, acknowledgedSafetyGate = false, toolIntent) {
  const response = await fetch(apiUrl("/api/theo/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      mode: state.provider,
      answerMode: state.mode,
      toolIntent,
      providerPreference: state.provider === "sandbox_live" ? liveProviderPreference() : undefined,
      acknowledgedSafetyGate
    })
  });

  if (!response.ok) {
    throw new Error(`Theo API returned ${response.status}`);
  }

  return response.json();
}

async function requestTheoVoice(text) {
  const response = await fetch(apiUrl("/api/theo/voice"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: state.voice
    })
  });

  if (!response.ok) {
    let message = `Theo voice returned ${response.status}`;
    try {
      const error = await response.json();
      message = error.message || error.error || message;
    } catch {
      // Keep the generic status message when the voice endpoint cannot return JSON.
    }
    throw new Error(message);
  }

  return response.blob();
}

function resetVoiceButton(button) {
  if (button) {
    button.disabled = false;
    button.textContent = "Listen";
  }
}

function stopActiveTheoAudio() {
  if (activeTheoAudio) {
    activeTheoAudio.pause();
    activeTheoAudio = null;
  }
  if (activeTheoAudioUrl) {
    URL.revokeObjectURL(activeTheoAudioUrl);
    activeTheoAudioUrl = "";
  }
  resetVoiceButton(activeVoiceButton);
  activeVoiceButton = null;
  voiceStatus.textContent = "Voice: Christopher";
}

function setToolSheetOpen(open) {
  toolSheet.hidden = !open;
  toolButton.setAttribute("aria-expanded", open ? "true" : "false");
}

async function playTheoVoice(button) {
  if (button === activeVoiceButton && activeTheoAudio && !activeTheoAudio.paused) {
    stopActiveTheoAudio();
    return;
  }

  stopActiveTheoAudio();
  button.disabled = true;
  button.textContent = "Preparing...";
  voiceStatus.textContent = "Voice: preparing";

  try {
    const text = decodeURIComponent(button.dataset.voiceText || "");
    const blob = await requestTheoVoice(text);
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    activeTheoAudio = audio;
    activeTheoAudioUrl = audioUrl;
    activeVoiceButton = button;

    const cleanup = () => {
      if (activeTheoAudio === audio) {
        stopActiveTheoAudio();
      }
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    button.disabled = false;
    button.textContent = "Stop";
    await audio.play();
    voiceStatus.textContent = "Voice: playing";
  } catch {
    stopActiveTheoAudio();
    button.disabled = false;
    button.textContent = "Voice unavailable";
    voiceStatus.textContent = "Voice unavailable";
    setTimeout(() => {
      resetVoiceButton(button);
      voiceStatus.textContent = "Voice: Christopher";
    }, 2200);
  }
}

function appendMessage(role, content, cards = [], context = {}) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const avatar = role === "theo" ? '<div class="avatar" aria-hidden="true">T</div>' : "";
  const speaker = role === "theo" ? '<p class="speaker">Theo</p>' : '<p class="speaker">You</p>';
  const priorityCards = cards.filter(isPriorityCard);
  const referenceCards = cards.filter((card) => !isPriorityCard(card));
  const priorityMarkup = priorityCards.length
    ? `<div class="notice-grid">${priorityCards.map(renderCard).join("")}</div>`
    : "";
  const referenceMarkup = role === "theo" ? renderReferenceDrawer(referenceCards) : "";
  const voiceMarkup = renderVoiceControl(role, content);
  const followupMarkup = renderFollowups(role, content, cards, context);
  article.innerHTML = `
    ${avatar}
    <div class="bubble">
      ${speaker}
      <p>${escapeHtml(cleanUserText(content))}</p>
      ${priorityMarkup}
      ${referenceMarkup}
      ${voiceMarkup}
      ${followupMarkup}
    </div>
  `;
  thread.append(article);
  thread.scrollTop = thread.scrollHeight;
  return article;
}

function chooseScenario(prompt) {
  const normalized = prompt.toLowerCase();
  const requestedCompound = requestedCompoundLabel(prompt);
  const isRetatrutide = requestedCompound === "Retatrutide";
  if (state.provider === "sandbox_live") {
    if (normalized.includes("dose") || normalized.includes("dosing") || normalized.includes("start")) {
      return isRetatrutide ? scenarios.gate : scenarios.warm;
    }
    if (normalized.includes("coa") || normalized.includes("verify") || normalized.includes("missing")) {
      return scenarios.missing;
    }
    return isRetatrutide ? scenarios.retatrutide : scenarios.warm;
  }
  if (requestedCompound && !isRetatrutide) {
    return scenarios.unloaded;
  }
  if (normalized.includes("dose") || normalized.includes("dosing") || normalized.includes("start")) {
    return isRetatrutide ? scenarios.gate : scenarios.unloaded;
  }
  if (normalized.includes("stale") || normalized.includes("current") || normalized.includes("side effect")) {
    return isRetatrutide ? scenarios.stale : scenarios.unloaded;
  }
  if (normalized.includes("coa") || normalized.includes("verify") || normalized.includes("missing")) {
    return scenarios.missing;
  }
  if (isRetatrutide) {
    return scenarios.retatrutide;
  }
  return scenarios.warm;
}

function setProvider(provider) {
  document.querySelectorAll("[data-provider]").forEach((candidate) => {
    candidate.classList.toggle("active", candidate.dataset.provider === provider);
  });
  state.provider = provider;
  providerStatus.textContent = answerLaneLabel();
}

function setLiveModel(model) {
  document.querySelectorAll("[data-live-model]").forEach((candidate) => {
    candidate.classList.toggle("active", candidate.dataset.liveModel === model);
  });
  state.liveModel = model;
  providerStatus.textContent = answerLaneLabel();
}

function setAnswerMode(mode) {
  const normalized = answerModeLabels[mode] ? mode : "quick";
  document.querySelectorAll("[data-mode]").forEach((candidate) => {
    candidate.classList.toggle("active", candidate.dataset.mode === normalized);
  });
  state.mode = normalized;
  modeStatus.textContent = answerModeLabel(normalized);
}

function toolThinkingText(toolIntent) {
  if (!toolIntent) {
    return "Checking compound match, source quality, review status, and safety boundaries...";
  }
  const label = cleanUserText(toolIntent.replaceAll("_", " "));
  return `Routing through Theo's ${label} operator lane...`;
}

async function runScenario(scenario, overridePrompt, acknowledgedSafetyGate = false, toolIntent) {
  const prompt = overridePrompt || scenario.prompt;
  if (scenario.provider) {
    setProvider(scenario.provider);
  }
  sourceStatus.textContent = scenario.status;
  appendMessage("user", prompt);
  const thinkingMessage = appendMessage(
    "theo",
    toolThinkingText(toolIntent)
  );

  if (scenario.localOnly) {
    thinkingMessage.remove();
    appendMessage(
      "theo",
      compoundTemplateText(scenario.answer, prompt),
      compoundTemplateCards(scenario.cards, prompt),
      { prompt, scenario }
    );
    return;
  }

  try {
    const response = await requestTheo(prompt, acknowledgedSafetyGate, toolIntent);
    state.lastGatePrompt = response.safetyGate?.required && !response.safetyGate.acknowledged ? prompt : state.lastGatePrompt;
    const usedLiveProvider = Array.isArray(response.safetyFlags) && response.safetyFlags.includes("live_provider_call");
    providerStatus.textContent =
      state.provider === "sandbox_live"
        ? usedLiveProvider
          ? `${liveModelLabel(state.liveModel)} · ${providerLabel(response.providerId)}`
          : answerLaneLabel()
        : `${providerLabel(response.providerId)} · ${modeLabel(response.mode)}`;
    const refusalStatus = response.refusalReason?.startsWith("out_of_scope_")
      ? "outside scope"
      : response.refusalReason
        ? "safety stop"
        : "";
    const responseCards = cardsFromTheoResponse(response);
    const optionalReferenceCount = responseCards.filter((card) => !isPriorityCard(card)).length;
    sourceStatus.textContent =
      refusalStatus ||
      (optionalReferenceCount > 0 ? `${optionalReferenceCount} optional references` : scenario.status);
    thinkingMessage.remove();
    appendMessage("theo", response.answer || scenario.answer, responseCards, { prompt, response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    thinkingMessage.remove();
    appendMessage(
      "theo",
      `${scenario.answer} Local Theo API fallback note: ${message}`,
      compoundTemplateCards(scenario.cards, prompt),
      { prompt, scenario }
    );
  }
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    setAnswerMode(button.dataset.mode);
  });
});

document.querySelectorAll("[data-provider]").forEach((button) => {
  button.addEventListener("click", () => {
    setProvider(button.dataset.provider);
  });
});

document.querySelectorAll("[data-live-model]").forEach((button) => {
  button.addEventListener("click", () => {
    setLiveModel(button.dataset.liveModel);
    setProvider("sandbox_live");
  });
});

document.querySelectorAll("[data-tool-command]").forEach((button) => {
  button.addEventListener("click", () => {
    const command = button.dataset.toolCommand;
    const prompt = button.dataset.commandPrompt || button.textContent.trim();
    const mode = button.dataset.commandMode || commandModeDefaults[command] || "quick";
    setAnswerMode(mode);
    setToolSheetOpen(false);

    if (commandsThatNeedUserText.has(command)) {
      promptInput.value = prompt;
      promptInput.focus();
      promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
      promptInput.dispatchEvent(new Event("input"));
      sourceStatus.textContent = `${answerModeLabel(mode)} ready`;
      return;
    }

    runScenario(chooseScenario(prompt), prompt, false, command);
  });
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    const scenario = scenarios[button.dataset.example];
    if (scenario) {
      runScenario(scenario);
    }
  });
});

toolButton.addEventListener("click", () => {
  setToolSheetOpen(toolSheet.hidden);
});

document.querySelectorAll("[data-close-tools]").forEach((button) => {
  button.addEventListener("click", () => {
    setToolSheetOpen(false);
  });
});

thread.addEventListener("click", (event) => {
  const voiceButton =
    event.target instanceof Element ? event.target.closest("[data-voice-text]") : null;
  if (voiceButton) {
    playTheoVoice(voiceButton);
    return;
  }

  const followupButton =
    event.target instanceof Element ? event.target.closest("[data-followup-prompt]") : null;
  if (followupButton) {
    const prompt = followupButton.dataset.followupPrompt || followupButton.textContent.trim();
    runScenario(chooseScenario(prompt), prompt);
    return;
  }

  if (event.target.matches("[data-gate-action]")) {
    sourceStatus.textContent = "safety check acknowledged";
    if (state.lastGatePrompt) {
      runScenario(scenarios.gate, state.lastGatePrompt, true);
      return;
    }
    appendMessage("theo", "Safety check acknowledged, but there is no saved safety-sensitive prompt in this shell state.");
  }
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 128)}px`;
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }
  promptInput.value = "";
  promptInput.style.height = "auto";
  setToolSheetOpen(false);
  runScenario(chooseScenario(prompt), prompt);
});
