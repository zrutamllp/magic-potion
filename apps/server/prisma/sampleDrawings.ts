// The sample Pictionary drawings: simple line pictures on a 0-100 grid (x right, y down).
// Each stroke is a list of points; the game draws them one by one, in order.

type Point = [number, number];
type Stroke = Point[];

const round = (n: number) => Math.round(n * 10) / 10;

// Points along a circle from one angle to another, in degrees (0 = right, 90 = down).
function arc(cx: number, cy: number, r: number, from = 0, to = 360, steps = 24): Stroke {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [round(cx + r * Math.cos(t)), round(cy + r * Math.sin(t))] as Point;
  });
}

function rect(x1: number, y1: number, x2: number, y2: number): Stroke {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ];
}

const key: Stroke[] = [
  arc(25, 50, 14),
  arc(25, 50, 5, 0, 360, 16),
  [
    [39, 50],
    [90, 50],
  ],
  [
    [72, 50],
    [72, 62],
    [78, 62],
    [78, 50],
  ],
  [
    [84, 50],
    [84, 58],
    [90, 58],
    [90, 50],
  ],
];

const cup: Stroke[] = [
  [
    [24, 40],
    [30, 86],
    [64, 86],
    [70, 40],
    [24, 40],
  ],
  arc(70, 60, 11, -80, 80, 12),
  ...[35, 47, 59].map((x): Stroke => [
    [x, 33],
    [x + 4, 27],
    [x, 21],
    [x + 4, 15],
    [x, 9],
  ]),
];

const lightBulb: Stroke[] = [
  // The glass: a circle open at the bottom, then the neck.
  [[40, 70], ...arc(50, 38, 24, 120, 420, 30), [60, 70]],
  [
    [40, 70],
    [60, 70],
  ],
  [
    [40, 75],
    [60, 75],
  ],
  [
    [41, 80],
    [59, 80],
  ],
  [
    [45, 85],
    [55, 85],
  ],
  [
    [22, 16],
    [15, 9],
  ],
  [
    [78, 16],
    [85, 9],
  ],
];

const laptop: Stroke[] = [
  rect(22, 16, 78, 58),
  rect(27, 21, 73, 53),
  [
    [22, 58],
    [78, 58],
    [92, 78],
    [8, 78],
    [22, 58],
  ],
  [
    [22, 65],
    [78, 65],
  ],
  rect(42, 69, 58, 75),
];

const rocket: Stroke[] = [
  [
    [50, 5],
    [62, 24],
    [62, 66],
    [38, 66],
    [38, 24],
    [50, 5],
  ],
  arc(50, 35, 6, 0, 360, 16),
  [
    [38, 50],
    [26, 70],
    [38, 66],
  ],
  [
    [62, 50],
    [74, 70],
    [62, 66],
  ],
  [
    [43, 66],
    [46, 80],
    [50, 72],
    [54, 86],
    [57, 66],
  ],
];

export const SAMPLE_DRAWINGS = [key, cup, lightBulb, laptop, rocket].map((strokes) => ({
  strokes,
}));
