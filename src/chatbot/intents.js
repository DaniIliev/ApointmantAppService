export const Intents = {
  BOOK_APPOINTMENT: "book_appointment",
  CHECK_AVAILABILITY: "check_availability",
  GREETING: "greeting",
  UNKNOWN: "unknown",
};

export const TRAINING_DATA = {
  [Intents.BOOK_APPOINTMENT]: [
    "Искам да си запазя час",
    "Искам да се подстрижа",
    "Може ли да запазя час за маникюр",
    "Кога мога да си запазя час за прическа",
  ],
  [Intents.CHECK_AVAILABILITY]: [
    "Кога е свободен Петър?",
    "Има ли свободни часове при Мария?",
    "Свободни часове за днес?",
  ],
  [Intents.GREETING]: ["Здравей", "Здравейте", "Привет", "Здрасти"],
};
