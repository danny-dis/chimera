type Color = string;

export interface Theme {
  bg: Color;
  fg: Color;
  accent: Color;
  muted: Color;
  success: Color;
  warning: Color;
  error: Color;
  info: Color;
  role: Record<string, Color>;
  border: Color;
  borderActive: Color;
  syntax: Record<string, Color>;
}

export const zen: Theme = {
  bg: 'black',
  fg: 'white',
  accent: 'cyan',
  muted: 'gray',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  role: {
    writer: 'green',
    reviewer: 'cyan',
    challenger: 'magenta',
    synthesizer: 'yellow',
    planner: 'blue',
    researcher: 'white',
    summarizer: 'gray',
  },
  border: 'gray',
  borderActive: 'cyan',
  syntax: {
    keyword: 'magenta',
    string: 'green',
    comment: 'gray',
    number: 'yellow',
    function: 'cyan',
    type: 'blue',
    plain: 'white',
  },
};

export const MIN_COLUMNS = 80;
export const MIN_ROWS = 24;

export const SIDEBAR_MIN_WIDTH = 28;
export const SIDEBAR_MAX_WIDTH = 50;
export const SIDEBAR_BORDER_OVERHEAD = 5;
export const INNER_BORDER_OVERHEAD = 4;
export const SIDEBAR_CONTENT_OVERHEAD = SIDEBAR_BORDER_OVERHEAD + INNER_BORDER_OVERHEAD;
