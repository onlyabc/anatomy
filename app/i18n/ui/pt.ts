import type { UiDictionary } from "../types";

export const ui: UiDictionary = {
  meta: {
    title: "Anatomy Atelier — Aprenda anatomia como um artista",
    description:
      "Explore órgãos em 3D com detalhe médico — coração, cérebro, pulmões, fígado, rins, olho, intestino, pâncreas e pele — em um ateliê de anatomia interativo.",
    ogTitle: "Anatomy Atelier — Aprenda anatomia como um artista",
    ogDescription: "Aprenda anatomia como um artista com espécimes 3D imersivos e ricos em detalhe médico.",
    imageAlt: "Um coração anatômico flutuando sobre um pedestal, ao lado da marca Anatomy Atelier",
  },
  brand: { tagline: "Aprenda anatomia como um artista", home: "Página inicial do Anatomy Atelier" },
  nav: { explore: "Explorar", systems: "Sistemas", lessons: "Lições", library: "Biblioteca", notes: "Notas" },
  search: { placeholder: "Buscar órgãos, temas…" },
  profile: { open: "Abrir perfil do estudante" },
  language: { label: "Idioma", choose: "Escolha um idioma" },
  library: {
    title: "Biblioteca de órgãos", open: "Abrir biblioteca de órgãos", close: "Fechar biblioteca",
    saved: "Órgãos salvos", viewAll: "Ver todos os órgãos",
    quoteLine1: "Aprender é", quoteLine2: "um ato de curiosidade.", quoteSign: "Continue explorando!",
  },
  tools: {
    label: "Ferramentas do visualizador 3D", rotate: "Girar", moveIn: "Aproximar foco", moveOut: "Afastar foco", focalPlane: "Plano focal",
    backgroundFrame: "Background frame", backgroundFrameChoose: "Choose background frame",
    backgroundFrameLoading: "Loading frames…", backgroundFrameEmpty: "No landscape frames available",
    backgroundFrameDefault: "Default frame",
    isolate: "Isolar",
    section: "Corte transversal", layers: "Camadas", compare: "Comparar", reset: "Redefinir",
  },
  viewer: {
    title: "Visualizador interativo: {organ}",
    canvas: "Modelo anatômico 3D interativo. Arraste para girar, role para aproximar e clique em um ponto para ler sobre a estrutura.",
    tip: "Dica", tipDrag: "Arraste para girar", tipScroll: "Role para aproximar", tipKeys: "Setas para girar",
    tipClick: "Clique em um ponto para saber mais",
    loading: "Preparando {organ}", autoRotate: "Rotação automática",
    caption: "Espécime 3D · clique em um ponto", structures: "Estruturas deste espécime",
  },
  info: {
    kicker: "{organ}", keyFacts: "Dados principais", size: "Tamanho", weight: "Peso", daily: "Por dia",
    location: "Localização", bloodSupply: "Irrigação", function: "Função",
    medical: "Importância médica", didYouKnow: "Você sabia", viewLesson: "Ver lição",
    animate: "Animar", quiz: "Quiz", compare: "Comparar",
  },
  compare: {
    title: "Comparação de órgãos", comparing: "Comparando", reference: "Referência",
    primaryRole: "Papel principal", scale: "Escala", vs: "vs.", close: "Fechar comparação",
  },
  cards: {
    resources: "Recursos de estudo: {organ}",
    microscopic: "Vista microscópica", compareOrgans: "Comparar órgãos", functionAnimation: "Animação funcional",
    clinicalNotes: "Notas clínicas", whereItWorks: "Onde atua", commonConditions: "Doenças comuns",
    exploreTissue: "Explorar o tecido", openComparison: "Abrir comparação", playAnimation: "Reproduzir animação",
    seeAll: "Ver todas", seeSystem: "Ver o sistema",
    playAria: "Reproduzir a animação funcional: {organ}", systemAria: "Ver onde {organ} se situa no corpo",
  },
  quiz: {
    start: "Começar o quiz de identificação", find: "Encontre", progress: "{current} de {total}",
    correct: "Correto", wrong: "Quase", reveal: "Isso é: {label}", answer: "{label} está marcado em verde",
    done: "Quiz concluído", score: "{score} de {total} corretas", retry: "Tentar de novo",
    exit: "Sair do quiz", hint: "Clique no ponto correspondente no modelo",
  },
  modal: {
    guided: "Descoberta guiada", close: "Fechar", continueExploring: "Continuar explorando",
    quizTitle: "Quiz rápido: {organ}", motionTitle: "{organ} em movimento",
    bodyTitle: "{organ} no corpo", insideTitle: "Por dentro: {organ}",
    quizPrompt: "Qual afirmação melhor descreve este órgão ({organ})?",
    quizA: "Desempenha um papel especializado na manutenção do corpo",
    quizB: "Funciona de forma totalmente independente",
    quizC: "Só está ativo durante o sono",
    lessonBody:
      "Acompanhe as estruturas destacadas, gire o espécime e ligue forma e função. Este breve momento de estudo foi pensado para construir um modelo mental duradouro.",
    systemIntro: "{location}. Acompanhe como {organ} se conecta ao restante do corpo.",
    system: "Sistema", primaryRole: "Papel principal", bloodSupply: "Irrigação",
  },
};
