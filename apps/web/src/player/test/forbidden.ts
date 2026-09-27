// Words that would tell teams to cooperate or explain the rounds (GAME_RULES section 16).
export const FORBIDDEN: RegExp[] = [
  /cooperat/i,
  /collaborat/i,
  /work together/i,
  /help each other/i,
  /helping/i,
  /\bhelp\b/i,
  /team up/i,
  /use the chat/i,
  /talk to/i,
  /who needs/i,
  /other teams need/i,
  /in round 2 you see/i,
  /every team'?s score/i,
  /share (your|the) /i,
];
