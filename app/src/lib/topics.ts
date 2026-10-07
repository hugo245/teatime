export const TOPICS = [
  'What was your very first job?',
  'Where did you grow up, and what was it like?',
  'What music did you dance to when you were young?',
  'What is the best holiday you have ever had?',
  'What is your favourite meal to cook?',
  'Do you have any pets, now or when you were young?',
  'What always makes you smile?',
  'What was your school like?',
  'Which film could you watch again and again?',
  'What is your favourite season, and why?',
  'Tell me about your family.',
  'What is a hobby you have always wanted to try?',
  'What was the first car you owned?',
  'Which town or country would you love to visit?',
  'What did you want to be when you were a child?',
  'What is the best advice you were ever given?',
  'What is your favourite flower or plant?',
  'What do you like to do on a Sunday?',
  'What is a book you really enjoyed?',
  'What is a skill you are proud of?',
  'How did you meet your best friend?',
  'How do you like your tea or coffee?',
  'What was your favourite toy as a child?',
  'What is the most beautiful place you have seen?',
  'Which song brings back happy memories?',
  'What did you do for fun as a teenager?',
  'Who was your favourite teacher, and why?',
  'What is a family tradition you love?',
  'What is your favourite sweet treat?',
  'What makes a perfect day for you?',
  'What has changed the most since you were young?',
  'What is something you learned recently?',
];

export function randomTopic(exclude?: number): { text: string; index: number } {
  let index = Math.floor(Math.random() * TOPICS.length);
  if (index === exclude) index = (index + 1) % TOPICS.length;
  return { text: TOPICS[index]!, index };
}
