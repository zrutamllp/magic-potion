// Reasons the game engine can refuse a player or staff action.
// Messages are shown to players, so keep them in plain, simple English.

export const ENGINE_ERRORS = {
  WRONG_PHASE: 'You cannot do that right now.',
  GAME_FROZEN: 'The game is paused. Please wait.',
  TEAM_NOT_FOUND: 'That team is not in this game.',
  TEAM_REMOVED: 'That team has left the game.',
  TASK_NOT_FOUND: 'That task is not one of yours.',
  TASK_ALREADY_DONE: 'You have already solved this task.',
  ANOTHER_TASK_OPEN: 'Finish or leave your open task first.',
  TASK_NOT_RUNNING: 'This task is not running.',
  NEGATIVE_FUNDS: 'Your Task Funds are below zero. Get them back to zero to start a task.',
  NO_HINT_FOR_TASK: 'This task has no hint.',
  HINT_ALREADY_USED: 'You have already used the hint for this try.',
  NOT_ENOUGH_FUNDS_FOR_HINT: 'You do not have enough funds for a hint.',
  LOCKED_OUT: 'Too many wrong tries. Wait for the lock to end.',
  INVALID_ANSWER: 'That answer is not in the right format.',
  INVALID_AMOUNT: 'Enter a whole amount above zero.',
  NOT_ENOUGH_FUNDS: 'You do not have enough Task Funds.',
  CANNOT_SEND_TO_SELF: 'You cannot send funds to your own team.',
  REQUEST_NOT_FOUND: 'That request was not found.',
  REQUEST_CLOSED: 'That request is already closed.',
  PAYER_NOT_ENOUGH_FUNDS: 'You do not have enough Task Funds to accept this request.',
  INBOX_NOT_FOUND: 'That inbox task was not found.',
  INBOX_NOT_RELEASED: 'That inbox task is not open yet.',
  INBOX_ALREADY_DONE: 'You have already completed this inbox task.',
  NO_ATTEMPTS_LEFT: 'You have no tries left for this question.',
  INVALID_EXTENSION: 'Enter a whole number of seconds above zero.',
  NOT_FROZEN: 'The game is not paused.',
  ALREADY_FROZEN: 'The game is already paused.',
  NOT_ENOUGH_TEAMS: 'A game needs at least 3 teams.',
  MISSING_CONTENT: 'Some tasks have no content yet.',
  CHAT_EMPTY: 'Type a message first.',
  CHAT_TOO_LONG: 'That message is too long.',
  CHAT_LIMIT_REACHED: 'You have used all your messages for this round.',
  // Staff actions (Phase 6C). Shown to staff only.
  INVALID_ADJUSTMENT: 'Enter a whole amount that is not zero.',
  REASON_REQUIRED: 'Type a reason.',
  INVALID_NAME: 'Enter a team name of 1 to 40 letters.',
  NAME_TAKEN: 'Another team already has that name.',
  NOT_LOCKED: 'This task is not locked.',
  FRAGMENT_NOT_FOUND: 'That fragment was not found.',
  FRAGMENT_ALREADY_RELEASED: 'That fragment has already been released.',
  ADJUSTMENT_NOT_FOUND: 'That request was not found.',
  ADJUSTMENT_CLOSED: 'That request has already been decided.',
  NOTHING_TO_UNDO: 'That change cannot be undone.',
  ALREADY_UNDONE: 'That change has already been undone.',
  UNDO_OUT_OF_DATE: 'The team has been renamed again since. Rename it instead.',
  MESSAGE_EMPTY: 'Type a message first.',
  GAME_ENDED: 'The game has ended.',
} as const;

export type EngineErrorCode = keyof typeof ENGINE_ERRORS;

export type EngineResult<T = void> =
  { ok: true; value: T } | { ok: false; code: EngineErrorCode; message: string };

// Login and access problems. Also shown to players, so plain English again.
export const AUTH_ERRORS = {
  BAD_TEAM_LOGIN: 'That team code or password is not right.',
  AMBIGUOUS_TEAM_CODE: 'We could not find your game. Please ask your facilitator.',
  BAD_STAFF_LOGIN: 'That email or password is not right.',
  TOO_MANY_TRIES: 'Too many tries. Please wait a few minutes and try again.',
  SESSION_REPLACED: 'Your team logged in on another device.',
  SESSION_ENDED: 'Your login has ended. Please log in again.',
  NOT_LOGGED_IN: 'Please log in.',
  NOT_ALLOWED: 'You are not allowed to do that.',
  INVALID_REQUEST: 'That request was not valid.',
  GAME_NOT_FOUND: 'That game was not found.',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;
