import type { UiDictionary } from "../types";

export const ui: UiDictionary = {
  meta: {
    title: "Anatomy Atelier — Learn anatomy like an artist",
    description:
      "Explore medically detailed 3D organs — heart, brain, lungs, liver, kidneys, eye, intestine, pancreas, and skin — through an elegant, interactive anatomy atelier.",
    ogTitle: "Anatomy Atelier — Learn anatomy like an artist",
    ogDescription: "Learn anatomy like an artist through immersive, medically detailed 3D specimens.",
    imageAlt: "An anatomical heart specimen floating above a plinth, beside the Anatomy Atelier wordmark",
  },
  brand: { tagline: "Learn anatomy like an artist", home: "Anatomy Atelier home" },
  nav: { explore: "Explore", systems: "Systems", lessons: "Lessons", library: "Library", notes: "Notes" },
  search: { placeholder: "Search organs, topics…" },
  profile: { open: "Open learner profile" },
  language: { label: "Language", choose: "Choose a language" },
  library: {
    title: "Organ library", open: "Open organ library", close: "Close library", saved: "Saved organs",
    viewAll: "View all organs",
    quoteLine1: "Learning is", quoteLine2: "an act of curiosity.", quoteSign: "Keep exploring!",
  },
  tools: {
    label: "3D viewer tools", rotate: "Rotate", moveIn: "Move in", moveOut: "Move out", isolate: "Isolate",
    section: "Cross-section", layers: "Layers", compare: "Compare", reset: "Reset",
  },
  viewer: {
    title: "{organ} interactive viewer",
    canvas: "Interactive 3D anatomy model. Drag to rotate, scroll to zoom, and click a dot to read about that structure.",
    tip: "Tip", tipDrag: "Drag to rotate", tipScroll: "Scroll to zoom", tipKeys: "Arrow keys to rotate",
    tipClick: "Click a dot to learn more",
    loading: "Preparing the {organ}", autoRotate: "Auto rotate",
    caption: "3D specimen · click a dot to explore", structures: "Structures in this specimen",
  },
  info: {
    kicker: "The {organ}", keyFacts: "Key facts", size: "Size", weight: "Weight", daily: "Daily",
    location: "Location", bloodSupply: "Blood supply", function: "Function",
    medical: "Medical importance", didYouKnow: "Did you know", viewLesson: "View lesson",
    animate: "Animate", quiz: "Quiz", compare: "Compare",
  },
  compare: {
    title: "Organ comparison", comparing: "Comparing", reference: "Reference",
    primaryRole: "Primary role", scale: "Scale", vs: "vs.", close: "Close comparison",
  },
  cards: {
    resources: "{organ} learning resources",
    microscopic: "Microscopic view", compareOrgans: "Compare organs", functionAnimation: "Function animation",
    clinicalNotes: "Clinical notes", whereItWorks: "Where it works", commonConditions: "Common conditions",
    exploreTissue: "Explore tissue", openComparison: "Open comparison", playAnimation: "Play animation",
    seeAll: "See all", seeSystem: "See the system",
    playAria: "Play the {organ} function animation", systemAria: "See where the {organ} sits in the body",
  },
  quiz: {
    start: "Start the labelling quiz", find: "Find the", progress: "{current} of {total}",
    correct: "Correct", wrong: "Not quite", reveal: "That is the {label}", answer: "{label} is marked in green",
    done: "Quiz complete", score: "{score} of {total} correct", retry: "Try again",
    exit: "Exit quiz", hint: "Click the matching dot on the model",
  },
  modal: {
    guided: "Guided discovery", close: "Close", continueExploring: "Continue exploring",
    quizTitle: "{organ} quick quiz", motionTitle: "{organ} in motion",
    bodyTitle: "{organ} in the body", insideTitle: "Inside the {organ}",
    quizPrompt: "Which statement best describes the {organ}?",
    quizA: "It plays a specialized role in maintaining the body",
    quizB: "It works completely independently",
    quizC: "It is active only during sleep",
    lessonBody:
      "Follow the highlighted structures, rotate the specimen, and connect form with function. This short study moment is designed to build a durable mental model.",
    systemIntro: "{location}. Trace how the {organ} connects to the rest of the body.",
    system: "System", primaryRole: "Primary role", bloodSupply: "Blood supply",
  },
};
